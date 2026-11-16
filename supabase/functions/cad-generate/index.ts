// Auto Cadê: a IA desenha ou ajusta uma planta a partir do pedido (texto ou voz ditada).
// Preço: supabase/functions/_shared/cad.ts (custo do uso da IA + 75%). Cobra antes de gerar;
// qualquer resposta não-2xx devolve os créditos (withRefundOnFailure).
import { corsHeaders } from "../_shared/cors.ts";
import { getUser, deductCredits, sanitizeError, withRefundOnFailure } from "../_shared/creative.ts";
import { callLlm } from "../_shared/llm.ts";
import {
  CAD_LIMITS,
  CAD_SYSTEM_PROMPT,
  buildCadUserMessage,
  cadCredits,
  cadRequestChars,
  parseModelJson,
  validateCadPlan,
} from "../_shared/cad.ts";
import { z } from "npm:zod@3";

const InputSchema = z.object({
  prompt: z.string().trim().min(3).max(CAD_LIMITS.maxPromptChars),
  mode: z.enum(["new", "edit"]).default("new"),
  current: z.string().max(CAD_LIMITS.maxCurrentChars).optional(),
});

Deno.serve(withRefundOnFailure(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const user = await getUser(req.headers.get("Authorization"));
  if (!user) return j(401, { error: "Unauthorized" });

  const parsed = InputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return j(400, { error: "invalid_input" });
  const { prompt, mode, current } = parsed.data;
  if (mode === "edit" && !current) return j(400, { error: "invalid_input" });

  const userMessage = buildCadUserMessage(prompt, mode, current);
  const credits = cadCredits(cadRequestChars(userMessage, CAD_SYSTEM_PROMPT));
  const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? undefined;

  try {
    const ded = await deductCredits(user.id, credits, "cad_ai", { mode, prompt_chars: prompt.length }, user.email, idempotencyKey);
    if (!ded.ok) return j(ded.status ?? 402, { error: ded.error });

    const llm = await callLlm({
      messages: [
        { role: "system", content: CAD_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      prefer: "kimi",
      temperature: 0.2,
      max_tokens: CAD_LIMITS.maxOutputTokens,
      json: true,
    });

    let raw: unknown;
    try {
      raw = parseModelJson(llm.content);
    } catch {
      console.warn("[cad-generate] invalid json from model", { provider: llm.provider });
      return j(502, { error: "cad_generation_failed", detail: "invalid_json" });
    }

    const plan = validateCadPlan(raw);
    if (!plan.ok) {
      console.warn("[cad-generate] invalid plan", { provider: llm.provider, error: plan.error });
      return j(502, { error: "cad_generation_failed", detail: plan.error });
    }

    return j(200, { ok: true, document: plan.document, credits_spent: credits, mode });
  } catch (e) {
    console.error("[cad-generate] error:", e);
    return j(500, { error: sanitizeError(e) });
  }
}));

function j(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
