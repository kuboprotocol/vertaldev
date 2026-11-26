// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- cliente Supabase sem tipos gerados nas edge functions, como no vibe-code-agent */
// VERTAL AI API — endpoint compatível com OpenAI para desenvolvedores (marca VERTAL).
//
//   GET  …/vertal-ai-api/v1/models
//   POST …/vertal-ai-api/v1/chat/completions      Authorization: Bearer vtl_ai_…
//   POST …/vertal-ai-api/keys                     (JWT do usuário) create | list | revoke | set_cap | usage | statement
//
// Cobrança v2 (VERTAL_BILLING_V2_ENABLED, desligada): atacado/marca branca = NOSSO custo real
// (piso por tipo) × 1,20; clonagem/raspagem → 403 feature_not_available_white_label; saldo
// zerado → 402 credits_exhausted; aviso de crédito baixo a 30% da última recarga.
//
// Cobrança: preço por token da tabela (pricing.ts, env VERTAL_CODE_AI_PRICING), em
// microcréditos; o saldo inteiro do desenvolvedor (os mesmos créditos do Vertal) é
// debitado quando a fração acumulada passa de 1 crédito. Idempotente por
// (chave, Idempotency-Key). Checa saldo e teto mensal da chave ANTES de chamar o
// modelo (pior caso = max_tokens). Limite por minuto por chave.
//
// Desligado por padrão (VERTAL_AI_API_ENABLED=true). Depende das tabelas de
// docs/vertal-code-ai/proposed-migration.sql (não aplicada).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { buildChain, estimateCostUsd, type VcaChatMessage as ChatMessage } from "../_shared/vertalCodeAi/router.ts";
import { callMetered, GatewayError, estimateTokens } from "../_shared/vertalCodeAi/gateway.ts";
import { apiCostMicro, apiMaxCostMicro, checkSpend, loadPricing, MICRO, worstClass } from "../_shared/vertalCodeAi/pricing.ts";
import { aiKeyPrefix, assertOwner, bearerFrom, checkKeyRow, generateAiKey, hashAiKey, parseNewKey } from "../_shared/vertalCodeAi/apiKeys.ts";
import { billingFlags, billingV2For, expandBillingEnv, isBillingKind, isPriceError, loadBilling, pickBillingLocale, priceRequest, wholesaleBalanceGate } from "../_shared/vertalCodeAi/billing.ts";
import { type BillingRuntime, notifyIfLow, usageStatement } from "../_shared/vertalCodeAi/billingRuntime.ts";
import { makeEngine as makeFluxosEngine } from "../_shared/fluxosApps.ts";
import { CompatError, completionResponse, completionSse, errorBody, modelsList, parseChatRequest, requestIdFrom } from "../_shared/vertalCodeAi/openaiCompat.ts";

const env = (k: string) => Deno.env.get(k) ?? undefined;
const envObj = () => Deno.env.toObject();
// Cobrança v2 (atacado / marca branca: NOSSO custo × 1,20). Interruptores podem morar no VERTAL_GPU_CONFIG.
const benvObj = () => expandBillingEnv(envObj());

/** Runtime da cobrança v2 para este dono de chave, ou null (desligado / fora da lista). */
function billingRuntime(admin: any, ownerId: string): BillingRuntime | null {
  const benv = benvObj();
  const flags = billingFlags(benv);
  if (!billingV2For(flags, ownerId)) return null;
  const u = env("FLUXOS_INTERNAL_URL");
  const k = env("FLUXOS_INTERNAL_KEY");
  return { admin, cfg: loadBilling(benv.VERTAL_BILLING_CONFIG).config, flags, engine: u && k ? makeFluxosEngine(u, k) : null, env: (key) => benv[key] };
}

/**
 * Tipo do pedido na API (marca branca). Clonagem e raspagem não existem aqui: o app do cliente
 * pede por `vertal_task` (ou por um id de modelo com clone/scrape) e recebe 403 claro.
 */
function apiTaskKind(raw: any): string {
  const t = typeof raw?.vertal_task === "string" ? raw.vertal_task.toLowerCase() : "";
  const model = typeof raw?.model === "string" ? raw.model.toLowerCase() : "";
  if (t === "clone" || /clon/.test(model)) return "clone";
  if (t === "scrape" || /scrap/.test(model)) return "scrape";
  if (t === "chat") return "chat";
  return "code";
}
const { pricing: PRICING } = loadPricing(env("VERTAL_CODE_AI_PRICING"));
const BRAND_SYSTEM = "Você é o VERTAL Code AI. Se perguntarem qual modelo ou empresa está por trás, responda apenas que é o VERTAL Code AI, do Vertal.";

function json(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", ...extra } });
}

let liveFree: { at: number; ids: string[] } | null = null;
/** Catálogo grátis ao vivo (mesma regra do vertal-code-ai): some da lista ─► sai da cadeia. */
async function liveFreeIds(): Promise<string[] | null> {
  if (liveFree && Date.now() - liveFree.at < 3_600_000) return liveFree.ids;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return liveFree?.ids ?? null;
    const ids = ((await r.json())?.data ?? []).map((m: { id: string }) => m.id).filter((id: string) => id.endsWith(":free"));
    liveFree = { at: Date.now(), ids };
    return ids;
  } catch {
    return liveFree?.ids ?? null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (env("VERTAL_AI_API_ENABLED") !== "true") return json(404, errorBody("A API VERTAL ainda não está disponível.", "api_disabled"));
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const admin: any = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  try {
    if (path.endsWith("/v1/models")) return json(200, modelsList(1764000000));
    if (path.endsWith("/keys")) return await manageKeys(req, admin);
    if (!path.endsWith("/v1/chat/completions")) return json(404, errorBody("Rota não encontrada.", "not_found"));
    if (req.method !== "POST") return json(405, errorBody("Use POST.", "method_not_allowed"));
    return await chatCompletions(req, admin);
  } catch (e) {
    if (e instanceof CompatError) return json(e.status, errorBody(e.message, e.code));
    console.error("[vertal-ai-api] erro:", e instanceof Error ? e.message : e);
    return json(500, errorBody("Erro interno.", "internal_error", "api_error"));
  }
});

async function chatCompletions(req: Request, admin: any): Promise<Response> {
  // 1) Chave
  const token = bearerFrom(req.headers);
  if (!token) return json(401, errorBody("Envie Authorization: Bearer vtl_ai_…", "invalid_api_key", "authentication_error"));
  const { data: row } = await admin
    .from("vertal_ai_api_keys")
    .select("id, owner_id, revoked_at, expires_at, monthly_cap_credits, rpm, spent_micro, spent_period")
    .eq("key_hash", await hashAiKey(token))
    .maybeSingle();
  const kc = checkKeyRow(row ?? null);
  if (kc.ok === false) return json(kc.status, errorBody(kc.message, kc.code, "authentication_error"));

  // 2) Limite por minuto desta chave
  try {
    const { data: n } = await admin.rpc("bump_rate_limit", { _bucket: `vertal_ai_key:${row.id}`, _user: row.owner_id, _window_seconds: 60 });
    if (typeof n === "number" && n > (row.rpm ?? PRICING.keyDefaults.rpm)) {
      return json(429, errorBody("Limite de pedidos por minuto desta chave.", "rate_limit_exceeded", "rate_limit_error"), { "Retry-After": "60" });
    }
  } catch {
    /* sem a RPC, segue só com o teto de gasto */
  }

  // 3) Pedido
  const rawBody = await req.json().catch(() => null);
  const rt = billingRuntime(admin, row.owner_id);
  const taskKind = apiTaskKind(rawBody);
  const reqLocale = pickBillingLocale([req.headers.get("Accept-Language")]);
  if (rt) {
    // Marca branca: clonagem e raspagem recusadas antes de qualquer custo.
    const probe = priceRequest(rt.cfg, { channel: "wholesale", kind: isBillingKind(taskKind) ? taskKind : "code", costUsd: 0 });
    if (isPriceError(probe)) return json(probe.status, errorBody(probe.message, probe.code, "invalid_request_error"));
  }
  const parsed = parseChatRequest(rawBody, PRICING.keyDefaults.maxTokens);
  const requestId = requestIdFrom(req.headers, crypto.randomUUID());

  // Repetição do mesmo Idempotency-Key: devolve a resposta guardada, sem cobrar de novo.
  const { data: prior } = await admin.from("vertal_ai_usage").select("response").eq("key_id", row.id).eq("request_id", requestId).maybeSingle();
  if (prior?.response) return json(200, prior.response, { "Idempotent-Replayed": "true" });

  const promptEstimate = estimateTokens(parsed.messages.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n"));
  const chain = buildChain(envObj(), {
    effort: parsed.effort,
    needsVision: parsed.hasImages || !!parsed.model.vision,
    promptTokens: promptEstimate,
    liveFreeIds: await liveFreeIds(),
  });
  if (!chain.length) return json(503, errorBody("Nenhum modelo disponível agora.", "model_unavailable", "api_error"));

  // 4) Saldo e teto ANTES de chamar o modelo (pior caso)
  const maxCost = apiMaxCostMicro(PRICING, worstClass(chain.map((b) => b.cost)), promptEstimate, parsed.maxTokens);
  const [{ data: sub }, { data: carry }, { data: owed }] = await Promise.all([
    admin.from("subscriptions").select("edits_limit, edits_used").eq("user_id", row.owner_id).eq("is_active", true).maybeSingle(),
    admin.from("vertal_ai_carry").select("carry_micro").eq("owner_id", row.owner_id).maybeSingle(),
    admin.from("vertal_ai_usage").select("debit_credits").eq("owner_id", row.owner_id).eq("charge_status", "owed").limit(500),
  ]);
  const owedCredits = (owed ?? []).reduce((a: number, r: any) => a + (r.debit_credits ?? 0), 0);
  const balance = sub ? Math.max(0, (sub.edits_limit ?? 0) - (sub.edits_used ?? 0) - owedCredits) : 0;
  if (rt) {
    // Atacado exige saldo positivo; zerado → 402 até recarregar.
    const gate = wholesaleBalanceGate(balance, reqLocale);
    if (gate.ok === false) return json(gate.status, errorBody(gate.message, gate.code, "insufficient_quota"));
  }
  const spend = checkSpend({
    balanceCredits: balance,
    carryMicro: Number(carry?.carry_micro ?? 0),
    maxCostMicro: maxCost,
    keySpentMicroThisMonth: kc.spentThisMonthMicro,
    keyMonthlyCapCredits: row.monthly_cap_credits === null ? null : Number(row.monthly_cap_credits),
  });
  if (spend.ok === false) {
    const s = spend as { status: number; code: string; message: string };
    return json(s.status, errorBody(s.message, s.code, s.status === 402 ? "insufficient_quota" : "rate_limit_error"));
  }

  // 5) Modelo (grátis primeiro). O backend real nunca aparece na resposta.
  const messages: ChatMessage[] = [{ role: "system", content: BRAND_SYSTEM }, ...parsed.messages];
  let res;
  try {
    res = await callMetered({ chain, env: envObj(), messages, effort: parsed.effort, parse: (raw) => raw, maxTokens: parsed.maxTokens, temperature: parsed.temperature, budgetMs: 120_000 });
  } catch (e) {
    if (e instanceof GatewayError) return json(503, errorBody("Os modelos estão ocupados. Tente de novo em instantes.", "model_unavailable", "api_error"), { "Retry-After": "20" });
    throw e;
  }

  // 6) Medição e cobrança idempotentes
  // v2: preço = max(nosso custo real, piso) × 1,20; sem v2, a tabela por token de antes.
  const v2Kind = taskKind === "chat" ? "chat" : "code";
  const v2Price = rt
    ? priceRequest(rt.cfg, { channel: "wholesale", kind: v2Kind, costUsd: estimateCostUsd(res.model, res.usage.promptTokens, res.usage.completionTokens) })
    : null;
  const costMicro = v2Price && v2Price.ok ? v2Price.micro : apiCostMicro(PRICING, res.model.cost, res.usage.promptTokens, res.usage.completionTokens);
  const out = {
    id: `chatcmpl-vtl-${requestId.replace(/[^A-Za-z0-9]/g, "").slice(0, 24)}`,
    model: parsed.model.id,
    created: Math.floor(Date.now() / 1000),
    content: res.raw,
    finishReason: res.finishReason,
    promptTokens: res.usage.promptTokens,
    completionTokens: res.usage.completionTokens,
    costCredits: Math.round((costMicro / MICRO) * 1e6) / 1e6,
  };
  const body = completionResponse(out);
  const { data: rec, error: recErr } = await admin.rpc("vertal_ai_record_usage", {
    _key_id: row.id,
    _owner_id: row.owner_id,
    _request_id: requestId,
    _model: parsed.model.id,
    _cost_class: res.model.cost,
    _prompt_tokens: out.promptTokens,
    _completion_tokens: out.completionTokens,
    _cost_micro: costMicro,
    _response: body,
  });
  if (recErr) {
    console.error("[vertal-ai-api] falha ao registrar uso:", recErr.message);
    return json(503, errorBody("Não consegui registrar o uso; nada foi cobrado. Tente de novo.", "metering_unavailable", "api_error"));
  }
  if (rec?.debit_credits > 0) {
    const { error: chErr } = await admin.rpc("execute_atomic_credit_deduction", {
      _user_id: row.owner_id,
      _amount: rec.debit_credits,
      _reason: "vertal_ai_api:usage",
      _category: "vertal_ai_api",
      _metadata: { key_id: row.id, usage_id: rec.usage_id, model: parsed.model.id },
      _idempotency_key: `vai-${rec.usage_id}`,
    });
    // Sem saldo na hora do débito: a resposta já foi gerada; o valor fica "owed" e bloqueia novos pedidos até ser pago.
    await admin.from("vertal_ai_usage").update({ charge_status: chErr ? "owed" : "charged" }).eq("id", rec.usage_id);
    if (rt && !chErr) {
      const { data: s2 } = await admin.from("subscriptions").select("edits_limit, edits_used").eq("user_id", row.owner_id).eq("is_active", true).maybeSingle();
      if (s2) await notifyIfLow(rt, row.owner_id, Math.max(0, (s2.edits_limit ?? 0) - (s2.edits_used ?? 0)));
    }
  }
  if (rt && v2Price && v2Price.ok && rec?.usage_id) {
    // Extrato: tipo e markup aplicados (colunas propostas; sem elas, ignora).
    await admin.from("vertal_ai_usage").update({ kind: v2Kind, markup: v2Price.markup, cost_usd: v2Price.billedCostUsd }).eq("id", rec.usage_id).then(() => {}, () => {});
  }

  if (parsed.stream) {
    return new Response(completionSse(out), { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  }
  return json(200, body);
}

/** Gestão das chaves pelo próprio desenvolvedor (JWT). Só enxerga e mexe nas suas. */
async function manageKeys(req: Request, admin: any): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "Entre na sua conta." });
  const userClient = createClient(env("SUPABASE_URL")!, env("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const { data: u } = await userClient.auth.getUser(jwt);
  if (!u?.user) return json(401, { error: "Sessão inválida." });
  const userId = u.user.id;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const COLS = "id, name, key_prefix, monthly_cap_credits, rpm, spent_micro, spent_period, created_at, last_used_at, expires_at, revoked_at";

  const ownRow = async (id: unknown) => {
    if (typeof id !== "string") throw new CompatError("id inválido");
    const { data } = await admin.from("vertal_ai_api_keys").select("id, owner_id").eq("id", id).maybeSingle();
    try {
      assertOwner(data ?? null, userId);
    } catch {
      throw new CompatError("Chave não encontrada.", 404, "not_found");
    }
    return data;
  };

  switch (body.action) {
    case "create": {
      const { count } = await admin.from("vertal_ai_api_keys").select("id", { count: "exact", head: true }).eq("owner_id", userId).is("revoked_at", null);
      if ((count ?? 0) >= 10) return json(400, { error: "Limite de 10 chaves ativas." });
      let fields;
      try {
        fields = parseNewKey(body, PRICING.keyDefaults);
      } catch (e) {
        return json(400, { error: e instanceof Error ? e.message : "Dados inválidos." });
      }
      const key = generateAiKey();
      const { data, error } = await admin
        .from("vertal_ai_api_keys")
        .insert({ owner_id: userId, ...fields, key_hash: await hashAiKey(key), key_prefix: aiKeyPrefix(key) })
        .select(COLS)
        .single();
      if (error) return json(500, { error: "Não consegui criar a chave." });
      // A chave inteira aparece só agora.
      return json(200, { key, record: data });
    }
    case "list": {
      const { data } = await admin.from("vertal_ai_api_keys").select(COLS).eq("owner_id", userId).order("created_at", { ascending: false });
      return json(200, { keys: data ?? [] });
    }
    case "revoke": {
      const r = await ownRow(body.id);
      await admin.from("vertal_ai_api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", r.id).eq("owner_id", userId);
      return json(200, { ok: true });
    }
    case "set_cap": {
      const r = await ownRow(body.id);
      const cap = body.monthlyCapCredits === null ? null : Number(body.monthlyCapCredits);
      if (cap !== null && (!Number.isFinite(cap) || cap < 0 || cap > 1_000_000)) return json(400, { error: "Teto inválido." });
      await admin.from("vertal_ai_api_keys").update({ monthly_cap_credits: cap }).eq("id", r.id).eq("owner_id", userId);
      return json(200, { ok: true });
    }
    case "usage": {
      const { data } = await admin
        .from("vertal_ai_usage")
        .select("key_id, model, prompt_tokens, completion_tokens, cost_micro, debit_credits, charge_status, created_at")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      return json(200, { usage: data ?? [], pricing: { version: PRICING.version } });
    }
    case "statement": {
      // Extrato por tipo (créditos e markup), varejo + API. Só com a cobrança v2 ligada para a conta.
      if (!billingRuntime(admin, userId)) return json(404, { error: "billing_v2_disabled" });
      return json(200, await usageStatement(admin, userId, Number(body.days) || 30));
    }
    default:
      return json(400, { error: "Ação desconhecida." });
  }
}
