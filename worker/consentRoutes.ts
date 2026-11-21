// Consent gate do chat da Vertal Dev: termo por categoria assinado eletronicamente.
//   POST /api/consent/status    {category?}            → aceites vigentes (sem dados pessoais), documento e pré-preenchimento
//   POST /api/consent/accept    {category, version, agree, fullName, document, address, organization?, location?}
//                                                       → grava o aceite (payload cifrado), hash SHA-256 e carimbo OpenTimestamps
//   POST /api/consent/classify  {text, surface?}       → nível (normal/sensível/ambíguo/proibido) + decisão; audita
//   POST /api/consent/admin-list {limit?}              → só admin; lista aceites (sem dados pessoais); registra o acesso
//   POST /api/consent/admin-get  {id, reason}          → só admin; decifra e confere o hash; registra o acesso
//   POST /api/consent/cron       (x-cron-token)        → upgrade dos .ots pendentes e reenvio dos que falharam
//
// Regras: ver supabase/functions/_shared/consentGate.ts e docs/CONSENT_GATE.md.
import {
  CONSENT_CATEGORIES, CONSENT_CATEGORY_KEYS, CONSENT_CLASSIFIER_SYSTEM, approximateLocation, buildSignedPayload, classifyRequest, consentDigest,
  consentDocument, decideGate, isConsentCategory, maskDocument, normalizeDocument, parseAcceptBody, sha256Hex, TOOL_CONSENT,
  type AcceptedVersions, type ConsentCategory, type ConsentClassification, type GateDecision, type SignedPayload, type SignerAddress, type SignerDocument,
} from '../supabase/functions/_shared/consentGate.ts';
import { otsStamp, otsUpgrade } from '../supabase/functions/_shared/openTimestamps.ts';
import { decryptWithConnectorKey, encryptWithConnectorKey, EncKeyMissingError } from './navigatorCrypto';
import { isAllowedOrigin } from './spotifyRoutes';
import { getUserId, table, type SupabaseEnv } from './supabaseRest';

export const CONSENT_API_PREFIX = '/api/consent';

export interface ConsentEnv extends SupabaseEnv {
  CONNECTOR_ENC_KEY?: string;
  /** Chave própria dos dados pessoais do termo. Se ausente, usa CONNECTOR_ENC_KEY. */
  CONSENT_ENC_KEY?: string;
  /** Mesmo valor do segredo 'vertal_scrape_cron_token' do Vault (pg_cron). */
  SCRAPE_CRON_TOKEN?: string;
  /** Opcional: pré-preenche nome/endereço/CPF a partir do cliente Stripe da compra do plano. */
  STRIPE_SECRET_KEY?: string;
  OPENROUTER_API_KEY?: string;
  /** Modelo barato do classificador (padrão google/gemini-2.5-flash-lite). */
  CONSENT_CLASSIFIER_MODEL?: string;
}

const consentKey = (env: ConsentEnv) => env.CONSENT_ENC_KEY || env.CONNECTOR_ENC_KEY;

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  const h: Record<string, string> = { 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Max-Age': '600', Vary: 'Origin' };
  if (isAllowedOrigin(origin)) h['Access-Control-Allow-Origin'] = origin!;
  return h;
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text().catch(() => '');
  if (text.length > 32_000) return null;
  try {
    const v = JSON.parse(text || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ─── Leitura dos aceites (usada também pelo /api/scrape e pelo Navigator) ──

interface AcceptanceRow { id: string; category: string; terms_version: string; digest_sha256: string; document_masked: string | null; accepted_at: string; location_kind: string }

export async function loadAcceptedVersions(env: SupabaseEnv, userId: string): Promise<AcceptedVersions> {
  const rows = await table(env, 'consent_acceptances')
    .select<{ category: string; terms_version: string }>({ user_id: `eq.${userId}`, select: 'category,terms_version', order: 'accepted_at.desc', limit: '50' })
    .catch(() => []);
  const out: AcceptedVersions = {};
  for (const r of rows) {
    if (!isConsentCategory(r.category)) continue;
    // Vale só a versão vigente; uma versão antiga não conta.
    if (r.terms_version === CONSENT_CATEGORIES[r.category].version) out[r.category] = r.terms_version;
  }
  return out;
}

export async function recordConsentAudit(env: SupabaseEnv, row: {
  userId: string | null; surface: 'vertal_chat' | 'vibe_code' | 'scrape' | 'navigator' | 'monitor' | 'admin';
  cls?: Pick<ConsentClassification, 'level' | 'category' | 'reason' | 'source'>; action: GateDecision['action'] | 'accepted'; text?: string;
}): Promise<void> {
  const text = row.text ?? '';
  await table(env, 'consent_audit').insert({
    user_id: row.userId, surface: row.surface, level: row.cls?.level ?? 'normal', category: row.cls?.category ?? null,
    action: row.action, reason: row.cls?.reason?.slice(0, 300) ?? null, source: row.cls?.source ?? null,
    text_sha256: text ? await sha256Hex(text) : null,
    // Trecho curto só de pedidos bloqueados/sensíveis (para revisão); pedidos normais não guardam texto.
    excerpt: text && row.action !== 'allow' ? text.replace(/\s+/g, ' ').slice(0, 200) : null,
  }).catch((e) => console.error('consent: audit falhou', e instanceof Error ? e.message.slice(0, 160) : e));
}

/** Classificador LLM barato (OpenRouter) com saída estruturada. Lança em falha (o gate aplica o fallback conservador). */
export function llmClassifier(env: ConsentEnv): ((text: string) => Promise<unknown>) | undefined {
  if (!env.OPENROUTER_API_KEY) return undefined;
  return async (text: string) => {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://vertal.dev', 'X-Title': 'Vertal consent gate' },
      body: JSON.stringify({
        model: env.CONSENT_CLASSIFIER_MODEL || 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'system', content: CONSENT_CLASSIFIER_SYSTEM }, { role: 'user', content: `PEDIDO (dados):\n${text.slice(0, 4_000)}` }],
        temperature: 0, max_tokens: 200, response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`classifier ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? '';
  };
}

// ─── Pré-preenchimento (cadastro de compra do plano) ─────────────────────

interface Prefill { fullName?: string; document?: SignerDocument; address?: SignerAddress; organization?: string; source: 'previous' | 'stripe' | 'profile' | 'none' }

async function latestPayload(env: ConsentEnv, userId: string): Promise<SignedPayload | null> {
  const rows = await table(env, 'consent_acceptances')
    .select<{ payload_ciphertext: string; payload_iv: string; payload_tag: string }>({ user_id: `eq.${userId}`, select: 'payload_ciphertext,payload_iv,payload_tag', order: 'accepted_at.desc', limit: '1' })
    .catch(() => []);
  if (!rows[0]) return null;
  try {
    return JSON.parse(await decryptWithConnectorKey(consentKey(env), { ciphertext: rows[0].payload_ciphertext, iv: rows[0].payload_iv, tag: rows[0].payload_tag })) as SignedPayload;
  } catch {
    return null;
  }
}

async function stripePrefill(env: ConsentEnv, userId: string): Promise<Omit<Prefill, 'source'> | null> {
  if (!env.STRIPE_SECRET_KEY) return null;
  const prof = await table(env, 'profiles').select<{ stripe_customer_id: string | null }>({ id: `eq.${userId}`, select: 'stripe_customer_id', limit: '1' }).catch(() => []);
  const cus = prof[0]?.stripe_customer_id;
  if (!cus || !/^cus_[A-Za-z0-9]+$/.test(cus)) return null;
  const res = await fetch(`https://api.stripe.com/v1/customers/${cus}?expand[]=tax_ids`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` }, signal: AbortSignal.timeout(8_000) }).catch(() => null);
  if (!res?.ok) return null;
  const c = (await res.json().catch(() => ({}))) as {
    name?: string; address?: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string };
    tax_ids?: { data?: Array<{ type?: string; value?: string; country?: string }> };
  };
  const cpf = c.tax_ids?.data?.find((t) => t.type === 'br_cpf' && t.value);
  // CPF do cadastro de compra só vale (e trava o campo) se os dígitos verificadores conferirem.
  const cpfDoc = cpf?.value ? normalizeDocument({ type: 'cpf', number: cpf.value, country: 'BR' }) : null;
  const a = c.address;
  return {
    ...(c.name ? { fullName: c.name } : {}),
    ...(cpfDoc ? { document: cpfDoc } : {}),
    ...(a?.line1 && a.city && a.country ? { address: { line1: a.line1, ...(a.line2 ? { line2: a.line2 } : {}), city: a.city, ...(a.state ? { region: a.state } : {}), ...(a.postal_code ? { postalCode: a.postal_code } : {}), country: a.country.toUpperCase() } } : {}),
  };
}

/**
 * Pré-preenchimento do cartão. O DOCUMENTO só vem do cadastro de compra (Stripe, tax_id br_cpf
 * com dígitos verificadores válidos) e, nesse caso, fica travado. Sem CPF no cadastro, o campo
 * fica VAZIO e editável: o usuário preenche (validado no cliente e no servidor). Nome, endereço e
 * organização vêm do último aceite, do Stripe ou do perfil (sempre editáveis).
 */
export function mergePrefill(
  prev: Pick<SignedPayload, 'signer'> | null,
  stripe: Omit<Prefill, 'source'> | null,
  displayName: string | null,
): Prefill {
  const document = stripe?.document ?? undefined;
  if (prev) {
    return { fullName: prev.signer.fullName, address: prev.signer.address, organization: prev.signer.organization, ...(document ? { document } : {}), source: 'previous' };
  }
  if (stripe && (stripe.fullName || stripe.document || stripe.address)) return { ...stripe, source: 'stripe' };
  return displayName ? { fullName: displayName, source: 'profile' } : { source: 'none' };
}

export async function loadPrefill(env: ConsentEnv, userId: string): Promise<Prefill> {
  const [prev, stripe] = await Promise.all([latestPayload(env, userId), stripePrefill(env, userId).catch(() => null)]);
  let displayName: string | null = null;
  if (!prev && !(stripe && (stripe.fullName || stripe.document || stripe.address))) {
    const prof = await table(env, 'profiles').select<{ display_name: string | null }>({ id: `eq.${userId}`, select: 'display_name', limit: '1' }).catch(() => []);
    displayName = prof[0]?.display_name ?? null;
  }
  return mergePrefill(prev, stripe, displayName);
}

// ─── Rotas ────────────────────────────────────────────────────────────────

export async function handleConsent(request: Request, env: ConsentEnv, url: URL): Promise<Response> {
  const route = url.pathname.slice(CONSENT_API_PREFIX.length).replace(/^\/+|\/+$/g, '');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { ok: false, status: 'bad_request' }, 405);
  if (route === 'cron') return cronRoute(request, env);
  if (!['status', 'accept', 'classify', 'admin-list', 'admin-get'].includes(route)) return json(request, { ok: false, status: 'bad_request' }, 404);
  let userId: string | null;
  try {
    userId = await getUserId(env, request.headers.get('Authorization'));
  } catch {
    return json(request, { ok: false, status: 'not_configured' }, 503);
  }
  if (!userId) return json(request, { ok: false, status: 'unauthorized' }, 401);
  if (!env.SUPABASE_SECRET_KEY || !consentKey(env)) return json(request, { ok: false, status: 'not_configured' }, 503);
  const body = await readBody(request);
  if (!body) return json(request, { ok: false, status: 'bad_request' }, 400);
  try {
    switch (route) {
      case 'status': return await statusRoute(request, env, userId, body);
      case 'accept': return await acceptRoute(request, env, userId, body);
      case 'classify': return await classifyRoute(request, env, userId, body);
      case 'admin-list': return await adminList(request, env, userId, body);
      default: return await adminGet(request, env, userId, body);
    }
  } catch (e) {
    if (e instanceof EncKeyMissingError) return json(request, { ok: false, status: 'not_configured' }, 503);
    console.error('consent: erro', route, e instanceof Error ? e.message.slice(0, 200) : e);
    return json(request, { ok: false, status: 'error' }, 500);
  }
}

async function statusRoute(request: Request, env: ConsentEnv, userId: string, body: Record<string, unknown>): Promise<Response> {
  const rows = await table(env, 'consent_acceptances').select<AcceptanceRow>({
    user_id: `eq.${userId}`, select: 'id,category,terms_version,digest_sha256,document_masked,accepted_at,location_kind', order: 'accepted_at.desc', limit: '50',
  });
  const ots = rows.length
    ? await table(env, 'consent_timestamps').select<{ acceptance_id: string; status: string; bitcoin_height: number | null }>({
      acceptance_id: `in.(${rows.map((r) => r.id).join(',')})`, select: 'acceptance_id,status,bitcoin_height',
    }).catch(() => [])
    : [];
  const accepted: Record<string, unknown> = {};
  for (const r of rows) {
    if (!isConsentCategory(r.category) || accepted[r.category] || r.terms_version !== CONSENT_CATEGORIES[r.category].version) continue;
    const t = ots.find((o) => o.acceptance_id === r.id);
    accepted[r.category] = { version: r.terms_version, acceptedAt: r.accepted_at, digest: r.digest_sha256, documentMasked: r.document_masked, locationKind: r.location_kind, ots: t ? { status: t.status, bitcoinHeight: t.bitcoin_height } : null };
  }
  const category = isConsentCategory(body.category) ? body.category : null;
  const prefill = category ? await loadPrefill(env, userId) : null;
  return json(request, {
    ok: true, status: 'ok', accepted,
    current: Object.fromEntries(CONSENT_CATEGORY_KEYS.map((c) => [c, { version: CONSENT_CATEGORIES[c].version, title: CONSENT_CATEGORIES[c].title }])),
    ...(category ? {
      category, version: CONSENT_CATEGORIES[category].version, title: CONSENT_CATEGORIES[category].title, document: consentDocument(category),
      prefill: prefill ? {
        fullName: prefill.fullName ?? '', address: prefill.address ?? null, organization: prefill.organization ?? '',
        // O documento do cadastro de compra (Stripe, CPF válido) vem mascarado e TRAVADO; sem ele, o campo vem vazio e editável.
        document: prefill.document ? { type: prefill.document.type, country: prefill.document.country, masked: maskDocument(prefill.document) } : null,
        documentLocked: !!prefill.document, source: prefill.source,
      } : null,
    } : {}),
  });
}

function clientIp(request: Request): string {
  return (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0] || '').trim().slice(0, 64);
}

async function acceptRoute(request: Request, env: ConsentEnv, userId: string, body: Record<string, unknown>): Promise<Response> {
  const prefill = await loadPrefill(env, userId);
  // Documento do cadastro de compra: o servidor usa o dele, nunca o que o cliente mandou.
  const merged = prefill.document ? { ...body, document: prefill.document } : body;
  const parsed = parseAcceptBody(merged);
  if (!parsed.ok) return json(request, { ok: false, status: 'bad_request', detail: parsed.detail }, 400);
  const input = parsed.data;
  const cf = (request as unknown as { cf?: Record<string, unknown> }).cf;
  const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const acceptedAt = new Date().toISOString();
  const payload = await buildSignedPayload(input, { userId, ip: clientIp(request), userAgent: request.headers.get('User-Agent') ?? '', acceptedAt, nonce, approximate: approximateLocation(cf) });
  const digest = await consentDigest(payload);
  const enc = await encryptWithConnectorKey(consentKey(env), JSON.stringify(payload));
  const id = crypto.randomUUID();
  await table(env, 'consent_acceptances').insert({
    id, user_id: userId, category: input.category, terms_version: input.version, terms_sha256: payload.termsSha256, digest_sha256: digest,
    location_kind: payload.location.kind, payload_ciphertext: enc.ciphertext, payload_iv: enc.iv, payload_tag: enc.tag,
    document_masked: maskDocument(input.document), accepted_at: acceptedAt,
  });
  // Carimbo no Bitcoin (OpenTimestamps, calendários públicos). Falhou: o cron reenvia.
  let otsStatus: 'pending' | 'submit_failed' = 'pending';
  try {
    const stamp = await otsStamp(digest);
    await table(env, 'consent_timestamps').insert({ acceptance_id: id, digest_sha256: digest, ots_proof: stamp.ots, status: 'pending', calendars: stamp.calendars, attempts: 1 });
  } catch (e) {
    otsStatus = 'submit_failed';
    await table(env, 'consent_timestamps').insert({ acceptance_id: id, digest_sha256: digest, status: 'submit_failed', attempts: 1, last_error: e instanceof Error ? e.message.slice(0, 300) : 'erro' }).catch(() => undefined);
  }
  await recordConsentAudit(env, { userId, surface: 'vertal_chat', cls: { level: 'sensitive', category: input.category, reason: `aceite ${input.version}`, source: 'rules' }, action: 'accepted' });
  await table(env, 'navigator_audit').insert({ user_id: userId, session_id: null, kind: 'consent_accepted', detail: { category: input.category, version: input.version } }).catch(() => undefined);
  return json(request, { ok: true, status: 'ok', id, category: input.category, version: input.version, digest, locationKind: payload.location.kind, ots: { status: otsStatus }, documentMasked: maskDocument(input.document) });
}

async function classifyRoute(request: Request, env: ConsentEnv, userId: string, body: Record<string, unknown>): Promise<Response> {
  const text = typeof body.text === 'string' ? body.text.slice(0, 6_000) : '';
  if (!text.trim()) return json(request, { ok: false, status: 'bad_request' }, 400);
  const surface = body.surface === 'vibe_code' ? 'vibe_code' : body.surface === 'navigator' ? 'navigator' : 'vertal_chat';
  const tool = typeof body.tool === 'string' ? body.tool : '';
  const cls = await classifyRequest(text, llmClassifier(env));
  const decision = decideGate(cls, await loadAcceptedVersions(env, userId), { clarifiedBefore: body.clarified === true, toolCategory: TOOL_CATEGORY[tool] });
  if (decision.action !== 'allow' || cls.level !== 'normal') await recordConsentAudit(env, { userId, surface, cls, action: decision.action, text });
  return json(request, { ok: true, status: 'ok', level: cls.level, category: cls.category, reason: cls.reason, decision });
}

// Navigator fora de propósito: só exige termo quando o pedido é sensível/ambíguo (ver TOOL_CONSENT).
const TOOL_CATEGORY: Record<string, ConsentCategory | undefined> = TOOL_CONSENT;

async function isAdmin(env: ConsentEnv, userId: string): Promise<boolean> {
  const rows = await table(env, 'user_roles').select<{ role: string }>({ user_id: `eq.${userId}`, role: 'eq.admin', select: 'role', limit: '1' }).catch(() => []);
  return rows.length > 0;
}

async function adminList(request: Request, env: ConsentEnv, userId: string, body: Record<string, unknown>): Promise<Response> {
  if (!(await isAdmin(env, userId))) return json(request, { ok: false, status: 'unauthorized' }, 403);
  const limit = Math.min(200, Math.max(1, Number(body.limit) || 50));
  const rows = await table(env, 'consent_acceptances').select<AcceptanceRow & { user_id: string }>({
    select: 'id,user_id,category,terms_version,digest_sha256,document_masked,accepted_at,location_kind', order: 'accepted_at.desc', limit: String(limit),
  });
  await table(env, 'consent_admin_access_log').insert({ admin_id: userId, action: 'list', reason: typeof body.reason === 'string' ? body.reason.slice(0, 300) : null, ip: clientIp(request) });
  return json(request, { ok: true, status: 'ok', acceptances: rows });
}

async function adminGet(request: Request, env: ConsentEnv, userId: string, body: Record<string, unknown>): Promise<Response> {
  if (!(await isAdmin(env, userId))) return json(request, { ok: false, status: 'unauthorized' }, 403);
  const id = typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
  // Acesso a dado pessoal exige motivo (fica no registro de auditoria).
  if (!id || reason.length < 5) return json(request, { ok: false, status: 'bad_request', detail: 'id_and_reason' }, 400);
  const rows = await table(env, 'consent_acceptances').select<AcceptanceRow & { payload_ciphertext: string; payload_iv: string; payload_tag: string; user_id: string }>({ id: `eq.${id}`, limit: '1' });
  const row = rows[0];
  if (!row) return json(request, { ok: false, status: 'not_found' }, 404);
  await table(env, 'consent_admin_access_log').insert({ admin_id: userId, acceptance_id: id, action: 'view', reason, ip: clientIp(request) });
  const payload = JSON.parse(await decryptWithConnectorKey(consentKey(env), { ciphertext: row.payload_ciphertext, iv: row.payload_iv, tag: row.payload_tag })) as SignedPayload;
  const recomputed = await consentDigest(payload);
  const ts = await table(env, 'consent_timestamps').select<{ ots_proof: string | null; status: string; bitcoin_height: number | null; calendars: string[] }>({ acceptance_id: `eq.${id}`, limit: '1' }).catch(() => []);
  return json(request, { ok: true, status: 'ok', acceptance: { id: row.id, userId: row.user_id, category: row.category, version: row.terms_version, acceptedAt: row.accepted_at, digest: row.digest_sha256, digestMatches: recomputed === row.digest_sha256 }, payload, document: isConsentCategory(row.category) ? consentDocument(row.category) : null, ots: ts[0] ?? null });
}

async function cronRoute(request: Request, env: ConsentEnv): Promise<Response> {
  const token = request.headers.get('x-cron-token') ?? '';
  if (!env.SCRAPE_CRON_TOKEN || token.length < 16 || !(await safeEqual(token, env.SCRAPE_CRON_TOKEN))) return json(request, { ok: false, status: 'unauthorized' }, 401);
  const due = await table(env, 'consent_timestamps').select<{ acceptance_id: string; digest_sha256: string; ots_proof: string | null; status: string; attempts: number }>({
    status: 'neq.confirmed', updated_at: `lt.${new Date(Date.now() - 50 * 60_000).toISOString()}`, select: 'acceptance_id,digest_sha256,ots_proof,status,attempts', order: 'updated_at.asc', limit: '20',
  });
  let upgraded = 0;
  for (const t of due) {
    const now = new Date().toISOString();
    try {
      if (!t.ots_proof) {
        const stamp = await otsStamp(t.digest_sha256);
        await table(env, 'consent_timestamps').update({ acceptance_id: `eq.${t.acceptance_id}` }, { ots_proof: stamp.ots, status: 'pending', calendars: stamp.calendars, attempts: t.attempts + 1, updated_at: now, last_error: null });
        continue;
      }
      const up = await otsUpgrade(t.ots_proof);
      await table(env, 'consent_timestamps').update({ acceptance_id: `eq.${t.acceptance_id}` }, {
        ots_proof: up.ots, status: up.status, bitcoin_height: up.bitcoinHeight, attempts: t.attempts + 1, updated_at: now,
        ...(up.status === 'confirmed' ? { confirmed_at: now } : {}),
      });
      if (up.changed) upgraded++;
    } catch (e) {
      await table(env, 'consent_timestamps').update({ acceptance_id: `eq.${t.acceptance_id}` }, { attempts: t.attempts + 1, updated_at: now, last_error: e instanceof Error ? e.message.slice(0, 300) : 'erro' }).catch(() => undefined);
    }
  }
  return json(request, { ok: true, status: 'ok', checked: due.length, upgraded });
}

export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0 && a.length === b.length;
}
