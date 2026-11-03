// Pacote Office: IA para preencher planilhas e escrever documentos.
//
// Cobrança: 1 crédito por uso da IA. O editor e a exportação são grátis e não
// passam por aqui. Se a IA falhar ou a saída for inválida, withRefundOnFailure
// devolve o crédito (resposta não-2xx).
//
// Roteamento: tarefa "docs" no tier flash do AI Gateway, ou seja, o provedor
// mais barato da cadeia (DeepSeek oficial) com fallback automático.
import { corsHeaders } from "../_shared/cors.ts";
import { getUser, deductCredits, sanitizeError, withRefundOnFailure } from "../_shared/creative.ts";
import { runGateway, GatewayError } from "../_shared/aiGateway.ts";
import {
  OFFICE_AI_CREDIT_COST,
  OfficeAiOutputError,
  buildOfficeMessages,
  clipSource,
  parseOfficeOutput,
} from "../_shared/officeAi.ts";
import { z } from "npm:zod@3";

const InputSchema = z.object({
  action: z.enum(["sheet", "doc"]),
  prompt: z.string().trim().min(3).max(2000),
  source: z.string().max(60_000).optional(),
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(withRefundOnFailure(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const user = await getUser(req.headers.get("Authorization"));
  if (!user) return json(401, { error: "Unauthorized" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return json(400, { error: "invalid_input", details: parsed.error.flatten() });
  }
  const { action, prompt, source } = parsed.data;

  const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? undefined;
  const charge = await deductCredits(
    user.id,
    OFFICE_AI_CREDIT_COST,
    "office_ai",
    { action },
    user.email ?? null,
    idempotencyKey,
  );
  if (!charge.ok) {
    const status = charge.status ?? 402;
    const error = charge.error === "deduction_failed" ? "insufficient_credits" : charge.error;
    return json(status, { error });
  }

  try {
    const gw = await runGateway({
      messages: buildOfficeMessages(action, prompt, clipSource(source ?? "")),
      kind: "docs",
      tier: "flash",
      json: true,
      temperature: 0.2,
      maxTokens: 4000,
    });
    const output = parseOfficeOutput(action, gw.content);
    return json(200, {
      action,
      output,
      provider: gw.provider,
      model: gw.model,
      creditsCharged: OFFICE_AI_CREDIT_COST,
    });
  } catch (err) {
    if (err instanceof OfficeAiOutputError) return json(502, { error: "invalid_model_output" });
    if (err instanceof GatewayError) return json(503, { error: "ai_unavailable" });
    return json(500, { error: sanitizeError(err) });
  }
}));
