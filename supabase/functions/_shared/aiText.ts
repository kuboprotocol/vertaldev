// Texto por IA para os agentes: chama a função `ai-gateway` (KUBO AI Gateway,
// DeepSeek com cache, retry e registro no Agent Activity) com o token do
// próprio usuário. Substitui o gateway do Lovable.

export interface AiTextOptions {
  task: "chat" | "classify" | "docs" | "marketing" | "code" | "debug" | "plan" | "architecture" | "complex";
  tier?: "flash" | "pro";
  json?: boolean;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}

export async function aiText(req: Request, opts: AiTextOptions): Promise<string> {
  const base = Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "");
  const r = await fetch(`${base}/functions/v1/ai-gateway`, {
    method: "POST",
    headers: {
      Authorization: req.headers.get("Authorization") ?? "",
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ task: opts.task, tier: opts.tier, json: opts.json ?? false, messages: opts.messages }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`ai_${r.status}${data?.error ? `:${data.error}` : ""}`);
  return typeof data?.content === "string" ? data.content : "";
}

/** JSON do modelo, tolerando cercas ```json. Objeto vazio se não parsear. */
export function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
