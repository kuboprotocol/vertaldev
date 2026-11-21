// Coleta web com Scrapling (F5) para o Vertal Chat, o Vibe Code e o Navigator.
//   POST /api/scrape/page           {url|urls, mode?, selectors?, adaptive?, includeText?, purpose?, sessionId?}
//   POST /api/scrape/crawl          {url, mode?, maxPages?, maxDepth?, pathPrefix?, selectors?, purpose?}
//   POST /api/scrape/monitors       {}                                   → lista do usuário
//   POST /api/scrape/monitor-create {name?, url, selector, selectorType?, mode?, frequencyMinutes?}
//   POST /api/scrape/monitor-update {id, status: "active"|"paused"}
//   POST /api/scrape/monitor-delete {id}
//   POST /api/scrape/monitor-check  {id}                                 → verifica agora (cobra)
//   POST /api/scrape/alerts         {}  · /alerts-seen {ids}             → alertas de mudança para o chat
//   POST /api/scrape/pricing        {}                                   → tabela de créditos (pública)
//   POST /api/scrape/cron           (x-cron-token)                       → monitores vencidos (pg_cron a cada 15 min)
//
// O Scrapling roda no sandbox E2B "vertal-browser" (navd → scraped.py, venv próprio).
// Regras duras (docs/VERTAL_SCRAPLING.md): termo assinado (consent gate), robots.txt,
// rate limit por domínio e por usuário, teto de páginas, sem captcha/paywall/login de
// terceiros, dados pessoais mascarados, auditoria em navigator_audit, saldo antes.
import {
  SCRAPE_LIMITS, SCRAPE_MESSAGES, SCRAPE_PRICE_TABLE, SCRAPE_USER_AGENT, billablePages, captchaUrls, createWindowLimiter, describeMonitorDiff,
  diffMonitorValue, isAllowedByRobots, nextCheckAt, pagePriceKey, parseCrawlBody, parseMonitorBody, parseScrapeBody, rateLimitDecision,
  robotsFromResponse, sanitizePages, scrapeCost, scrapePrice, type RobotsPolicy, type ScrapeMode, type ScrapePage, type ScrapeSelector, type ScrapeStatus,
} from '../supabase/functions/_shared/scrapeCore.ts';
import { classifyByRules, decideGate } from '../supabase/functions/_shared/consentGate.ts';
import { auditDetail, type NavigatorAuditKind } from '../supabase/functions/_shared/navigatorCore.ts';
import { createSandbox, E2BError, killSandbox, navd, waitNavd, type E2BEnv, type NavdTarget } from './e2bClient';
import { loadAcceptedVersions, recordConsentAudit, safeEqual, type ConsentEnv } from './consentRoutes';
import { randomToken } from './navigatorCrypto';
import { isAllowedOrigin } from './spotifyRoutes';
import { getUserId, rpc, table, type SupabaseEnv } from './supabaseRest';

export const SCRAPE_API_PREFIX = '/api/scrape';

export interface ScrapeEnv extends SupabaseEnv, E2BEnv, ConsentEnv {
  /** Template E2B da coleta (padrão: o mesmo do Navigator, vertal-browser). */
  SCRAPE_TEMPLATE?: string;
  /** Sandboxes de coleta simultâneos (padrão 2). */
  SCRAPE_MAX_SANDBOXES?: string;
  /** Liga/desliga a coleta sem novo deploy ("off" desliga). */
  SCRAPE_ENABLED?: string;
}

/** Para a rota page com sessionId: alvo do navd na sessão do Navigator do usuário (registrado por navigatorRoutes). */
export type SessionTargetResolver = (env: ScrapeEnv, userId: string, sessionId: string) => Promise<NavdTarget | null>;
let resolveSession: SessionTargetResolver | null = null;
export function registerSessionResolver(fn: SessionTargetResolver) {
  resolveSession = fn;
}

const userLimiter = createWindowLimiter(SCRAPE_LIMITS.userTasksPer10Min, 10 * 60_000);
const robotsCache = new Map<string, { at: number; policy: RobotsPolicy }>();

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  const h: Record<string, string> = { 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Max-Age': '600', Vary: 'Origin' };
  if (isAllowedOrigin(origin)) h['Access-Control-Allow-Origin'] = origin!;
  return h;
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

const fail = (request: Request, status: Exclude<ScrapeStatus, 'ok'>, extra: Record<string, unknown> = {}, http = 200) =>
  json(request, { ok: false, status, message: SCRAPE_MESSAGES[status], ...extra }, http);

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text().catch(() => '');
  if (text.length > SCRAPE_LIMITS.maxBodyBytes) return null;
  try {
    const v = JSON.parse(text || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return '';
  }
};

async function audit(env: SupabaseEnv, userId: string, kind: NavigatorAuditKind, detail: Record<string, unknown>) {
  await table(env, 'navigator_audit').insert({ user_id: userId, session_id: null, kind, detail: auditDetail(detail) }).catch((e) => {
    console.error('scrape: audit falhou', kind, e instanceof Error ? e.message.slice(0, 160) : e);
  });
}

// ─── robots.txt (pré-checagem no Worker; o navd confere de novo) ─────────

export async function robotsPolicyFor(origin: string, doFetch: typeof fetch = fetch, now = Date.now()): Promise<RobotsPolicy> {
  const hit = robotsCache.get(origin);
  if (hit && now - hit.at < SCRAPE_LIMITS.robotsCacheMs) return hit.policy;
  let policy: RobotsPolicy;
  try {
    const res = await doFetch(`${origin}/robots.txt`, { headers: { 'User-Agent': SCRAPE_USER_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(SCRAPE_LIMITS.robotsTimeoutMs) });
    const text = res.ok ? (await res.text()).slice(0, SCRAPE_LIMITS.maxRobotsBytes) : '';
    policy = robotsFromResponse(res.status, text);
  } catch {
    policy = robotsFromResponse(null, '');
  }
  robotsCache.set(origin, { at: now, policy });
  if (robotsCache.size > 2_000) robotsCache.delete(robotsCache.keys().next().value!);
  return policy;
}

async function robotsAllows(url: string): Promise<boolean> {
  const u = new URL(url);
  return isAllowedByRobots(await robotsPolicyFor(u.origin), `${u.pathname}${u.search}`);
}

// ─── Créditos ────────────────────────────────────────────────────────────

async function balanceOf(env: SupabaseEnv, userId: string): Promise<number> {
  const rows = await table(env, 'subscriptions').select<{ edits_limit: number; edits_used: number }>({ user_id: `eq.${userId}`, is_active: 'eq.true', select: 'edits_limit,edits_used', limit: '1' }).catch(() => []);
  return rows[0] ? Math.max(0, Number(rows[0].edits_limit) - Number(rows[0].edits_used)) : 0;
}

async function charge(env: SupabaseEnv, userId: string, amount: number, reason: string, key: string, metadata: Record<string, unknown>): Promise<'ok' | 'insufficient_credits'> {
  if (amount <= 0) return 'ok';
  try {
    await rpc(env, 'execute_atomic_credit_deduction', { _user_id: userId, _amount: amount, _reason: reason, _category: 'vertal_chat', _metadata: { source: 'scrapling', ...metadata }, _idempotency_key: key });
    return 'ok';
  } catch (e) {
    if (/insufficient_credits|subscription_not_found/.test(e instanceof Error ? e.message : '')) return 'insufficient_credits';
    throw e;
  }
}

// ─── Sandbox de coleta ───────────────────────────────────────────────────

const maxSandboxes = (env: ScrapeEnv) => {
  const n = Number(env.SCRAPE_MAX_SANDBOXES);
  return Number.isFinite(n) && n >= 1 && n <= 20 ? Math.floor(n) : SCRAPE_LIMITS.maxConcurrentSandboxes;
};

interface Collector { target: NavdTarget; owned: boolean }

async function openCollector(env: ScrapeEnv, meta: Record<string, string>): Promise<Collector> {
  const tplEnv: E2BEnv = { ...env, NAVIGATOR_TEMPLATE: env.SCRAPE_TEMPLATE || env.NAVIGATOR_TEMPLATE };
  const sb = await createSandbox(tplEnv, { timeoutSeconds: 240, metadata: { app: 'vertal-scrapling', ...meta } });
  try {
    if (!(await waitNavd(env, sb.sandboxId))) throw new E2BError('navd_not_ready');
    const token = randomToken();
    const init = await navd<{ ok?: boolean }>(env, { sandboxId: sb.sandboxId }, 'POST', '/init', { mode: 'scrape', token }, 20_000);
    if (!init.data.ok) throw new E2BError('navd_init_failed');
    return { target: { sandboxId: sb.sandboxId, token }, owned: true };
  } catch (e) {
    await killSandbox(env, sb.sandboxId);
    throw e;
  }
}

async function runCollector(env: ScrapeEnv, c: Collector, body: Record<string, unknown>): Promise<{ pages: unknown; truncated?: boolean }> {
  const res = await navd<{ ok?: boolean; pages?: unknown; truncated?: boolean; error?: string }>(env, c.target, 'POST', '/scrape', body, SCRAPE_LIMITS.taskTimeoutMs + 10_000);
  if (!res.data.ok) throw new E2BError(`scrape_failed:${res.data.error ?? res.status}`);
  return { pages: res.data.pages, truncated: res.data.truncated };
}

// ─── Gate comum (termo, proibidos, rate limit, saldo, capacidade) ────────

interface GateOk { ok: true; runId: string }
type GateResult = GateOk | { ok: false; response: Response };

async function preflight(request: Request, env: ScrapeEnv, userId: string, o: {
  tool: 'scrape_page' | 'crawl_site'; mode: ScrapeMode; urls: string[]; maxPages: number; purpose: string;
}): Promise<GateResult> {
  // 1) Consent gate: proibido bloqueia sempre; a ferramenta exige o termo "web_scraping".
  const cls = classifyByRules(`${o.purpose}\n${o.urls.join(' ')}`);
  const decision = decideGate(cls, await loadAcceptedVersions(env, userId), { clarifiedBefore: true, toolCategory: 'web_scraping' });
  if (decision.action === 'block') {
    await recordConsentAudit(env, { userId, surface: 'scrape', cls, action: 'block', text: o.purpose });
    await audit(env, userId, 'consent_blocked', { reason: cls.reason, url: o.urls[0], tool: o.tool });
    return { ok: false, response: fail(request, 'prohibited', { reason: cls.reason }) };
  }
  if (decision.action === 'require_terms') {
    await recordConsentAudit(env, { userId, surface: 'scrape', cls: { ...cls, category: decision.category }, action: 'require_terms', text: o.purpose });
    return { ok: false, response: fail(request, 'consent_required', { category: decision.category, version: decision.version, title: decision.title }) };
  }
  // 2) Rate limit: no isolate e no banco (vale entre isolates).
  if (!userLimiter.take(userId)) return { ok: false, response: fail(request, 'rate_limited', { detail: 'user_tasks' }, 429) };
  const since10 = new Date(Date.now() - 10 * 60_000).toISOString();
  const since1 = new Date(Date.now() - 60_000).toISOString();
  const hosts = [...new Set(o.urls.map(hostOf).filter(Boolean))];
  const [mine, byDomain, running] = await Promise.all([
    table(env, 'scrape_runs').select<{ pages: number }>({ user_id: `eq.${userId}`, created_at: `gt.${since10}`, select: 'pages', limit: '500' }),
    table(env, 'scrape_runs').select<{ hosts: string[]; pages: number }>({ hosts: `ov.{${hosts.map((h) => `"${h}"`).join(',')}}`, created_at: `gt.${since1}`, select: 'hosts,pages', limit: '500' }),
    table(env, 'scrape_runs').select<{ id: string }>({ status: 'eq.running', created_at: `gt.${new Date(Date.now() - 3 * 60_000).toISOString()}`, select: 'id', limit: '50' }),
  ]);
  const domainPages: Record<string, number> = {};
  for (const r of byDomain) for (const h of r.hosts ?? []) domainPages[h] = (domainPages[h] ?? 0) + Math.max(1, r.pages);
  const rl = rateLimitDecision({ userPages10m: mine.reduce((n, r) => n + r.pages, 0), userTasks10m: mine.length, domainPages1m: domainPages, wantPages: o.maxPages, hosts });
  if (!rl.ok) return { ok: false, response: fail(request, 'rate_limited', { detail: rl.reason, host: rl.host }, 429) };
  // 3) Saldo ANTES (custo máximo possível).
  const maxCost = scrapeCost(o.tool === 'crawl_site' ? 'crawl' : 'scrape', o.mode, o.maxPages);
  if ((await balanceOf(env, userId)) < maxCost) return { ok: false, response: fail(request, 'insufficient_credits', { needed: maxCost }, 402) };
  // 4) Capacidade.
  if (running.length >= maxSandboxes(env)) return { ok: false, response: fail(request, 'capacity', {}, 503) };
  const runId = crypto.randomUUID();
  await table(env, 'scrape_runs').insert({ id: runId, user_id: userId, tool: o.tool, mode: o.mode, hosts, url: o.urls[0], status: 'running' });
  return { ok: true, runId };
}

async function finish(env: ScrapeEnv, userId: string, runId: string, o: { tool: 'scrape_page' | 'crawl_site'; mode: ScrapeMode; url: string; pages: ScrapePage[] }) {
  const pages = billablePages(o.pages);
  const unit = scrapePrice(pagePriceKey(o.tool === 'crawl_site' ? 'crawl' : 'scrape', o.mode));
  const credits = unit * pages;
  const charged = await charge(env, userId, credits, o.tool === 'crawl_site' ? 'scrapling_crawl' : 'scrapling_scrape', `scrape:${runId}`, { run_id: runId, pages, mode: o.mode });
  const blocked = o.pages.length - pages;
  await table(env, 'scrape_runs').update({ id: `eq.${runId}` }, {
    pages, blocked, credits: charged === 'ok' ? credits : 0, status: charged === 'ok' ? 'done' : 'insufficient_credits', finished_at: new Date().toISOString(),
  }).catch(() => undefined);
  await audit(env, userId, o.tool === 'crawl_site' ? 'crawl' : 'scrape', { url: o.url, mode: o.mode, pages, credits: charged === 'ok' ? credits : 0 });
  if (blocked) {
    const reasons = [...new Set(o.pages.filter((p) => p.blocked).map((p) => p.blocked))].join(',');
    await audit(env, userId, 'scrape_blocked', { url: o.url, reason: reasons, blocked });
  }
  return { charged, credits, unit, pages };
}

// ─── Rotas ────────────────────────────────────────────────────────────────

export async function handleScrape(request: Request, env: ScrapeEnv, url: URL): Promise<Response> {
  const route = url.pathname.slice(SCRAPE_API_PREFIX.length).replace(/^\/+|\/+$/g, '');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return fail(request, 'bad_request', {}, 405);
  if (route === 'pricing') return json(request, { ok: true, status: 'ok', markupPercent: 145, table: SCRAPE_PRICE_TABLE });
  if (route === 'cron') return cronRoute(request, env);
  const routes = ['page', 'crawl', 'monitors', 'monitor-create', 'monitor-update', 'monitor-delete', 'monitor-check', 'alerts', 'alerts-seen'];
  if (!routes.includes(route)) return fail(request, 'bad_request', {}, 404);
  let userId: string | null;
  try {
    userId = await getUserId(env, request.headers.get('Authorization'));
  } catch {
    return fail(request, 'not_configured', {}, 503);
  }
  if (!userId) return fail(request, 'unauthorized', {}, 401);
  if (env.SCRAPE_ENABLED === 'off' || !env.SUPABASE_SECRET_KEY || !env.E2B_API_KEY) return fail(request, 'not_configured', {}, 503);
  const body = await readBody(request);
  if (!body) return fail(request, 'bad_request', {}, 400);
  try {
    switch (route) {
      case 'page': return await pageRoute(request, env, userId, body);
      case 'crawl': return await crawlRoute(request, env, userId, body);
      case 'monitors': return await listMonitors(request, env, userId);
      case 'monitor-create': return await createMonitor(request, env, userId, body);
      case 'monitor-update': return await updateMonitor(request, env, userId, body);
      case 'monitor-delete': return await deleteMonitor(request, env, userId, body);
      case 'monitor-check': return await checkMonitorRoute(request, env, userId, body);
      case 'alerts': return await alertsRoute(request, env, userId);
      default: return await alertsSeen(request, env, userId, body);
    }
  } catch (e) {
    if (e instanceof E2BError) {
      console.error('scrape: e2b', route, e.message.slice(0, 200));
      return fail(request, 'sandbox_error', {}, 502);
    }
    console.error('scrape: erro', route, e instanceof Error ? e.message.slice(0, 200) : e);
    return fail(request, 'error', {}, 500);
  }
}

function resultView(pages: ScrapePage[], extra: Record<string, unknown>) {
  return {
    ok: true, status: 'ok', pages: pages.map(({ fingerprints: _fp, ...p }) => p), captchaUrls: captchaUrls(pages),
    blocked: pages.filter((p) => p.blocked).map((p) => ({ url: p.url, reason: p.blocked })), ...extra,
  };
}

async function pageRoute(request: Request, env: ScrapeEnv, userId: string, body: Record<string, unknown>): Promise<Response> {
  const parsed = parseScrapeBody(body);
  if (!parsed.ok) return fail(request, parsed.status, { detail: parsed.detail }, 400);
  const req = parsed.data;
  const purpose = typeof body.purpose === 'string' ? body.purpose.slice(0, 1_000) : '';
  // Sessão do Navigator: só depois de o usuário resolver um captcha na tela ao vivo (modo dinâmico, contexto dele).
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  if (sessionId && req.mode !== 'dynamic') return fail(request, 'bad_request', { detail: 'session_needs_dynamic' }, 400);
  const robotsBlocked: ScrapePage[] = [];
  const allowed: string[] = [];
  for (const u of req.urls) {
    if (await robotsAllows(u)) allowed.push(u);
    else robotsBlocked.push({ url: u, items: {}, blocked: 'robots' });
  }
  if (!allowed.length) {
    await audit(env, userId, 'scrape_blocked', { url: req.urls[0], reason: 'robots' });
    return json(request, { ...resultView(robotsBlocked, { credits: 0, mode: req.mode }), ok: false, status: 'robots', message: SCRAPE_MESSAGES.robots });
  }
  const gate = await preflight(request, env, userId, { tool: 'scrape_page', mode: req.mode, urls: allowed, maxPages: allowed.length, purpose });
  if (!gate.ok) return gate.response;
  let collector: Collector | null = null;
  try {
    if (sessionId) {
      const target = resolveSession ? await resolveSession(env, userId, sessionId) : null;
      if (!target) throw new E2BError('no_session');
      collector = { target, owned: false };
    } else {
      collector = await openCollector(env, { user: userId.slice(0, 8), run: gate.runId });
    }
    const out = await runCollector(env, collector, { mode: req.mode, urls: allowed, selectors: req.selectors, adaptive: req.adaptive, includeText: req.includeText, ...(sessionId ? { useSession: true } : {}) });
    const pages = [...sanitizePages(out.pages, allowed.length), ...robotsBlocked];
    const fin = await finish(env, userId, gate.runId, { tool: 'scrape_page', mode: req.mode, url: allowed[0], pages });
    if (fin.charged !== 'ok') return fail(request, 'insufficient_credits', {}, 402); // sem saldo: os dados não saem
    return json(request, resultView(pages, { runId: gate.runId, mode: req.mode, credits: fin.credits, unitCredits: fin.unit, billedPages: fin.pages, source: 'scrapling' }));
  } catch (e) {
    await table(env, 'scrape_runs').update({ id: `eq.${gate.runId}` }, { status: 'failed', finished_at: new Date().toISOString() }).catch(() => undefined);
    throw e;
  } finally {
    if (collector?.owned) await killSandbox(env, collector.target.sandboxId);
  }
}

async function crawlRoute(request: Request, env: ScrapeEnv, userId: string, body: Record<string, unknown>): Promise<Response> {
  const parsed = parseCrawlBody(body);
  if (!parsed.ok) return fail(request, parsed.status, { detail: parsed.detail }, 400);
  const req = parsed.data;
  if (!(await robotsAllows(req.url))) {
    await audit(env, userId, 'scrape_blocked', { url: req.url, reason: 'robots', tool: 'crawl_site' });
    return fail(request, 'robots', { pages: [{ url: req.url, items: {}, blocked: 'robots' }] });
  }
  const purpose = typeof body.purpose === 'string' ? body.purpose.slice(0, 1_000) : '';
  const gate = await preflight(request, env, userId, { tool: 'crawl_site', mode: req.mode, urls: [req.url], maxPages: req.maxPages, purpose });
  if (!gate.ok) return gate.response;
  let collector: Collector | null = null;
  try {
    collector = await openCollector(env, { user: userId.slice(0, 8), run: gate.runId });
    const out = await runCollector(env, collector, {
      mode: req.mode, selectors: req.selectors, adaptive: req.adaptive, includeText: req.includeText,
      crawl: { url: req.url, maxPages: req.maxPages, maxDepth: req.maxDepth, ...(req.pathPrefix ? { pathPrefix: req.pathPrefix } : {}) },
    });
    const pages = sanitizePages(out.pages, req.maxPages);
    const fin = await finish(env, userId, gate.runId, { tool: 'crawl_site', mode: req.mode, url: req.url, pages });
    if (fin.charged !== 'ok') return fail(request, 'insufficient_credits', {}, 402);
    return json(request, resultView(pages, { runId: gate.runId, mode: req.mode, credits: fin.credits, unitCredits: fin.unit, billedPages: fin.pages, truncated: !!out.truncated, source: 'scrapling' }));
  } catch (e) {
    await table(env, 'scrape_runs').update({ id: `eq.${gate.runId}` }, { status: 'failed', finished_at: new Date().toISOString() }).catch(() => undefined);
    throw e;
  } finally {
    if (collector?.owned) await killSandbox(env, collector.target.sandboxId);
  }
}

// ─── Monitores ───────────────────────────────────────────────────────────

interface MonitorRow {
  id: string; user_id: string; name: string; url: string; selector: ScrapeSelector; mode: ScrapeMode; frequency_minutes: number; status: string;
  status_detail: string | null; last_value: string | null; last_diff: unknown; fingerprint: Record<string, unknown> | null; last_checked_at: string | null;
  last_changed_at: string | null; next_check_at: string; consecutive_failures: number; credits_spent: number; created_at: string;
}

const MONITOR_COLS = 'id,user_id,name,url,selector,mode,frequency_minutes,status,status_detail,last_value,last_diff,fingerprint,last_checked_at,last_changed_at,next_check_at,consecutive_failures,credits_spent,created_at';
const monitorView = ({ fingerprint: _f, user_id: _u, ...m }: MonitorRow) => ({ ...m, unitCredits: scrapePrice(pagePriceKey('monitor', m.mode)) });

async function listMonitors(request: Request, env: ScrapeEnv, userId: string): Promise<Response> {
  const rows = await table(env, 'scrape_monitors').select<MonitorRow>({ user_id: `eq.${userId}`, select: MONITOR_COLS, order: 'created_at.desc', limit: String(SCRAPE_LIMITS.maxMonitorsPerUser) });
  return json(request, { ok: true, status: 'ok', monitors: rows.map(monitorView), prices: SCRAPE_PRICE_TABLE.filter((r) => r.key.startsWith('monitor')) });
}

async function loadMonitor(env: ScrapeEnv, userId: string, id: unknown): Promise<MonitorRow | null> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await table(env, 'scrape_monitors').select<MonitorRow>({ id: `eq.${id}`, user_id: `eq.${userId}`, select: MONITOR_COLS, limit: '1' });
  return rows[0] ?? null;
}

type CheckOutcome =
  | { kind: 'ok'; value: string; changed: boolean; message: string; credits: number }
  | { kind: 'blocked'; reason: string }
  | { kind: 'empty' }
  | { kind: 'no_credits' }
  | { kind: 'consent' };

/** Uma verificação: coleta, cobra (só se obteve valor), compara e atualiza o monitor. */
async function checkMonitor(env: ScrapeEnv, m: MonitorRow, getCollector: () => Promise<Collector>, opts: { baseline?: boolean } = {}): Promise<CheckOutcome> {
  const now = Date.now();
  const accepted = await loadAcceptedVersions(env, m.user_id);
  if (decideGate({ level: 'normal', category: null, reason: '', source: 'rules' }, accepted, { toolCategory: 'web_scraping' }).action !== 'allow') {
    await table(env, 'scrape_monitors').update({ id: `eq.${m.id}` }, { status: 'needs_attention', status_detail: 'Assine o termo de uso atualizado da coleta web.', next_check_at: nextCheckAt(now, m.frequency_minutes), updated_at: new Date(now).toISOString() });
    return { kind: 'consent' };
  }
  const unit = scrapePrice(pagePriceKey('monitor', m.mode));
  if ((await balanceOf(env, m.user_id)) < unit) {
    await table(env, 'scrape_monitors').update({ id: `eq.${m.id}` }, { status: 'paused_no_credits', status_detail: SCRAPE_MESSAGES.insufficient_credits, updated_at: new Date(now).toISOString() });
    await table(env, 'scrape_monitor_alerts').insert({ monitor_id: m.id, user_id: m.user_id, kind: 'no_credits', message: `Monitor "${m.name}" pausado: créditos insuficientes.`, url: m.url }).catch(() => undefined);
    return { kind: 'no_credits' };
  }
  if (!(await robotsAllows(m.url))) return markBlocked(env, m, 'robots', now);
  const c = await getCollector();
  const out = await runCollector(env, c, { mode: m.mode, urls: [m.url], selectors: [m.selector], adaptive: true, fingerprints: m.fingerprint ? { [m.selector.name]: m.fingerprint } : {}, includeText: false });
  const page = sanitizePages(out.pages, 1)[0];
  if (!page) return markBlocked(env, m, 'error', now);
  if (page.blocked) return markBlocked(env, m, page.blocked, now);
  const value = (page.items[m.selector.name] ?? [])[0] ?? '';
  if (!value) {
    const failures = m.consecutive_failures + 1;
    await table(env, 'scrape_monitors').update({ id: `eq.${m.id}` }, {
      consecutive_failures: failures, status: failures >= 3 ? 'error' : m.status, status_detail: 'O seletor não encontrou nada na página.',
      last_checked_at: new Date(now).toISOString(), next_check_at: nextCheckAt(now, m.frequency_minutes), updated_at: new Date(now).toISOString(),
    });
    return { kind: 'empty' };
  }
  const charged = await charge(env, m.user_id, unit, 'scrapling_monitor', `monitor:${m.id}:${m.next_check_at}${opts.baseline ? ':base' : ''}`, { monitor_id: m.id, mode: m.mode });
  if (charged !== 'ok') return { kind: 'no_credits' };
  const diff = diffMonitorValue(m.last_value, value);
  const message = describeMonitorDiff(m.name, diff);
  const fp = page.fingerprints?.[m.selector.name];
  await table(env, 'scrape_monitors').update({ id: `eq.${m.id}` }, {
    last_value: diff.after, last_diff: diff.changed ? diff : m.last_diff ?? null, ...(fp && !page.relocated?.length ? { fingerprint: fp } : {}),
    last_checked_at: new Date(now).toISOString(), next_check_at: nextCheckAt(now, m.frequency_minutes), consecutive_failures: 0,
    status: m.status === 'paused' ? 'paused' : 'active', status_detail: page.relocated?.length ? 'Seletor relocalizado pela extração adaptativa.' : null,
    credits_spent: m.credits_spent + unit, updated_at: new Date(now).toISOString(), ...(diff.changed ? { last_changed_at: new Date(now).toISOString() } : {}),
  });
  await table(env, 'scrape_runs').insert({ user_id: m.user_id, tool: 'monitor_check', mode: m.mode, hosts: [hostOf(m.url)], url: m.url, pages: 1, credits: unit, status: 'done', monitor_id: m.id, finished_at: new Date(now).toISOString() }).catch(() => undefined);
  await audit(env, m.user_id, 'monitor_check', { monitor: m.name, url: m.url, credits: unit, mode: m.mode });
  if (diff.changed) {
    await table(env, 'scrape_monitor_alerts').insert({ monitor_id: m.id, user_id: m.user_id, kind: 'changed', message, old_value: diff.before, new_value: diff.after, diff, url: m.url });
    await audit(env, m.user_id, 'monitor_changed', { monitor: m.name, url: m.url });
  }
  return { kind: 'ok', value: diff.after, changed: diff.changed, message, credits: unit };
}

async function markBlocked(env: ScrapeEnv, m: MonitorRow, reason: string, now: number): Promise<CheckOutcome> {
  const captcha = reason === 'captcha';
  const failures = m.consecutive_failures + 1;
  await table(env, 'scrape_monitors').update({ id: `eq.${m.id}` }, {
    consecutive_failures: failures,
    status: captcha || reason === 'robots' || reason === 'login' || reason === 'paywall' ? 'needs_attention' : failures >= 3 ? 'error' : m.status,
    status_detail: captcha ? 'O site pediu um captcha: abra a página no Navigator e resolva na tela ao vivo.' : `Bloqueado: ${reason}.`,
    last_checked_at: new Date(now).toISOString(), next_check_at: nextCheckAt(now, m.frequency_minutes), updated_at: new Date(now).toISOString(),
  });
  if (captcha || failures === 3) {
    await table(env, 'scrape_monitor_alerts').insert({
      monitor_id: m.id, user_id: m.user_id, kind: captcha ? 'captcha' : 'error', url: m.url,
      message: captcha ? `Monitor "${m.name}": apareceu um captcha. Resolva na tela ao vivo do Navigator; não resolvo captcha automaticamente.` : `Monitor "${m.name}" com erro (${reason}).`,
    }).catch(() => undefined);
  }
  await audit(env, m.user_id, 'scrape_blocked', { monitor: m.name, url: m.url, reason });
  return { kind: 'blocked', reason };
}

async function createMonitor(request: Request, env: ScrapeEnv, userId: string, body: Record<string, unknown>): Promise<Response> {
  const parsed = parseMonitorBody(body);
  if (!parsed.ok) return fail(request, parsed.status, { detail: parsed.detail }, 400);
  const accepted = await loadAcceptedVersions(env, userId);
  const cls = classifyByRules(`${parsed.data.name} ${parsed.data.url}`);
  const decision = decideGate(cls, accepted, { clarifiedBefore: true, toolCategory: 'web_scraping' });
  if (decision.action === 'block') {
    await recordConsentAudit(env, { userId, surface: 'monitor', cls, action: 'block', text: parsed.data.name });
    return fail(request, 'prohibited', { reason: cls.reason });
  }
  if (decision.action === 'require_terms') return fail(request, 'consent_required', { category: decision.category, version: decision.version, title: decision.title });
  const count = await table(env, 'scrape_monitors').select<{ id: string }>({ user_id: `eq.${userId}`, select: 'id', limit: String(SCRAPE_LIMITS.maxMonitorsPerUser + 1) });
  if (count.length >= SCRAPE_LIMITS.maxMonitorsPerUser) return fail(request, 'monitor_limit');
  if (!(await robotsAllows(parsed.data.url))) return fail(request, 'robots');
  const unit = scrapePrice(pagePriceKey('monitor', parsed.data.mode));
  if ((await balanceOf(env, userId)) < unit) return fail(request, 'insufficient_credits', { needed: unit }, 402);
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const row: MonitorRow = {
    id, user_id: userId, name: parsed.data.name, url: parsed.data.url, selector: parsed.data.selector, mode: parsed.data.mode, frequency_minutes: parsed.data.frequencyMinutes,
    status: 'active', status_detail: null, last_value: null, last_diff: null, fingerprint: null, last_checked_at: null, last_changed_at: null,
    next_check_at: nowIso, consecutive_failures: 0, credits_spent: 0, created_at: nowIso,
  };
  // Valida o seletor agora (1ª verificação = linha de base, cobrada); sem valor, o monitor não é criado.
  let collector: Collector | null = null;
  try {
    await table(env, 'scrape_monitors').insert({ ...row });
    const outcome = await checkMonitor(env, row, async () => (collector ??= await openCollector(env, { user: userId.slice(0, 8), monitor: id })), { baseline: true });
    if (outcome.kind !== 'ok') {
      await table(env, 'scrape_monitors').delete({ id: `eq.${id}` });
      const why = outcome.kind === 'blocked' ? outcome.reason : outcome.kind;
      return fail(request, outcome.kind === 'no_credits' ? 'insufficient_credits' : outcome.kind === 'blocked' && outcome.reason === 'robots' ? 'robots' : 'bad_request', { detail: why === 'empty' ? 'selector_not_found' : why, ...(outcome.kind === 'blocked' && outcome.reason === 'captcha' ? { captchaUrls: [row.url] } : {}) });
    }
    await audit(env, userId, 'monitor_created', { monitor: row.name, url: row.url, mode: row.mode });
    const fresh = await loadMonitor(env, userId, id);
    return json(request, { ok: true, status: 'ok', monitor: fresh ? monitorView(fresh) : null, value: outcome.value, credits: outcome.credits });
  } finally {
    if (collector) await killSandbox(env, (collector as Collector).target.sandboxId);
  }
}

async function updateMonitor(request: Request, env: ScrapeEnv, userId: string, body: Record<string, unknown>): Promise<Response> {
  const m = await loadMonitor(env, userId, body.id);
  if (!m) return fail(request, 'not_found', {}, 404);
  if (body.status !== 'active' && body.status !== 'paused') return fail(request, 'bad_request', { detail: 'status' }, 400);
  const nowIso = new Date().toISOString();
  await table(env, 'scrape_monitors').update({ id: `eq.${m.id}` }, { status: body.status, status_detail: null, updated_at: nowIso, ...(body.status === 'active' ? { next_check_at: nowIso, consecutive_failures: 0 } : {}) });
  await audit(env, userId, 'monitor_updated', { monitor: m.name, reason: body.status === 'paused' ? 'pausado' : 'retomado' });
  const fresh = await loadMonitor(env, userId, m.id);
  return json(request, { ok: true, status: 'ok', monitor: fresh ? monitorView(fresh) : null });
}

async function deleteMonitor(request: Request, env: ScrapeEnv, userId: string, body: Record<string, unknown>): Promise<Response> {
  const m = await loadMonitor(env, userId, body.id);
  if (!m) return fail(request, 'not_found', {}, 404);
  await table(env, 'scrape_monitors').delete({ id: `eq.${m.id}`, user_id: `eq.${userId}` });
  await audit(env, userId, 'monitor_deleted', { monitor: m.name, url: m.url });
  return json(request, { ok: true, status: 'ok' });
}

async function checkMonitorRoute(request: Request, env: ScrapeEnv, userId: string, body: Record<string, unknown>): Promise<Response> {
  const m = await loadMonitor(env, userId, body.id);
  if (!m) return fail(request, 'not_found', {}, 404);
  if (!userLimiter.take(userId)) return fail(request, 'rate_limited', {}, 429);
  let collector: Collector | null = null;
  try {
    const outcome = await checkMonitor(env, m, async () => (collector ??= await openCollector(env, { user: userId.slice(0, 8), monitor: m.id })));
    const fresh = await loadMonitor(env, userId, m.id);
    if (outcome.kind === 'consent') return fail(request, 'consent_required', { category: 'web_scraping' });
    if (outcome.kind === 'no_credits') return fail(request, 'insufficient_credits', {}, 402);
    return json(request, { ok: true, status: 'ok', outcome, monitor: fresh ? monitorView(fresh) : null });
  } finally {
    if (collector) await killSandbox(env, (collector as Collector).target.sandboxId);
  }
}

async function alertsRoute(request: Request, env: ScrapeEnv, userId: string): Promise<Response> {
  const rows = await table(env, 'scrape_monitor_alerts').select<Record<string, unknown>>({
    user_id: `eq.${userId}`, seen_at: 'is.null', select: 'id,monitor_id,kind,message,old_value,new_value,url,created_at', order: 'created_at.desc', limit: '20',
  });
  return json(request, { ok: true, status: 'ok', alerts: rows });
}

async function alertsSeen(request: Request, env: ScrapeEnv, userId: string, body: Record<string, unknown>): Promise<Response> {
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50);
  if (ids.length) await table(env, 'scrape_monitor_alerts').update({ id: `in.(${ids.join(',')})`, user_id: `eq.${userId}` }, { seen_at: new Date().toISOString() });
  return json(request, { ok: true, status: 'ok' });
}

/** pg_cron (a cada 15 min): monitores vencidos, um sandbox para o lote. */
async function cronRoute(request: Request, env: ScrapeEnv): Promise<Response> {
  const token = request.headers.get('x-cron-token') ?? '';
  if (!env.SCRAPE_CRON_TOKEN || token.length < 16 || !(await safeEqual(token, env.SCRAPE_CRON_TOKEN))) return fail(request, 'unauthorized', {}, 401);
  if (env.SCRAPE_ENABLED === 'off' || !env.E2B_API_KEY || !env.SUPABASE_SECRET_KEY) return fail(request, 'not_configured', {}, 503);
  const due = await table(env, 'scrape_monitors').select<MonitorRow>({
    status: 'eq.active', next_check_at: `lte.${new Date().toISOString()}`, select: MONITOR_COLS, order: 'next_check_at.asc', limit: String(SCRAPE_LIMITS.maxMonitorsPerCron),
  });
  let collector: Collector | null = null;
  const summary = { due: due.length, changed: 0, blocked: 0, failed: 0 };
  try {
    for (const m of due) {
      try {
        const out = await checkMonitor(env, m, async () => (collector ??= await openCollector(env, { job: 'monitors' })));
        if (out.kind === 'ok' && out.changed) summary.changed++;
        if (out.kind === 'blocked') summary.blocked++;
      } catch (e) {
        summary.failed++;
        console.error('scrape cron: monitor falhou', m.id, e instanceof Error ? e.message.slice(0, 160) : e);
        await table(env, 'scrape_monitors').update({ id: `eq.${m.id}` }, { next_check_at: nextCheckAt(Date.now(), Math.min(60, m.frequency_minutes)), consecutive_failures: m.consecutive_failures + 1 }).catch(() => undefined);
        if (e instanceof E2BError && /navd_not_ready|create/.test(e.message)) break; // sandbox fora: tenta no próximo ciclo
      }
    }
  } finally {
    if (collector) await killSandbox(env, (collector as Collector).target.sandboxId);
  }
  return json(request, { ok: true, status: 'ok', ...summary });
}

/** Só para testes. */
export const __test = { robotsCache, userLimiter };
