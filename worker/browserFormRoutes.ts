// Navegador na nuvem do Vertal Chat: preenche formulários de sites para o usuário.
//   POST /api/browser/inspect       {url}                          → esquema do formulário + screenshot
//   POST /api/browser/fill-preview  {url, values}                  → preenche, screenshot + erros, NÃO envia
//   POST /api/browser/submit        {url, values, submitSelector?, confirmed: true, runId}
//                                                                  → preenche, cobra, envia, texto de confirmação
//
// Roda no Worker do vertal.dev com o Cloudflare Browser Run (binding BROWSER +
// @cloudflare/puppeteer). Não usa edge function do Supabase (o projeto está no
// limite de funções). Autenticação: JWT da sessão do Supabase, como /api/spotify.
// Cada chamada abre a página do zero e fecha o navegador no fim (sem sessão
// guardada): mais simples e robusto; o envio refaz o preenchimento na hora.
// Guia: docs/BROWSER_FORM_AGENT.md.
import type { Browser, BrowserWorker, Page } from '@cloudflare/puppeteer';
import {
  BROWSER_FORM_LIMITS, BROWSER_FORM_MESSAGES, buildFormSchema, chooseSubmitButton, confirmationText, createRateLimiter,
  detectCaptcha, dominantFormIndex, isAllowedSubrequest, normalizeFormUrl, parseFormValues, planFill,
  type BrowserFormStatus, type CaptchaSignals, type FormSchema, type RawFormControl, type RawSubmitButton,
} from '../supabase/functions/_shared/browserForm';
import { EXTRACT_SCRIPT, RESULT_SCRIPT, clickSubmitScript, fillScript } from './browserFormPage';
import { isAllowedOrigin } from './spotifyRoutes';
import { getUserId, rpc, type SupabaseEnv } from './supabaseRest';

export const BROWSER_API_PREFIX = '/api/browser';

export interface BrowserFormEnv extends SupabaseEnv {
  /** Binding do Browser Run (wrangler.jsonc → "browser": { "binding": "BROWSER" }). */
  BROWSER?: BrowserWorker;
}

// Limites por usuário (por isolate do Worker: melhor esforço, não global).
const readLimiter = createRateLimiter(20, 10 * 60_000);
const submitLimiter = createRateLimiter(5, 10 * 60_000);
/** Um navegador por usuário por vez. */
const busyUsers = new Set<string>();

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}

const fail = (request: Request, status: Exclude<BrowserFormStatus, 'ok'>, extra: Record<string, unknown> = {}, http = 200) =>
  json(request, { ok: false, status, message: BROWSER_FORM_MESSAGES[status], ...extra }, http);

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError('timeout')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > BROWSER_FORM_LIMITS.maxBodyBytes) return null;
  const text = await request.text().catch(() => '');
  if (text.length > BROWSER_FORM_LIMITS.maxBodyBytes) return null;
  try {
    const parsed = JSON.parse(text || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function handleBrowserForm(request: Request, env: BrowserFormEnv, url: URL): Promise<Response> {
  const route = url.pathname.slice(BROWSER_API_PREFIX.length).replace(/\/+$/, '');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return fail(request, 'bad_request', {}, 405);
  const op = route === '/inspect' ? 'inspect' : route === '/fill-preview' ? 'preview' : route === '/submit' ? 'submit' : null;
  if (!op) return fail(request, 'bad_request', {}, 404);

  let userId: string | null;
  try {
    userId = await getUserId(env, request.headers.get('Authorization'));
  } catch {
    return fail(request, 'not_configured', {}, 503);
  }
  if (!userId) return fail(request, 'unauthorized', {}, 401);
  if (!env.BROWSER) return fail(request, 'not_configured', {}, 503);

  const body = await readBody(request);
  if (!body) return fail(request, 'bad_request', {}, 400);
  const target = normalizeFormUrl(body.url);
  if (!target) return fail(request, 'blocked_url');
  const values = parseFormValues(body.values);

  if (op === 'submit') {
    // O envio só acontece depois do clique do usuário em "Enviar" no chat.
    if (body.confirmed !== true) return fail(request, 'bad_request', { detail: 'confirmation_required' }, 400);
    if (typeof body.runId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(body.runId)) return fail(request, 'bad_request', { detail: 'run_id_required' }, 400);
    if (!submitLimiter.take(userId)) return fail(request, 'rate_limited', {}, 429);
  } else if (!readLimiter.take(userId)) {
    return fail(request, 'rate_limited', {}, 429);
  }
  if (busyUsers.has(userId)) return fail(request, 'rate_limited', { detail: 'busy' }, 429);
  busyUsers.add(userId);

  let browser: Browser | null = null;
  try {
    const puppeteer = (await import('@cloudflare/puppeteer')).default;
    browser = await puppeteer.launch(env.BROWSER);
    const session = browser;
    const result = await withTimeout(
      run(session, op, { url: target, values, submitSelector: typeof body.submitSelector === 'string' ? body.submitSelector : undefined, userId, runId: String(body.runId ?? ''), env }),
      BROWSER_FORM_LIMITS.totalTimeoutMs,
    );
    return json(request, result);
  } catch (e) {
    if (e instanceof TimeoutError) return fail(request, 'timeout');
    const message = e instanceof Error ? e.message : String(e);
    console.error('browser-form: erro', op, message.slice(0, 300));
    if (/429|limit/i.test(message)) return fail(request, 'rate_limited', { detail: 'browser_capacity' }, 429);
    return fail(request, 'error', {}, 500);
  } finally {
    busyUsers.delete(userId);
    if (browser) await browser.close().catch(() => undefined);
  }
}

interface RunInput {
  url: string;
  values: ReturnType<typeof parseFormValues>;
  submitSelector?: string;
  userId: string;
  runId: string;
  env: BrowserFormEnv;
}

type Extracted = { controls: RawFormControl[]; buttons: RawSubmitButton[]; title: string; captcha: CaptchaSignals };

async function screenshot(page: Page): Promise<string | undefined> {
  for (const quality of [55, 35]) {
    try {
      const shot = await page.screenshot({ type: 'jpeg', quality, encoding: 'base64', fullPage: quality === 55, captureBeyondViewport: quality === 55 });
      const b64 = typeof shot === 'string' ? shot : '';
      if (b64 && b64.length <= BROWSER_FORM_LIMITS.maxScreenshotBase64) return `data:image/jpeg;base64,${b64}`;
    } catch {
      // Tenta de novo menor (só a parte visível).
    }
  }
  return undefined;
}

async function openPage(browser: Browser, url: string, dialogs: string[], acceptDialogs: () => boolean): Promise<{ page: Page; status?: 'blocked_url' | 'navigation_failed' }> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 1280, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (!isAllowedSubrequest(req.url())) {
      void req.abort('blockedbyclient').catch(() => undefined);
      return;
    }
    if (req.resourceType() === 'media') {
      void req.abort().catch(() => undefined);
      return;
    }
    void req.continue().catch(() => undefined);
  });
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message().slice(0, 300));
    void (acceptDialogs() ? dialog.accept() : dialog.dismiss()).catch(() => undefined);
  });
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: BROWSER_FORM_LIMITS.navigationTimeoutMs });
    if (!res) return { page, status: 'navigation_failed' };
  } catch {
    return { page, status: 'navigation_failed' };
  }
  // Redirecionamento para rede interna também é barrado.
  if (!normalizeFormUrl(page.url())) return { page, status: 'blocked_url' };
  await page.waitForNetworkIdle({ idleTime: 600, timeout: 6_000 }).catch(() => undefined);
  return { page };
}

async function run(browser: Browser, op: 'inspect' | 'preview' | 'submit', input: RunInput): Promise<Record<string, unknown>> {
  const dialogs: string[] = [];
  let submitting = false;
  const { page, status } = await openPage(browser, input.url, dialogs, () => submitting);
  if (status) return { ok: false, status, message: BROWSER_FORM_MESSAGES[status] };

  const extracted = (await page.evaluate(EXTRACT_SCRIPT)) as Extracted;
  const schema: FormSchema = buildFormSchema(extracted.controls, extracted.buttons, extracted.title);
  const base = { url: page.url(), schema };
  const captcha = detectCaptcha(extracted.captcha);

  if (schema.fields.length === 0) {
    const status: BrowserFormStatus = captcha.captcha ? 'captcha' : 'no_form';
    return { ok: false, status, message: BROWSER_FORM_MESSAGES[status], ...base, screenshot: await screenshot(page), captchaKind: captcha.kind };
  }
  if (op === 'inspect') {
    return { ok: true, status: captcha.captcha ? 'captcha' : 'ok', ...base, captchaKind: captcha.kind, screenshot: await screenshot(page) };
  }

  const plan = planFill(schema.fields, input.values);
  const filled = (await page.evaluate(fillScript(plan.fills))) as { errors: Array<{ key: string; message: string }>; invalid: Array<{ key: string; message: string }> };
  const labelOf = (key: string) => schema.fields.find((f) => f.key === key)?.label ?? key;
  const errors = [
    ...plan.errors,
    ...filled.errors.map((e) => `"${labelOf(e.key)}": ${e.message}.`),
    ...filled.invalid.map((e) => `"${labelOf(e.key)}": ${e.message}`),
  ];
  const missingRequired = plan.missingRequired.map((f) => f.key);
  const fillInfo = {
    filled: plan.fills.map((f) => f.key),
    unknownKeys: plan.unknownKeys,
    missingRequired,
    errors,
    captchaKind: captcha.kind,
  };

  if (op === 'preview') {
    return { ok: true, status: captcha.captcha ? 'captcha' : 'ok', ...base, ...fillInfo, screenshot: await screenshot(page) };
  }

  // ── submit ──
  if (captcha.captcha) {
    return { ok: false, status: 'captcha', message: BROWSER_FORM_MESSAGES.captcha, ...base, ...fillInfo, screenshot: await screenshot(page) };
  }
  if (errors.length > 0 || missingRequired.length > 0) {
    return { ok: false, status: 'validation_error', message: BROWSER_FORM_MESSAGES.validation_error, ...base, ...fillInfo, screenshot: await screenshot(page) };
  }
  const button = chooseSubmitButton(extracted.controls, extracted.buttons, input.submitSelector);
  const formIndex = dominantFormIndex(extracted.controls);
  if (!button && formIndex < 0) {
    return { ok: false, status: 'no_form', message: 'Não achei o botão de envio deste formulário.', ...base, ...fillInfo };
  }

  // Cobra antes de clicar (idempotente pelo runId): sem crédito, nada é enviado.
  let charged = 0;
  try {
    const debit = await rpc<{ replayed?: boolean } | null>(input.env, 'execute_atomic_credit_deduction', {
      _user_id: input.userId,
      _amount: BROWSER_FORM_LIMITS.submitCredits,
      _reason: 'browser_form_submit',
      _category: 'vertal_chat',
      _metadata: { source: 'browser_form', host: new URL(input.url).host },
      _idempotency_key: `browser_form:${input.runId}`,
    });
    // Mesmo runId de novo (retentativa): este envio já aconteceu. Nunca envia duas vezes.
    if (debit?.replayed) {
      return { ok: false, status: 'bad_request', message: 'Este formulário já foi enviado nesta aprovação.', detail: 'already_submitted', ...base };
    }
    charged = BROWSER_FORM_LIMITS.submitCredits;
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (/insufficient_credits|subscription_not_found/.test(message)) {
      return { ok: false, status: 'insufficient_credits', message: BROWSER_FORM_MESSAGES.insufficient_credits, ...base, ...fillInfo };
    }
    throw e;
  }

  submitting = true;
  const startUrl = page.url();
  const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: BROWSER_FORM_LIMITS.submitWaitMs }).catch(() => null);
  const how = (await page.evaluate(clickSubmitScript(button ? `[data-vertal-submit="s${button.index}"]` : null, formIndex))) as string;
  await Promise.race([navigation, page.waitForNetworkIdle({ idleTime: 1_200, timeout: BROWSER_FORM_LIMITS.submitWaitMs }).catch(() => undefined)]);
  await new Promise((r) => setTimeout(r, 800));

  const after = (await page.evaluate(RESULT_SCRIPT)) as { title: string; headings: string[]; alerts: string[]; invalid: string[]; stillHasForm: boolean; bodyText: string };
  const confirmation = confirmationText({ ...after, alerts: [...dialogs, ...after.alerts] });
  const navigated = page.url() !== startUrl;
  const rejected = !navigated && after.invalid.length > 0;
  return {
    ok: !rejected,
    status: rejected ? 'validation_error' : 'ok',
    ...(rejected ? { message: BROWSER_FORM_MESSAGES.validation_error } : {}),
    url: page.url(),
    submittedVia: how,
    navigated,
    confirmation,
    pageErrors: after.invalid,
    charged,
    filled: plan.fills.map((f) => f.key),
    screenshot: await screenshot(page),
  };
}
