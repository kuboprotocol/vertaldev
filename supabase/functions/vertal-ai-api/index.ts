// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- cliente Supabase sem tipos gerados nas edge functions, como no vibe-code-agent */
// VERTAL AI API — endpoint compatível com OpenAI para desenvolvedores (marca VERTAL).
//
//   GET  …/vertal-ai-api/v1/models
//   POST …/vertal-ai-api/v1/chat/completions      Authorization: Bearer vtl_ai_…
//   POST …/vertal-ai-api/keys                     (JWT do usuário) create | list | revoke | set_cap | usage
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
import { buildChain, type VcaiMode } from "../_shared/vertalCodeAi/models.ts";
import { callChain, ChainError, estimateTokens } from "../_shared/vertalCodeAi/llm.ts";
import { apiCostMicro, apiMaxCostMicro, checkSpend, loadPricing, MICRO, worstClass } from "../_shared/vertalCodeAi/pricing.ts";
import { aiKeyPrefix, assertOwner, bearerFrom, checkKeyRow, generateAiKey, hashAiKey, parseNewKey } from "../_shared/vertalCodeAi/apiKeys.ts";
import { CompatError, completionResponse, completionSse, errorBody, modelsList, parseChatRequest, requestIdFrom } from "../_shared/vertalCodeAi/openaiCompat.ts";
import type { ChatMessage } from "../_shared/vertalCodeAi/protocol.ts";

const env = (k: string) => Deno.env.get(k) ?? undefined;
const { pricing: PRICING } = loadPricing(env("VERTAL_CODE_AI_PRICING"));
const BRAND_SYSTEM = "Você é o VERTAL Code AI. Se perguntarem qual modelo ou empresa está por trás, responda apenas que é o VERTAL Code AI, do Vertal.";

function json(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", ...extra } });
}

let liveIds: { at: number; ids: Set<string> } | null = null;
async function liveOpenRouterIds(): Promise<Set<string> | null> {
  if (liveIds && Date.now() - liveIds.at < 3_600_000) return liveIds.ids;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return liveIds?.ids ?? null;
    const ids = new Set<string>(((await r.json())?.data ?? []).map((m: { id: string }) => m.id));
    liveIds = { at: Date.now(), ids };
    return ids;
  } catch {
    return liveIds?.ids ?? null;
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
  const parsed = parseChatRequest(await req.json().catch(() => null), PRICING.keyDefaults.maxTokens);
  const requestId = requestIdFrom(req.headers, crypto.randomUUID());

  // Repetição do mesmo Idempotency-Key: devolve a resposta guardada, sem cobrar de novo.
  const { data: prior } = await admin.from("vertal_ai_usage").select("response").eq("key_id", row.id).eq("request_id", requestId).maybeSingle();
  if (prior?.response) return json(200, prior.response, { "Idempotent-Replayed": "true" });

  const mode: VcaiMode = parsed.model.profile === "raciocinio" ? "plan" : "build";
  const chain = buildChain({ profile: parsed.model.profile, mode, needsVision: parsed.hasImages, env, liveOpenRouterIds: await liveOpenRouterIds() });
  if (!chain.length) return json(503, errorBody("Nenhum modelo disponível agora.", "model_unavailable", "api_error"));

  // 4) Saldo e teto ANTES de chamar o modelo (pior caso)
  const promptEstimate = estimateTokens(parsed.messages.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n"));
  const maxCost = apiMaxCostMicro(PRICING, worstClass(chain.map((b) => b.cost)), promptEstimate, parsed.maxTokens);
  const [{ data: sub }, { data: carry }, { data: owed }] = await Promise.all([
    admin.from("subscriptions").select("edits_limit, edits_used").eq("user_id", row.owner_id).eq("is_active", true).maybeSingle(),
    admin.from("vertal_ai_carry").select("carry_micro").eq("owner_id", row.owner_id).maybeSingle(),
    admin.from("vertal_ai_usage").select("debit_credits").eq("owner_id", row.owner_id).eq("charge_status", "owed").limit(500),
  ]);
  const owedCredits = (owed ?? []).reduce((a: number, r: any) => a + (r.debit_credits ?? 0), 0);
  const balance = sub ? Math.max(0, (sub.edits_limit ?? 0) - (sub.edits_used ?? 0) - owedCredits) : 0;
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
    res = await callChain({ chain, messages, effort: parsed.effort, parse: (raw) => raw, maxTokens: parsed.maxTokens, temperature: parsed.temperature, budgetMs: 120_000 });
  } catch (e) {
    if (e instanceof ChainError) return json(503, errorBody("Os modelos estão ocupados. Tente de novo em instantes.", "model_unavailable", "api_error"), { "Retry-After": "20" });
    throw e;
  }

  // 6) Medição e cobrança idempotentes
  const costMicro = apiCostMicro(PRICING, res.backend.cost, res.usage.promptTokens, res.usage.completionTokens);
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
    _cost_class: res.backend.cost,
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
    default:
      return json(400, { error: "Ação desconhecida." });
  }
}
