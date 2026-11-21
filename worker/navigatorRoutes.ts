// Vertal Navigator: agente de navegação web com sessão persistente (fase 1).
//   POST /api/navigator/start     {url?}                         → cria/reaproveita a sessão do usuário; URL da tela ao vivo (só ver)
//   POST /api/navigator/task      {sessionId, task, url?, maxSteps?} → instrução em linguagem natural (browser-use no sandbox)
//   POST /api/navigator/status    {sessionId, after?}            → passos, pedidos pendentes, screenshot; cobra os minutos
//   POST /api/navigator/input     {sessionId, requestId, kind, approve?|value?, confirmed?}
//                                                                → aprovação de pagamento / código 2FA / resposta
//   POST /api/navigator/takeover  {sessionId}                    → usuário assume o controle (URL com senha de controle)
//   POST /api/navigator/release   {sessionId}                    → devolve ao agente (troca a senha de controle, salva cookies)
//   POST /api/navigator/stop      {sessionId}                    → salva cookies, encerra o sandbox
//   POST /api/navigator/forget    {}                             → apaga os cookies salvos do usuário
//
// Roda no Worker do vertal.dev (o Supabase está no limite de edge functions).
// O navegador fica num sandbox E2B self-hosted (template vertal-browser, ver
// infra/vertal-browser e docs/VERTAL_NAVIGATOR.md). Auth: JWT do Supabase.
// Segredos do cofre e cookies usam a CONNECTOR_ENC_KEY (mesmo AES-GCM das edge functions).
import { createRateLimiter } from '../supabase/functions/_shared/browserForm';
import {
  NAVIGATOR_LIMITS, NAVIGATOR_MESSAGES, liveViewUrl, minutesDue, normalizeNavigatorUrl, parseInputBody, parseSessionBody,
  parseStartBody, parseTaskBody, pickSecretForHost, sanitizeEvents, sanitizePending, isBlockedHost,
  type NavigatorStatus, type VaultSecretMeta,
} from '../supabase/functions/_shared/navigatorCore.ts';
import { createSandbox, e2bDomain, E2BError, killSandbox, navd, setSandboxTimeout, waitNavd, type E2BEnv, type NavdTarget } from './e2bClient';
import { decryptWithConnectorKey, encryptWithConnectorKey, EncKeyMissingError, randomPassword, randomToken } from './navigatorCrypto';
import { isAllowedOrigin } from './spotifyRoutes';
import { getUserId, rpc, table, type SupabaseEnv } from './supabaseRest';

export const NAVIGATOR_API_PREFIX = '/api/navigator';

export interface NavigatorEnv extends SupabaseEnv, E2BEnv {
  OPENROUTER_API_KEY?: string;
  /** Modelo do agente via OpenRouter (padrão google/gemini-3-flash-preview). */
  NAVIGATOR_MODEL?: string;
  /** "openrouter" (padrão) ou "deepseek" (alternativa sem visão; usa DEEPSEEK_API_KEY e NAVIGATOR_MODEL=deepseek-flash). */
  NAVIGATOR_LLM_PROVIDER?: string;
  DEEPSEEK_API_KEY?: string;
  /** Sessões simultâneas no total (padrão 2). */
  NAVIGATOR_MAX_SESSIONS?: string;
  /** Créditos por minuto (padrão 1). */
  NAVIGATOR_CREDITS_PER_MINUTE?: string;
  /** Mesma chave AES-GCM das edge functions (cofre e conectores). */
  CONNECTOR_ENC_KEY?: string;
  /** Chave própria do Navigator (sessões e cookies). Se ausente, usa CONNECTOR_ENC_KEY. */
  NAVIGATOR_ENC_KEY?: string;
  /** Token interno compartilhado com a edge function kubo-secrets (fill_secret). */
  NAVIGATOR_INTERNAL_TOKEN?: string;
}

const startLimiter = createRateLimiter(6, 10 * 60_000);
const taskLimiter = createRateLimiter(20, 10 * 60_000);
const pollLimiter = createRateLimiter(600, 10 * 60_000);

interface SessionRow {
  id: string;
  user_id: string;
  sandbox_id: string | null;
  status: 'starting' | 'active' | 'ended';
  secret_ciphertext: string | null;
  secret_iv: string | null;
  secret_tag: string | null;
  started_at: string;
  expires_at: string;
  billed_minutes: number;
  ended_at: string | null;
}

interface SessionSecrets {
  token: string;
  viewPassword: string;
  controlPassword: string;
}

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

const fail = (request: Request, status: Exclude<NavigatorStatus, 'ok'>, extra: Record<string, unknown> = {}, http = 200) =>
  json(request, { ok: false, status, message: NAVIGATOR_MESSAGES[status], ...extra }, http);

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text().catch(() => '');
  if (text.length > NAVIGATOR_LIMITS.maxBodyBytes) return null;
  try {
    const parsed = JSON.parse(text || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const intEnv = (raw: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : fallback;
};
const maxSessions = (env: NavigatorEnv) => intEnv(env.NAVIGATOR_MAX_SESSIONS, NAVIGATOR_LIMITS.maxConcurrentSessions, 1, 50);
const creditsPerMinute = (env: NavigatorEnv) => intEnv(env.NAVIGATOR_CREDITS_PER_MINUTE, NAVIGATOR_LIMITS.creditsPerMinute, 0, 100);

// ─── Sessões ──────────────────────────────────────────────────────────────
const sessions = (env: NavigatorEnv) => table(env, 'navigator_sessions');

async function loadSession(env: NavigatorEnv, userId: string, sessionId: string): Promise<SessionRow | null> {
  const rows = await sessions(env).select<SessionRow>({ id: `eq.${sessionId}`, user_id: `eq.${userId}`, limit: '1' });
  return rows[0] ?? null;
}

async function activeSessionOf(env: NavigatorEnv, userId: string): Promise<SessionRow | null> {
  const rows = await sessions(env).select<SessionRow>({ user_id: `eq.${userId}`, status: 'in.(starting,active)', order: 'started_at.desc', limit: '1' });
  return rows[0] ?? null;
}

async function secretsOf(env: NavigatorEnv, row: SessionRow): Promise<SessionSecrets> {
  if (!row.secret_ciphertext || !row.secret_iv || !row.secret_tag) throw new Error('session_without_secrets');
  return JSON.parse(await decryptWithConnectorKey(navKey(env), { ciphertext: row.secret_ciphertext, iv: row.secret_iv, tag: row.secret_tag })) as SessionSecrets;
}

async function sealSecrets(env: NavigatorEnv, s: SessionSecrets) {
  const enc = await encryptWithConnectorKey(navKey(env), JSON.stringify(s));
  return { secret_ciphertext: enc.ciphertext, secret_iv: enc.iv, secret_tag: enc.tag };
}

async function endSession(env: NavigatorEnv, row: SessionRow, reason: string): Promise<void> {
  await sessions(env).update({ id: `eq.${row.id}`, status: 'neq.ended' }, { status: 'ended', ended_at: new Date().toISOString(), end_reason: reason }).catch(() => undefined);
  if (row.sandbox_id) await killSandbox(env, row.sandbox_id);
}

/** Cobra os minutos devidos (pré-pago). Trava otimista em billed_minutes: duas chamadas simultâneas não cobram duas vezes. */
async function bill(env: NavigatorEnv, row: SessionRow, now = Date.now()): Promise<'ok' | 'insufficient_credits'> {
  const perMinute = creditsPerMinute(env);
  const due = minutesDue(Date.parse(row.started_at), row.billed_minutes, now, Date.parse(row.expires_at));
  if (due <= 0) return 'ok';
  const from = row.billed_minutes + 1;
  const to = row.billed_minutes + due;
  const updated = await sessions(env).update<SessionRow>({ id: `eq.${row.id}`, billed_minutes: `eq.${row.billed_minutes}` }, { billed_minutes: to, last_activity_at: new Date(now).toISOString() });
  if (updated.length === 0) return 'ok'; // outra chamada já cobrou este intervalo
  row.billed_minutes = to;
  if (perMinute === 0) return 'ok';
  try {
    await rpc(env, 'execute_atomic_credit_deduction', {
      _user_id: row.user_id,
      _amount: perMinute * due,
      _reason: 'navigator_minutes',
      _category: 'vertal_chat',
      _metadata: { source: 'navigator', session_id: row.id, minutes: `${from}-${to}` },
      _idempotency_key: `navigator:${row.id}:m${from}-${to}`,
    });
    return 'ok';
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (/insufficient_credits|subscription_not_found/.test(message)) return 'insufficient_credits';
    throw e;
  }
}

// ─── Perfil (cookies cifrados por usuário) ───────────────────────────────
interface Cookie {
  name: string;
  value: string;
  domain: string;
  [k: string]: unknown;
}

async function loadProfileCookies(env: NavigatorEnv, userId: string): Promise<Cookie[]> {
  const rows = await table(env, 'navigator_profiles').select<{ ciphertext: string; iv: string; tag: string }>({ user_id: `eq.${userId}`, select: 'ciphertext,iv,tag', limit: '1' });
  if (!rows[0]) return [];
  try {
    const parsed = JSON.parse(await decryptWithConnectorKey(navKey(env), rows[0]));
    return Array.isArray(parsed) ? (parsed as Cookie[]) : [];
  } catch {
    return []; // chave trocada ou dado corrompido: começa sem cookies
  }
}

export function filterCookies(cookies: unknown): Cookie[] {
  if (!Array.isArray(cookies)) return [];
  return cookies
    .filter((c): c is Cookie => !!c && typeof c === 'object' && typeof (c as Cookie).name === 'string' && typeof (c as Cookie).domain === 'string')
    .filter((c) => !isBlockedHost(String(c.domain).replace(/^\./, '')))
    .slice(0, NAVIGATOR_LIMITS.maxCookies);
}

async function saveProfile(env: NavigatorEnv, userId: string, target: NavdTarget): Promise<number | null> {
  try {
    const { data } = await navd<{ ok?: boolean; cookies?: unknown }>(env, target, 'GET', '/cookies');
    if (!data.ok) return null;
    const cookies = filterCookies(data.cookies);
    const plain = JSON.stringify(cookies);
    if (plain.length > NAVIGATOR_LIMITS.maxProfileBytes) return null;
    const enc = await encryptWithConnectorKey(navKey(env), plain);
    await table(env, 'navigator_profiles').upsert(
      { user_id: userId, ciphertext: enc.ciphertext, iv: enc.iv, tag: enc.tag, cookie_count: cookies.length, bytes: plain.length, updated_at: new Date().toISOString() },
      'user_id',
    );
    return cookies.length;
  } catch (e) {
    console.error('navigator: saveProfile falhou', e instanceof Error ? e.message.slice(0, 200) : e);
    return null;
  }
}

// ─── Cofre (fill_secret) ─────────────────────────────────────────────────
const navKey = (env: NavigatorEnv): string | undefined => env.NAVIGATOR_ENC_KEY || env.CONNECTOR_ENC_KEY;

/** Valor do cofre: decifra local se houver CONNECTOR_ENC_KEY; senão pede à edge function kubo-secrets (que audita). */
async function resolveVaultValue(env: NavigatorEnv, userId: string, secretId: string, host: string, sessionId: string): Promise<string | null> {
  if (env.CONNECTOR_ENC_KEY) {
    const rows = await table(env, 'kubo_secrets').select<{ ciphertext: string; iv: string; tag: string }>({ id: `eq.${secretId}`, select: 'ciphertext,iv,tag', limit: '1' });
    if (!rows[0]) return null;
    const v = await decryptWithConnectorKey(env.CONNECTOR_ENC_KEY, rows[0]);
    await table(env, 'kubo_secret_audit').insert({ secret_id: secretId, actor_id: userId, action: 'inject', meta: { target: 'navigator', host, session_id: sessionId } }).catch(() => undefined);
    return v;
  }
  if (!env.NAVIGATOR_INTERNAL_TOKEN || !env.SUPABASE_URL) return null;
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/kubo-secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-navigator-token': env.NAVIGATOR_INTERNAL_TOKEN, apikey: env.SUPABASE_SECRET_KEY ?? '', Authorization: `Bearer ${env.SUPABASE_SECRET_KEY ?? ''}` },
    body: JSON.stringify({ id: secretId, user_id: userId, host, session_id: sessionId }),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { value?: unknown };
  return typeof data.value === 'string' ? data.value : null;
}
async function visibleSecrets(env: NavigatorEnv, userId: string): Promise<VaultSecretMeta[]> {
  const cols = 'id,owner_id,env_key,bound_to';
  const owned = await table(env, 'kubo_secrets').select<Omit<VaultSecretMeta, 'role'>>({ owner_id: `eq.${userId}`, bound_to: 'not.is.null', select: cols });
  const grants = await table(env, 'kubo_secret_grants').select<{ secret_id: string }>({ grantee_id: `eq.${userId}`, select: 'secret_id' });
  const ids = grants.map((g) => g.secret_id).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const granted = ids.length
    ? await table(env, 'kubo_secrets').select<Omit<VaultSecretMeta, 'role'>>({ id: `in.(${ids.join(',')})`, bound_to: 'not.is.null', select: cols })
    : [];
  return [...owned.map((s) => ({ ...s, role: 'owner' as const })), ...granted.map((s) => ({ ...s, role: 'grant' as const }))];
}

/** Resolve um pedido needs_secret do agente: decifra no Worker e entrega direto ao navd. O valor nunca sai do servidor. */
async function fulfillSecret(env: NavigatorEnv, userId: string, row: SessionRow, target: NavdTarget, pending: { id: string; name?: string; host?: string }): Promise<boolean> {
  const host = String(pending.host ?? '');
  const secret = pickSecretForHost(await visibleSecrets(env, userId), pending.name, host);
  if (!secret) {
    await navd(env, target, 'POST', '/input', { id: pending.id, kind: 'secret', value: null }).catch(() => undefined);
    return false;
  }
  let value: string | null = await resolveVaultValue(env, userId, secret.id, host, row.id);
  if (value === null) return false;
  try {
    await navd(env, target, 'POST', '/input', { id: pending.id, kind: 'secret', value });
  } finally {
    value = null;
  }
  const now = new Date().toISOString();
  await table(env, 'kubo_secrets').update({ id: `eq.${secret.id}` }, { last_used_at: now }).catch(() => undefined);
  return true;
}

/** Chave do OpenRouter guardada como segredo do Supabase (NAVIGATOR_OPENROUTER_KEY), entregue pelo kubo-secrets. */
let cachedLlmKey: { v: string; at: number } | null = null;
async function internalLlmKey(env: NavigatorEnv): Promise<string | undefined> {
  if (cachedLlmKey && Date.now() - cachedLlmKey.at < 10 * 60_000) return cachedLlmKey.v;
  if (!env.NAVIGATOR_INTERNAL_TOKEN || !env.SUPABASE_URL) return undefined;
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/kubo-secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-navigator-token': env.NAVIGATOR_INTERNAL_TOKEN, apikey: env.SUPABASE_SECRET_KEY ?? '', Authorization: `Bearer ${env.SUPABASE_SECRET_KEY ?? ''}` },
    body: JSON.stringify({ op: 'llm_key' }),
  }).catch(() => null);
  if (!res?.ok) return undefined;
  const data = (await res.json().catch(() => ({}))) as { value?: unknown };
  if (typeof data.value !== 'string' || !data.value) return undefined;
  cachedLlmKey = { v: data.value, at: Date.now() };
  return data.value;
}

// ─── Rotas ────────────────────────────────────────────────────────────────
export async function handleNavigator(request: Request, env: NavigatorEnv, url: URL): Promise<Response> {
  const route = url.pathname.slice(NAVIGATOR_API_PREFIX.length).replace(/^\/+|\/+$/g, '');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return fail(request, 'bad_request', {}, 405);
  if (!['start', 'task', 'status', 'input', 'takeover', 'release', 'stop', 'forget'].includes(route)) return fail(request, 'bad_request', {}, 404);

  let userId: string | null;
  try {
    userId = await getUserId(env, request.headers.get('Authorization'));
  } catch {
    return fail(request, 'not_configured', {}, 503);
  }
  if (!userId) return fail(request, 'unauthorized', {}, 401);
  if (!env.E2B_API_KEY || !env.SUPABASE_SECRET_KEY || !navKey(env) || (!env.CONNECTOR_ENC_KEY && !env.NAVIGATOR_INTERNAL_TOKEN)) return fail(request, 'not_configured', {}, 503);

  const body = await readBody(request);
  if (!body) return fail(request, 'bad_request', {}, 400);

  try {
    switch (route) {
      case 'start':
        return await start(request, env, userId, body);
      case 'forget':
        await table(env, 'navigator_profiles').delete({ user_id: `eq.${userId}` });
        return json(request, { ok: true, status: 'ok' });
      default:
        return await withSession(request, env, userId, route, body);
    }
  } catch (e) {
    if (e instanceof EncKeyMissingError) return fail(request, 'not_configured', {}, 503);
    if (e instanceof E2BError) {
      console.error('navigator: e2b', route, e.message.slice(0, 300));
      return fail(request, 'sandbox_error', {}, 502);
    }
    console.error('navigator: erro', route, e instanceof Error ? e.message.slice(0, 300) : e);
    return fail(request, 'error', {}, 500);
  }
}

function sessionView(env: NavigatorEnv, row: SessionRow, s: SessionSecrets, extra: Record<string, unknown> = {}) {
  return {
    sessionId: row.id,
    liveViewUrl: row.sandbox_id ? liveViewUrl(row.sandbox_id, e2bDomain(env), s.viewPassword, false) : null,
    expiresAt: row.expires_at,
    billedMinutes: row.billed_minutes,
    creditsPerMinute: creditsPerMinute(env),
    ...extra,
  };
}

async function start(request: Request, env: NavigatorEnv, userId: string, body: Record<string, unknown>): Promise<Response> {
  const parsed = parseStartBody(body);
  if (!parsed.ok) return fail(request, parsed.status);

  // Reaproveita a sessão viva do usuário.
  const existing = await activeSessionOf(env, userId);
  if (existing) {
    if (existing.status === 'starting' && Date.now() - Date.parse(existing.started_at) < 60_000) return fail(request, 'busy', { detail: 'starting' }, 409);
    const expired = Date.parse(existing.expires_at) <= Date.now();
    const alive = !expired && existing.status === 'active' && existing.sandbox_id && (await waitNavd(env, existing.sandbox_id, 4_000));
    if (alive) {
      const s = await secretsOf(env, existing);
      if ((await bill(env, existing)) === 'insufficient_credits') {
        await saveProfile(env, userId, { sandboxId: existing.sandbox_id!, token: s.token });
        await endSession(env, existing, 'insufficient_credits');
        return fail(request, 'insufficient_credits', {}, 402);
      }
      await setSandboxTimeout(env, existing.sandbox_id!, NAVIGATOR_LIMITS.idleTimeoutSeconds);
      return json(request, { ok: true, status: 'ok', reused: true, ...sessionView(env, existing, s) });
    }
    await endSession(env, existing, expired ? 'expired' : 'sandbox_gone');
  }

  if (!startLimiter.take(userId)) return fail(request, 'rate_limited', {}, 429);
  const live = await sessions(env).select<{ id: string }>({ status: 'in.(starting,active)', expires_at: `gt.${new Date().toISOString()}`, select: 'id' });
  if (live.length >= maxSessions(env)) return fail(request, 'capacity', {}, 503);

  const secrets: SessionSecrets = { token: randomToken(), viewPassword: randomPassword(), controlPassword: randomPassword() };
  while (secrets.controlPassword === secrets.viewPassword) secrets.controlPassword = randomPassword();
  const id = crypto.randomUUID();
  const now = Date.now();
  const row: SessionRow = {
    id, user_id: userId, sandbox_id: null, status: 'starting', secret_ciphertext: null, secret_iv: null, secret_tag: null,
    started_at: new Date(now).toISOString(), expires_at: new Date(now + NAVIGATOR_LIMITS.maxSessionMinutes * 60_000).toISOString(),
    billed_minutes: 0, ended_at: null,
  };
  try {
    // Índice único parcial (uma sessão viva por usuário) barra dois starts simultâneos.
    await sessions(env).insert({ ...row, ...(await sealSecrets(env, secrets)) });
  } catch {
    return fail(request, 'busy', { detail: 'starting' }, 409);
  }

  try {
    const sandbox = await createSandbox(env, { timeoutSeconds: NAVIGATOR_LIMITS.idleTimeoutSeconds, metadata: { app: 'vertal-navigator', session: id } });
    row.sandbox_id = sandbox.sandboxId;
    await sessions(env).update({ id: `eq.${id}` }, { sandbox_id: sandbox.sandboxId });
    if (!(await waitNavd(env, sandbox.sandboxId))) throw new E2BError('navd_not_ready');
    const cookies = await loadProfileCookies(env, userId);
    const init = await navd<{ ok?: boolean; cookiesImported?: number }>(env, { sandboxId: sandbox.sandboxId }, 'POST', '/init', {
      token: secrets.token, viewPassword: secrets.viewPassword, controlPassword: secrets.controlPassword,
      cookies, ...(parsed.data.url ? { startUrl: parsed.data.url } : {}),
    }, 45_000);
    if (!init.data.ok) throw new E2BError('navd_init_failed');
    if ((await bill(env, row, now)) === 'insufficient_credits') {
      await endSession(env, row, 'insufficient_credits');
      return fail(request, 'insufficient_credits', {}, 402);
    }
    await sessions(env).update({ id: `eq.${id}` }, { status: 'active', last_activity_at: new Date().toISOString() });
    row.status = 'active';
    return json(request, { ok: true, status: 'ok', reused: false, cookiesRestored: init.data.cookiesImported ?? 0, ...sessionView(env, row, secrets) });
  } catch (e) {
    await endSession(env, row, 'start_failed');
    throw e;
  }
}

async function withSession(request: Request, env: NavigatorEnv, userId: string, route: string, body: Record<string, unknown>): Promise<Response> {
  const base = parseSessionBody(body);
  if (!base.ok) return fail(request, base.status, { detail: base.detail }, 400);
  const row = await loadSession(env, userId, base.data.sessionId);
  if (!row) return fail(request, 'no_session', {}, 404);
  if (row.status === 'ended' || !row.sandbox_id) return fail(request, 'session_ended');
  const s = await secretsOf(env, row);
  const target: NavdTarget = { sandboxId: row.sandbox_id, token: s.token };

  if (route === 'stop' || Date.parse(row.expires_at) <= Date.now()) {
    const saved = await saveProfile(env, userId, target);
    await navd(env, target, 'POST', '/stop', {}, 12_000).catch(() => undefined);
    await bill(env, row).catch(() => undefined);
    await endSession(env, row, route === 'stop' ? 'user_stop' : 'expired');
    return route === 'stop'
      ? json(request, { ok: true, status: 'ok', cookiesSaved: saved, billedMinutes: row.billed_minutes })
      : fail(request, 'session_ended', { detail: 'expired', cookiesSaved: saved });
  }

  if (route === 'status' ? !pollLimiter.take(userId) : route === 'task' ? !taskLimiter.take(userId) : false) {
    return fail(request, 'rate_limited', {}, 429);
  }

  if ((await bill(env, row)) === 'insufficient_credits') {
    await saveProfile(env, userId, target);
    await endSession(env, row, 'insufficient_credits');
    return fail(request, 'insufficient_credits', {}, 402);
  }
  // Atividade renova o timeout de inatividade do sandbox.
  if (!(await setSandboxTimeout(env, row.sandbox_id, NAVIGATOR_LIMITS.idleTimeoutSeconds))) {
    await endSession(env, row, 'sandbox_gone');
    return fail(request, 'session_ended', { detail: 'sandbox_gone' });
  }

  switch (route) {
    case 'task': {
      const parsed = parseTaskBody(body);
      if (!parsed.ok) return fail(request, parsed.status, { detail: parsed.detail }, 400);
      const provider = env.NAVIGATOR_LLM_PROVIDER === 'deepseek' ? 'deepseek' : 'openrouter';
      const llmKey = provider === 'deepseek' ? env.DEEPSEEK_API_KEY : (env.OPENROUTER_API_KEY || (await internalLlmKey(env)));
      if (!llmKey) return fail(request, 'not_configured', { detail: provider }, 503);
      const usable = (await visibleSecrets(env, userId)).map((x) => ({ name: x.env_key, boundTo: x.bound_to }));
      const task = parsed.data.url ? `Comece abrindo ${parsed.data.url}. ${parsed.data.task}` : parsed.data.task;
      const res = await navd<{ ok?: boolean; runId?: string; error?: string }>(env, target, 'POST', '/task', {
        task, provider, apiKey: llmKey,
        model: env.NAVIGATOR_MODEL || (provider === 'deepseek' ? 'deepseek-flash' : 'google/gemini-3-flash-preview'),
        maxSteps: parsed.data.maxSteps, secrets: usable,
      });
      if (res.status === 409) return fail(request, 'busy', {}, 409);
      if (!res.data.ok) return fail(request, 'bad_request', { detail: res.data.error }, 400);
      return json(request, { ok: true, status: 'ok', runId: res.data.runId, ...sessionView(env, row, s) });
    }
    case 'status': {
      const res = await navd<{ ok?: boolean; status?: string; runId?: string; takeover?: boolean; url?: string; events?: unknown; lastSeq?: number; pending?: unknown; screenshot?: string }>(
        env, target, 'GET', `/events?after=${base.data.after}`,
      );
      if (!res.data.ok) return fail(request, 'sandbox_error', {}, 502);
      const pending = sanitizePending(res.data.pending);
      // Segredos pedidos pelo agente: resolvidos aqui, no servidor.
      for (const p of pending.filter((x) => x.kind === 'secret')) {
        await fulfillSecret(env, userId, row, target, p);
      }
      const events = sanitizeEvents(res.data.events);
      let cookiesSaved: number | null = null;
      if (events.some((e) => e.type === 'done')) cookiesSaved = await saveProfile(env, userId, target);
      const pageUrl = typeof res.data.url === 'string' && normalizeNavigatorUrl(res.data.url) ? res.data.url : undefined;
      return json(request, {
        ok: true, status: 'ok', agentStatus: res.data.status, runId: res.data.runId, takeover: !!res.data.takeover,
        url: pageUrl, events, lastSeq: res.data.lastSeq ?? base.data.after,
        pending: pending.filter((p) => p.kind !== 'secret'),
        filling: pending.filter((p) => p.kind === 'secret').map((p) => ({ name: p.name, host: p.host })),
        screenshot: typeof res.data.screenshot === 'string' && res.data.screenshot.startsWith('data:image/jpeg;base64,') ? res.data.screenshot : undefined,
        ...(cookiesSaved !== null ? { cookiesSaved } : {}),
        ...sessionView(env, row, s),
      });
    }
    case 'input': {
      const parsed = parseInputBody(body);
      if (!parsed.ok) return fail(request, parsed.status, { detail: parsed.detail }, 400);
      const d = parsed.data;
      const res = await navd<{ ok?: boolean; error?: string }>(env, target, 'POST', '/input',
        d.kind === 'approval' ? { id: d.requestId, kind: 'approval', approve: d.approve } : { id: d.requestId, kind: d.kind, value: d.value });
      if (!res.data.ok) return fail(request, 'not_pending', { detail: res.data.error }, 409);
      return json(request, { ok: true, status: 'ok' });
    }
    case 'takeover': {
      // Senha de controle nova a cada tomada de controle: a URL anterior não vale mais.
      const next = { ...s, controlPassword: randomPassword() };
      while (next.controlPassword === next.viewPassword) next.controlPassword = randomPassword();
      const res = await navd<{ ok?: boolean }>(env, target, 'POST', '/takeover', { controlPassword: next.controlPassword });
      if (!res.data.ok) return fail(request, 'sandbox_error', {}, 502);
      await sessions(env).update({ id: `eq.${row.id}` }, await sealSecrets(env, next));
      return json(request, { ok: true, status: 'ok', controlUrl: liveViewUrl(row.sandbox_id, e2bDomain(env), next.controlPassword, true), ...sessionView(env, row, next) });
    }
    case 'release': {
      const next = { ...s, controlPassword: randomPassword() };
      while (next.controlPassword === next.viewPassword) next.controlPassword = randomPassword();
      const res = await navd<{ ok?: boolean }>(env, target, 'POST', '/release', { controlPassword: next.controlPassword });
      if (!res.data.ok) return fail(request, 'sandbox_error', {}, 502);
      await sessions(env).update({ id: `eq.${row.id}` }, await sealSecrets(env, next));
      // O usuário pode ter feito login à mão: guarda os cookies agora.
      const cookiesSaved = await saveProfile(env, userId, target);
      return json(request, { ok: true, status: 'ok', cookiesSaved, ...sessionView(env, row, next) });
    }
    default:
      return fail(request, 'bad_request', {}, 404);
  }
}
