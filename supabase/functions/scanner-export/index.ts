// Scanner de documentos: cobra 4 créditos por PDF exportado (uma vez por exportação, não por ajuste).
// A imagem não passa por aqui: o recorte e o PDF são feitos no navegador. Só a cobrança acontece no servidor.
import { corsHeaders } from "../_shared/cors.ts";
import { getUser, deductCredits, sanitizeError } from "../_shared/creative.ts";
import { SCANNER_MAX_PAGES, SCANNER_PDF_CREDITS } from "../_shared/scanner.ts";
import { z } from "npm:zod@3";

const InputSchema = z.object({
  pages: z.number().int().min(1).max(SCANNER_MAX_PAGES),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j(405, { error: "method_not_allowed" });

  const user = await getUser(req.headers.get("Authorization"));
  if (!user) return j(401, { error: "Unauthorized" });

  const parsed = InputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return j(400, { error: "invalid_input" });

  try {
    const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? undefined;
    const ded = await deductCredits(
      user.id,
      SCANNER_PDF_CREDITS,
      "document_scanner_pdf",
      { pages: parsed.data.pages },
      user.email,
      idempotencyKey,
    );
    if (!ded.ok) return j(ded.status ?? 402, { error: ded.error });
    return j(200, { ok: true, credits_spent: SCANNER_PDF_CREDITS, replayed: ded.replayed ?? false });
  } catch (e) {
    return j(500, { error: sanitizeError(e) });
  }
});

function j(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
