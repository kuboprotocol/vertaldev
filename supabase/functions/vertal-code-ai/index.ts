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
  estimateCostUsd,
  estimateTokens,
  extractImages,
  imageRequestBody,
  isVcaMediaEnabled,
  mediaCostUsd,
  parseVcaOption,
  retailCredits,
  VCA_IMAGE_MODELS,
  VCA_MEDIA_OPTIONS,
  VCA_OPTION_LABEL,
  VCA_TEXT_OPTIONS,
  VCA_VIDEO_MODELS,
  videoRequestBody,
  isVcaEnabled,
  isVcaUserAllowed,
  publicModelInfo,
  requestBody,
  shouldFallback,
  type VcaChatMessage,
  type VcaEffort,
  type VcaMode,
  type VcaModel,
  withinSelfHostedBudget,
} from "../_shared/vertalCodeAi/router.ts";
import { isSafePath } from "../_shared/vibeAgentCore.ts";
import { type ModelReply, parseVcaTurn, runVertalCodeAi, type VcaEvent, type VcaPlan } from "../_shared/vertalCodeAi/core.ts";
// Vertal Prospector (aditivo, desligado por padrão: VERTAL_PROSPECTOR_ENABLED + VERTAL_PROSPECTOR_USER_IDS).
import { isProspectorEnabled } from "../_shared/vertalProspector/core.ts";
import { handleProspector } from "../_shared/vertalProspector/handler.ts";
import { getFreshAccessToken, loadAccount } from "../_shared/gmailToken.ts";
// Vertal Growth Team (aditivo, desligado por padrão: VERTAL_GROWTH_TEAM_ENABLED + allowlist do Prospector).
import { growthChargeAdmins, isGrowthEnabled } from "../_shared/vertalGrowth/core.ts";
import { handleGrowth, type DebitResult } from "../_shared/vertalGrowth/handler.ts";
import { listVisibleSecrets, resolveEnvForRun } from "../_shared/kuboSecrets.ts";
// Vertal CRM (aditivo, desligado por padrão: VERTAL_CRM_ENABLED + VERTAL_CRM_USER_IDS). Não depende das flags do VERTAL Code AI.
import { crmChargeAdmins, crmChargeOn, isApiKeyShape as isVertalCrmApiKey, isCrmEnabled } from "../_shared/vertalCrm/core.ts";
import { autoImport as vertalCrmAutoImport, handleCrm, hashApiKey as hashVertalCrmKey, type CrmDeps } from "../_shared/vertalCrm/handler.ts";
import { verifyFluxosKey as verifyVertalCrmFluxosKey } from "../_shared/fluxosBroker.ts";
import { makeEngine as makeVertalCrmEngine } from "../_shared/fluxosApps.ts";

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

const env = () => Deno.env.toObject();

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
const SELF_HOSTED_COOLDOWN_MS = 60_000;
/** Tempo que sempre sobra para a reserva (grátis/paga) depois de tentar a LLM própria. */
const FALLBACK_RESERVE_MS = 45_000;

/** Lê o streaming OpenAI-compatível com prazo para o 1º pedaço e prazo total. */
async function streamWithBudget(r: Response, firstTokenMs: number, abort: AbortController): Promise<string> {
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  let gotFirst = false;
  const firstTimer = setTimeout(() => {
    if (!gotFirst) abort.abort(new DOMException("first token timeout", "TimeoutError"));
  }, firstTokenMs);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return out;
        try {
          const piece = JSON.parse(data)?.choices?.[0]?.delta?.content;
          if (typeof piece === "string" && piece) {
            gotFirst = true;
            out += piece;
          }
        } catch {
          /* pedaço parcial */
        }
      }
    }
    return out;
  } finally {
    clearTimeout(firstTimer);
  }
}

async function callChain(
  chain: VcaModel[],
  messages: VcaChatMessage[],
  opts: { json: boolean; maxTokens: number; effort: VcaEffort; deadline: number },
): Promise<ModelReply> {
  const e = env();
  const failures: string[] = [];
  const inputTokens = estimateTokens(messages);
  for (let i = 0; i < chain.length; i++) {
    const m = chain[i];
    const left = opts.deadline - Date.now();
    if (left < 8_000) break;
    const budget = m.budget;
    if (budget) {
      // LLM própria: só pedidos pequenos, com tempo curto, e sem comer o tempo da reserva.
      if ((selfHostedCooldown.get(m.id) ?? 0) > Date.now()) {
        failures.push(`${m.id}:cooldown`);
        continue;
      }
      const ownLeft = Math.min(budget.totalMs, left - FALLBACK_RESERVE_MS);
      if (!withinSelfHostedBudget(m, inputTokens, ownLeft)) {
        failures.push(`${m.id}:skip(${inputTokens}tok)`);
        continue;
      }
    }
    const timeout = budget
      ? Math.min(budget.totalMs, left - FALLBACK_RESERVE_MS)
      : Math.min(left - 3_000, m.provider === "ollama" ? 240_000 : 90_000);
    const key = (e[m.keyEnv] ?? "").trim();
    const abort = new AbortController();
    const totalTimer = setTimeout(() => abort.abort(new DOMException("timeout", "TimeoutError")), timeout);
    try {
      const reqBody = requestBody(m, messages, { effort: opts.effort, json: opts.json, maxTokens: opts.maxTokens });
      const r = await fetch(m.url, {
        method: "POST",
        signal: abort.signal,
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
          ...(m.provider === "openrouter" ? { "HTTP-Referer": "https://vertal.dev", "X-Title": "VERTAL Code AI" } : {}),
        },
        body: JSON.stringify(m.provider === "openrouter" ? { ...reqBody, usage: { include: true } } : reqBody),
      });
      if (!r.ok) {
        failures.push(`${m.id}:${r.status}`);
        await r.body?.cancel();
        if (budget) selfHostedCooldown.set(m.id, Date.now() + SELF_HOSTED_COOLDOWN_MS);
        if (budget || shouldFallback(r.status)) continue;
        break;
      }
      let content: unknown;
      let usage: unknown = {};
      if (reqBody.stream === true && r.body) {
        content = await streamWithBudget(r, budget?.firstTokenMs ?? timeout, abort);
      } else {
        const d = await r.json();
        content = d?.choices?.[0]?.message?.content;
        usage = d?.usage ?? {};
      }
      if (typeof content !== "string" || !content.trim()) {
        failures.push(`${m.id}:empty`);
        continue;
      }
      // LLM própria é pequena: se não entregou o JSON pedido, a reserva tenta (sem gastar um turno).
      if (budget && opts.json && parseVcaTurn(content).retry) {
        failures.push(`${m.id}:bad_json`);
        continue;
      }
      const u = usage as { prompt_tokens?: number; completion_tokens?: number; cost?: number };
      const costUsd = typeof u.cost === "number"
        ? u.cost
        : estimateCostUsd(m, u.prompt_tokens ?? inputTokens, u.completion_tokens ?? Math.ceil(content.length / 3.5));
      console.log(
        `[vertal-code-ai] ok ${m.id} (${m.provider}/${m.model}) in=${inputTokens} tokens=${JSON.stringify(usage)} ` +
          `cost_usd=${costUsd.toFixed(6)} retail_credits=${retailCredits(costUsd)} (cobrança desligada)`,
      );
      const info = publicModelInfo(m);
      return { content, label: info.label, cost: info.cost, fellBack: failures.some((f) => !f.includes(":skip(")) };
    } catch (err) {
      failures.push(`${m.id}:${err instanceof Error ? err.name : "err"}`);
      if (budget) selfHostedCooldown.set(m.id, Date.now() + SELF_HOSTED_COOLDOWN_MS);
    } finally {
      clearTimeout(totalTimer);
    }
  }
  console.warn(`[vertal-code-ai] chain failed: ${failures.join(",")}`);
  throw new Error("vca_all_models_failed");
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
      for (const m of VCA_IMAGE_MODELS) {
        const t0 = Date.now();
        try {
          const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: orHeaders,
            signal: AbortSignal.timeout(90_000),
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
      return json(502, { error: "vca_media_failed" });
    }

    if (action === "video") {
      if (!mprompt) return json(400, { error: "empty_prompt" });
      const fails: string[] = [];
      for (const m of VCA_VIDEO_MODELS) {
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
      return json(502, { error: "vca_media_failed" });
    }

    const jobId = await verifyJob(userId, typeof body.job === "string" ? body.job : "");
    if (!jobId) return json(404, { error: "job_not_found" });
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
  const chain = option === "auto" && !modelId ? buildChain(env(), chainOpts) : buildOptionChain(env(), { ...chainOpts, option, modelId });
  if (!chain.length) return json(503, { error: "no_model_configured" });

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
          },
          {
            callModel: (messages, o) => callChain(chain, messages, { ...o, effort, deadline }),
            listPaths: async () => [...(await getFiles()).keys()],
            readFile: async (p) => (await getFiles()).get(p),
            indexSource: async () => [...(await getFiles())].filter(([, c]) => c.length < 60_000).map(([path, content]) => ({ path, content })),
            checkSyntax,
            emit: send,
          },
        );
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
