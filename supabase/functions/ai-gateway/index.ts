// KUBO AI Gateway — endpoint único de IA para os agentes e para o app.
//
// POST /functions/v1/ai-gateway
//   { "task"?: TaskKind, "messages"?: Msg[], "prompt"?: string,
//     "system"?: string, "project_id"?: uuid, "json"?: boolean,
//     "tier"?: "flash" | "pro", "no_cache"?: boolean }
//   → { content, task, tier, provider, model, cached, usage, cost_usd,
//       duration_ms, run_id }
//
// GET  /functions/v1/ai-gateway  → tabela de roteamento (para a UI).
//
// Cada chamada é registrada em ai_gateway_runs (painel Agent Activity).
// O usuário nunca escolhe o modelo: escolhe a tarefa, o gateway escolhe o
// modelo mais barato que resolve.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  GatewayError,
  isTaskKind,
  ROUTES,
  runGateway,
  TASK_KINDS,
  type Msg,
} from "../_shared/aiGateway.ts";
import { recordGatewayFailure, recordGatewayRun, supabaseGatewayCache } from "../_shared/aiGatewayStore.ts";

const MAX_MESSAGES = 200;
const MAX_TOTAL_CHARS = 400_000;
const RATE_LIMIT_PER_MINUTE = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseMessages(body: Record<string, unknown>): Msg[] | string {
  const out: Msg[] = [];
  if (typeof body.system === "string" && body.system.trim()) {
    out.push({ role: "system", content: body.system });
  }
  if (Array.isArray(body.messages)) {
    if (body.messages.length > MAX_MESSAGES) return "too_many_messages";
    for (const m of body.messages) {
      const role = (m as Msg)?.role;
      const content = (m as Msg)?.content;
      if (!["system", "user", "assistant"].includes(role) || typeof content !== "string") {
        return "invalid_message";
      }
      out.push({ role, content });
    }
  }
  if (typeof body.prompt === "string" && body.prompt.trim()) {
    out.push({ role: "user", content: body.prompt });
  }
  if (!out.some((m) => m.role === "user")) return "missing_prompt";
  if (out.reduce((n, m) => n + m.content.length, 0) > MAX_TOTAL_CHARS) return "payload_too_large";
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method === "GET") {
    return json({
      tasks: TASK_KINDS.map((k) => ({
        task: k,
        label: ROUTES[k].label,
        tier: ROUTES[k].tier,
        cacheable: ROUTES[k].cacheable,
      })),
    });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const messages = parseMessages(body);
  if (typeof messages === "string") return json({ error: messages }, 400);

  if (body.task !== undefined && !isTaskKind(body.task)) {
    return json({ error: "invalid_task", tasks: TASK_KINDS }, 400);
  }
  if (body.tier !== undefined && body.tier !== "flash" && body.tier !== "pro") {
    return json({ error: "invalid_tier" }, 400);
  }

  let projectId: string | null = null;
  if (body.project_id !== undefined && body.project_id !== null) {
    if (typeof body.project_id !== "string" || !UUID_RE.test(body.project_id)) {
      return json({ error: "invalid_project_id" }, 400);
    }
    // RLS de projects garante que só o dono enxerga o projeto.
    const { data: proj } = await userClient.from("projects").select("id").eq("id", body.project_id).maybeSingle();
    if (!proj) return json({ error: "project_not_found" }, 404);
    projectId = body.project_id;
  }

  const admin = createClient(SUPABASE_URL, SERVICE);

  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("ai_gateway_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return json({ error: "rate_limited", retry_after_seconds: 60 }, 429);
  }

  const cache = supabaseGatewayCache(admin);

  try {
    const result = await runGateway(
      {
        messages,
        kind: body.task as never,
        tier: body.tier as never,
        json: body.json === true,
        noCache: body.no_cache === true,
      },
      { cache },
    );
    const runId = await recordGatewayRun(admin, user.id, projectId, result);

    return json({
      content: result.content,
      task: result.kind,
      tier: result.tier,
      provider: result.provider,
      model: result.model,
      cached: result.cached,
      usage: result.usage,
      cost_usd: result.costUsd,
      duration_ms: result.durationMs,
      run_id: runId,
    });
  } catch (e) {
    const status = e instanceof GatewayError ? e.status : 500;
    const message = e instanceof GatewayError ? e.message : "internal_error";
    await recordGatewayFailure(admin, user.id, projectId, isTaskKind(body.task) ? body.task : "chat", e);
    if (!(e instanceof GatewayError)) console.error("[ai-gateway]", e);
    return json({ error: message }, status);
  }
});
