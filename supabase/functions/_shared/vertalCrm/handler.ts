// Vertal CRM · operações do servidor (edge function existente vertal-code-ai, ?app=crm).
//
// O CRUD do dia a dia vai direto do navegador pelo PostgREST com RLS (grátis, sem passar aqui).
// Aqui ficam só as operações que precisam do servidor:
//   - criar workspace (é aqui que valem as flags), membros e papéis;
//   - IA (1 crédito por uso, débito atômico + idempotente, devolução se falhar);
//   - API (chaves vcrm_) e webhooks; CRUD para a API e para o Vertal Fluxos (grátis);
//   - importar do Vertal Prospector / Growth Team; capturar e-mails do Gmail como notas (só leitura);
//   - sincronizar com CRMs externos pelas conexões que o usuário JÁ tem no Vertal Fluxos
//     (4 créditos uma vez para ativar; 2 por execução com IA; sem IA = VERTAL_CRM_PLAIN_SYNC_COST, padrão grátis).
// Nada aqui envia e-mail ou mensagem para ninguém.

import {
  aiMessages, localizeAiText, API_KEY_PREFIX, compactContext, contactPatch, CRM_AI_COST, CRM_DEFAULT_CURRENCY, CRM_DEFAULT_WS_NAME, CRM_EVENT_TYPES, CRM_SYNC_ACTIVATE_COST,
  CRM_SYNC_AI_RUN_COST, crmAiRequiresPlan, crmLang, dealPatch, DEFAULT_MAPPING, defaultPipelineName, defaultStages, EMAIL_RE,
  extractJson, flattenContact, growthContactToCrm, isAiKind, isSafeWebhookUrl, mappingMessages, normalizeEvents,
  normalizeMapping, normalizeStages, parseEmailDraft, parseNextAction, parseScore, plainSyncCost, providerInfo,
  prospectorLeadToCrm, pulledToContacts, PUSH_ACTION, pushParameters, SALESFORCE_PULL_QUERY, sanitizeSearchFilter,
  type CrmContactInput, type CrmEnv, type CrmLang, type SearchFilter, slugify, SYNC_PROVIDERS, UUID_RE,
} from "./core.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

/** Resultado do débito (tipo solto de propósito: o front compila sem strictNullChecks). */
export interface DebitResult { ok: boolean; charged?: number; free?: boolean; balanceAfter?: number | null; error?: string }

export interface CrmEngine {
  call(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<{ status: number; data: Loose }>;
}

export interface CrmDeps {
  admin: Loose;
  userId: string;
  env: CrmEnv;
  fetch: typeof fetch;
  /** Quem chama: o próprio usuário (JWT), uma chave da API (vcrm_) ou o Vertal Fluxos (vfk1). */
  via: "user" | "api" | "fluxos";
  /** Workspace fixo da chave de API. */
  apiWorkspaceId?: string | null;
  apiScopes?: string[];
  callModel: (messages: unknown[], o: { json: boolean; maxTokens: number }) => Promise<{ content: string; label?: string }>;
  credits: {
    debit: (amount: number, key: string, metadata: Record<string, unknown>) => Promise<DebitResult>;
    refund: (amount: number, key: string, metadata: Record<string, unknown>) => Promise<boolean>;
  };
  /** Motor do Vertal Fluxos (para sincronizar pelos apps que o usuário já conectou). */
  engine?: CrmEngine | null;
  gmailToken?: (accountId: string) => Promise<{ token: string; email: string }>;
  /** O usuário tem plano pago ativo? (VERTAL_CRM_AI_REQUIRES_PLAN). Sem a função, a regra não se aplica. */
  hasPaidPlan?: () => Promise<boolean>;
}

type Res = { status: number; body: Record<string, unknown> };
const ok = (body: Record<string, unknown> = {}): Res => ({ status: 200, body: { ok: true, ...body } });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Res => ({ status, body: { error, ...extra } });

const USER_OPS = new Set([
  "status", "bootstrap", "create_workspace", "delete_workspace", "invite_member", "set_member_role", "remove_member",
  "ai", "quote", "import_prospector", "import_growth", "capture_email", "api_key_create", "api_key_revoke",
  "webhook_create", "webhook_delete", "webhook_toggle", "sync_providers", "sync_activate", "sync_run", "sync_deactivate",
  "save_pipeline", "delete_pipeline",
]);
/** Operações da API/Vertal Fluxos (também liberadas para o usuário logado). CRUD = grátis. */
const API_OPS = new Set([
  "whoami", "list_workspaces", "list_pipelines", "list_contacts", "get_contact", "find_contact", "create_contact", "update_contact",
  "delete_contact", "list_companies", "create_company", "list_deals", "get_deal", "create_deal", "update_deal", "move_deal",
  "delete_deal", "create_task", "complete_task", "list_tasks", "create_note", "events_since",
]);
const WRITE_API_OPS = new Set(["create_contact", "update_contact", "delete_contact", "create_company", "create_deal", "update_deal", "move_deal", "delete_deal", "create_task", "complete_task", "create_note"]);

/** IA do CRM exige qualquer plano pago (padrão ligado). Devolve a resposta de upsell ou null. */
async function planGate(deps: CrmDeps, cost: number): Promise<Res | null> {
  if (!crmAiRequiresPlan(deps.env) || !deps.hasPaidPlan) return null;
  let paid = false;
  try {
    paid = await deps.hasPaidPlan();
  } catch {
    paid = false;
  }
  return paid ? null : fail(402, "plan_required", { cost, upgradeUrl: "/pricing", hint: "crm_ai_requires_any_paid_plan" });
}

const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const uuid = (v: unknown) => (typeof v === "string" && UUID_RE.test(v) ? v.toLowerCase() : null);
const idemKey = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9:_-]{8,100}$/.test(v) ? v : null);

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomToken(bytes = 32): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export const hashApiKey = sha256Hex;

// ─── workspace e papéis ───────────────────────────────────────────────
async function roleIn(deps: CrmDeps, ws: string): Promise<string | null> {
  const { data } = await deps.admin.from("crm_members").select("role").eq("workspace_id", ws).eq("user_id", deps.userId).maybeSingle();
  return data?.role ?? null;
}
const canWrite = (r: string | null) => r === "owner" || r === "admin" || r === "member";
const isAdminRole = (r: string | null) => r === "owner" || r === "admin";

/** Workspace da chamada: o da chave de API, o pedido (se for membro) ou o primeiro do usuário. */
async function resolveWorkspace(deps: CrmDeps, body: Loose): Promise<{ ws: string; role: string } | null> {
  if (deps.via === "api") {
    if (!deps.apiWorkspaceId) return null;
    const role = await roleIn(deps, deps.apiWorkspaceId);
    return role ? { ws: deps.apiWorkspaceId, role } : null;
  }
  const asked = uuid(body.workspaceId);
  if (asked) {
    const role = await roleIn(deps, asked);
    return role ? { ws: asked, role } : null;
  }
  const { data } = await deps.admin.from("crm_members").select("workspace_id, role, created_at").eq("user_id", deps.userId)
    .order("created_at", { ascending: true }).limit(1);
  const first = (data ?? [])[0];
  return first ? { ws: first.workspace_id, role: first.role } : null;
}

async function createWorkspace(deps: CrmDeps, name: string, lang: CrmLang) {
  const { data: ws, error } = await deps.admin.from("crm_workspaces")
    .insert({ owner_id: deps.userId, name: name || (CRM_DEFAULT_WS_NAME[lang] ?? "Meu CRM"), lang, currency: CRM_DEFAULT_CURRENCY[lang] ?? "USD" }).select("*").single();
  if (error || !ws) throw new Error(`workspace_insert: ${error?.message}`);
  const { data: u } = await deps.admin.auth.admin.getUserById(deps.userId).catch(() => ({ data: null }));
  await deps.admin.from("crm_members").insert({ workspace_id: ws.id, user_id: deps.userId, role: "owner", email: u?.user?.email ?? null });
  await deps.admin.from("crm_pipelines").insert({ workspace_id: ws.id, name: defaultPipelineName(lang), stages: defaultStages(lang), is_default: true, position: 0 });
  return ws;
}

async function listWorkspaces(deps: CrmDeps) {
  const { data: mem } = await deps.admin.from("crm_members").select("workspace_id, role, created_at")
    .eq("user_id", deps.userId).order("created_at", { ascending: true });
  const ids = (mem ?? []).map((m: Loose) => m.workspace_id);
  if (!ids.length) return [];
  const { data: wss } = await deps.admin.from("crm_workspaces").select("id, name, currency, lang, owner_id, settings").in("id", ids);
  return (mem ?? []).map((m: Loose) => {
    const w = (wss ?? []).find((x: Loose) => x.id === m.workspace_id);
    return w ? { ...w, settings: w.settings ?? {}, role: m.role } : null;
  }).filter(Boolean);
}

async function findUserIdByEmail(deps: CrmDeps, email: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await deps.admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const hit = (data?.users ?? []).find((u: Loose) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit.id;
    if ((data?.users ?? []).length < 1000) return null;
  }
  return null;
}

// ─── upsert de contato/empresa (deduplica por id externo ou e-mail) ─────────
async function upsertCompany(deps: CrmDeps, ws: string, c: { name: string } & Record<string, unknown>, extKey?: string): Promise<string | null> {
  const name = str(c.name, 200);
  if (!name) return null;
  if (extKey) {
    const [k, v] = extKey.split("=");
    const { data } = await deps.admin.from("crm_companies").select("id").eq("workspace_id", ws).eq(`external_ids->>${k}`, v).limit(1);
    if (data?.[0]) return data[0].id;
  }
  const { data: byName } = await deps.admin.from("crm_companies").select("id").eq("workspace_id", ws).ilike("name", name.replace(/[%_]/g, " ")).limit(1);
  if (byName?.[0]) return byName[0].id;
  const { data, error } = await deps.admin.from("crm_companies").insert({ workspace_id: ws, ...c, name }).select("id").single();
  if (error) throw new Error(`company_insert: ${error.message}`);
  return data.id;
}

async function upsertContact(deps: CrmDeps, ws: string, c: CrmContactInput & { company_id?: string | null }): Promise<{ id: string; created: boolean }> {
  for (const [k, v] of Object.entries(c.external_ids ?? {})) {
    if (!v) continue;
    const { data } = await deps.admin.from("crm_contacts").select("id, external_ids").eq("workspace_id", ws).eq(`external_ids->>${k}`, v).limit(1);
    if (data?.[0]) return { id: data[0].id, created: false };
  }
  const email = c.emails?.[0]?.email?.toLowerCase();
  if (email) {
    const { data } = await deps.admin.from("crm_contacts").select("id, external_ids").eq("workspace_id", ws).eq("email_primary", email).limit(1);
    if (data?.[0]) {
      await deps.admin.from("crm_contacts").update({ external_ids: { ...(data[0].external_ids ?? {}), ...(c.external_ids ?? {}) } }).eq("id", data[0].id);
      return { id: data[0].id, created: false };
    }
  }
  const { data, error } = await deps.admin.from("crm_contacts").insert({
    workspace_id: ws, first_name: c.first_name, last_name: c.last_name, title: c.title ?? null, emails: c.emails ?? [], phones: c.phones ?? [],
    status: c.status ?? "cold", source: c.source, external_ids: c.external_ids ?? {}, background: c.background ?? null,
    company_id: c.company_id ?? null, owner_id: deps.via === "user" ? deps.userId : null,
  }).select("id").single();
  if (error) throw new Error(`contact_insert: ${error.message}`);
  return { id: data.id, created: true };
}

// ─── importações do Prospector / Growth Team ────────────────────────────
export async function importProspector(deps: CrmDeps, ws: string, campaignId?: string | null) {
  let q = deps.admin.from("prospector_leads").select("*").eq("user_id", deps.userId).neq("status", "opted_out").order("created_at", { ascending: false }).limit(500);
  if (campaignId) q = q.eq("campaign_id", campaignId);
  const { data: leads } = await q;
  let companies = 0, contacts = 0;
  for (const lead of leads ?? []) {
    const m = prospectorLeadToCrm(lead);
    const companyId = await upsertCompany(deps, ws, { ...m.company }, `prospector_lead=${lead.id}`);
    if (companyId) companies++;
    if (m.contact) {
      const r = await upsertContact(deps, ws, { ...m.contact, company_id: companyId });
      if (r.created) contacts++;
    }
  }
  return { leads: (leads ?? []).length, companies, contactsCreated: contacts };
}

export async function importGrowth(deps: CrmDeps, ws: string, growthId?: string | null) {
  let q = deps.admin.from("growth_contacts").select("*").eq("user_id", deps.userId).order("created_at", { ascending: false }).limit(1000);
  if (growthId) q = q.eq("growth_id", growthId);
  const { data: rows } = await q;
  let created = 0;
  for (const gc of rows ?? []) {
    const m = growthContactToCrm(gc);
    if (!m) continue;
    const companyId = m.company ? await upsertCompany(deps, ws, { name: m.company, source: "growth", external_ids: {} }) : null;
    const r = await upsertContact(deps, ws, { ...m.contact, company_id: companyId });
    if (r.created) created++;
  }
  return { contacts: (rows ?? []).length, contactsCreated: created };
}

/** Importação automática (Prospector/Growth → Vertal CRM como CRM padrão). Silenciosa: nunca quebra a op original. */
export async function autoImport(deps: CrmDeps, source: "prospector" | "growth", id?: string | null) {
  try {
    const ws = await resolveWorkspace(deps, {});
    if (!ws || !canWrite(ws.role)) return null;
    const { data: w } = await deps.admin.from("crm_workspaces").select("settings").eq("id", ws.ws).maybeSingle();
    if (w?.settings?.autoImport === false) return null;
    return source === "prospector" ? await importProspector(deps, ws.ws, id) : await importGrowth(deps, ws.ws, id);
  } catch (e) {
    console.warn("[vertal-crm] importação automática falhou:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ─── contexto do registro para a IA ──────────────────────────────────────
async function recordContext(deps: CrmDeps, ws: string, type: string, id: string) {
  const table = type === "deal" ? "crm_deals" : type === "company" ? "crm_companies" : "crm_contacts";
  const { data: rec } = await deps.admin.from(table).select("*").eq("workspace_id", ws).eq("id", id).maybeSingle();
  if (!rec) return null;
  const col = type === "deal" ? "deal_id" : type === "company" ? "company_id" : "contact_id";
  const [{ data: notes }, { data: tasks }, { data: acts }] = await Promise.all([
    deps.admin.from("crm_notes").select("text, source, created_at").eq("workspace_id", ws).eq(col, id).order("created_at", { ascending: false }).limit(15),
    deps.admin.from("crm_tasks").select("type, text, due_date, done_at").eq("workspace_id", ws).eq(col, id).order("created_at", { ascending: false }).limit(10),
    deps.admin.from("crm_activities").select("kind, summary, data, created_at").eq("workspace_id", ws).eq(col, id).order("created_at", { ascending: false }).limit(15),
  ]);
  let company: Loose = null;
  if (rec.company_id) ({ data: company } = await deps.admin.from("crm_companies").select("name, sector, size, website, city, description").eq("id", rec.company_id).maybeSingle());
  let deals: Loose = [];
  if (type === "contact") ({ data: deals } = await deps.admin.from("crm_deals").select("name, stage, status, amount, expected_closing_date").eq("workspace_id", ws).contains("contact_ids", [id]).limit(10));
  const { custom: _c, external_ids: _e, workspace_id: _w, ...clean } = rec;
  return { type, record: clean, company, deals, notes: notes ?? [], tasks: tasks ?? [], timeline: acts ?? [] };
}

/** Executa o filtro da busca em linguagem natural (só filtros permitidos; nada de SQL cru). */
async function runSearch(deps: CrmDeps, ws: string, f: SearchFilter) {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  if (f.entity === "deals") {
    let q = deps.admin.from("crm_deals").select("id, name, stage, status, amount, expected_closing_date, company_id, updated_at").eq("workspace_id", ws).is("archived_at", null);
    if (f.text) q = q.ilike("name", `%${f.text}%`);
    if (f.stage) q = q.eq("stage", f.stage);
    if (f.deal_status) q = q.eq("status", f.deal_status);
    if (f.min_amount !== undefined) q = q.gte("amount", f.min_amount);
    if (f.max_amount !== undefined) q = q.lte("amount", f.max_amount);
    if (f.created_after) q = q.gte("created_at", f.created_after);
    if (f.created_before) q = q.lte("created_at", f.created_before);
    if (f.no_activity_days) q = q.lte("updated_at", daysAgo(f.no_activity_days));
    const { data } = await q.order("amount", { ascending: false }).limit(50);
    return data ?? [];
  }
  if (f.entity === "companies") {
    let q = deps.admin.from("crm_companies").select("id, name, sector, city, website").eq("workspace_id", ws);
    if (f.text) q = q.or(`name.ilike.%${f.text}%,sector.ilike.%${f.text}%,city.ilike.%${f.text}%`);
    if (f.created_after) q = q.gte("created_at", f.created_after);
    const { data } = await q.order("created_at", { ascending: false }).limit(50);
    return data ?? [];
  }
  let q = deps.admin.from("crm_contacts").select("id, first_name, last_name, title, email_primary, status, score, company_id, last_seen, tags").eq("workspace_id", ws);
  if (f.text) q = q.or(`first_name.ilike.%${f.text}%,last_name.ilike.%${f.text}%,email_primary.ilike.%${f.text}%,title.ilike.%${f.text}%`);
  if (f.status) q = q.eq("status", f.status);
  if (f.min_score !== undefined) q = q.gte("score", f.min_score);
  if (f.created_after) q = q.gte("created_at", f.created_after);
  if (f.created_before) q = q.lte("created_at", f.created_before);
  if (f.no_activity_days) q = q.lte("last_seen", daysAgo(f.no_activity_days));
  if (f.tag) {
    const { data: tag } = await deps.admin.from("crm_tags").select("id").eq("workspace_id", ws).ilike("name", f.tag).limit(1);
    if (!tag?.[0]) return [];
    q = q.contains("tags", [tag[0].id]);
  }
  const { data } = await q.order("created_at", { ascending: false }).limit(50);
  return data ?? [];
}


/** Minutos que um pedido de IA pode ficar "rodando" antes de ser considerado perdido (a função caiu no meio). */
export const STUCK_AI_MINUTES = 10;

/**
 * Pedidos de IA que ficaram "rodando" (a função parou antes de terminar ou de devolver): devolve o crédito
 * (chave idempotente "refund:<chave>") e marca como devolvido. Roda no "status" (abrir o CRM).
 */
export async function reconcileStuckAiRuns(deps: CrmDeps, now: Date = new Date()): Promise<number> {
  try {
    const cutoff = now.getTime() - STUCK_AI_MINUTES * 60_000;
    const { data } = await deps.admin.from("crm_ai_runs").select("idempotency_key, created_at, status").eq("user_id", deps.userId).eq("status", "running").limit(50);
    let n = 0;
    for (const r of (data ?? []) as Loose[]) {
      if (new Date(r.created_at).getTime() > cutoff) continue;
      // Só devolve o que foi de fato debitado (conta sem cobrança/admin não tem débito).
      const { data: tx } = await deps.admin.from("credit_transactions").select("delta").eq("user_id", deps.userId).eq("idempotency_key", r.idempotency_key).limit(1);
      const debited = Math.abs(Math.min(0, Number((tx ?? [])[0]?.delta ?? 0)));
      const refunded = debited > 0 ? await deps.credits.refund(debited, r.idempotency_key, { source: "vertal_crm", reason: "stuck_run" }) : false;
      await deps.admin.from("crm_ai_runs").update({ status: refunded ? "refunded" : "failed", error: "stuck_run", finished_at: now.toISOString() })
        .eq("user_id", deps.userId).eq("idempotency_key", r.idempotency_key).eq("status", "running");
      if (refunded) n++;
    }
    return n;
  } catch {
    return 0;
  }
}

// ─── IA: 1 crédito, idempotente, devolve se falhar ────────────────────────
async function runAi(deps: CrmDeps, ws: string, body: Loose): Promise<Res> {
  const kind = body.kind;
  if (!isAiKind(kind)) return fail(400, "invalid_kind");
  const key = idemKey(body.idempotencyKey);
  if (!key) return fail(400, "missing_idempotency_key");
  const lang = crmLang(body.lang);
  const chargeKey = `crm_ai:${key}`;
  const gate = await planGate(deps, CRM_AI_COST);
  if (gate) return gate;

  // Repetiu o mesmo pedido: devolve o resultado guardado, sem cobrar de novo.
  const { data: prev } = await deps.admin.from("crm_ai_runs").select("*").eq("user_id", deps.userId).eq("idempotency_key", chargeKey).maybeSingle();
  if (prev) {
    if (prev.status === "ok") return ok({ replayed: true, kind, result: prev.result, credits: 0 });
    if (prev.status === "running") return fail(409, "in_progress");
    return fail(409, "previous_attempt_failed", { hint: "use_new_idempotency_key", refunded: prev.status === "refunded" });
  }

  let ctx: unknown;
  let entityType: string | null = null;
  let entityId: string | null = null;
  if (kind === "search") {
    const query = str(body.query, 400);
    if (!query) return fail(400, "missing_query");
    const { data: pipes } = await deps.admin.from("crm_pipelines").select("name, stages").eq("workspace_id", ws);
    ctx = (pipes ?? []).map((p: Loose) => ({ funil: p.name, etapas: (p.stages ?? []).map((s: Loose) => `${s.id}=${s.label}`) }));
  } else {
    entityType = ["contact", "deal", "company"].includes(body.entityType) ? body.entityType : "contact";
    entityId = uuid(body.entityId);
    if (!entityId) return fail(400, "missing_entity");
    if (kind === "score" && entityType !== "contact") return fail(400, "score_only_for_contacts");
    ctx = await recordContext(deps, ws, entityType!, entityId);
    if (!ctx) return fail(404, "not_found");
  }

  const { error: insErr } = await deps.admin.from("crm_ai_runs").insert({
    workspace_id: ws, user_id: deps.userId, kind, entity_type: entityType, entity_id: entityId, idempotency_key: chargeKey, status: "running",
  });
  if (insErr) return fail(409, "in_progress");

  const debit = await deps.credits.debit(CRM_AI_COST, chargeKey, { source: "vertal_crm", kind, workspace_id: ws, entity_type: entityType, entity_id: entityId });
  if (!debit.ok) {
    await deps.admin.from("crm_ai_runs").delete().eq("user_id", deps.userId).eq("idempotency_key", chargeKey);
    return fail(debit.error === "insufficient_credits" ? 402 : 409, debit.error ?? "charge_failed", { cost: CRM_AI_COST });
  }
  const charged = debit.charged ?? 0;

  const finishFail = async (error: string): Promise<Res> => {
    let refunded = false;
    if (charged > 0) refunded = await deps.credits.refund(charged, chargeKey, { source: "vertal_crm", kind, reason: error });
    await deps.admin.from("crm_ai_runs").update({ status: refunded ? "refunded" : "failed", error, finished_at: new Date().toISOString() })
      .eq("user_id", deps.userId).eq("idempotency_key", chargeKey);
    return fail(502, "ai_failed", { detail: error, refunded, credits: refunded ? 0 : charged });
  };

  try {
    // Teste do fluxo de devolução (só o smoke usa; nunca ligado na tela).
    if (body.simulateFailure === true && deps.env.VERTAL_CRM_ALLOW_SIMULATED_FAILURE === "true") throw new Error("simulated_failure");
    const reply = await deps.callModel(aiMessages(kind, ctx, lang, { query: body.query, goal: body.goal }), {
      json: kind !== "summary", maxTokens: kind === "summary" ? 600 : kind === "email" ? 700 : 400,
    });
    const text = reply?.content ?? "";
    let result: Record<string, unknown>;
    if (kind === "summary") {
      if (!text.trim()) throw new Error("empty");
      result = { summary: localizeAiText(text.trim(), lang).slice(0, 4000) };
    } else if (kind === "email") {
      const d = parseEmailDraft(text);
      if (!d) throw new Error("bad_email");
      result = { draft: d, note: "rascunho" };
    } else if (kind === "score") {
      const s = parseScore(text);
      if (!s) throw new Error("bad_score");
      await deps.admin.from("crm_contacts").update({ score: s.score, score_reason: s.reasons.join(" · ").slice(0, 600) }).eq("workspace_id", ws).eq("id", entityId);
      result = s;
    } else if (kind === "next_action") {
      const a = parseNextAction(text);
      if (!a) throw new Error("bad_action");
      result = a;
      if (body.createTask === true) {
        const due = new Date(Date.now() + a.due_in_days * 86_400_000).toISOString();
        const col = entityType === "deal" ? "deal_id" : entityType === "company" ? "company_id" : "contact_id";
        const { data: t } = await deps.admin.from("crm_tasks").insert({ workspace_id: ws, [col]: entityId, type: a.task_type, text: a.action, due_date: due, created_by: deps.userId, assignee_id: deps.userId }).select("id").single();
        result = { ...a, taskId: t?.id ?? null };
      }
    } else {
      const f = sanitizeSearchFilter(extractJson(text));
      result = { filter: f, items: await runSearch(deps, ws, f) };
    }
    if (body.saveAsNote === true && entityId && (kind === "summary" || kind === "next_action")) {
      const col = entityType === "deal" ? "deal_id" : entityType === "company" ? "company_id" : "contact_id";
      await deps.admin.from("crm_notes").insert({ workspace_id: ws, [col]: entityId, text: kind === "summary" ? String(result.summary) : `Próxima ação (IA): ${result.action}`, source: "ai", author_id: deps.userId });
    }
    await deps.admin.from("crm_ai_runs").update({ status: "ok", credits: charged, result, finished_at: new Date().toISOString() })
      .eq("user_id", deps.userId).eq("idempotency_key", chargeKey);
    return ok({ kind, result, credits: charged, free: debit.free === true, balanceAfter: debit.balanceAfter ?? null, model: reply?.label ?? null });
  } catch (e) {
    return finishFail(e instanceof Error ? e.message.slice(0, 120) : "error");
  }
}

// ─── Gmail → notas (só leitura) ─────────────────────────────────────────
async function captureEmail(deps: CrmDeps, ws: string, body: Loose): Promise<Res> {
  if (!deps.gmailToken) return fail(503, "gmail_unavailable");
  const contactId = uuid(body.contactId);
  if (!contactId) return fail(400, "missing_contact");
  const { data: c } = await deps.admin.from("crm_contacts").select("id, emails").eq("workspace_id", ws).eq("id", contactId).maybeSingle();
  if (!c) return fail(404, "not_found");
  const emails = (c.emails ?? []).map((e: Loose) => String(e.email ?? "").toLowerCase()).filter((e: string) => EMAIL_RE.test(e)).slice(0, 3);
  if (!emails.length) return fail(400, "contact_without_email");
  const { data: accounts } = await deps.admin.from("gmail_accounts").select("id, email").eq("user_id", deps.userId);
  const acc = (accounts ?? []).find((a: Loose) => a.id === body.accountId) ?? (accounts ?? [])[0];
  if (!acc) return fail(409, "gmail_not_connected");
  const { token } = await deps.gmailToken(acc.id);
  const qs = emails.map((e: string) => `from:${e} OR to:${e}`).join(" OR ");
  const h = { Authorization: `Bearer ${token}` };
  const list = await deps.fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=${encodeURIComponent(`(${qs}) newer_than:180d`)}`, { headers: h });
  if (!list.ok) return fail(502, "gmail_failed");
  const ids = ((await list.json())?.messages ?? []).map((m: Loose) => m.id).slice(0, 15);
  let added = 0;
  for (const id of ids) {
    const { data: exists } = await deps.admin.from("crm_notes").select("id").eq("workspace_id", ws).eq("external_ref", `gmail:${id}`).maybeSingle();
    if (exists) continue;
    const r = await deps.fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, { headers: h });
    if (!r.ok) continue;
    const m = await r.json();
    const hdr = (n: string) => (m?.payload?.headers ?? []).find((x: Loose) => String(x.name).toLowerCase() === n)?.value ?? "";
    const text = `✉️ ${hdr("subject") || "(sem assunto)"}\nDe: ${hdr("from")}\nData: ${hdr("date")}\n\n${String(m?.snippet ?? "").slice(0, 1500)}`;
    const { error } = await deps.admin.from("crm_notes").insert({ workspace_id: ws, contact_id: contactId, text, source: "email", external_ref: `gmail:${id}`, meta: { gmail_id: id, thread_id: m?.threadId ?? null }, author_id: deps.userId });
    if (!error) added++;
  }
  if (added) await deps.admin.from("crm_contacts").update({ last_seen: new Date().toISOString() }).eq("id", contactId);
  return ok({ found: ids.length, added, account: acc.email });
}

// ─── sincronização com CRMs externos ───────────────────────────────────────
async function fluxosConnection(deps: CrmDeps, app: string) {
  const { data } = await deps.admin.from("fluxos_connections").select("app_key, status, fluxos_connection_id, screen_name").eq("user_id", deps.userId).eq("app_key", app).maybeSingle();
  return data ?? null;
}

async function syncProviders(deps: CrmDeps, ws: string): Promise<Res> {
  const { data: conns } = await deps.admin.from("crm_sync_connections").select("*").eq("workspace_id", ws);
  const { data: fx } = await deps.admin.from("fluxos_connections").select("app_key, status").eq("user_id", deps.userId);
  const fxMap = new Map((fx ?? []).map((r: Loose) => [r.app_key, r.status]));
  return ok({
    providers: SYNC_PROVIDERS.map((p) => ({
      ...p,
      available: !!p.fluxosApp,
      fluxosStatus: p.fluxosApp ? fxMap.get(p.fluxosApp) ?? null : null,
      connection: (conns ?? []).find((c: Loose) => c.provider === p.id) ?? null,
    })),
    costs: { activate: CRM_SYNC_ACTIVATE_COST, aiRun: CRM_SYNC_AI_RUN_COST, plainRun: plainSyncCost(deps.env) },
  });
}

async function syncActivate(deps: CrmDeps, ws: string, body: Loose): Promise<Res> {
  const p = providerInfo(body.provider);
  if (!p) return fail(400, "invalid_provider");
  if (!p.fluxosApp) return fail(409, "provider_coming_soon");
  const key = idemKey(body.idempotencyKey);
  if (!key) return fail(400, "missing_idempotency_key");
  const { data: existing } = await deps.admin.from("crm_sync_connections").select("*").eq("workspace_id", ws).eq("provider", p.id).maybeSingle();
  if (existing) {
    if (existing.status !== "active") await deps.admin.from("crm_sync_connections").update({ status: "active" }).eq("id", existing.id);
    return ok({ connection: { ...existing, status: "active" }, credits: 0, alreadyActive: true });
  }
  const fx = await fluxosConnection(deps, p.fluxosApp);
  if (!fx || fx.status !== "connected") return fail(409, "provider_not_connected", { app: p.fluxosApp });
  const chargeKey = `crm_sync_activate:${key}`;
  const debit = await deps.credits.debit(CRM_SYNC_ACTIVATE_COST, chargeKey, { source: "vertal_crm_sync", provider: p.id, workspace_id: ws });
  if (!debit.ok) return fail(debit.error === "insufficient_credits" ? 402 : 409, debit.error ?? "charge_failed", { cost: CRM_SYNC_ACTIVATE_COST });
  const { data: conn, error } = await deps.admin.from("crm_sync_connections").insert({
    workspace_id: ws, provider: p.id, status: "active", charge_key: chargeKey, charged_credits: debit.charged ?? 0, created_by: deps.userId,
    mapping: p.id === "pipedrive" || p.id === "hubspot" ? DEFAULT_MAPPING[p.id] : {},
  }).select("*").single();
  if (error || !conn) {
    const refunded = (debit.charged ?? 0) > 0 ? await deps.credits.refund(debit.charged ?? 0, chargeKey, { source: "vertal_crm_sync", provider: p.id }) : false;
    return fail(500, "activate_failed", { refunded });
  }
  return ok({ connection: conn, credits: debit.charged ?? 0, free: debit.free === true });
}

async function syncRun(deps: CrmDeps, ws: string, body: Loose): Promise<Res> {
  const p = providerInfo(body.provider);
  if (!p || !p.fluxosApp) return fail(400, "invalid_provider");
  const mode = body.mode === "ai" ? "ai" : "plain";
  const direction = body.direction === "pull" || body.direction === "both" ? body.direction : "push";
  const key = idemKey(body.idempotencyKey);
  if (!key) return fail(400, "missing_idempotency_key");
  const { data: conn } = await deps.admin.from("crm_sync_connections").select("*").eq("workspace_id", ws).eq("provider", p.id).maybeSingle();
  if (!conn || conn.status !== "active") return fail(409, "sync_not_activated", { cost: CRM_SYNC_ACTIVATE_COST });
  const fx = await fluxosConnection(deps, p.fluxosApp);
  if (!fx || fx.status !== "connected") return fail(409, "provider_not_connected", { app: p.fluxosApp });
  if (!deps.engine) return fail(503, "fluxos_not_configured");
  if ((direction === "push" && !p.push) || (direction === "pull" && !p.pull)) return fail(400, "direction_not_supported", { push: p.push, pull: p.pull });

  const cost = mode === "ai" ? CRM_SYNC_AI_RUN_COST : plainSyncCost(deps.env);
  if (mode === "ai") {
    const gate = await planGate(deps, cost);
    if (gate) return gate;
  }
  const chargeKey = `crm_sync_run:${key}`;
  const { data: prevRun } = await deps.admin.from("crm_sync_runs").select("*").eq("workspace_id", ws).eq("charge_key", chargeKey).maybeSingle();
  if (prevRun) return prevRun.status === "ok" ? ok({ replayed: true, run: prevRun, credits: 0 }) : fail(409, "previous_attempt_" + prevRun.status);
  let charged = 0;
  let free = false;
  if (cost > 0) {
    const d = await deps.credits.debit(cost, chargeKey, { source: "vertal_crm_sync", provider: p.id, mode, workspace_id: ws });
    if (!d.ok) return fail(d.error === "insufficient_credits" ? 402 : 409, d.error ?? "charge_failed", { cost });
    charged = d.charged ?? 0;
    free = d.free === true;
  }
  const { data: run } = await deps.admin.from("crm_sync_runs").insert({
    workspace_id: ws, connection_id: conn.id, mode, direction, status: "running", credits: charged, charge_key: chargeKey, created_by: deps.userId,
  }).select("*").single();
  const stats: Record<string, unknown> = { pushed: 0, pulled: 0, skipped: 0, errors: [] as string[] };
  try {
    let mapping = conn.mapping ?? {};
    if (mode === "ai" && (p.id === "pipedrive" || p.id === "hubspot")) {
      const def = await deps.engine.call("GET", `/apps/${p.fluxosApp}`);
      const action = (def.data?.actions ?? []).find((a: Loose) => a.key === PUSH_ACTION[p.id as "pipedrive" | "hubspot"]);
      const params = ((action?.arguments ?? action?.substeps?.find((s: Loose) => s.key === "chooseTrigger")?.arguments ?? []) as Loose[])
        .map((a) => ({ key: String(a.key), label: a.label, required: !!a.required })).filter((a) => a.key);
      const allowed = params.length ? params.map((a) => a.key) : Object.keys(DEFAULT_MAPPING[p.id]);
      const reply = await deps.callModel(mappingMessages(p.name, params.length ? params : allowed.map((k) => ({ key: k })), crmLang(body.lang)), { json: true, maxTokens: 400 });
      const j = extractJson(reply?.content ?? "");
      mapping = normalizeMapping(j?.mapping, p.id, allowed);
      stats.mappingNotes = typeof j?.notes === "string" ? j.notes.slice(0, 400) : null;
      await deps.admin.from("crm_sync_connections").update({ mapping }).eq("id", conn.id);
    }
    if ((direction === "push" || direction === "both") && p.push && (p.id === "pipedrive" || p.id === "hubspot")) {
      const map = Object.keys(mapping).length ? mapping : DEFAULT_MAPPING[p.id];
      const { data: contacts } = await deps.admin.from("crm_contacts").select("*").eq("workspace_id", ws).is(`external_ids->>${p.id}`, null).order("created_at", { ascending: true }).limit(Math.min(Number(body.limit) || 50, 100));
      const companyIds = [...new Set((contacts ?? []).map((c: Loose) => c.company_id).filter(Boolean))];
      const { data: comps } = companyIds.length ? await deps.admin.from("crm_companies").select("id, name, website").in("id", companyIds) : { data: [] };
      for (const c of contacts ?? []) {
        const params = pushParameters(p.id, map, flattenContact(c, (comps ?? []).find((x: Loose) => x.id === c.company_id)));
        if (p.id === "hubspot" && !params.email) {
          (stats.skipped as number)++;
          continue;
        }
        const r = await deps.engine.call("POST", "/run", { appKey: p.fluxosApp, kind: "action", key: PUSH_ACTION[p.id], connectionId: fx.fluxos_connection_id, parameters: params });
        if (r.status !== 200 || !r.data?.ok) {
          (stats.errors as string[]).push(String(r.data?.message ?? r.status).slice(0, 160));
          if ((stats.errors as string[]).length >= 5) break;
          continue;
        }
        const out = r.data?.data ?? {};
        const extId = String(out?.data?.id ?? out?.id ?? out?.vid ?? "") || "sincronizado";
        await deps.admin.from("crm_contacts").update({ external_ids: { ...(c.external_ids ?? {}), [p.id]: extId } }).eq("id", c.id);
        (stats.pushed as number)++;
      }
    }
    if ((direction === "pull" || direction === "both") && p.pull) {
      let items: unknown[] = [];
      if (p.id === "salesforce") {
        const r = await deps.engine.call("POST", "/run", { appKey: "salesforce", kind: "action", key: "executeQuery", connectionId: fx.fluxos_connection_id, parameters: { query: SALESFORCE_PULL_QUERY } });
        if (r.status === 200 && r.data?.ok) items = (r.data?.data?.records ?? r.data?.data?.data?.records ?? []) as unknown[];
        else (stats.errors as string[]).push(String(r.data?.message ?? r.status).slice(0, 160));
      } else {
        for (const key of ["newLeads", "newDeals"]) {
          const r = await deps.engine.call("POST", "/run", { appKey: "pipedrive", kind: "trigger", key, connectionId: fx.fluxos_connection_id, parameters: {} });
          if (r.status === 200 && r.data?.ok) items = items.concat((r.data?.items ?? []) as unknown[]);
          else (stats.errors as string[]).push(`${key}: ${String(r.data?.message ?? r.status).slice(0, 140)}`);
        }
      }
      for (const c of pulledToContacts(p.id, items)) {
        const companyId = c.company ? await upsertCompany(deps, ws, { name: c.company, source: "sync", external_ids: {} }) : null;
        const { company: _co, ...contact } = c;
        const r = await upsertContact(deps, ws, { ...contact, company_id: companyId });
        if (r.created) (stats.pulled as number)++;
        else (stats.skipped as number)++;
      }
    }
    const errs = stats.errors as string[];
    const allFailed = errs.length > 0 && !stats.pushed && !stats.pulled;
    if (allFailed) throw new Error(errs[0]);
    const now = new Date().toISOString();
    await deps.admin.from("crm_sync_runs").update({ status: "ok", stats, finished_at: now }).eq("id", run?.id);
    await deps.admin.from("crm_sync_connections").update({ last_sync_at: now, last_result: stats }).eq("id", conn.id);
    return ok({ stats, credits: charged, free, mode, mapping });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : "error";
    const refunded = charged > 0 ? await deps.credits.refund(charged, chargeKey, { source: "vertal_crm_sync", provider: p.id, reason: msg }) : false;
    await deps.admin.from("crm_sync_runs").update({ status: "failed", error: msg, stats, finished_at: new Date().toISOString() }).eq("id", run?.id);
    return fail(502, "sync_failed", { detail: msg, refunded });
  }
}

// ─── CRUD da API / Vertal Fluxos ────────────────────────────────────────
async function defaultPipeline(deps: CrmDeps, ws: string, id?: string | null) {
  let q = deps.admin.from("crm_pipelines").select("*").eq("workspace_id", ws);
  q = id ? q.eq("id", id) : q.order("is_default", { ascending: false }).order("position", { ascending: true });
  const { data } = await q.limit(1);
  return data?.[0] ?? null;
}

async function apiOp(deps: CrmDeps, op: string, ws: string, body: Loose): Promise<Res> {
  const a = deps.admin;
  const lim = Math.max(1, Math.min(Number(body.limit) || 50, 200));
  switch (op) {
    case "list_pipelines": {
      const { data } = await a.from("crm_pipelines").select("id, name, stages, is_default").eq("workspace_id", ws).order("position");
      return ok({ pipelines: data ?? [] });
    }
    case "list_contacts": {
      let q = a.from("crm_contacts").select("*").eq("workspace_id", ws);
      const qq = str(body.q, 80).replace(/[%_,()*\\]/g, " ").trim();
      if (qq) q = q.or(`first_name.ilike.%${qq}%,last_name.ilike.%${qq}%,email_primary.ilike.%${qq}%`);
      const { data } = await q.order("created_at", { ascending: false }).limit(lim);
      return ok({ contacts: data ?? [] });
    }
    case "get_contact": {
      const { data } = await a.from("crm_contacts").select("*").eq("workspace_id", ws).eq("id", uuid(body.id)).maybeSingle();
      return data ? ok({ contact: data }) : fail(404, "not_found");
    }
    case "find_contact": {
      const email = str(body.email, 200).toLowerCase();
      if (!EMAIL_RE.test(email)) return fail(400, "invalid_email");
      const { data } = await a.from("crm_contacts").select("*").eq("workspace_id", ws).eq("email_primary", email).limit(1);
      return ok({ contact: data?.[0] ?? null, found: !!data?.[0] });
    }
    case "create_contact": {
      const patch = contactPatch(body.contact ?? body);
      if (!patch.first_name && !patch.last_name && !patch.emails) return fail(400, "missing_name_or_email");
      let company_id: string | null = uuid(body.contact?.company_id ?? body.company_id);
      const companyName = str(body.contact?.company ?? body.company, 200);
      if (!company_id && companyName) company_id = await upsertCompany(deps, ws, { name: companyName, source: deps.via, external_ids: {} });
      const r = await upsertContact(deps, ws, {
        first_name: String(patch.first_name ?? ""), last_name: String(patch.last_name ?? ""), title: (patch.title as string) ?? null,
        emails: (patch.emails as Loose) ?? [], phones: (patch.phones as Loose) ?? [], status: (patch.status as string) ?? "cold",
        source: deps.via === "fluxos" ? "fluxos" : deps.via, external_ids: {}, background: (patch.background as string) ?? null, company_id,
      });
      const { data } = await a.from("crm_contacts").select("*").eq("id", r.id).single();
      return ok({ contact: data, created: r.created });
    }
    case "update_contact": {
      const id = uuid(body.id);
      if (!id) return fail(400, "missing_id");
      const patch = contactPatch(body.contact ?? body);
      const { data, error } = await a.from("crm_contacts").update(patch).eq("workspace_id", ws).eq("id", id).select("*").maybeSingle();
      if (error) return fail(400, "update_failed");
      return data ? ok({ contact: data }) : fail(404, "not_found");
    }
    case "delete_contact": {
      const { error } = await a.from("crm_contacts").delete().eq("workspace_id", ws).eq("id", uuid(body.id));
      return error ? fail(400, "delete_failed") : ok();
    }
    case "list_companies": {
      const { data } = await a.from("crm_companies").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(lim);
      return ok({ companies: data ?? [] });
    }
    case "create_company": {
      const name = str(body.name ?? body.company?.name, 200);
      if (!name) return fail(400, "missing_name");
      const id = await upsertCompany(deps, ws, { name, website: str(body.website, 300) || null, phone: str(body.phone, 40) || null, city: str(body.city, 120) || null, source: deps.via, external_ids: {} });
      const { data } = await a.from("crm_companies").select("*").eq("id", id).single();
      return ok({ company: data });
    }
    case "list_deals": {
      let q = a.from("crm_deals").select("*").eq("workspace_id", ws).is("archived_at", null);
      if (uuid(body.pipelineId)) q = q.eq("pipeline_id", uuid(body.pipelineId));
      if (typeof body.stage === "string") q = q.eq("stage", slugify(body.stage));
      const { data } = await q.order("updated_at", { ascending: false }).limit(lim);
      return ok({ deals: data ?? [] });
    }
    case "get_deal": {
      const { data } = await a.from("crm_deals").select("*").eq("workspace_id", ws).eq("id", uuid(body.id)).maybeSingle();
      return data ? ok({ deal: data }) : fail(404, "not_found");
    }
    case "create_deal": {
      const patch = dealPatch(body.deal ?? body);
      if (!patch.name) return fail(400, "missing_name");
      const pipe = await defaultPipeline(deps, ws, uuid(body.pipelineId ?? body.deal?.pipeline_id));
      if (!pipe) return fail(409, "no_pipeline");
      const stage = (pipe.stages ?? []).some((s: Loose) => s.id === patch.stage) ? patch.stage : pipe.stages?.[0]?.id;
      const contactId = uuid(body.contactId ?? body.deal?.contact_id);
      const { data, error } = await a.from("crm_deals").insert({
        workspace_id: ws, pipeline_id: pipe.id, ...patch, stage, company_id: uuid(body.companyId ?? body.deal?.company_id),
        contact_ids: contactId ? [contactId] : [], source: deps.via === "fluxos" ? "fluxos" : deps.via,
      }).select("*").single();
      if (error) return fail(400, "create_failed", { detail: error.message.slice(0, 120) });
      return ok({ deal: data });
    }
    case "update_deal":
    case "move_deal": {
      const id = uuid(body.id);
      if (!id) return fail(400, "missing_id");
      const patch = op === "move_deal" ? { stage: slugify(String(body.stage ?? "")) } : dealPatch(body.deal ?? body);
      if (patch.stage) {
        const { data: d } = await a.from("crm_deals").select("pipeline_id").eq("workspace_id", ws).eq("id", id).maybeSingle();
        if (!d) return fail(404, "not_found");
        const pipe = await defaultPipeline(deps, ws, d.pipeline_id);
        if (!(pipe?.stages ?? []).some((s: Loose) => s.id === patch.stage)) return fail(400, "invalid_stage", { stages: (pipe?.stages ?? []).map((s: Loose) => s.id) });
      }
      const { data, error } = await a.from("crm_deals").update(patch).eq("workspace_id", ws).eq("id", id).select("*").maybeSingle();
      if (error) return fail(400, "update_failed");
      return data ? ok({ deal: data }) : fail(404, "not_found");
    }
    case "delete_deal": {
      const { error } = await a.from("crm_deals").delete().eq("workspace_id", ws).eq("id", uuid(body.id));
      return error ? fail(400, "delete_failed") : ok();
    }
    case "list_tasks": {
      let q = a.from("crm_tasks").select("*").eq("workspace_id", ws);
      if (body.open !== false) q = q.is("done_at", null);
      const { data } = await q.order("due_date", { ascending: true, nullsFirst: false }).limit(lim);
      return ok({ tasks: data ?? [] });
    }
    case "create_task": {
      const text = str(body.text ?? body.task?.text, 2000);
      if (!text) return fail(400, "missing_text");
      const due = str(body.due_date ?? body.dueDate, 40);
      const dueIso = due && !Number.isNaN(Date.parse(due)) ? new Date(due).toISOString() : null;
      const { data, error } = await a.from("crm_tasks").insert({
        workspace_id: ws, text, type: str(body.type, 30) || "none", due_date: dueIso, reminder_at: dueIso,
        contact_id: uuid(body.contactId), deal_id: uuid(body.dealId), company_id: uuid(body.companyId),
        created_by: deps.userId, assignee_id: deps.userId,
      }).select("*").single();
      if (error) return fail(400, "create_failed", { detail: error.message.slice(0, 120) });
      return ok({ task: data });
    }
    case "complete_task": {
      const { data } = await a.from("crm_tasks").update({ done_at: new Date().toISOString() }).eq("workspace_id", ws).eq("id", uuid(body.id)).select("*").maybeSingle();
      return data ? ok({ task: data }) : fail(404, "not_found");
    }
    case "create_note": {
      const text = str(body.text, 20000);
      if (!text) return fail(400, "missing_text");
      const { data, error } = await a.from("crm_notes").insert({
        workspace_id: ws, text, source: deps.via === "user" ? "manual" : "api", contact_id: uuid(body.contactId), deal_id: uuid(body.dealId), company_id: uuid(body.companyId), author_id: deps.userId,
      }).select("*").single();
      if (error) return fail(400, "create_failed", { detail: error.message.slice(0, 120) });
      return ok({ note: data });
    }
    case "events_since": {
      const after = Math.max(0, Math.floor(Number(body.after) || 0));
      const types = Array.isArray(body.types) ? body.types.filter((t: unknown) => (CRM_EVENT_TYPES as readonly string[]).includes(String(t))) : [];
      let q = a.from("crm_events").select("id, type, entity_id, payload, created_at").eq("workspace_id", ws).gt("id", after);
      if (types.length) q = q.in("type", types);
      const { data } = await q.order("id", { ascending: false }).limit(Math.min(lim, 100));
      return ok({ events: data ?? [] });
    }
  }
  return fail(404, "unknown_op");
}

// ─── ponto de entrada ──────────────────────────────────────────────────────
export async function handleCrm(body: Loose, deps: CrmDeps): Promise<Res> {
  const op = String(body?.op ?? "status");
  if (deps.via !== "user" && !API_OPS.has(op)) return fail(403, "op_not_allowed_for_key");
  if (!USER_OPS.has(op) && !API_OPS.has(op)) return fail(404, "unknown_op");

  try {
    const { data: rl } = await deps.admin.rpc("bump_rate_limit", { _bucket: "vertal_crm", _user: deps.userId, _window_seconds: 60 });
    if (typeof rl === "number" && rl > 120) return fail(429, "rate_limited");
  } catch { /* limite indisponível não bloqueia o CRM */ }

  if (op === "status" || op === "whoami") {
    if (deps.via === "user" && op === "status") await reconcileStuckAiRuns(deps);
    const workspaces = await listWorkspaces(deps);
    return ok({
      enabled: true, via: deps.via, workspaces,
      costs: { ai: CRM_AI_COST, syncActivate: CRM_SYNC_ACTIVATE_COST, syncAiRun: CRM_SYNC_AI_RUN_COST, syncPlainRun: plainSyncCost(deps.env) },
    });
  }
  if (op === "list_workspaces") return ok({ workspaces: await listWorkspaces(deps) });
  if (op === "quote") {
    const what = String(body.what ?? "ai");
    const cost = what === "sync_activate" ? CRM_SYNC_ACTIVATE_COST : what === "sync_ai" ? CRM_SYNC_AI_RUN_COST : what === "sync_plain" ? plainSyncCost(deps.env) : CRM_AI_COST;
    return ok({ what, cost });
  }
  if (op === "bootstrap") {
    const existing = await listWorkspaces(deps);
    if (existing.length) return ok({ workspace: existing[0], workspaces: existing, created: false });
    const ws = await createWorkspace(deps, str(body.name, 120), crmLang(body.lang));
    return ok({ workspace: { ...ws, role: "owner" }, workspaces: [{ ...ws, role: "owner" }], created: true });
  }
  if (op === "create_workspace") {
    const { count } = await deps.admin.from("crm_workspaces").select("id", { count: "exact", head: true }).eq("owner_id", deps.userId);
    if ((count ?? 0) >= 5) return fail(409, "workspace_limit");
    const ws = await createWorkspace(deps, str(body.name, 120), crmLang(body.lang));
    return ok({ workspace: { ...ws, role: "owner" } });
  }

  const resolved = await resolveWorkspace(deps, body);
  if (!resolved) return fail(404, "workspace_not_found");
  const { ws, role } = resolved;

  if (API_OPS.has(op)) {
    if (WRITE_API_OPS.has(op) && !canWrite(role)) return fail(403, "read_only_role");
    if (deps.via === "api" && WRITE_API_OPS.has(op) && !(deps.apiScopes ?? []).includes("write")) return fail(403, "key_without_write_scope");
    return apiOp(deps, op, ws, body);
  }

  switch (op) {
    case "delete_workspace": {
      if (role !== "owner") return fail(403, "owner_only");
      if (body.confirm !== "APAGAR" && body.confirm !== "DELETE") return fail(400, "confirmation_required");
      await deps.admin.from("crm_workspaces").delete().eq("id", ws).eq("owner_id", deps.userId);
      return ok({ deleted: ws });
    }
    case "invite_member": {
      if (!isAdminRole(role)) return fail(403, "admin_only");
      const email = str(body.email, 200).toLowerCase();
      if (!EMAIL_RE.test(email)) return fail(400, "invalid_email");
      const r = ["admin", "member", "viewer"].includes(body.role) ? body.role : "member";
      const uid = await findUserIdByEmail(deps, email);
      // Só quem já tem conta no Vertal Dev; nenhum convite por e-mail é enviado.
      if (!uid) return fail(404, "user_not_found", { hint: "ask_to_sign_up" });
      const { count } = await deps.admin.from("crm_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", ws);
      if ((count ?? 0) >= 50) return fail(409, "member_limit");
      const { error } = await deps.admin.from("crm_members").upsert({ workspace_id: ws, user_id: uid, role: r, email }, { onConflict: "workspace_id,user_id", ignoreDuplicates: true });
      return error ? fail(400, "invite_failed") : ok({ member: { user_id: uid, email, role: r } });
    }
    case "set_member_role": {
      if (!isAdminRole(role)) return fail(403, "admin_only");
      const uid = uuid(body.userId);
      const r = ["admin", "member", "viewer"].includes(body.role) ? body.role : null;
      if (!uid || !r) return fail(400, "invalid_input");
      if (r === "admin" && role !== "owner") return fail(403, "owner_only");
      const { data } = await deps.admin.from("crm_members").update({ role: r }).eq("workspace_id", ws).eq("user_id", uid).neq("role", "owner").select("user_id").maybeSingle();
      return data ? ok() : fail(404, "member_not_found");
    }
    case "remove_member": {
      const uid = uuid(body.userId);
      if (!uid) return fail(400, "invalid_input");
      if (uid !== deps.userId && !isAdminRole(role)) return fail(403, "admin_only");
      const { data } = await deps.admin.from("crm_members").delete().eq("workspace_id", ws).eq("user_id", uid).neq("role", "owner").select("user_id").maybeSingle();
      return data ? ok() : fail(404, "member_not_found");
    }
    case "ai":
      if (!canWrite(role) && body.kind !== "summary" && body.kind !== "search") return fail(403, "read_only_role");
      return runAi(deps, ws, body);
    case "import_prospector":
      if (!canWrite(role)) return fail(403, "read_only_role");
      return ok({ result: await importProspector(deps, ws, uuid(body.campaignId)) });
    case "import_growth":
      if (!canWrite(role)) return fail(403, "read_only_role");
      return ok({ result: await importGrowth(deps, ws, uuid(body.growthId)) });
    case "capture_email":
      if (!canWrite(role)) return fail(403, "read_only_role");
      return captureEmail(deps, ws, body);
    case "api_key_create": {
      if (!isAdminRole(role)) return fail(403, "admin_only");
      const { count } = await deps.admin.from("crm_api_keys").select("id", { count: "exact", head: true }).eq("workspace_id", ws).is("revoked_at", null);
      if ((count ?? 0) >= 10) return fail(409, "key_limit");
      const key = `${API_KEY_PREFIX}${randomToken(32)}`;
      const scopes = body.readOnly === true ? ["read"] : ["read", "write"];
      const { data, error } = await deps.admin.from("crm_api_keys").insert({
        workspace_id: ws, name: str(body.name, 80) || "Chave da API", prefix: key.slice(0, 12), key_hash: await sha256Hex(key), scopes, created_by: deps.userId,
      }).select("id, name, prefix, scopes, created_at").single();
      if (error) return fail(400, "create_failed");
      return ok({ key, apiKey: data, shownOnce: true });
    }
    case "api_key_revoke": {
      if (!isAdminRole(role)) return fail(403, "admin_only");
      await deps.admin.from("crm_api_keys").update({ revoked_at: new Date().toISOString() }).eq("workspace_id", ws).eq("id", uuid(body.id));
      return ok();
    }
    case "webhook_create": {
      if (!isAdminRole(role)) return fail(403, "admin_only");
      if (!isSafeWebhookUrl(body.url)) return fail(400, "invalid_url", { hint: "https_public_only" });
      const { count } = await deps.admin.from("crm_webhooks").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
      if ((count ?? 0) >= 10) return fail(409, "webhook_limit");
      const secret = `whsec_${randomToken(24)}`;
      const { data, error } = await deps.admin.from("crm_webhooks").insert({ workspace_id: ws, url: body.url, events: normalizeEvents(body.events), secret, created_by: deps.userId })
        .select("id, url, events, active, created_at").single();
      if (error) return fail(400, "create_failed");
      return ok({ webhook: data, secret, shownOnce: true });
    }
    case "webhook_delete": {
      if (!isAdminRole(role)) return fail(403, "admin_only");
      await deps.admin.from("crm_webhooks").delete().eq("workspace_id", ws).eq("id", uuid(body.id));
      return ok();
    }
    case "webhook_toggle": {
      if (!isAdminRole(role)) return fail(403, "admin_only");
      await deps.admin.from("crm_webhooks").update({ active: body.active === true }).eq("workspace_id", ws).eq("id", uuid(body.id));
      return ok();
    }
    case "save_pipeline": {
      if (!isAdminRole(role)) return fail(403, "admin_only");
      const stages = normalizeStages(body.stages);
      if (!stages) return fail(400, "invalid_stages");
      const name = str(body.name, 80) || "Funil";
      const id = uuid(body.id);
      if (id) {
        // Etapa removida com negócios dentro: eles vão para a primeira etapa (o gatilho do banco faz isso ao regravar).
        const { data, error } = await deps.admin.from("crm_pipelines").update({ name, stages }).eq("workspace_id", ws).eq("id", id).select("*").maybeSingle();
        if (error || !data) return fail(400, "save_failed");
        const ids = stages.map((s) => s.id);
        const { data: orphan } = await deps.admin.from("crm_deals").select("id, stage").eq("pipeline_id", id).not("stage", "in", `(${ids.map((i) => `"${i}"`).join(",")})`);
        for (const d of orphan ?? []) await deps.admin.from("crm_deals").update({ stage: ids[0] }).eq("id", d.id);
        // Tipo da etapa pode ter mudado (aberta ↔ ganha): regrava o status dos negócios.
        await deps.admin.from("crm_deals").update({ pipeline_id: id }).eq("pipeline_id", id);
        return ok({ pipeline: data, moved: (orphan ?? []).length });
      }
      const { count } = await deps.admin.from("crm_pipelines").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
      if ((count ?? 0) >= 20) return fail(409, "pipeline_limit");
      const { data, error } = await deps.admin.from("crm_pipelines").insert({ workspace_id: ws, name, stages, position: count ?? 0, is_default: !count }).select("*").single();
      return error ? fail(400, "save_failed") : ok({ pipeline: data });
    }
    case "delete_pipeline": {
      if (!isAdminRole(role)) return fail(403, "admin_only");
      const id = uuid(body.id);
      const { count } = await deps.admin.from("crm_pipelines").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
      if ((count ?? 0) <= 1) return fail(409, "last_pipeline");
      const { count: deals } = await deps.admin.from("crm_deals").select("id", { count: "exact", head: true }).eq("pipeline_id", id);
      if ((deals ?? 0) > 0 && body.confirm !== "APAGAR") return fail(409, "pipeline_has_deals", { deals });
      await deps.admin.from("crm_pipelines").delete().eq("workspace_id", ws).eq("id", id);
      return ok();
    }
    case "sync_providers":
      return syncProviders(deps, ws);
    case "sync_activate":
      if (!isAdminRole(role)) return fail(403, "admin_only");
      return syncActivate(deps, ws, body);
    case "sync_run":
      if (!canWrite(role)) return fail(403, "read_only_role");
      return syncRun(deps, ws, body);
    case "sync_deactivate": {
      if (!isAdminRole(role)) return fail(403, "admin_only");
      const p = providerInfo(body.provider);
      if (!p) return fail(400, "invalid_provider");
      await deps.admin.from("crm_sync_connections").update({ status: "paused" }).eq("workspace_id", ws).eq("provider", p.id);
      return ok();
    }
  }
  return fail(404, "unknown_op");
}

export const _internals = { compactContext };
