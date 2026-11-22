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
//   POST /api/navigator/settings  {} | {autoApproveEnabled, autoApproveMaxCents, confirmed?}
//                                                                → lê/grava "aprovar automático até R$X" (padrão: sempre pedir)
//   POST /api/navigator/activity  {}                             → histórico: sessões e auditoria (segredos só por nome)
//
// Roda no Worker do vertal.dev (o Supabase está no limite de edge functions).
// O navegador fica num sandbox E2B self-hosted (template vertal-browser, ver
// infra/vertal-browser e docs/VERTAL_NAVIGATOR.md). Auth: JWT do Supabase.
// Segredos do cofre e cookies usam a CONNECTOR_ENC_KEY (mesmo AES-GCM das edge functions).
// Auditoria (navigator_audit): conteúdo sensível cifrado com NAVIGATOR_AUDIT_KEY
// (fallback NAVIGATOR_ENC_KEY/CONNECTOR_ENC_KEY), ver _shared/navigatorAuditVault.ts.
// Logs (console.*) passam por safeErrorMessage: nunca texto de tarefa, URL com token, cookie ou cabeçalho.
import { createRateLimiter } from '../supabase/functions/_shared/browserForm';
import {
  DEFAULT_NAVIGATOR_SETTINGS, NAVIGATOR_LIMITS, NAVIGATOR_MESSAGES, extractCheckoutSummary, formatCents,
  liveViewUrl, minutesDue, normalizeNavigatorUrl, parseInputBody, parseSessionBody, parseSettingsBody, parseStartBody, parseTaskBody,
  pickSecretForHost, pickTotpForHost, isTotpSecretName, sanitizeEvents, sanitizePending, isBlockedHost, framedNavigatorTask, navigatorStartUrl, pickNavigatorModel,
  type CheckoutSummary, type NavigatorAuditKind, type NavigatorPending, type NavigatorSettings, type NavigatorStatus, type VaultSecretMeta,
} from '../supabase/functions/_shared/navigatorCore.ts';
import { parseTotpSeed, totpNow } from '../supabase/functions/_shared/totp.ts';
import {
  ALWAYS_ASK, approvalMatchesPending, autoPayDecision, cardFillValues, cardLabel, cardVaultValue, detectSubscription, effectivePolicy,
  isWalletSecret, parseAutomation, parseCardInput, parseCardVaultValue, paymentRecheck, vertalPayBalanceFrom, vertalPayLine, walletCardName,
  WALLET_BOUND, WALLET_CARD_RE, DISABLED_VERTAL_PAY, type Automation, type PaymentPolicy, type VertalPayAdapter,
} from '../supabase/functions/_shared/navigatorPayments.ts';
import {
  authPendingView, parseAuthInput, pickLoginForHost, pickPhoneForHost, siteSecretNames, siteSlugForHost,
} from '../supabase/functions/_shared/navigatorAuthForms.ts';
import { createSandbox, e2bDomain, E2BError, killSandbox, navd, setSandboxTimeout, waitNavd, type E2BEnv, type NavdTarget } from './e2bClient';
import { decryptWithConnectorKey, encryptWithConnectorKey, EncKeyMissingError, randomPassword, randomToken } from './navigatorCrypto';
import { isAllowedOrigin } from './spotifyRoutes';
import { auditWriteKey, openAuditDetail, sealAuditDetail } from '../supabase/functions/_shared/navigatorAuditVault.ts';
import { safeErrorMessage } from '../supabase/functions/_shared/logRedact.ts';
import { getUserId, rpc, table, type SupabaseEnv } from './supabaseRest';

export const NAVIGATOR_API_PREFIX = '/api/navigator';

export interface NavigatorEnv extends SupabaseEnv, E2BEnv {
  OPENROUTER_API_KEY?: string;
  /** Modelo do agente via OpenRouter (padrão google/gemini-3-flash-preview). */
  NAVIGATOR_MODEL?: string;
  /** Fase 4: modelos que uma tarefa pode pedir (separados por vírgula). Vazio = só o padrão. */
  NAVIGATOR_ALLOWED_MODELS?: string;
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
  /** Chave dedicada da auditoria cifrada (AES-256-GCM, 32 bytes). Ausente: usa NAVIGATOR_ENC_KEY/CONNECTOR_ENC_KEY (key_version 0). */
  NAVIGATOR_AUDIT_KEY?: string;
  /** OpenRouter: "deny" (padrão) só usa provedores que não guardam/treinam com os prompts. "allow" só em emergência. */
  NAVIGATOR_LLM_DATA_COLLECTION?: string;
  /** OpenRouter: "true" restringe a endpoints ZDR (retenção zero). Desligado por padrão (pode faltar provedor para o modelo). */
  NAVIGATOR_LLM_ZDR?: string;
  /** "on" liga o Vertal Vibe Pay como fonte no cartão de pagamento (só leitura de saldo até o Pay ter API de pagar). */
  VERTAL_PAY_NAVIGATOR?: string;
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
  automation?: Automation | null;
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
  const closed = await sessions(env).update({ id: `eq.${row.id}`, status: 'neq.ended' }, { status: 'ended', ended_at: new Date().toISOString(), end_reason: reason }).catch(() => []);
  if (row.sandbox_id) await killSandbox(env, row.sandbox_id);
  if (Array.isArray(closed) && closed.length) await recordAudit(env, row.user_id, row.id, 'session_end', { end_reason: reason, minutes: row.billed_minutes });
}

// ─── Auditoria (fase 2) ──────────────────────────────────────────────────
/**
 * Grava uma linha em navigator_audit. Nunca derruba a rota. O detalhe passa por auditDetail
 * (sem valores de segredo/senha/código/cookie); o que identifica site, conta ou conteúdo
 * (tarefa, URL, host, nome do segredo, loja, itens) vai cifrado (AES-256-GCM, AAD = dono+tipo).
 */
async function recordAudit(env: NavigatorEnv, userId: string, sessionId: string | null, kind: NavigatorAuditKind, detail: Record<string, unknown> = {}): Promise<void> {
  try {
    const sealed = await sealAuditDetail(auditWriteKey(env), userId, kind, detail);
    await table(env, 'navigator_audit').insert({ user_id: userId, session_id: sessionId, kind, ...sealed });
  } catch (e) {
    console.error('navigator: audit falhou', kind, safeErrorMessage(e, 160));
  }
}

type PaymentSettings = NavigatorSettings & { periodMaxCents?: number; periodDays?: number; merchants?: string[]; allowRecurring?: boolean };

async function loadSettings(env: NavigatorEnv, userId: string): Promise<PaymentSettings> {
  type Row = { auto_approve_enabled: boolean; auto_approve_max_cents: number; auto_approve_period_cents?: number; auto_approve_period_days?: number; auto_approve_merchants?: string[]; auto_approve_recurring?: boolean };
  let rows: Row[] = await table(env, 'navigator_settings')
    .select<Row>({ user_id: `eq.${userId}`, select: 'auto_approve_enabled,auto_approve_max_cents,auto_approve_period_cents,auto_approve_period_days,auto_approve_merchants,auto_approve_recurring', limit: '1' })
    .catch(() => null as unknown as Row[]);
  // Migration de pagamentos ainda não aplicada: lê só as colunas antigas.
  if (!rows) rows = await table(env, 'navigator_settings').select<Row>({ user_id: `eq.${userId}`, select: 'auto_approve_enabled,auto_approve_max_cents', limit: '1' }).catch(() => []);
  const r = rows[0];
  if (!r) return { ...DEFAULT_NAVIGATOR_SETTINGS };
  return {
    autoApproveEnabled: !!r.auto_approve_enabled, autoApproveMaxCents: Number(r.auto_approve_max_cents) || 0,
    periodMaxCents: Number(r.auto_approve_period_cents) || 0, periodDays: Number(r.auto_approve_period_days) || 30,
    merchants: Array.isArray(r.auto_approve_merchants) ? r.auto_approve_merchants : [], allowRecurring: !!r.auto_approve_recurring,
  };
}

type RawPending = Record<string, unknown>;

/** Lê loja/itens/total do texto da página que o navd mandou no pedido de aprovação. */
function summaryOf(p: RawPending): CheckoutSummary {
  return extractCheckoutSummary(p.pageText, p.pageTitle, p.url);
}

/** Campos do resumo que vão para o cartão (o texto bruto da página nunca sai do servidor). */
function withSummary(p: RawPending): RawPending {
  if (p.kind !== 'approval') return p;
  const sum = summaryOf(p);
  const { pageText: _drop, ...rest } = p;
  return {
    ...rest,
    store: sum.store || undefined,
    pageTitle: sum.pageTitle || undefined,
    ...(sum.total ? { total: sum.total.text, totalCents: sum.total.cents, currency: sum.total.currency } : {}),
    items: sum.items,
    // Paywall/assinatura: recorrente, período e termos de renovação como a página diz.
    ...(p.category !== 'write' ? subscriptionFields(p.pageText) : {}),
  };
}

function subscriptionFields(pageText: unknown): Record<string, unknown> {
  const sub = detectSubscription(pageText);
  return sub.recurring || sub.renewalTerms ? { recurring: sub.recurring || undefined, period: sub.period, renewalTerms: sub.renewalTerms } : {};
}

function summaryAudit(p: RawPending | undefined): Record<string, unknown> {
  if (!p) return {};
  const sum = summaryOf(p);
  return { store: sum.store, total: sum.total?.text, cents: sum.total?.cents, currency: sum.total?.currency, items: sum.items, target: p.target, url: p.url, reason: p.reason };
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
    console.error('navigator: saveProfile falhou', safeErrorMessage(e, 200));
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
  await recordAudit(env, userId, row.id, 'secret_used', { name: secret.env_key, host });
  return true;
}

/** Código TOTP de agora: pela edge function kubo-secrets (op "totp"), ou localmente se o Worker tiver a CONNECTOR_ENC_KEY. A semente nunca sai do servidor. */
async function resolveTotpCode(env: NavigatorEnv, userId: string, secretId: string, host: string, sessionId: string): Promise<string | null> {
  if (env.NAVIGATOR_INTERNAL_TOKEN && env.SUPABASE_URL) {
    const res = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/kubo-secrets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-navigator-token': env.NAVIGATOR_INTERNAL_TOKEN, apikey: env.SUPABASE_SECRET_KEY ?? '', Authorization: `Bearer ${env.SUPABASE_SECRET_KEY ?? ''}` },
      body: JSON.stringify({ op: 'totp', id: secretId, user_id: userId, host, session_id: sessionId }),
    }).catch(() => null);
    if (res?.ok) {
      const data = (await res.json().catch(() => ({}))) as { code?: unknown };
      if (typeof data.code === 'string' && /^\d{6,8}$/.test(data.code)) return data.code;
    }
    if (!env.CONNECTOR_ENC_KEY) return null;
  }
  if (!env.CONNECTOR_ENC_KEY) return null;
  const rows = await table(env, 'kubo_secrets').select<{ ciphertext: string; iv: string; tag: string }>({ id: `eq.${secretId}`, select: 'ciphertext,iv,tag', limit: '1' });
  if (!rows[0]) return null;
  const params = parseTotpSeed(await decryptWithConnectorKey(env.CONNECTOR_ENC_KEY, rows[0]));
  if (!params) return null;
  const { code } = await totpNow(params);
  await table(env, 'kubo_secret_audit').insert({ secret_id: secretId, actor_id: userId, action: 'inject', meta: { target: 'navigator', kind: 'totp', host, session_id: sessionId } }).catch(() => undefined);
  return code;
}

/** Resolve um pedido needs_totp do agente: gera o código no servidor e entrega ao navd, que digita. Sem semente: null (o navd pede ao usuário). */
async function fulfillTotp(env: NavigatorEnv, userId: string, row: SessionRow, target: NavdTarget, pending: { id: string; name?: string; host?: string }): Promise<boolean> {
  const host = String(pending.host ?? '');
  const secret = pickTotpForHost(await visibleSecrets(env, userId), host, pending.name);
  const code = secret ? await resolveTotpCode(env, userId, secret.id, host, row.id).catch(() => null) : null;
  await navd(env, target, 'POST', '/input', { id: pending.id, kind: 'totp', value: code }).catch(() => undefined);
  if (!code || !secret) return false;
  await table(env, 'kubo_secrets').update({ id: `eq.${secret.id}` }, { last_used_at: new Date().toISOString() }).catch(() => undefined);
  await recordAudit(env, userId, row.id, 'totp_used', { name: secret.env_key, host });
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

// ─── Formulários seguros (bloquinhos inline no chat) ─────────────────────
/** Só os campos do cartão (nunca valores). */
function sanitizeAuthView(v: ReturnType<typeof authPendingView>): Partial<NavigatorPending> {
  return {
    host: v.host, site: v.site, domain: v.domain,
    ...(v.loginFields ? { loginFields: v.loginFields } : {}),
    ...(v.otpKind ? { otpKind: v.otpKind } : {}),
    ...(v.retry ? { retry: true } : {}),
    ...(v.connector ? { connector: v.connector } : {}),
    ...(v.saveAs ? { saveAs: v.saveAs as Record<string, string> } : {}),
  };
}

/** Dica mascarada do Cofre: identificador mostra o começo; senha/telefone/semente nunca mostram nada. */
function hintFor(value: string, identifier: boolean): string {
  if (!identifier || value.length <= 6) return '••••';
  return `${value.slice(0, 2)}••••${value.slice(-2)}`;
}

/**
 * Cria ou atualiza um segredo do Cofre vinculado ao site (o mesmo formato AES-GCM do kubo-secrets).
 * Só o Worker escreve aqui, só para o dono, só com o vínculo do domínio da página.
 */
export async function saveVaultSecret(
  env: NavigatorEnv, userId: string,
  s: { envKey: string; value: string; boundTo: string; label: string; identifier: boolean; host: string; group?: string; hint?: string },
): Promise<{ ok: true; envKey: string; created: boolean } | { ok: false; reason: string }> {
  if (!env.CONNECTOR_ENC_KEY) return { ok: false, reason: 'no_key' };
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(s.envKey) || !/^[a-z0-9_-]{1,64}$/.test(s.boundTo)) return { ok: false, reason: 'bad_name' };
  const enc = await encryptWithConnectorKey(env.CONNECTOR_ENC_KEY, s.value);
  const now = new Date().toISOString();
  const hint = s.hint ?? hintFor(s.value, s.identifier);
  const existing = await table(env, 'kubo_secrets').select<{ id: string }>({ owner_id: `eq.${userId}`, env_key: `eq.${s.envKey}`, select: 'id', limit: '1' });
  let id: string;
  let created = false;
  if (existing[0]) {
    id = existing[0].id;
    await table(env, 'kubo_secrets').update({ id: `eq.${id}`, owner_id: `eq.${userId}` }, {
      ciphertext: enc.ciphertext, iv: enc.iv, tag: enc.tag, masked_hint: hint, bound_to: s.boundTo, rotated_at: now, updated_at: now,
    });
  } else {
    const rows = await table(env, 'kubo_secrets').insertReturning<{ id: string }>({
      owner_id: userId, name: s.label.slice(0, 80), env_key: s.envKey, group_name: s.group ?? 'navigator', bound_to: s.boundTo,
      description: `Salvo pelo Vertal Navigator (cartão seguro) em ${now.slice(0, 10)} para ${s.host}`.slice(0, 300),
      ciphertext: enc.ciphertext, iv: enc.iv, tag: enc.tag, masked_hint: hint,
    });
    id = Array.isArray(rows) && rows[0]?.id ? rows[0].id : '';
    created = true;
  }
  await table(env, 'kubo_secret_audit').insert({
    secret_id: id || null, owner_id: userId, actor_id: userId, action: created ? 'create' : 'rotate', env_key: s.envKey,
    meta: { target: 'navigator', source: 'secure_form', host: s.host },
  }).catch(() => undefined);
  return { ok: true, envKey: s.envKey, created };
}

/** Pedido de login: usa o login salvo do site se houver tudo o que o site pediu (e não é retry). */
async function fulfillLoginFromVault(env: NavigatorEnv, userId: string, row: SessionRow, target: NavdTarget, p: NavigatorPending, raw: RawPending): Promise<{ filled: boolean; prefillUsername?: string }> {
  const host = String(p.host ?? '');
  const fields = p.loginFields?.length ? p.loginFields : ['username', 'password'];
  const login = pickLoginForHost(await visibleSecrets(env, userId), host);
  if (raw.retry === true) {
    // Login salvo recusado: o cartão volta com o usuário (identificador do próprio dono) preenchido.
    const u = login.username && login.username.role === 'owner' ? await resolveVaultValue(env, userId, login.username.id, host, row.id).catch(() => null) : null;
    return { filled: false, ...(u ? { prefillUsername: u.slice(0, 254) } : {}) };
  }
  const need = fields.map((f) => (f === 'username' ? login.username : login.password));
  if (need.some((x) => !x)) {
    const u = fields.includes('username') && login.username?.role === 'owner' ? await resolveVaultValue(env, userId, login.username.id, host, row.id).catch(() => null) : null;
    return { filled: false, ...(u ? { prefillUsername: u.slice(0, 254) } : {}) };
  }
  const value: Record<string, string> = {};
  for (const f of fields) {
    const meta = f === 'username' ? login.username! : login.password!;
    const v = await resolveVaultValue(env, userId, meta.id, host, row.id).catch(() => null);
    if (!v) return { filled: false };
    value[f] = v;
  }
  const res = await navd<{ ok?: boolean }>(env, target, 'POST', '/input', { id: p.id, kind: 'login', value }).catch(() => null);
  for (const k of Object.keys(value)) value[k] = '';
  if (!res?.data.ok) return { filled: false };
  for (const f of fields) {
    const meta = f === 'username' ? login.username! : login.password!;
    await table(env, 'kubo_secrets').update({ id: `eq.${meta.id}` }, { last_used_at: new Date().toISOString() }).catch(() => undefined);
    await recordAudit(env, userId, row.id, 'secret_used', { name: meta.env_key, host });
  }
  return { filled: true };
}

async function fulfillPhoneFromVault(env: NavigatorEnv, userId: string, row: SessionRow, target: NavdTarget, p: NavigatorPending): Promise<boolean> {
  const host = String(p.host ?? '');
  const meta = pickPhoneForHost(await visibleSecrets(env, userId), host);
  if (!meta) return false;
  let v = await resolveVaultValue(env, userId, meta.id, host, row.id).catch(() => null);
  if (!v) return false;
  const res = await navd<{ ok?: boolean }>(env, target, 'POST', '/input', { id: p.id, kind: 'phone', value: v }).catch(() => null);
  v = null;
  if (!res?.data.ok) return false;
  await recordAudit(env, userId, row.id, 'secret_used', { name: meta.env_key, host });
  return true;
}

/**
 * Resposta de um cartão seguro. O valor chega por HTTPS do cartão, é salvo no Cofre (se o usuário
 * marcou) e vai direto ao navd. Nunca volta ao cliente, nunca vai para log nem para a auditoria.
 */
async function authInput(
  request: Request, env: NavigatorEnv, userId: string, row: SessionRow, target: NavdTarget,
  requestId: string, body: Record<string, unknown>, asked: RawPending | undefined,
): Promise<Response> {
  if (asked?.kind === 'card' && (body.kind === 'card' || body.cancel === true)) return cardInput(request, env, userId, row, target, requestId, body, asked);
  if (!asked || (asked.kind !== 'login' && asked.kind !== 'code' && asked.kind !== 'phone')) return fail(request, 'not_pending', {}, 409);
  const host = String(asked.host ?? '').toLowerCase();
  const slug = siteSlugForHost(host);
  const names = slug ? siteSecretNames(slug) : null;
  const fields = (Array.isArray(asked.fields) ? asked.fields : ['username', 'password']).filter((f): f is 'username' | 'password' => f === 'username' || f === 'password');
  const parsed = parseAuthInput(body, fields.length ? fields : ['username', 'password']);
  if (!parsed.ok) return fail(request, 'bad_request', { detail: parsed.detail }, 400);
  const a = parsed.data;
  const saved: string[] = [];
  let saveError: string | undefined;
  const save = async (envKey: string, value: string, identifier: boolean, label: string) => {
    if (!slug) { saveError = 'Este site não tem domínio público para vincular no Cofre.'; return; }
    try {
      const r = await saveVaultSecret(env, userId, { envKey, value, boundTo: slug, label, identifier, host });
      if (r.ok) {
        saved.push(r.envKey);
        await recordAudit(env, userId, row.id, 'secret_saved', { name: r.envKey, host });
      } else saveError = r.reason === 'no_key' ? 'O Cofre não está disponível agora; o valor foi usado só nesta tarefa.' : 'Não consegui salvar no Cofre.';
    } catch (e) {
      console.error('navigator: salvar no cofre falhou', safeErrorMessage(e, 160));
      saveError = 'Não consegui salvar no Cofre; o valor foi usado só nesta tarefa.';
    }
  };
  const send = (kind: string, value: unknown) => navd<{ ok?: boolean; error?: string }>(env, target, 'POST', '/input', { id: requestId, kind, value });

  let res: Awaited<ReturnType<typeof send>>;
  if (a.kind === 'cancel') {
    res = await send(String(asked.kind), null);
  } else if (a.kind === 'connector') {
    if (asked.kind !== 'login') return fail(request, 'bad_request', { detail: 'kind' }, 400);
    res = await send('login', { connector: 'gmail' });
    await recordAudit(env, userId, row.id, 'connector_chosen', { name: 'Gmail', host });
  } else if (a.kind === 'login') {
    if (asked.kind !== 'login') return fail(request, 'bad_request', { detail: 'kind' }, 400);
    const value: Record<string, string> = {};
    if (a.username) value.username = a.username;
    if (a.password) value.password = a.password;
    res = await send('login', value);
    if (res.data.ok && a.save && names) {
      if (a.username) await save(names.username, a.username, true, `Login ${slug}`);
      if (a.password) await save(names.password, a.password, false, `Senha ${slug}`);
    }
    for (const k of Object.keys(value)) value[k] = '';
    if (res.data.ok) await recordAudit(env, userId, row.id, 'login_entered', { host });
  } else if (a.kind === 'code') {
    if (asked.kind !== 'code') return fail(request, 'bad_request', { detail: 'kind' }, 400);
    let code = a.value;
    if (a.totpSeed) {
      const params = parseTotpSeed(a.totpSeed);
      if (!params) return fail(request, 'bad_request', { detail: 'totp_seed' }, 400);
      if (!code) code = (await totpNow(params)).code;
    }
    res = await send('code', code);
    if (res.data.ok && a.totpSeed && names) {
      await save(names.totp, a.totpSeed, false, `Autenticador ${slug}`);
      if (saved.includes(names.totp)) await recordAudit(env, userId, row.id, 'totp_consent', { name: names.totp, host: slug });
    }
    if (res.data.ok) await recordAudit(env, userId, row.id, 'code_entered', { host });
  } else {
    if (asked.kind !== 'phone') return fail(request, 'bad_request', { detail: 'kind' }, 400);
    res = await send('phone', a.value);
    if (res.data.ok && a.save && names) await save(names.phone, a.value, true, `Telefone ${slug}`);
    if (res.data.ok) await recordAudit(env, userId, row.id, 'phone_entered', { host });
  }
  if (!res.data.ok) return fail(request, 'not_pending', { detail: res.data.error }, 409);
  return json(request, { ok: true, status: 'ok', saved, ...(saveError ? { saveError } : {}) });
}

// ─── Pagamentos: aprovação automática, carteira, Vertal Pay ──────────────
function paySourceLabel(p: RawPending | undefined): string | undefined {
  const ps = p?.paySource as { kind?: unknown; last4?: unknown } | undefined;
  return ps?.kind === 'card' && typeof ps.last4 === 'string' ? `cartão •••• ${ps.last4}` : undefined;
}

async function loadAutomation(env: NavigatorEnv, sessionId: string): Promise<Automation | null> {
  const rows = await sessions(env).select<{ automation: Automation | null }>({ id: `eq.${sessionId}`, select: 'automation', limit: '1' }).catch(() => []);
  return rows[0]?.automation ?? null;
}

/** Soma dos pagamentos automáticos já feitos nesta loja no período (auditoria cifrada, decifrada aqui). */
async function spentInPeriod(env: NavigatorEnv, userId: string, store: string, days: number): Promise<number> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = await table(env, 'navigator_audit').select<AuditDbRow>({
    user_id: `eq.${userId}`, kind: 'eq.payment', created_at: `gte.${since}`, order: 'created_at.desc', limit: '200',
    select: 'id,session_id,kind,detail,detail_ciphertext,detail_iv,detail_tag,key_version,created_at',
  }).catch(() => []);
  let total = 0;
  for (const r of rows) {
    const d = await openAuditDetail(env, { ...r, user_id: userId }).catch(() => null) as Record<string, unknown> | null;
    if (d && (d.status === 'auto_approved' || d.status === 'approved') && d.store === store && typeof d.cents === 'number') total += d.cents;
  }
  return total;
}

/**
 * Decide sozinho um pedido de aprovação quando há pré-aprovação explícita. Pagamento: só dentro do teto
 * (autoPayDecision). Envio/confirmação (escrita): só no modo "automatizar tudo" desta tarefa. Devolve o recibo, ou null (pergunta).
 */
async function autoDecide(env: NavigatorEnv, userId: string, row: SessionRow, target: NavdTarget, p: RawPending, policy: PaymentPolicy, automation: Automation | null): Promise<Record<string, unknown> | null> {
  const at = new Date().toISOString();
  if (p.category === 'write') {
    if (automation?.mode !== 'all') return null;
    const ans = await navd<{ ok?: boolean }>(env, target, 'POST', '/input', { id: p.id, kind: 'approval', approve: true }).catch(() => null);
    if (!ans?.data.ok) return null;
    await recordAudit(env, userId, row.id, 'auto_action', { target: p.target, url: p.url, reason: p.reason });
    return { kind: 'write', target: String(p.target ?? '').slice(0, 160), url: typeof p.url === 'string' ? p.url.slice(0, 300) : undefined, at };
  }
  if (policy === ALWAYS_ASK || policy.mode !== 'preapproved') return null;
  const sum = summaryOf(p);
  const sub = detectSubscription(p.pageText);
  const spent = policy.periodMaxCents && sum.store ? await spentInPeriod(env, userId, sum.store, policy.periodDays ?? 30) : 0;
  const decision = autoPayDecision(policy, sum, { spentInPeriodCents: spent, subscription: sub, totalChanged: p.totalChanged === true });
  if (!decision.auto || !sum.total) return null;
  const ans = await navd<{ ok?: boolean }>(env, target, 'POST', '/input', {
    id: p.id, kind: 'approval', approve: true, totalCents: sum.total.cents, currency: sum.total.currency, store: sum.store,
  }).catch(() => null);
  if (!ans?.data.ok) return null;
  await recordAudit(env, userId, row.id, 'auto_approved', { ...summaryAudit(p), limit: formatCents(policy.perPaymentMaxCents) });
  await recordAudit(env, userId, row.id, 'payment', { ...summaryAudit(p), status: 'auto_approved', source: paySourceLabel(p) });
  return { kind: 'payment', store: sum.store, total: sum.total.text, totalCents: sum.total.cents, currency: sum.total.currency, recurring: sub.recurring || undefined, source: paySourceLabel(p), limit: formatCents(policy.perPaymentMaxCents), at };
}

/** Vertal Vibe Pay: só com a flag ligada; saldo lido da função `wallet` (bank-overview) com o JWT do usuário. Nunca inventa saldo. */
export function vertalPay(env: NavigatorEnv, authorization: string | null): VertalPayAdapter {
  if (env.VERTAL_PAY_NAVIGATOR !== 'on' || !env.SUPABASE_URL || !authorization) return DISABLED_VERTAL_PAY;
  return {
    enabled: true,
    canPay: false, // sem API de pagar checkout de terceiros com o saldo (o Pay ainda está em desenvolvimento, #192)
    balance: async () => {
      const res = await fetch(`${env.SUPABASE_URL!.replace(/\/+$/, '')}/functions/v1/wallet`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authorization, apikey: env.SUPABASE_PUBLISHABLE_KEY ?? '' },
        body: JSON.stringify({ action: 'bank-overview' }),
      }).catch(() => null);
      if (!res?.ok) return null;
      return vertalPayBalanceFrom(await res.json().catch(() => null));
    },
  };
}

/** Pedido de cartão: usa o cartão da carteira (Cofre); sem cartão válido (ou recusado) o chat mostra o formulário. */
async function fulfillCardFromWallet(env: NavigatorEnv, userId: string, row: SessionRow, target: NavdTarget, p: NavigatorPending, raw: RawPending): Promise<{ filled: true } | { filled: false; view: Partial<NavigatorPending> }> {
  const fields = (Array.isArray(raw.fields) ? raw.fields : ['number']).filter((f): f is string => typeof f === 'string');
  const host = String(raw.host ?? p.host ?? '');
  const domain = siteSlugForHost(host).replace(/-/g, '.') || host;
  const base = { cardFields: fields, domain, host };
  if (raw.retry === true) return { filled: false, view: { ...base, cardRequired: true, retry: true } };
  const cards = (await table(env, 'kubo_secrets').select<{ id: string; env_key: string; bound_to: string | null; last_used_at: string | null }>({
    owner_id: `eq.${userId}`, bound_to: `eq.${WALLET_BOUND}`, select: 'id,env_key,bound_to,last_used_at', order: 'last_used_at.desc.nullslast', limit: '5',
  }).catch(() => [])).filter((c) => WALLET_CARD_RE.test(c.env_key));
  if (!cards.length) return { filled: false, view: { ...base, cardRequired: true } };
  const v = await resolveVaultValue(env, userId, cards[0].id, host, row.id).catch(() => null);
  const card = v ? parseCardVaultValue(v) : null;
  if (!card) return { filled: false, view: { ...base, cardRequired: true } };
  if (fields.includes('cvv') && !card.cvv) return { filled: false, view: { ...base, cvvOnlyFor: cardLabel(card) } };
  const value = cardFillValues(card, fields);
  const res = await navd<{ ok?: boolean }>(env, target, 'POST', '/input', { id: p.id, kind: 'card', value }).catch(() => null);
  for (const k of Object.keys(value)) value[k] = '';
  if (!res?.data.ok) return { filled: false, view: { ...base, cardRequired: true } };
  await table(env, 'kubo_secrets').update({ id: `eq.${cards[0].id}` }, { last_used_at: new Date().toISOString() }).catch(() => undefined);
  await recordAudit(env, userId, row.id, 'secret_used', { name: cards[0].env_key, host });
  return { filled: true };
}

/** Cartão seguro de cartão: valida, guarda na carteira (Cofre) se marcado e entrega ao navd. Nada volta ao cliente. */
async function cardInput(request: Request, env: NavigatorEnv, userId: string, row: SessionRow, target: NavdTarget, requestId: string, body: Record<string, unknown>, asked: RawPending): Promise<Response> {
  const host = String(asked.host ?? '').toLowerCase();
  const fields = (Array.isArray(asked.fields) ? asked.fields : ['number']).filter((f): f is string => typeof f === 'string');
  if (body.cancel === true) {
    const r = await navd<{ ok?: boolean }>(env, target, 'POST', '/input', { id: requestId, kind: 'card', value: null });
    return r.data.ok ? json(request, { ok: true, status: 'ok', saved: [] }) : fail(request, 'not_pending', {}, 409);
  }
  // Só o CVV, para o cartão salvo (o resto vem do Cofre).
  if (body.useSaved === true) {
    const cvv = String(body.cvv ?? '').trim();
    if (!/^\d{3,4}$/.test(cvv)) return fail(request, 'bad_request', { detail: 'cvv' }, 400);
    const cards = (await table(env, 'kubo_secrets').select<{ id: string; env_key: string }>({ owner_id: `eq.${userId}`, bound_to: `eq.${WALLET_BOUND}`, select: 'id,env_key', order: 'last_used_at.desc.nullslast', limit: '1' }).catch(() => []));
    const v = cards[0] ? await resolveVaultValue(env, userId, cards[0].id, host, row.id).catch(() => null) : null;
    const card = v ? parseCardVaultValue(v) : null;
    if (!card) return fail(request, 'bad_request', { detail: 'no_card' }, 400);
    const value = cardFillValues({ ...card, cvv }, fields);
    const r = await navd<{ ok?: boolean }>(env, target, 'POST', '/input', { id: requestId, kind: 'card', value });
    for (const k of Object.keys(value)) value[k] = '';
    if (!r.data.ok) return fail(request, 'not_pending', {}, 409);
    await recordAudit(env, userId, row.id, 'secret_used', { name: cards[0].env_key, host });
    return json(request, { ok: true, status: 'ok', saved: [] });
  }
  const parsed = parseCardInput(body);
  if (!parsed.ok) return fail(request, 'bad_request', { detail: parsed.detail }, 400);
  if (fields.includes('cvv') && !parsed.data.cvv) return fail(request, 'bad_request', { detail: 'cvv' }, 400);
  const value = cardFillValues(parsed.data, fields);
  const r = await navd<{ ok?: boolean; error?: string }>(env, target, 'POST', '/input', { id: requestId, kind: 'card', value });
  for (const k of Object.keys(value)) value[k] = '';
  if (!r.data.ok) return fail(request, 'not_pending', { detail: r.data.error }, 409);
  const saved: string[] = [];
  let saveError: string | undefined;
  if (parsed.save) {
    try {
      const s = await saveVaultSecret(env, userId, {
        envKey: walletCardName(parsed.data.number), value: cardVaultValue(parsed.data, parsed.saveCvv), boundTo: WALLET_BOUND,
        label: cardLabel(parsed.data), identifier: false, host, group: 'wallet', hint: cardLabel(parsed.data),
      });
      if (s.ok) {
        saved.push(s.envKey);
        await recordAudit(env, userId, row.id, 'secret_saved', { name: s.envKey, host });
      } else saveError = 'Não consegui guardar o cartão no Cofre; ele foi usado só neste pagamento.';
    } catch (e) {
      console.error('navigator: salvar cartão falhou', safeErrorMessage(e, 120));
      saveError = 'Não consegui guardar o cartão no Cofre; ele foi usado só neste pagamento.';
    }
  }
  return json(request, { ok: true, status: 'ok', saved, ...(saveError ? { saveError } : {}) });
}

// ─── Rotas ────────────────────────────────────────────────────────────────
export async function handleNavigator(request: Request, env: NavigatorEnv, url: URL): Promise<Response> {
  const route = url.pathname.slice(NAVIGATOR_API_PREFIX.length).replace(/^\/+|\/+$/g, '');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return fail(request, 'bad_request', {}, 405);
  if (!['start', 'task', 'status', 'input', 'takeover', 'release', 'stop', 'forget', 'settings', 'activity'].includes(route)) return fail(request, 'bad_request', {}, 404);

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
      case 'settings':
        return await settingsRoute(request, env, userId, body);
      case 'activity':
        return await activityRoute(request, env, userId);
      default:
        return await withSession(request, env, userId, route, body);
    }
  } catch (e) {
    if (e instanceof EncKeyMissingError) return fail(request, 'not_configured', {}, 503);
    if (e instanceof E2BError) {
      console.error('navigator: e2b', route, safeErrorMessage(e));
      return fail(request, 'sandbox_error', {}, 502);
    }
    console.error('navigator: erro', route, safeErrorMessage(e));
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
    if (existing.status === 'starting' && Date.now() - Date.parse(existing.started_at) < 180_000) return fail(request, 'busy', { detail: 'starting' }, 409);
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

  // Fase 4: até 2 tentativas silenciosas (sandbox novo na 2ª). Na 1ª abertura o navd
  // às vezes não respondia a tempo e o usuário via "start_failed"; a 2ª funcionava.
  const cookies = await loadProfileCookies(env, userId);
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= NAVIGATOR_START_ATTEMPTS; attempt++) {
    let sandboxId: string | null = null;
    try {
      const sandbox = await createSandbox(env, { timeoutSeconds: NAVIGATOR_LIMITS.idleTimeoutSeconds, metadata: { app: 'vertal-navigator', session: id } });
      sandboxId = sandbox.sandboxId;
      row.sandbox_id = sandbox.sandboxId;
      await sessions(env).update({ id: `eq.${id}` }, { sandbox_id: sandbox.sandboxId });
      if (!(await waitNavd(env, sandbox.sandboxId))) throw new E2BError('navd_not_ready');
      const init = await navd<{ ok?: boolean; cookiesImported?: number }>(env, { sandboxId: sandbox.sandboxId }, 'POST', '/init', {
        token: secrets.token, viewPassword: secrets.viewPassword, controlPassword: secrets.controlPassword,
        // Gmail sem login abre a página de marketing: vai direto ao login do Google (navigatorStartUrl).
        cookies, ...(parsed.data.url ? { startUrl: navigatorStartUrl(parsed.data.url) } : {}),
      }, 60_000);
      if (!init.data.ok) throw new E2BError('navd_init_failed');
      if ((await bill(env, row, now)) === 'insufficient_credits') {
        await endSession(env, row, 'insufficient_credits');
        return fail(request, 'insufficient_credits', {}, 402);
      }
      await sessions(env).update({ id: `eq.${id}` }, { status: 'active', last_activity_at: new Date().toISOString() });
      row.status = 'active';
      await recordAudit(env, userId, id, 'session_start', { ...(parsed.data.url ? { url: parsed.data.url } : {}), ...(attempt > 1 ? { attempt } : {}) });
      return json(request, { ok: true, status: 'ok', reused: false, cookiesRestored: init.data.cookiesImported ?? 0, ...sessionView(env, row, secrets) });
    } catch (e) {
      lastError = e;
      console.warn(`[navigator] start tentativa ${attempt} falhou:`, safeErrorMessage(e));
      // Sandbox que não subiu não fica para trás (nem ocupa vaga).
      if (sandboxId) await killSandbox(env, sandboxId);
      if (!(e instanceof E2BError)) break;
    }
  }
  await endSession(env, row, 'start_failed');
  throw lastError ?? new E2BError('start_failed');
}

/** Tentativas de abrir o sandbox antes de mostrar erro (a 2ª é silenciosa). */
export const NAVIGATOR_START_ATTEMPTS = 2;

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
      // Cartões da carteira nunca vão como segredo do fill_secret (só o fluxo de pagamento os usa).
      const usable = (await visibleSecrets(env, userId)).filter((x) => !isWalletSecret(x)).map((x) => ({ name: x.env_key, boundTo: x.bound_to }));
      // "Automatizar tudo" desta tarefa: só com o toque do usuário (confirmed), nunca pelo texto do modelo.
      const automation = parseAutomation(body.automation);
      if (!automation.ok) return fail(request, 'bad_request', { detail: automation.detail }, 400);
      await sessions(env).update({ id: `eq.${row.id}` }, { automation: automation.data }).catch(() => undefined);
      row.automation = automation.data;
      if (automation.data) await recordAudit(env, userId, row.id, 'settings_changed', automation.data.paymentMaxCents ? { limit: formatCents(automation.data.paymentMaxCents) } : {});
      // Página já aberta na sessão: a tarefa continua dali (não volta ao buscador a cada tarefa).
      const opened = parsed.data.url ? null : await navd<{ ok?: boolean; url?: string }>(env, target, 'GET', `/events?after=${Number.MAX_SAFE_INTEGER}`).catch(() => null);
      const currentUrl = typeof opened?.data.url === 'string' && /^https?:/i.test(opened.data.url) ? opened.data.url : null;
      // Fase 4: plano curto, leitura do texto da página e resposta citando o que foi lido.
      // Escopo: só o que foi pedido; busca sempre no DuckDuckGo; Gmail direto no login.
      const startUrl = parsed.data.url ? navigatorStartUrl(parsed.data.url) : undefined;
      const task = framedNavigatorTask(parsed.data.task, startUrl, { currentUrl });
      const model = pickNavigatorModel(parsed.data.model, { defaultModel: env.NAVIGATOR_MODEL, allowed: env.NAVIGATOR_ALLOWED_MODELS, provider });
      const res = await navd<{ ok?: boolean; runId?: string; error?: string }>(env, target, 'POST', '/task', {
        task, provider, apiKey: llmKey,
        model, llmPrivacy: llmPrivacy(env),
        maxSteps: parsed.data.maxSteps, secrets: usable,
      });
      if (res.status === 409) return fail(request, 'busy', {}, 409);
      // Defesa em profundidade: o navd também recusa senha/PIN/código com valor no texto.
      if (res.data.error === 'credentials_in_task') return fail(request, 'credentials_in_task', {}, 400);
      if (!res.data.ok) return fail(request, 'bad_request', { detail: res.data.error }, 400);
      await recordAudit(env, userId, row.id, 'task', { task: parsed.data.task, url: parsed.data.url });
      return json(request, { ok: true, status: 'ok', runId: res.data.runId, ...sessionView(env, row, s) });
    }
    case 'status': {
      const res = await navd<{ ok?: boolean; status?: string; runId?: string; takeover?: boolean; url?: string; events?: unknown; lastSeq?: number; pending?: unknown; screenshot?: string }>(
        env, target, 'GET', `/events?after=${base.data.after}`,
      );
      if (!res.data.ok) return fail(request, 'sandbox_error', {}, 502);
      const rawPending = (Array.isArray(res.data.pending) ? res.data.pending : []) as RawPending[];
      const autoAnswered = new Set<string>();
      // Recheck do total logo antes do clique (uma aprovação = um pagamento no total exato).
      for (const p of rawPending.filter((x) => x?.kind === 'payment_check' && typeof x.id === 'string')) {
        const fresh = summaryOf(p);
        const r = paymentRecheck({ cents: Number(p.approvedTotalCents), currency: String(p.currency ?? 'BRL') as 'BRL', store: typeof p.store === 'string' && p.store ? p.store : undefined }, fresh);
        await navd(env, target, 'POST', '/input', { id: p.id, kind: 'payment_check', value: r.ok }).catch(() => undefined);
        autoAnswered.add(String(p.id));
        if (!r.ok) await recordAudit(env, userId, row.id, 'payment', { ...summaryAudit(p), status: r.reason });
      }
      // Aprovação automática: só com pré-aprovação explícita (configurações ou "automatizar tudo" desta tarefa).
      const receipts: Array<Record<string, unknown>> = [];
      if (rawPending.some((p) => p?.kind === 'approval')) {
        const automation = row.automation ?? (await loadAutomation(env, row.id));
        const settings = await loadSettings(env, userId);
        const policy = effectivePolicy(settings, automation);
        for (const p of rawPending.filter((x) => x?.kind === 'approval' && typeof x.id === 'string')) {
          const r = await autoDecide(env, userId, row, target, p, policy, automation);
          if (r) {
            autoAnswered.add(String(p.id));
            receipts.push(r);
          }
        }
      }
      const vpay = rawPending.some((p) => p?.kind === 'approval' && p?.category !== 'write') ? vertalPay(env, request.headers.get('Authorization')) : DISABLED_VERTAL_PAY;
      const balance = vpay.enabled ? await vpay.balance().catch(() => null) : null;
      const pending = sanitizePending(rawPending.filter((p) => p?.kind !== 'payment_check' && !autoAnswered.has(String(p?.id))).map((p) => {
        const v = withSummary(p);
        if (v.kind === 'approval' && v.category !== 'write' && balance) {
          const line = vertalPayLine(balance, typeof v.totalCents === 'number' ? { cents: v.totalCents, currency: v.currency as 'BRL', text: String(v.total ?? '') } : null, (c) => formatCents(c));
          if (line) v.vertalPayLine = line;
        }
        return v;
      }));
      // Segredos e códigos TOTP pedidos pelo agente: resolvidos aqui, no servidor.
      for (const p of pending.filter((x) => x.kind === 'secret')) {
        await fulfillSecret(env, userId, row, target, p);
      }
      for (const p of pending.filter((x) => x.kind === 'totp')) {
        await fulfillTotp(env, userId, row, target, p);
      }
      // Cartões seguros (login/senha/código/telefone): Cofre primeiro; senão o usuário vê o cartão inline.
      const autoFilled = new Set<string>();
      const raws = new Map(rawPending.map((r) => [String(r?.id), r]));
      for (const p of pending.filter((x) => x.kind === 'login' || x.kind === 'phone' || x.kind === 'code')) {
        const raw = raws.get(p.id) ?? {};
        Object.assign(p, sanitizeAuthView(authPendingView(p.kind as 'login' | 'phone' | 'code', raw)));
        if (p.kind === 'login') {
          const r = await fulfillLoginFromVault(env, userId, row, target, p, raw);
          if (r.filled) autoFilled.add(p.id);
          else if (r.prefillUsername) p.prefillUsername = r.prefillUsername;
        } else if (p.kind === 'phone' && (await fulfillPhoneFromVault(env, userId, row, target, p))) {
          autoFilled.add(p.id);
        }
      }
      for (const p of pending.filter((x) => x.kind === 'card')) {
        const raw = raws.get(p.id) ?? {};
        const r = await fulfillCardFromWallet(env, userId, row, target, p, raw);
        if (r.filled) autoFilled.add(p.id);
        else Object.assign(p, r.view);
      }
      const events = sanitizeEvents(res.data.events);
      let cookiesSaved: number | null = null;
      if (events.some((e) => e.type === 'done')) cookiesSaved = await saveProfile(env, userId, target);
      const pageUrl = typeof res.data.url === 'string' && normalizeNavigatorUrl(res.data.url) ? res.data.url : undefined;
      return json(request, {
        ok: true, status: 'ok', agentStatus: res.data.status, runId: res.data.runId, takeover: !!res.data.takeover,
        url: pageUrl, events, lastSeq: res.data.lastSeq ?? base.data.after,
        pending: pending.filter((p) => p.kind !== 'secret' && p.kind !== 'totp' && !autoFilled.has(p.id)),
        filling: [
          ...pending.filter((p) => p.kind === 'secret' || p.kind === 'totp').map((p) => ({ name: p.name, host: p.host, kind: p.kind })),
          ...pending.filter((p) => autoFilled.has(p.id)).map((p) => ({ name: p.kind === 'phone' ? 'telefone' : p.kind === 'card' ? 'cartão da carteira' : 'login salvo', host: p.host, kind: p.kind })),
        ],
        ...(receipts.length ? { receipts } : {}),
        screenshot: typeof res.data.screenshot === 'string' && res.data.screenshot.startsWith('data:image/jpeg;base64,') ? res.data.screenshot : undefined,
        ...(cookiesSaved !== null ? { cookiesSaved } : {}),
        ...sessionView(env, row, s),
      });
    }
    case 'input': {
      const parsed = parseInputBody(body);
      if (!parsed.ok) return fail(request, parsed.status, { detail: parsed.detail }, 400);
      const d = parsed.data;
      // Detalhes do pedido (loja/total/botão) para a auditoria, antes de responder.
      const before = await navd<{ ok?: boolean; pending?: RawPending[] }>(env, target, 'GET', '/pending').catch(() => null);
      const asked = (before?.data.pending ?? []).find((p) => p?.id === d.requestId);
      if (d.kind === 'auth') return await authInput(request, env, userId, row, target, d.requestId, d.body, asked);
      if (d.kind === 'approval' && asked && asked.kind === 'approval' && asked.category !== 'write') {
        const sum = summaryOf(asked);
        // Uma aprovação = um total: o cartão manda o total que o usuário viu; se a página já mostra outro, pergunta de novo.
        if (d.approve && !approvalMatchesPending({ totalCents: d.totalCents, currency: d.currency }, sum)) return fail(request, 'total_changed', {}, 409);
        const res = await navd<{ ok?: boolean; error?: string }>(env, target, 'POST', '/input', {
          id: d.requestId, kind: 'approval', approve: d.approve, ...(d.approve && sum.total ? { totalCents: sum.total.cents, currency: sum.total.currency, store: sum.store } : {}),
        });
        if (!res.data.ok) return fail(request, 'not_pending', { detail: res.data.error }, 409);
        await recordAudit(env, userId, row.id, d.approve ? 'approval_granted' : 'approval_denied', summaryAudit(asked));
        await recordAudit(env, userId, row.id, 'payment', { ...summaryAudit(asked), status: d.approve ? 'approved' : 'denied', source: paySourceLabel(asked) });
        return json(request, { ok: true, status: 'ok' });
      }
      const res = await navd<{ ok?: boolean; error?: string }>(env, target, 'POST', '/input',
        d.kind === 'approval' ? { id: d.requestId, kind: 'approval', approve: d.approve } : { id: d.requestId, kind: d.kind, value: d.value });
      if (!res.data.ok) return fail(request, 'not_pending', { detail: res.data.error }, 409);
      if (d.kind === 'approval') await recordAudit(env, userId, row.id, d.approve ? 'approval_granted' : 'approval_denied', summaryAudit(asked));
      else if (d.kind === 'code') await recordAudit(env, userId, row.id, 'code_entered', { host: typeof asked?.host === 'string' ? asked.host : undefined });
      return json(request, { ok: true, status: 'ok' });
    }
    case 'takeover': {
      // Senha de controle nova a cada tomada de controle: a URL anterior não vale mais.
      const next = { ...s, controlPassword: randomPassword() };
      while (next.controlPassword === next.viewPassword) next.controlPassword = randomPassword();
      const res = await navd<{ ok?: boolean }>(env, target, 'POST', '/takeover', { controlPassword: next.controlPassword });
      if (!res.data.ok) return fail(request, 'sandbox_error', {}, 502);
      await sessions(env).update({ id: `eq.${row.id}` }, await sealSecrets(env, next));
      await recordAudit(env, userId, row.id, 'takeover');
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
      await recordAudit(env, userId, row.id, 'release');
      return json(request, { ok: true, status: 'ok', cookiesSaved, ...sessionView(env, row, next) });
    }
    default:
      return fail(request, 'bad_request', {}, 404);
  }
}

// ─── Preferências e Atividade (fase 2) ───────────────────────────────────
async function settingsRoute(request: Request, env: NavigatorEnv, userId: string, body: Record<string, unknown>): Promise<Response> {
  // Consentimento explícito para guardar a semente TOTP no cofre (o segredo em si vai pelo kubo-secrets).
  if (body.consent === 'totp') {
    const name = typeof body.name === 'string' ? body.name.trim().toUpperCase() : '';
    const bound = typeof body.boundTo === 'string' ? body.boundTo.trim().toLowerCase() : '';
    if (!isTotpSecretName(name) || !/^[a-z0-9_-]{1,64}$/.test(bound) || body.confirmed !== true) return fail(request, 'bad_request', { detail: 'consent' }, 400);
    await recordAudit(env, userId, null, 'totp_consent', { name, host: bound });
    return json(request, { ok: true, status: 'ok' });
  }
  if (body.autoApproveEnabled === undefined) {
    return json(request, { ok: true, status: 'ok', settings: await loadSettings(env, userId), capCents: NAVIGATOR_LIMITS.autoApproveMaxCentsCap });
  }
  const parsed = parseSettingsBody(body);
  if (!parsed.ok) return fail(request, parsed.status, { detail: parsed.detail }, 400);
  const s = parsed.data;
  await table(env, 'navigator_settings').upsert(
    { user_id: userId, auto_approve_enabled: s.autoApproveEnabled, auto_approve_max_cents: s.autoApproveMaxCents, updated_at: new Date().toISOString() },
    'user_id',
  );
  await recordAudit(env, userId, null, 'settings_changed', s.autoApproveEnabled ? { limit: formatCents(s.autoApproveMaxCents) } : {});
  return json(request, { ok: true, status: 'ok', settings: s, capCents: NAVIGATOR_LIMITS.autoApproveMaxCentsCap });
}

/** Privacidade das chamadas ao LLM (navd repassa ao OpenRouter em provider.data_collection / provider.zdr). */
function llmPrivacy(env: NavigatorEnv): { dataCollection: 'deny' | 'allow'; zdr: boolean } {
  return { dataCollection: env.NAVIGATOR_LLM_DATA_COLLECTION === 'allow' ? 'allow' : 'deny', zdr: env.NAVIGATOR_LLM_ZDR === 'true' };
}

interface AuditDbRow {
  id: string;
  session_id: string | null;
  kind: string;
  detail: Record<string, unknown>;
  detail_ciphertext?: string | null;
  detail_iv?: string | null;
  detail_tag?: string | null;
  key_version?: number | null;
  created_at: string;
}

/** Lê a auditoria do dono e decifra no servidor; o cliente recebe só {id, session_id, kind, detail, created_at}. */
async function loadOwnAudit(env: NavigatorEnv, userId: string): Promise<Array<Omit<AuditDbRow, 'detail_ciphertext' | 'detail_iv' | 'detail_tag' | 'key_version'>>> {
  const base = { user_id: `eq.${userId}`, order: 'created_at.desc', limit: '150' };
  let rows: AuditDbRow[];
  try {
    rows = await table(env, 'navigator_audit').select<AuditDbRow>({ ...base, select: 'id,session_id,kind,detail,detail_ciphertext,detail_iv,detail_tag,key_version,created_at' });
  } catch {
    // Migração do cofre ainda não aplicada: colunas novas não existem.
    rows = await table(env, 'navigator_audit').select<AuditDbRow>({ ...base, select: 'id,session_id,kind,detail,created_at' }).catch(() => []);
  }
  return Promise.all(rows.map(async (r) => ({
    id: r.id, session_id: r.session_id, kind: r.kind, created_at: r.created_at,
    detail: await openAuditDetail(env, { ...r, user_id: userId }),
  })));
}

async function activityRoute(request: Request, env: NavigatorEnv, userId: string): Promise<Response> {
  const [recentSessions, audit] = await Promise.all([
    sessions(env).select<{ id: string; status: string; started_at: string; ended_at: string | null; end_reason: string | null; billed_minutes: number }>({
      user_id: `eq.${userId}`, select: 'id,status,started_at,ended_at,end_reason,billed_minutes', order: 'started_at.desc', limit: '20',
    }),
    loadOwnAudit(env, userId).catch(() => []),
  ]);
  return json(request, { ok: true, status: 'ok', sessions: recentSessions, audit });
}

/** Só para testes: o resumo que o cartão recebe a partir do pedido cru do navd. */
export const __test = { withSummary, summaryAudit, llmPrivacy, authInput, fulfillLoginFromVault, fulfillPhoneFromVault, sanitizeAuthView, autoDecide, fulfillCardFromWallet, cardInput, spentInPeriod };
export type { NavigatorPending };
