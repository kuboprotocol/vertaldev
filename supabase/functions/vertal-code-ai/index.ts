// VERTAL Code AI · edge function (nuvem). Modo NOVO, ao lado do Vibe Code — não substitui nada.
//
//   POST {action:"status"}                       → {enabled, allowed} (200 só para quem está liberado)
//   POST {action:"models"}                       → modelos disponíveis (só nomes Vertal)
//   POST {action:"run", mode, effort, prompt...}  → SSE: status/read/model/verify/diff/plan/reply/done
//   POST {action:"apply", projectId, changes}     → grava versões novas no cofre de código do projeto
//   run aceita também option ("auto"|"code"|"livre"|"turbo"|"pro") e modelId (id Vertal, fixa um modelo da opção)
//   POST {action:"image", prompt, images?}        → {images:[dataUrl], text, model, estimate}  (só com VERTAL_CODE_AI_MEDIA_ENABLED)
//   POST {action:"video", prompt}                 → {job, model, estimate}; depois {action:"video_status", job}
//   POST {action:"video_content", job}            → bytes do vídeo (quando o provedor não devolve link assinado)
//   POST {action:"senses", op:"status|decide|photo|frames|hear|speak"} → Vertal Decide / Visão / Ouvir (só com mídia ligada e endpoint próprio)
//   POST {action:"novela", op:"submit|status|result"}  → Vertal Novela (~2 min); job assinado como o vídeo
//   POST {action:"free_quota", op?:"status"|"probe"} → monitor de cota grátis (só admin; uso vs limite por provedor, quem está pulado)
//   run aceita skipModels:[id|provedor|custo] só de admin (teste de queda da cadeia)
//   POST {action:"prospector", op, ...}           → Vertal Prospector (só com VERTAL_PROSPECTOR_ENABLED e o usuário em VERTAL_PROSPECTOR_USER_IDS)
//   POST {action:"growth", op, ...}               → Vertal Growth Team (só com VERTAL_GROWTH_TEAM_ENABLED e o mesmo usuário liberado no Prospector)
//   POST ?app=crm {op, ...}                       → Vertal CRM (só com VERTAL_CRM_ENABLED e o usuário em VERTAL_CRM_USER_IDS;
//                                                   aceita JWT do usuário, chave da API "x-vertal-crm-key: vcrm_…" ou a chave vfk1 do Vertal Fluxos)
//
// Liga só com VERTAL_CODE_AI_ENABLED=true (padrão: desligado → 404).
// Com VERTAL_CODE_AI_USER_IDS (lista de ids separada por vírgula), só esses usuários; os demais recebem 404.
// Não escreve em ai_gateway_runs (para não mexer na saúde/roteamento do Vibe Code) e
// não cobra créditos na v1 (modelos grátis). Chaves só por variável de ambiente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildChain,
  buildOptionChain,
  extractImages,
  imageRequestBody,
  isVcaMediaEnabled,
  mediaCostUsd,
  parseVcaOption,
  retailCredits,
  VCA_MEDIA_OPTIONS,
  VCA_OPTION_LABEL,
  VCA_TEXT_OPTIONS,
  videoRequestBody,
  expandVcaEnv,
  extractOwnImage,
  imageModels,
  ownImageRequestBody,
  ownVideoRequestBody,
  ownVideoStatus,
  VCA_OWN_JOB_PREFIX,
  videoModels,
  isVcaEnabled,
  isVcaUserAllowed,
  publicModelInfo,
  type VcaChatMessage,
  type VcaEffort,
  type VcaMode,
  type VcaModel,
} from "../_shared/vertalCodeAi/router.ts";
import { isSafePath } from "../_shared/vibeAgentCore.ts";
import { type ModelReply, runVertalCodeAi, type VcaEvent, type VcaPlan } from "../_shared/vertalCodeAi/core.ts";
import { runChain } from "../_shared/vertalCodeAi/chainRunner.ts";
import {
  CEREBRAS_MODELS_URL,
  FreeQuotaMonitor,
  freeTierModels,
  GEMINI_MODELS_URL,
  QUOTA_BUCKET_PREFIX,
  type QuotaStore,
} from "../_shared/vertalCodeAi/freeQuota.ts";
import { sensesConfig } from "../_shared/vertalCodeAi/senses.ts";
import { handleNovela, handleSenses, type SensesHandlerDeps } from "../_shared/vertalCodeAi/sensesHandler.ts";
// Equipe Vertal (3 núcleos + 5 papéis), memória expansiva e Vertal Decide — aditivo, desligado por padrão:
// VERTAL_CODE_AI_TEAM_ENABLED + VERTAL_CODE_AI_TEAM_USER_IDS (lista própria; vazia = ninguém).
import {
  expandTeamEnv,
  isVcaTeamEnabled,
  isVcaTeamMemoryEnabled,
  isVcaTeamSandboxEnabled,
  runVertalTeam,
  teamBudgetFromEnv,
  VcaBudgetGuard,
} from "../_shared/vertalCodeAi/team.ts";
import { deleteMemories, listMemories, type MemoryStoreDeps, rememberRun, retrieveMemories } from "../_shared/vertalCodeAi/memory.ts";
import { analyzeWithDecide, type DecisionQuestions, makeDecider } from "../_shared/vertalCodeAi/decide.ts";
import { runSandboxTest } from "../_shared/vertalCodeAi/sandbox.ts";
import { repairAgentJson } from "../_shared/chatOrchestrator.ts";
// Vertal Prospector (aditivo, desligado por padrão: VERTAL_PROSPECTOR_ENABLED + VERTAL_PROSPECTOR_USER_IDS).
import { isProspectorEnabled } from "../_shared/vertalProspector/core.ts";
import { handleProspector } from "../_shared/vertalProspector/handler.ts";
import { getFreshAccessToken, loadAccount } from "../_shared/gmailToken.ts";
// Vertal Growth Team (aditivo, desligado por padrão: VERTAL_GROWTH_TEAM_ENABLED + allowlist do Prospector).
import { growthChargeAdmins, isGrowthEnabled } from "../_shared/vertalGrowth/core.ts";
import { handleGrowth, type DebitResult } from "../_shared/vertalGrowth/handler.ts";
import { listVisibleSecrets, resolveEnvForRun } from "../_shared/kuboSecrets.ts";
// Vertal CRM (aditivo, desligado por padrão: VERTAL_CRM_ENABLED + VERTAL_CRM_USER_IDS). Não depende das flags do VERTAL Code AI.
import { crmChargeAdmins, crmChargeOn, isApiKeyShape as isVertalCrmApiKey, isCrmEnabled, isPaidCrmPlan } from "../_shared/vertalCrm/core.ts";
import { autoImport as vertalCrmAutoImport, handleCrm, hashApiKey as hashVertalCrmKey, type CrmDeps } from "../_shared/vertalCrm/handler.ts";
import { verifyFluxosKey as verifyVertalCrmFluxosKey } from "../_shared/fluxosBroker.ts";
import { makeEngine as makeVertalCrmEngine } from "../_shared/fluxosApps.ts";
import { vertalPersonaEnabled } from "../_shared/vertalPersona.ts";
// VERTAL Code AI → Vertal Data Library (Vertaldephin): desligado por padrão (config VERTAL_DATA_LIBRARY); só com consentimento gravado.
import {
  dataLibraryConfig as vcaDataLibraryConfig,
  decideConsent as vcaDlDecideConsent,
  parseCookieClaim as vcaDlCookieClaim,
  rewardsConsentFromRows as vcaDlRewardsConsent,
  trackMedia as vcaDlTrackMedia,
  type VcaConsentDecision,
  VcaDataLibrarySender,
  VcaRunTracker,
} from "../_shared/vertalCodeAi/dataLibrary.ts";

// Cliente do Supabase e módulo TypeScript sem tipos gerados (mesmo padrão do vibe-code-agent).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EFFORTS: VcaEffort[] = ["auto", "low", "high", "max"];
const ORIGINS = ["vertal_code_ai", "vibe_code", "vertal_chat"] as const;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// VERTAL_GPU_CONFIG (um só segredo) expande só as chaves da GPU própria; o resto do ambiente fica igual.
const env = () => expandVcaEnv(Deno.env.toObject());

// Catálogo grátis ao vivo do OpenRouter (cache por isolate, 1 h). Falha = mantém a lista configurada.
let liveFree: { at: number; ids: string[] } | null = null;
async function liveFreeIds(): Promise<string[] | null> {
  if (liveFree && Date.now() - liveFree.at < 3_600_000) return liveFree.ids;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(3_000) });
    if (!r.ok) return null;
    const d = await r.json();
    const ids = ((d?.data ?? []) as Array<{ id: string }>).map((m) => m.id).filter((id) => id.endsWith(":free"));
    liveFree = { at: Date.now(), ids };
    return ids;
  } catch {
    return null;
  }
}

// Equipe Vertal: config própria (também aceita as chaves VERTAL_CODE_AI_TEAM_* / VERTAL_DECIDE_* dentro de VERTAL_GPU_CONFIG).
const teamEnv = () => expandTeamEnv(env());

/** Embedding local do Edge Runtime (gte-small, 384 dimensões, sem custo). Sem ele, a memória busca por palavras. */
let gteSession: Loose = null;
async function embedText(text: string): Promise<number[] | null> {
  if (/^(0|false|off|no)$/i.test(Deno.env.get("VERTAL_CODE_AI_TEAM_EMBEDDINGS") ?? "")) return null;
  const S = (globalThis as Loose).Supabase;
  if (!S?.ai?.Session || !text.trim()) return null;
  gteSession ??= new S.ai.Session("gte-small");
  const out = await gteSession.run(text, { mean_pool: true, normalize: true });
  return Array.from(out as ArrayLike<number>);
}

/** Checagem de sintaxe real com o compilador TypeScript (carregado só quando preciso). */
let tsMod: Loose = null;
async function checkSyntax(path: string, content: string): Promise<string[]> {
  if (/^(0|false|off)$/i.test(Deno.env.get("VERTAL_CODE_AI_TS_CHECK") ?? "")) return [];
  tsMod ??= (await import("npm:typescript@5.8.3")).default;
  const ts = tsMod;
  const out = ts.transpileModule(content, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return (out.diagnostics ?? []).slice(0, 5).map((d: Loose) => {
    const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
    if (d.file && typeof d.start === "number") {
      const { line } = d.file.getLineAndCharacterOfPosition(d.start);
      return `linha ${line + 1}: ${msg}`;
    }
    return msg;
  });
}

// LLM própria que falhou por erro/tempo fica de fora por um minuto (por isolate), para não atrasar cada turno.
const selfHostedCooldown = new Map<string, number>();

// ── Monitor de cota grátis (freeQuota.ts). Contadores do dia/mês e esperas na tabela JÁ EXISTENTE
// rate_limit_counters (sem migração): bucket_key "vcaq:…", user_id = zero (sistema), window_start = fim da
// janela (no futuro, então a limpeza do bump_rate_limit — que apaga janelas com mais de 1 h — não os toca).
const QUOTA_SYSTEM_USER = "00000000-0000-0000-0000-000000000000";
let quotaAdmin: Loose = null;
const quotaDb = (): Loose =>
  (quotaAdmin ??= createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } }));
const quotaStore: QuotaStore = {
  async load() {
    const { data, error } = await quotaDb()
      .from("rate_limit_counters")
      .select("bucket_key, count, window_start")
      .eq("user_id", QUOTA_SYSTEM_USER)
      .like("bucket_key", `${QUOTA_BUCKET_PREFIX}%`)
      .gte("window_start", new Date(Date.now() - 3_600_000).toISOString())
      .limit(500);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ bucket_key: string; count: number; window_start: string }>).map((r) => ({
      bucket: r.bucket_key,
      count: Number(r.count) || 0,
      until: Date.parse(r.window_start),
    }));
  },
  async add(bucket, until, delta) {
    const window_start = new Date(until).toISOString();
    const db = quotaDb();
    const { data } = await db.from("rate_limit_counters").select("count")
      .eq("bucket_key", bucket).eq("user_id", QUOTA_SYSTEM_USER).eq("window_start", window_start).maybeSingle();
    const count = Math.min(2_000_000_000, (Number(data?.count) || 0) + delta);
    const { error } = await db.from("rate_limit_counters").upsert(
      { bucket_key: bucket, user_id: QUOTA_SYSTEM_USER, window_start, count },
      { onConflict: "bucket_key,user_id,window_start" },
    );
    if (error) throw new Error(error.message);
  },
};
const freeQuota = new FreeQuotaMonitor({
  env: () => env(),
  store: /^(0|false|off|no)$/i.test(Deno.env.get("VERTAL_FREE_QUOTA_STORE") ?? "") ? null : quotaStore,
  defer: (p) => (globalThis as Loose).EdgeRuntime?.waitUntil?.(p),
  log: (m) => console.warn(m),
});

/** Executa a cadeia (lógica em _shared/vertalCodeAi/chainRunner.ts, testada no Vitest). */
async function callChain(
  chain: VcaModel[],
  messages: VcaChatMessage[],
  opts: { json: boolean; maxTokens: number; effort: VcaEffort; deadline: number },
): Promise<ModelReply> {
  // Retrato do banco (cache de 20 s por isolate; falha = segue só com a memória). Teto de 1,5 s.
  await Promise.race([freeQuota.refresh(), new Promise((r) => setTimeout(r, 1_500))]);
  return runChain(chain, messages, opts, {
    fetch: (url, init) => fetch(url, init),
    env: env(),
    cooldown: selfHostedCooldown,
    quota: freeQuota,
    log: (m) => console.log(m),
    warn: (m) => console.warn(m),
  });
}

/** Lista os ids de modelo que a chave de cada provedor grátis enxerga (só ids; para conferir a config). */
async function probeFreeModels(e: Record<string, string | undefined>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const get = async (url: string, headers: Record<string, string>) => {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return { status: r.status };
    return { status: r.status, body: await r.json() };
  };
  const ck = (e.VERTAL_CEREBRAS_KEY ?? "").trim();
  if (ck) {
    try {
      const r = await get(CEREBRAS_MODELS_URL, { Authorization: `Bearer ${ck}` });
      out.cerebras = { status: r.status, ids: ((r as Loose).body?.data ?? []).map((m: Loose) => m.id).filter((x: unknown) => typeof x === "string").slice(0, 60) };
    } catch (err) {
      out.cerebras = { error: err instanceof Error ? err.name : "err" };
    }
  } else out.cerebras = { configured: false };
  const gk = (e.VERTAL_GEMINI_KEY ?? "").trim();
  if (gk) {
    try {
      const r = await get(`${GEMINI_MODELS_URL}?pageSize=200`, { "x-goog-api-key": gk });
      out.gemini = {
        status: r.status,
        ids: ((r as Loose).body?.models ?? [])
          .filter((m: Loose) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
          .map((m: Loose) => String(m.name ?? "").replace(/^models\//, ""))
          .filter((x: string) => /flash|lite|gemma/i.test(x))
          .slice(0, 80),
      };
    } catch (err) {
      out.gemini = { error: err instanceof Error ? err.name : "err" };
    }
  } else out.gemini = { configured: false };
  return out;
}

// ── VERTAL Code AI → Data Library (Vertaldephin). Sem config = null = nada muda (nem consulta ao banco). ──
let vcaDlSender: { sig: string; sender: VcaDataLibrarySender } | null = null;
const vcaDlDefer = (p: Promise<unknown>) => (globalThis as Loose).EdgeRuntime?.waitUntil?.(p);
function vcaDataLibrary(admin: Loose, userId: string, body: Record<string, Loose>): { sender: VcaDataLibrarySender; consent: Promise<VcaConsentDecision> } | null {
  try {
    const cfg = vcaDataLibraryConfig(Deno.env.toObject());
    if (!cfg) return null;
    const sig = `${cfg.endpoint}|${cfg.key}|${cfg.policy}`;
    if (vcaDlSender?.sig !== sig) vcaDlSender = { sig, sender: new VcaDataLibrarySender(cfg, { fetch, warn: (m) => console.warn(m) }) };
    const cookie = vcaDlCookieClaim(body.dataConsent);
    // Consulta em paralelo (o pedido não espera): aceite do Vertal Node no painel de recompensas (vertal_nodes.opted_in).
    const consent = (async () => {
      if (!cfg.sources.includes("rewards_panel")) return vcaDlDecideConsent(cfg, "none", cookie);
      const { data, error } = await admin.from("vertal_nodes").select("opted_in").eq("user_id", userId);
      return vcaDlDecideConsent(cfg, error ? "none" : vcaDlRewardsConsent(data), cookie);
    })().catch(() => vcaDlDecideConsent(cfg, "none", cookie));
    return { sender: vcaDlSender.sender, consent };
  } catch {
    return null;
  }
}
function vcaDlMedia(admin: Loose, userId: string, body: Record<string, Loose>, m: Parameters<typeof vcaDlTrackMedia>[1]): void {
  const dl = vcaDataLibrary(admin, userId, body);
  if (dl) vcaDlTrackMedia({ ...dl, userId, runId: crypto.randomUUID(), defer: vcaDlDefer }, m);
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Id do trabalho de vídeo amarrado ao usuário (HMAC): ninguém consulta o vídeo de outro. */
async function hmacHex(msg: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "vca"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
async function signJob(userId: string, jobId: string): Promise<string> {
  return `${jobId}.${await hmacHex(`${userId}:${jobId}`)}`;
}
async function verifyJob(userId: string, token: string): Promise<string | null> {
  const i = token.lastIndexOf(".");
  if (i <= 0 || token.length > 300) return null;
  const jobId = token.slice(0, i);
  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) return null;
  return (await hmacHex(`${userId}:${jobId}`)) === token.slice(i + 1) ? jobId : null;
}

// ─── Vertal CRM ───────────────────────────────────────────────────────────────
const vertalCrmCors = { ...corsHeaders, "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"]}, x-vertal-crm-key, x-vertal-fluxos-key` };
const vertalCrmJson = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...vertalCrmCors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** Créditos do Vertal CRM: mesmas funções atômicas e idempotentes da plataforma (débito + devolução). */
function vertalCrmCredits(admin: Loose, userId: string): CrmDeps["credits"] {
  return {
    debit: async (amount, key, metadata) => {
      if (!crmChargeOn(env())) return { ok: true, charged: 0, free: true };
      const { data: isAdmin } = await admin.rpc("is_admin", { p_user_id: userId });
      if (isAdmin && !crmChargeAdmins(env())) return { ok: true, charged: 0, free: true };
      const { data, error } = await admin.rpc("execute_atomic_credit_deduction", {
        _user_id: userId, _amount: amount, _reason: String(metadata.source ?? "vertal_crm"), _category: "creative_economy", _metadata: metadata, _idempotency_key: key,
      });
      if (error) return { ok: false, error: /insufficient_credits/.test(error.message ?? "") ? "insufficient_credits" : "charge_failed" };
      if (!(data as Loose)?.success) return { ok: false, error: "charge_failed" };
      if ((data as Loose)?.replayed) return { ok: false, error: "duplicate_request" };
      return { ok: true, charged: amount, balanceAfter: (data as Loose)?.balance_after ?? null };
    },
    refund: async (amount, key, metadata) => {
      const { error } = await admin.rpc("execute_atomic_credit_topup", {
        _user_id: userId, _amount: amount, _reason: `refund:${String(metadata.source ?? "vertal_crm")}`, _category: "creative_refund",
        _metadata: { ...metadata, charge_idempotency_key: key }, _idempotency_key: `refund:${key}`,
      });
      if (error) console.error("[vertal-crm] devolução falhou:", error.message);
      return !error;
    },
  };
}

function vertalCrmDeps(admin: Loose, userId: string, via: CrmDeps["via"], extra: Partial<CrmDeps> = {}): CrmDeps {
  const fluxosUrl = Deno.env.get("FLUXOS_INTERNAL_URL");
  const fluxosKey = Deno.env.get("FLUXOS_INTERNAL_KEY");
  return {
    admin, userId, env: env(), fetch, via,
    // Roteador do VERTAL Code AI (LLM própria → OpenRouter grátis → DeepSeek), sem mudar nada nele.
    callModel: async (messages, o) => {
      const chain = buildChain(env(), { effort: "low", liveFreeIds: await liveFreeIds() });
      if (!chain.length) throw new Error("no_model_configured");
      return callChain(chain, messages as VcaChatMessage[], { ...o, effort: "low", deadline: Date.now() + 90_000 });
    },
    credits: vertalCrmCredits(admin, userId),
    engine: fluxosUrl && fluxosKey ? makeVertalCrmEngine(fluxosUrl, fluxosKey) : null,
    gmailToken: async (accountId) => {
      const acct = await loadAccount(admin, userId, accountId);
      return { token: await getFreshAccessToken(admin, acct), email: acct.email };
    },
    // IA do CRM só com plano pago (VERTAL_CRM_AI_REQUIRES_PLAN, padrão ligado): lê a assinatura ativa.
    hasPaidPlan: async () => {
      const { data } = await admin.from("subscriptions").select("plan, is_active").eq("user_id", userId).eq("is_active", true).limit(5);
      return (data ?? []).some((s: Loose) => isPaidCrmPlan(s));
    },
    ...extra,
  };
}

async function handleVertalCrmRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: vertalCrmCors });
  if (req.method !== "POST") return vertalCrmJson(405, { error: "method_not_allowed" });
  const admin: Loose = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let body: Record<string, Loose>;
  try {
    body = await req.json();
  } catch {
    return vertalCrmJson(400, { error: "invalid_json_body" });
  }
  let userId: string | null = null;
  let via: CrmDeps["via"] = "user";
  const extra: Partial<CrmDeps> = {};
  const apiKey = req.headers.get("x-vertal-crm-key");
  const fluxosKey = req.headers.get("x-vertal-fluxos-key");
  if (apiKey) {
    if (!isVertalCrmApiKey(apiKey)) return vertalCrmJson(401, { error: "invalid_api_key" });
    const { data: k } = await admin.from("crm_api_keys").select("id, workspace_id, scopes, created_by, revoked_at").eq("key_hash", await hashVertalCrmKey(apiKey)).maybeSingle();
    if (!k || k.revoked_at || !k.created_by) return vertalCrmJson(401, { error: "invalid_api_key" });
    userId = k.created_by;
    via = "api";
    extra.apiWorkspaceId = k.workspace_id;
    extra.apiScopes = k.scopes ?? ["read"];
    admin.from("crm_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", k.id).then(() => {});
  } else if (fluxosKey) {
    userId = await verifyVertalCrmFluxosKey(fluxosKey, Deno.env.get("FLUXOS_BROKER_SECRET"));
    if (!userId) return vertalCrmJson(401, { error: "invalid_fluxos_key" });
    via = "fluxos";
  } else {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return vertalCrmJson(401, { error: "missing_authorization" });
    const { data: u, error } = await admin.auth.getUser(token);
    if (error || !u?.user) return vertalCrmJson(401, { error: "invalid_token" });
    userId = u.user.id;
  }
  // Mesma resposta de "desligado" para quem não está liberado.
  if (!isCrmEnabled(env(), userId)) return vertalCrmJson(404, { error: "vertal_crm_disabled" });
  try {
    const r = await handleCrm(body, vertalCrmDeps(admin, userId!, via, extra));
    return vertalCrmJson(r.status, r.body);
  } catch (e) {
    console.error("[vertal-crm] falhou:", e instanceof Error ? e.message : e);
    return vertalCrmJson(500, { error: "crm_failed" });
  }
}

Deno.serve(async (req) => {
  // Vertal CRM: rota própria (?app=crm), com as próprias flags; com VERTAL_CRM_ENABLED desligado responde 404.
  if (new URL(req.url).searchParams.get("app") === "crm") return handleVertalCrmRequest(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!isVcaEnabled(env())) return json(404, { error: "vertal_code_ai_disabled" });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "missing_authorization" });
  const userClient: Loose = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userRes?.user) return json(401, { error: "invalid_token" });
  const userId: string = userRes.user.id;
  // Lista de liberação: quem não está nela não vê nada (mesma resposta de "desligado").
  if (!isVcaUserAllowed(env(), userId)) return json(404, { error: "vertal_code_ai_disabled" });
  const admin: Loose = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  let body: Record<string, Loose>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json_body" });
  }
  const action = body.action ?? "run";
  if (action === "status") return json(200, { enabled: true, allowed: true });

  // Vertal Prospector: desligado (404) se o interruptor/lista não liberar este usuário. Não muda nada do resto.
  if (action === "prospector") {
    if (!isProspectorEnabled(env(), userId)) return json(404, { error: "vertal_prospector_disabled" });
    const chain = buildChain(env(), { effort: "low", liveFreeIds: await liveFreeIds() });
    if (!chain.length) return json(503, { error: "no_model_configured" });
    try {
      const r = await handleProspector(body, {
        admin,
        userId,
        env: env(),
        fetch,
        callModel: (messages, o) => callChain(chain, messages as VcaChatMessage[], { ...o, effort: "low", deadline: Date.now() + 100_000 }),
        gmailToken: async (accountId) => {
          const acct = await loadAccount(admin, userId, accountId);
          return { token: await getFreshAccessToken(admin, acct), email: acct.email };
        },
      });
      // Vertal CRM como CRM padrão: leads novos/atualizados do Prospector entram no CRM (só com o CRM liberado para o usuário).
      if (r.status === 200 && isCrmEnabled(env(), userId) && ["find_leads", "enrich_lead", "check_replies", "update_lead"].includes(String(body.op))) {
        await vertalCrmAutoImport(vertalCrmDeps(admin, userId, "user"), "prospector", typeof body.campaignId === "string" ? body.campaignId : null);
      }
      return json(r.status, r.body);
    } catch (e) {
      console.error("[vertal-prospector] falhou:", e instanceof Error ? e.message : e);
      return json(500, { error: "prospector_failed" });
    }
  }
  // Vertal Growth Team: desligado (404) se o interruptor/lista não liberar este usuário. Não muda nada do resto.
  if (action === "growth") {
    if (!isGrowthEnabled(env(), userId)) return json(404, { error: "vertal_growth_disabled" });
    const chain = buildChain(env(), { effort: "low", liveFreeIds: await liveFreeIds() });
    if (!chain.length) return json(503, { error: "no_model_configured" });
    const callModel = (messages: unknown[], o: { json: boolean; maxTokens: number }) =>
      callChain(chain, messages as VcaChatMessage[], { ...o, effort: "low", deadline: Date.now() + 100_000 });
    const gmailToken = async (accountId: string) => {
      const acct = await loadAccount(admin, userId, accountId);
      return { token: await getFreshAccessToken(admin, acct), email: acct.email };
    };
    try {
      const r = await handleGrowth(body, {
        admin, userId, env: env(), fetch, callModel, gmailToken,
        // Créditos: mesmas funções atômicas e idempotentes do resto da plataforma (débito + devolução).
        credits: {
          debit: async (amount, key, metadata): Promise<DebitResult> => {
            const { data: isAdmin } = await admin.rpc("is_admin", { p_user_id: userId });
            if (isAdmin && !growthChargeAdmins(env())) return { ok: true, charged: 0, free: true };
            const { data, error } = await admin.rpc("execute_atomic_credit_deduction", {
              _user_id: userId, _amount: amount, _reason: "vertal_growth_team", _category: "creative_economy", _metadata: metadata, _idempotency_key: key,
            });
            if (error) return { ok: false, error: /insufficient_credits/.test(error.message ?? "") ? "insufficient_credits" : "charge_failed" };
            if (!(data as Loose)?.success) return { ok: false, error: "charge_failed" };
            if ((data as Loose)?.replayed) return { ok: false, error: "duplicate_request" };
            return { ok: true, charged: amount, balanceAfter: (data as Loose)?.balance_after ?? null };
          },
          refund: async (amount, key, metadata) => {
            const { error } = await admin.rpc("execute_atomic_credit_topup", {
              _user_id: userId, _amount: amount, _reason: "refund:vertal_growth_team", _category: "creative_refund",
              _metadata: { ...metadata, charge_idempotency_key: key }, _idempotency_key: `refund:${key}`,
            });
            if (error) console.error("[vertal-growth] devolução falhou:", error.message);
            return !error;
          },
        },
        stripeKey: async () => (await resolveEnvForRun(admin, userId, ["STRIPE_SECRET_KEY"], { target: "vertal_growth_stripe_read" })).env.STRIPE_SECRET_KEY ?? null,
        hasSecrets: async (keys) => {
          const names = new Set((await listVisibleSecrets(admin, userId)).map((s) => s.env_key));
          return keys.every((k) => names.has(k));
        },
        prospector: (b) => handleProspector(b as Record<string, Loose>, { admin, userId, env: env(), fetch, callModel, gmailToken }),
      });
      // Vertal CRM como CRM padrão: contatos do Growth Team entram no CRM depois de "Atualizar etapas"/novo contato (só com o CRM liberado).
      if (r.status === 200 && isCrmEnabled(env(), userId) && ["sync", "add_contact", "update_contact"].includes(String(body.op))) {
        await vertalCrmAutoImport(vertalCrmDeps(admin, userId, "user"), "growth", typeof body.growthId === "string" ? body.growthId : typeof body.id === "string" ? body.id : null);
      }
      return json(r.status, r.body);
    } catch (e) {
      console.error("[vertal-growth] falhou:", e instanceof Error ? e.message : e);
      return json(500, { error: "growth_failed" });
    }
  }
  const origin = ORIGINS.includes(body.origin) ? body.origin : "vertal_code_ai";

  // Projeto do usuário (RLS decide se ele pode ver). Sem projeto = cofre pessoal (project_id nulo).
  let projectId: string | null = null;
  if (typeof body.projectId === "string" && UUID_RE.test(body.projectId)) {
    const { data: proj } = await userClient.from("projects").select("id").eq("id", body.projectId).maybeSingle();
    if (!proj) return json(404, { error: "project_not_found" });
    projectId = proj.id;
  }
  const scope = (q: Loose) => (projectId ? q.eq("project_id", projectId) : q.is("project_id", null));

  if (action === "models") {
    const effort: VcaEffort = EFFORTS.includes(body.effort) ? body.effort : "auto";
    const option = parseVcaOption(body.option);
    const live = await liveFreeIds();
    const chain = option === "auto" ? buildChain(env(), { effort, liveFreeIds: live }) : buildOptionChain(env(), { effort, option, liveFreeIds: live });
    const mediaEnabled = isVcaMediaEnabled(env());
    const options = [...VCA_TEXT_OPTIONS, ...(mediaEnabled ? VCA_MEDIA_OPTIONS : [])].map((id) => ({ id, label: VCA_OPTION_LABEL[id] }));
    return json(200, { models: chain.map(publicModelInfo), paidEnabled: chain.some((m) => m.cost === "paid"), options, mediaEnabled });
  }

  // ─── Monitor de cota grátis: só leitura, só admin (is_admin). op "status" (padrão) ou "probe". ───
  if (action === "free_quota") {
    const { data: isAdm } = await admin.rpc("is_admin", { p_user_id: userId });
    if (!isAdm) return json(404, { error: "unknown_action" });
    const e = env();
    if (body.op === "probe") return json(200, { probe: await probeFreeModels(e) });
    await freeQuota.refresh(true);
    const tracked = [
      ...freeTierModels(e),
      ...buildChain(e, { effort: "auto", liveFreeIds: await liveFreeIds() }),
    ];
    return json(200, {
      ...freeQuota.snapshot(tracked),
      chainAuto: buildChain(e, { effort: "auto", liveFreeIds: await liveFreeIds() }).map((m) => ({ id: m.id, provider: m.provider, model: m.model, cost: m.cost })),
    });
  }

  // ─── Equipe Vertal: status e memória (só para quem está na lista da Equipe; os demais, 404) ───
  const teamActions = ["team_status", "team_run", "memory_list", "memory_delete", "decide", "decide_analyze"];
  if (teamActions.includes(action) && !isVcaTeamEnabled(teamEnv(), userId)) return json(404, { error: "vertal_code_ai_team_disabled" });
  const memDeps = (): MemoryStoreDeps => ({
    admin,
    userClient,
    userId,
    projectId,
    embed: embedText,
    warn: (m) => console.warn(m),
  });
  if (action === "team_status") {
    const te = teamEnv();
    return json(200, { team: true, memory: isVcaTeamMemoryEnabled(te), sandbox: isVcaTeamSandboxEnabled(te), decide: true });
  }
  if (action === "memory_list") {
    if (!isVcaTeamMemoryEnabled(teamEnv())) return json(200, { available: false, items: [] });
    return json(200, await listMemories(memDeps(), { allProjects: body.allProjects === true }));
  }
  if (action === "memory_delete") {
    if (!isVcaTeamMemoryEnabled(teamEnv())) return json(200, { available: false, deleted: 0 });
    return json(200, await deleteMemories(memDeps(), { ids: body.ids, clear: body.clear === true, clearAll: body.clearAll === true }));
  }

  // Limite por usuário (balde próprio; não divide cota com o Vibe Code).
  try {
    const { data: rl } = await admin.rpc("bump_rate_limit", { _bucket: "vertal_code_ai", _user: userId, _window_seconds: 60 });
    if (typeof rl === "number" && rl > 12) return json(429, { error: "rate_limited" });
  } catch (e) {
    console.warn("[vertal-code-ai] rate-limit check failed:", e instanceof Error ? e.message : e);
  }

  // Últimas versões dos arquivos do projeto no cofre de código (mesma tabela do Vibe Code, só leitura aqui).
  const latestFiles = async (): Promise<Map<string, string>> => {
    const { data } = await scope(
      admin.from("vibe_project_files").select("path, content, version").eq("user_id", userId)
        .order("version", { ascending: false }).limit(4000),
    );
    const out = new Map<string, string>();
    for (const r of (data ?? []) as Array<{ path: string; content: string }>) if (!out.has(r.path)) out.set(r.path, r.content ?? "");
    return out;
  };

  // Cadeia barata/própria (coordenação e Vertal Decide): própria → grátis → reserva; nunca paga.
  const coordinatorChain = async (promptTokens: number) =>
    buildOptionChain(env(), { option: "livre", effort: "low", promptTokens, liveFreeIds: await liveFreeIds() });

  if (action === "decide" || action === "decide_analyze") {
    const coord = await coordinatorChain(1_000);
    const deadline = Date.now() + 60_000;
    const callLlm = coord.length ? (m: VcaChatMessage[], o: { json: boolean; maxTokens: number }) => callChain(coord, m, { ...o, effort: "low", deadline }) : undefined;
    const decide = makeDecider({ fetch: (u, i) => fetch(u, i), env: teamEnv(), callLlm, log: (m) => console.log(m) });
    if (action === "decide") {
      const state = body.state && typeof body.state === "object" && !Array.isArray(body.state) ? body.state : null;
      const questions = body.questions && typeof body.questions === "object" ? (body.questions as DecisionQuestions) : null;
      if (!state || !questions || JSON.stringify(state).length > 120_000) return json(400, { error: "invalid_decision_request" });
      const r = await decide(state, questions);
      return json(200, { ...r, source: r.source === "none" ? "none" : "vertal_decide", engine: r.source });
    }
    if (!body.dossier) return json(400, { error: "invalid_decision_request" });
    const r = await analyzeWithDecide(
      { dossier: body.dossier, question: typeof body.question === "string" ? body.question.slice(0, 500) : undefined, causes: Array.isArray(body.causes) ? body.causes : undefined },
      {
        decide,
        proposeCauses: callLlm
          ? async (dossier, question) => {
            const reply = await callLlm([
              { role: "system", content: 'Você é analista de negócios. Liste de 3 a 5 causas candidatas, curtas e distintas, para o problema do dossiê. Responda só JSON: {"causes":["..."]}. Português do Brasil.' },
              { role: "user", content: `${question ? `Pergunta: ${question}\n\n` : ""}Dossiê:\n${dossier}` },
            ], { json: true, maxTokens: 400 });
            const fixed = repairAgentJson(reply.content);
            const list = fixed && Array.isArray(fixed.value.causes) ? fixed.value.causes : [];
            return list.filter((c: unknown): c is string => typeof c === "string").map((c: string) => c.slice(0, 200));
          }
          : undefined,
      },
    );
    return json(200, { ...r, source: r.source === "none" ? "none" : "vertal_decide", engine: r.source });
  }

  if (action === "team_run") {
    const te = teamEnv();
    const mode: VcaMode = body.mode === "plan" ? "plan" : "build";
    const effort: VcaEffort = EFFORTS.includes(body.effort) ? body.effort : "auto";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return json(400, { error: "empty_prompt" });
    const images: string[] = (Array.isArray(body.images) ? body.images : [])
      .filter((u: unknown): u is string => typeof u === "string" && (/^data:image\/(png|jpe?g|webp|gif);base64,/.test(u) || /^https:\/\//.test(u)) && u.length < 6_000_000)
      .slice(0, 4);
    const attachments = (Array.isArray(body.attachments) ? body.attachments : [])
      .filter((a: Loose) => a && typeof a.path === "string" && typeof a.content === "string")
      .slice(0, 10)
      .map((a: Loose) => ({ path: a.path.slice(0, 300), content: a.content.slice(0, 200_000) }));
    const history = (Array.isArray(body.history) ? body.history : [])
      .filter((h: Loose) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
      .slice(-8);
    const option = parseVcaOption(body.option);
    if (option === "imagem" || option === "video") return json(400, { error: "use_media_action" });
    const modelId = typeof body.modelId === "string" ? body.modelId.slice(0, 64) : null;
    const deadlineMs = Number(Deno.env.get("VERTAL_CODE_AI_DEADLINE_MS")) || 140_000;
    const deadline = Date.now() + deadlineMs;
    const chainOpts = { effort, needsVision: images.length > 0, promptTokens: Math.ceil(prompt.length / 3.5), liveFreeIds: await liveFreeIds() };
    // Engenheiros: a cadeia de sempre da opção escolhida (própria primeiro, grátis, pago só com ALLOW_PAID).
    const engineerChain = option === "auto" && !modelId ? buildChain(env(), chainOpts) : buildOptionChain(env(), { ...chainOpts, option, modelId });
    if (!engineerChain.length) return json(503, { error: "no_model_configured" });
    const coordChain = await coordinatorChain(chainOpts.promptTokens);
    const coord = coordChain.length ? coordChain : engineerChain;
    const runId = crypto.randomUUID();
    const memoryOn = isVcaTeamMemoryEnabled(te);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (e: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
          } catch {
            /* cliente fechou */
          }
        };
        send({ kind: "status", title: mode === "plan" ? "Equipe Vertal planejando" : "Equipe Vertal construindo", origin, team: true });
        try {
          let files: Map<string, string> | null = null;
          const getFiles = async () => (files ??= await latestFiles());
          const callCoordinator = (m: VcaChatMessage[], o: { json: boolean; maxTokens: number }) => callChain(coord, m, { ...o, effort: "low", deadline });
          const result = await runVertalTeam(
            {
              mode,
              effort,
              prompt,
              history,
              images,
              attachments,
              plan: body.plan && typeof body.plan === "object" ? (body.plan as VcaPlan) : null,
              persona: vertalPersonaEnabled(Deno.env.get("VERTAL_PERSONA_ENABLED")),
              runId,
              maxEngineers: Number(te.VERTAL_CODE_AI_TEAM_MAX_ENGINEERS) || 3,
              maxReviewRounds: te.VERTAL_CODE_AI_TEAM_REVIEW_ROUNDS !== undefined ? Number(te.VERTAL_CODE_AI_TEAM_REVIEW_ROUNDS) : 1,
            },
            {
              callCoordinator,
              callEngineer: (m, o) => callChain(engineerChain, m, { ...o, effort, deadline }),
              listPaths: async () => [...(await getFiles()).keys()],
              readFile: async (p) => (await getFiles()).get(p),
              indexSource: async () => [...(await getFiles())].filter(([, c]) => c.length < 60_000).map(([path, content]) => ({ path, content })),
              checkSyntax,
              sandboxTest: isVcaTeamSandboxEnabled(te)
                ? async (changes) => {
                  const orch = await import("../_shared/orchestrator.ts");
                  if (orch.orchestratorDriver() !== "e2b") return { ran: false, ok: false, issues: [] };
                  return runSandboxTest(changes, {
                    provision: (sid, t) => orch.provisionContainer(sid, "vertal-code-ai", userId, t),
                    exec: (ref, cmd, ms) => orch.execInContainer(ref, cmd, "vertal_code_ai_check", ms),
                    destroy: (ref) => orch.destroyContainer(ref),
                  }, { runId, timeoutMs: Number(te.VERTAL_CODE_AI_TEAM_E2B_TIMEOUT_MS) || 45_000 });
                }
                : undefined,
              memory: memoryOn
                ? {
                  retrieve: (q) => retrieveMemories(memDeps(), q),
                  remember: (drafts, summary) => rememberRun(memDeps(), drafts, summary, { runId }),
                }
                : undefined,
              decide: makeDecider({ fetch: (u, i) => fetch(u, i), env: te, callLlm: callCoordinator, log: (m) => console.log(m) }),
              emit: send,
              budget: new VcaBudgetGuard(teamBudgetFromEnv(te, Math.max(20_000, deadline - Date.now() - 2_000))),
            },
          );
          send({
            kind: "base_hashes",
            hashes: Object.fromEntries(await Promise.all(result.changes.map(async (c) => [c.path, await sha256(c.before)]))),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          send({
            kind: "error",
            message: msg === "vca_all_models_failed"
              ? "Todos os modelos estão ocupados ou sem cota agora. Tente em alguns minutos."
              : "A Equipe Vertal não conseguiu concluir o pedido.",
          });
          console.error("[vertal-code-ai] team_run failed:", msg);
        } finally {
          try {
            controller.close();
          } catch {
            /* já fechado */
          }
        }
      },
    });
    return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  }

  if (action === "apply") {
    const changes = Array.isArray(body.changes) ? body.changes.slice(0, 40) : [];
    if (!changes.length) return json(400, { error: "no_changes" });
    const current = await latestFiles();
    const applied: string[] = [];
    const conflicts: string[] = [];
    const skipped: string[] = [];
    for (const c of changes) {
      const path = typeof c?.path === "string" ? c.path : "";
      if (!isSafePath(path)) {
        skipped.push(path);
        continue;
      }
      if (typeof c.after !== "string") {
        skipped.push(path); // apagar arquivo: v1 só sinaliza; o dev apaga no Vibe Code.
        continue;
      }
      const base = typeof c.baseHash === "string" ? c.baseHash : null;
      if (base !== null && base !== (await sha256(current.get(path) ?? ""))) {
        conflicts.push(path);
        continue;
      }
      // Versionamento igual ao do cofre do Vibe Code: nova versão = última + 1.
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        const { data: latest } = await scope(
          admin.from("vibe_project_files").select("version").eq("user_id", userId).eq("path", path)
            .order("version", { ascending: false }).limit(1),
        );
        const version = ((latest?.[0]?.version as number | undefined) ?? 0) + 1;
        const { error } = await admin.from("vibe_project_files").insert({
          user_id: userId,
          project_id: projectId,
          conversation_id: null,
          path,
          content: c.after.slice(0, 500_000),
          version,
          commit_sha: null,
        });
        if (!error) ok = true;
        else if (error.code !== "23505") break;
      }
      (ok ? applied : skipped).push(path);
    }
    return json(200, { applied, conflicts, skipped });
  }

  if (action === "image" || action === "video" || action === "video_status" || action === "video_content") {
    const e = env();
    if (!isVcaMediaEnabled(e)) return json(404, { error: "vertal_code_ai_media_disabled" });
    const key = (e.OPENROUTER_API_KEY ?? "").trim();
    const orHeaders = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "https://vertal.dev", "X-Title": "VERTAL Code AI" };
    const mprompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 2_000) : "";

    if (action === "image") {
      if (!mprompt) return json(400, { error: "empty_prompt" });
      const refs: string[] = (Array.isArray(body.images) ? body.images : [])
        .filter((u: unknown): u is string => typeof u === "string" && (/^data:image\/(png|jpe?g|webp);base64,/.test(u) || /^https:\/\//.test(u)) && u.length < 6_000_000)
        .slice(0, 2);
      const fails: string[] = [];
      const imgStart = Date.now();
      for (const m of imageModels(e)) {
        const t0 = Date.now();
        if (m.provider === "own") {
          // Própria (GPU): só texto → imagem; com imagem de referência vai direto para a de sempre.
          if (refs.length) {
            fails.push(`${m.id}:skip(refs)`);
            continue;
          }
          try {
            const r = await fetch(`${m.url}/generate`, {
              method: "POST",
              headers: { Authorization: `Bearer ${(e[m.keyEnv ?? ""] ?? "").trim()}`, "Content-Type": "application/json" },
              signal: AbortSignal.timeout(Number(e.VERTAL_OWN_IMAGE_TIMEOUT_MS) || 70_000),
              body: JSON.stringify(ownImageRequestBody(mprompt)),
            });
            if (!r.ok) {
              fails.push(`${m.id}:${r.status}`);
              await r.body?.cancel();
              continue;
            }
            const img = extractOwnImage(await r.json());
            if (!img) {
              fails.push(`${m.id}:no_image`);
              continue;
            }
            const usd = mediaCostUsd(m);
            console.log(`[vertal-code-ai] image ok ${m.id} (${m.model}) ms=${Date.now() - t0} est_usd=${usd.toFixed(6)}`);
            vcaDlMedia(admin, userId, body, { mediaType: "image", ok: true, latencyMs: Date.now() - imgStart, cost: "self_hosted", label: m.label, fellBack: fails.some((f) => !f.includes(":skip(")), costUsd: usd, referenceImages: refs.length, outputs: 1, videoSeconds: null });
            return json(200, {
              images: [img],
              text: "",
              model: { id: m.id, label: m.label, cost: "self_hosted" },
              estimate: { usd: Math.round(usd * 1e6) / 1e6, credits: retailCredits(usd), charged: false },
            });
          } catch (err) {
            fails.push(`${m.id}:${err instanceof Error ? err.name : "err"}`);
          }
          continue;
        }
        try {
          const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: orHeaders,
            // Se a própria já gastou tempo, a de sempre fica com o que sobra (nunca mais de 90 s).
            signal: AbortSignal.timeout(Math.max(20_000, Math.min(90_000, 140_000 - (Date.now() - imgStart)))),
            body: JSON.stringify({ ...imageRequestBody(m, mprompt, refs), usage: { include: true } }),
          });
          if (!r.ok) {
            fails.push(`${m.id}:${r.status}`);
            await r.body?.cancel();
            continue;
          }
          const d = await r.json();
          const out = extractImages(d);
          if (!out.images.length) {
            fails.push(`${m.id}:no_image`);
            continue;
          }
          const usd = typeof d?.usage?.cost === "number" ? d.usage.cost : mediaCostUsd(m);
          console.log(`[vertal-code-ai] image ok ${m.id} (${m.model}) ms=${Date.now() - t0} cost_usd=${usd.toFixed(6)}`);
          vcaDlMedia(admin, userId, body, { mediaType: "image", ok: true, latencyMs: Date.now() - imgStart, cost: "paid", label: m.label, fellBack: fails.some((f) => !f.includes(":skip(")), costUsd: usd, referenceImages: refs.length, outputs: Math.min(2, out.images.length), videoSeconds: null });
          return json(200, {
            images: out.images.slice(0, 2),
            text: out.text.slice(0, 2_000),
            model: { id: m.id, label: m.label, cost: "paid" },
            estimate: { usd: Math.round(usd * 1e6) / 1e6, credits: retailCredits(usd), charged: false },
          });
        } catch (err) {
          fails.push(`${m.id}:${err instanceof Error ? err.name : "err"}`);
        }
      }
      console.warn(`[vertal-code-ai] image failed: ${fails.join(",")}`);
      vcaDlMedia(admin, userId, body, { mediaType: "image", ok: false, latencyMs: Date.now() - imgStart, cost: null, label: null, fellBack: fails.length > 1, costUsd: 0, referenceImages: refs.length, outputs: 0, videoSeconds: null });
      return json(502, { error: "vca_media_failed" });
    }

    if (action === "video") {
      if (!mprompt) return json(400, { error: "empty_prompt" });
      const fails: string[] = [];
      const vidStart = Date.now(); // VERTAL Code AI · Data Library (latência até o envio do trabalho)
      for (const m of videoModels(e)) {
        if (m.provider === "own") {
          try {
            const r = await fetch(`${m.url}/submit`, {
              method: "POST",
              headers: { Authorization: `Bearer ${(e[m.keyEnv ?? ""] ?? "").trim()}`, "Content-Type": "application/json" },
              signal: AbortSignal.timeout(30_000),
              body: JSON.stringify(ownVideoRequestBody(m, mprompt)),
            });
            if (!r.ok) {
              fails.push(`${m.id}:${r.status}`);
              await r.body?.cancel();
              continue;
            }
            const d = await r.json();
            if (typeof d?.id !== "string" || !d.id) {
              fails.push(`${m.id}:no_job`);
              continue;
            }
            const usd = mediaCostUsd(m);
            console.log(`[vertal-code-ai] video submitted ${m.id} (${m.model}) est_usd=${usd.toFixed(4)}`);
            vcaDlMedia(admin, userId, body, { mediaType: "video", ok: true, latencyMs: Date.now() - vidStart, cost: "self_hosted", label: m.label, fellBack: fails.length > 0, costUsd: usd, referenceImages: 0, outputs: 1, videoSeconds: m.seconds ?? null });
            return json(202, {
              job: await signJob(userId, `${VCA_OWN_JOB_PREFIX}${d.id}`),
              status: "pending",
              model: { id: m.id, label: m.label, cost: "self_hosted" },
              estimate: { usd: Math.round(usd * 1e6) / 1e6, credits: retailCredits(usd), charged: false, seconds: m.seconds },
            });
          } catch (err) {
            fails.push(`${m.id}:${err instanceof Error ? err.name : "err"}`);
          }
          continue;
        }
        try {
          const r = await fetch("https://openrouter.ai/api/v1/videos", {
            method: "POST",
            headers: orHeaders,
            signal: AbortSignal.timeout(30_000),
            body: JSON.stringify({ ...videoRequestBody(m, mprompt), user: userId }),
          });
          if (!r.ok) {
            fails.push(`${m.id}:${r.status}`);
            await r.body?.cancel();
            continue;
          }
          const d = await r.json();
          if (typeof d?.id !== "string") {
            fails.push(`${m.id}:no_job`);
            continue;
          }
          const usd = mediaCostUsd(m);
          console.log(`[vertal-code-ai] video submitted ${m.id} (${m.model}) est_usd=${usd.toFixed(4)}`);
          vcaDlMedia(admin, userId, body, { mediaType: "video", ok: true, latencyMs: Date.now() - vidStart, cost: "paid", label: m.label, fellBack: fails.length > 0, costUsd: usd, referenceImages: 0, outputs: 1, videoSeconds: m.seconds ?? null });
          return json(202, {
            job: await signJob(userId, d.id),
            status: d.status ?? "pending",
            model: { id: m.id, label: m.label, cost: "paid" },
            estimate: { usd: Math.round(usd * 1e6) / 1e6, credits: retailCredits(usd), charged: false, seconds: m.seconds },
          });
        } catch (err) {
          fails.push(`${m.id}:${err instanceof Error ? err.name : "err"}`);
        }
      }
      console.warn(`[vertal-code-ai] video failed: ${fails.join(",")}`);
      vcaDlMedia(admin, userId, body, { mediaType: "video", ok: false, latencyMs: Date.now() - vidStart, cost: null, label: null, fellBack: fails.length > 1, costUsd: 0, referenceImages: 0, outputs: 0, videoSeconds: null });
      return json(502, { error: "vca_media_failed" });
    }

    const jobId = await verifyJob(userId, typeof body.job === "string" ? body.job : "");
    if (!jobId) return json(404, { error: "job_not_found" });
    if (jobId.startsWith(VCA_OWN_JOB_PREFIX)) {
      // Job do vídeo próprio (GPU): status e bytes vêm do endpoint próprio, sempre pelo nosso proxy.
      const own = videoModels(e).find((m) => m.provider === "own");
      if (!own?.url) return json(404, { error: "job_not_found" });
      const ownId = encodeURIComponent(jobId.slice(VCA_OWN_JOB_PREFIX.length));
      const ownHeaders = { Authorization: `Bearer ${(e[own.keyEnv ?? ""] ?? "").trim()}` };
      if (action === "video_status") {
        const r = await fetch(`${own.url}/status?id=${ownId}`, { headers: ownHeaders, signal: AbortSignal.timeout(20_000) });
        if (!r.ok) {
          await r.body?.cancel();
          return json(502, { error: "vca_media_failed", status: r.status });
        }
        const status = ownVideoStatus(await r.json());
        return json(200, {
          status,
          url: null,
          needsProxy: status === "completed",
          error: status === "failed" || status === "expired" ? "vca_media_failed" : undefined,
        });
      }
      const r = await fetch(`${own.url}/result?id=${ownId}`, { headers: ownHeaders, signal: AbortSignal.timeout(60_000) });
      if (!r.ok || !r.body) {
        await r.body?.cancel();
        return json(502, { error: "vca_media_failed", status: r.status });
      }
      return new Response(r.body, { headers: { ...corsHeaders, "Content-Type": "video/mp4", "Cache-Control": "private, max-age=3600" } });
    }
    if (action === "video_status") {
      const r = await fetch(`https://openrouter.ai/api/v1/videos/${encodeURIComponent(jobId)}`, { headers: orHeaders, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) {
        await r.body?.cancel();
        return json(502, { error: "vca_media_failed", status: r.status });
      }
      const d = await r.json();
      const status = typeof d?.status === "string" ? d.status : "unknown";
      const signed = Array.isArray(d?.urls) && typeof d.urls[0] === "string" ? d.urls[0] : null;
      const usd = typeof d?.usage?.cost === "number" ? d.usage.cost : null;
      if (status === "completed" && usd !== null) console.log(`[vertal-code-ai] video done cost_usd=${usd}`);
      return json(200, {
        status,
        url: status === "completed" ? signed : null,
        needsProxy: status === "completed" && !signed,
        error: ["failed", "cancelled", "expired"].includes(status) ? "vca_media_failed" : undefined,
        estimate: usd !== null ? { usd, credits: retailCredits(usd), charged: false } : undefined,
      });
    }
    // video_content: repassa os bytes (o link sem assinatura exige a nossa chave).
    const r = await fetch(`https://openrouter.ai/api/v1/videos/${encodeURIComponent(jobId)}/content?index=0`, { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok || !r.body) {
      await r.body?.cancel();
      return json(502, { error: "vca_media_failed", status: r.status });
    }
    return new Response(r.body, { headers: { ...corsHeaders, "Content-Type": r.headers.get("Content-Type") ?? "video/mp4", "Cache-Control": "private, max-age=3600" } });
  }

  if (action === "senses" || action === "novela") {
    // Vertal Decide / Visão / Ouvir / Novela: aditivo; sem endpoint próprio configurado responde 404 (desligado).
    const deps: SensesHandlerDeps = {
      fetch: (u, i) => fetch(u, i),
      rawFetch: (u, i) => fetch(u, i),
      signJob: (id) => signJob(userId, id),
      verifyJob: (t) => verifyJob(userId, t),
      log: (m) => console.log(m),
    };
    const r = action === "senses" ? await handleSenses(body, sensesConfig(env()), deps) : await handleNovela(body, sensesConfig(env()), deps);
    if ("response" in r) {
      const h = new Headers(r.response.headers);
      for (const [k, v] of Object.entries(corsHeaders)) h.set(k, v);
      return new Response(r.response.body, { status: r.response.status, headers: h });
    }
    return json(r.status, r.body);
  }

  if (action !== "run") return json(400, { error: "unknown_action" });

  const mode: VcaMode = body.mode === "plan" ? "plan" : "build";
  const effort: VcaEffort = EFFORTS.includes(body.effort) ? body.effort : "auto";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return json(400, { error: "empty_prompt" });
  const images: string[] = (Array.isArray(body.images) ? body.images : [])
    .filter((u: unknown): u is string => typeof u === "string" && (/^data:image\/(png|jpe?g|webp|gif);base64,/.test(u) || /^https:\/\//.test(u)))
    .filter((u: string) => u.length < 6_000_000)
    .slice(0, 4);
  const attachments = (Array.isArray(body.attachments) ? body.attachments : [])
    .filter((a: Loose) => a && typeof a.path === "string" && typeof a.content === "string")
    .slice(0, 10)
    .map((a: Loose) => ({ path: a.path.slice(0, 300), content: a.content.slice(0, 200_000) }));
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((h: Loose) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
    .slice(-8);

  const deadlineMs = Number(Deno.env.get("VERTAL_CODE_AI_DEADLINE_MS")) || 140_000;
  const deadline = Date.now() + deadlineMs;
  const option = parseVcaOption(body.option);
  if (option === "imagem" || option === "video") return json(400, { error: "use_media_action" });
  const modelId = typeof body.modelId === "string" ? body.modelId.slice(0, 64) : null;
  const chainOpts = {
    effort,
    needsVision: images.length > 0,
    promptTokens: Math.ceil(prompt.length / 3.5),
    liveFreeIds: await liveFreeIds(),
  };
  // Sem opção/modelo fixo: exatamente a cadeia de antes.
  let chain = option === "auto" && !modelId ? buildChain(env(), chainOpts) : buildOptionChain(env(), { ...chainOpts, option, modelId });
  // Teste (só admin): skipModels pula ids, provedores ("ollama", "ollama_cloud"…) ou custos ("self_hosted")
  // para provar que a cadeia cai para o próximo. Ignorado para quem não é admin.
  if (Array.isArray(body.skipModels) && body.skipModels.length) {
    const { data: isAdm } = await admin.rpc("is_admin", { p_user_id: userId });
    if (isAdm) {
      const skip = new Set((body.skipModels as unknown[]).slice(0, 20).map((x) => String(x)));
      chain = chain.filter((m) => !skip.has(m.id) && !skip.has(m.provider) && !skip.has(m.cost));
    }
  }
  if (!chain.length) return json(503, { error: "no_model_configured" });

  // VERTAL Code AI → Data Library: null sem config (padrão). Consentimento consultado em paralelo; o pedido não espera.
  const vcaDl = vcaDataLibrary(admin, userId, body);
  const vcaDlRun = vcaDl
    ? new VcaRunTracker(
      { mode, option, effort, modelPinned: !!modelId, prompt, images: images.length, attachments: attachments.length, historyTurns: history.length, surface: origin },
      { ...vcaDl, userId, runId: crypto.randomUUID(), defer: vcaDlDefer },
    )
    : null;
  vcaDlRun?.started();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: VcaEvent | Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          /* cliente fechou */
        }
      };
      send({ kind: "status", title: mode === "plan" ? "Planejando" : "Construindo", origin });
      try {
        let files: Map<string, string> | null = null;
        const getFiles = async () => (files ??= await latestFiles());
        const result = await runVertalCodeAi(
          {
            mode,
            effort,
            prompt,
            history,
            images,
            attachments,
            plan: body.plan && typeof body.plan === "object" ? (body.plan as VcaPlan) : null,
            persona: vertalPersonaEnabled(Deno.env.get("VERTAL_PERSONA_ENABLED")),
          },
          {
            callModel: (messages, o) => callChain(chain, messages, { ...o, effort, deadline }).then((r) => (vcaDlRun?.modelCall(r), r)),
            listPaths: async () => [...(await getFiles()).keys()],
            readFile: async (p) => (await getFiles()).get(p),
            indexSource: async () => [...(await getFiles())].filter(([, c]) => c.length < 60_000).map(([path, content]) => ({ path, content })),
            checkSyntax,
            emit: send,
          },
        );
        vcaDlRun?.finished({ ok: true, filesChanged: result.changes.length, verified: result.verified, codeExcerpt: result.changes.find((c) => c.after)?.after ?? null });
        // Hash do "antes" de cada arquivo: o apply recusa se o arquivo mudou no meio do caminho.
        send({
          kind: "base_hashes",
          hashes: Object.fromEntries(await Promise.all(result.changes.map(async (c) => [c.path, await sha256(c.before)]))),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({
          kind: "error",
          message: msg === "vca_all_models_failed"
            ? "Todos os modelos grátis estão ocupados ou sem cota agora. Tente em alguns minutos ou ative o servidor próprio Vertal."
            : "Não consegui concluir o pedido.",
        });
        console.error("[vertal-code-ai] run failed:", msg);
        vcaDlRun?.finished({ ok: false, errorCode: msg === "vca_all_models_failed" ? "all_models_failed" : "internal" });
      } finally {
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
      }
    },
  });
  return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
});
