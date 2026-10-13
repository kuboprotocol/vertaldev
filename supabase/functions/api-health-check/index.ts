// Lightweight health check across every AI provider configured for the Creative panel.
// Returns latency + status for each provider so the UI can render a status board.
import { corsHeaders } from "../_shared/cors.ts";

type Status = { status: "ok" | "error" | "missing"; latency_ms?: number; message?: string; model?: string };

async function timed<T>(fn: () => Promise<Response>): Promise<{ res: Response | null; ms: number; err?: string }> {
  const t0 = Date.now();
  try {
    const res = await fn();
    return { res, ms: Date.now() - t0 };
  } catch (e) {
    return { res: null, ms: Date.now() - t0, err: e instanceof Error ? e.message : String(e) };
  }
}

async function ping(name: string, key: string | undefined, exec: () => Promise<Response>): Promise<Status> {
  if (!key) return { status: "missing", message: `${name.toUpperCase()}_API_KEY not configured` };
  const { res, ms, err } = await timed(exec);
  if (!res) return { status: "error", latency_ms: ms, message: err ?? "network_error" };
  if (!res.ok) return { status: "error", latency_ms: ms, message: `HTTP ${res.status}` };
  return { status: "ok", latency_ms: ms };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const OR = Deno.env.get("OPENROUTER_API_KEY");
  const DEEPSEEK = Deno.env.get("DEEPSEEK_API_KEY");

  const [openrouter, deepseek] = await Promise.all([
    ping("openrouter", OR, () => fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${OR}` },
    })),
    ping("deepseek", DEEPSEEK, () => fetch("https://api.deepseek.com/models", {
      headers: { Authorization: `Bearer ${DEEPSEEK}` },
    })),
  ]);

  const body = {
    checked_at: new Date().toISOString(),
    openrouter, deepseek,
  };
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
