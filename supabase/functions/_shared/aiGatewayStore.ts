// Persistência do KUBO AI Gateway no Supabase: cache de respostas
// (ai_gateway_cache) e registro de execuções (ai_gateway_runs, painel
// Agent Activity). Usado pela função `ai-gateway` e pelos agentes que chamam
// o gateway direto (ex.: vibe-code-agent).
// deno-lint-ignore-file no-explicit-any
import { GatewayError, type GatewayCache, type GatewayResult, type TaskKind } from "./aiGateway.ts";

const CACHE_TTL_HOURS = 24;

type Admin = { from: (table: string) => any };

export function supabaseGatewayCache(admin: Admin): GatewayCache {
  return {
    async get(key) {
      const { data } = await admin
        .from("ai_gateway_cache")
        .select("content")
        .eq("key", key)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      return data?.content ?? null;
    },
    async set(key, content, meta) {
      await admin.from("ai_gateway_cache").upsert({
        key,
        content,
        task_kind: meta.kind,
        model: meta.model,
        expires_at: new Date(Date.now() + CACHE_TTL_HOURS * 3_600_000).toISOString(),
      });
    },
  };
}

/** Registra uma execução bem-sucedida; devolve o id da linha (ou null). */
export async function recordGatewayRun(
  admin: Admin,
  userId: string,
  projectId: string | null,
  result: GatewayResult,
): Promise<string | null> {
  const { data } = await admin
    .from("ai_gateway_runs")
    .insert({
      user_id: userId,
      project_id: projectId,
      task_kind: result.kind,
      tier: result.tier,
      provider: result.provider,
      model: result.model,
      cached: result.cached,
      status: "ok",
      prompt_tokens: result.usage?.prompt_tokens ?? null,
      completion_tokens: result.usage?.completion_tokens ?? null,
      cost_usd: result.costUsd,
      duration_ms: result.durationMs,
      attempts: result.attempts,
      dropped_messages: result.droppedMessages,
    })
    .select("id")
    .maybeSingle();
  return data?.id ?? null;
}

/** Registra uma execução que falhou (aparece como erro no Agent Activity). */
export async function recordGatewayFailure(
  admin: Admin,
  userId: string,
  projectId: string | null,
  kind: TaskKind,
  err: unknown,
): Promise<void> {
  await admin.from("ai_gateway_runs").insert({
    user_id: userId,
    project_id: projectId,
    task_kind: kind,
    status: "error",
    error: (err instanceof Error ? err.message : "internal_error").slice(0, 300),
    attempts: err instanceof GatewayError ? err.attempts : [],
  });
}
