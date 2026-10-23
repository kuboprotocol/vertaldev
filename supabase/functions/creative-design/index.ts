// Estúdio de Design (Painel Criativo). Níveis e custos espelham src/config/designPricing.ts;
// src/config/__tests__/designPricing.test.ts falha se as duas tabelas divergirem.
import { corsHeaders } from "../_shared/cors.ts";
import { getUser, deductCredits, recordAsset, sanitizeError, withRefundOnFailure } from "../_shared/creative.ts";
import { z } from "npm:zod@3";

const TIERS = {
  simple: { credits: 1, variants: 1 },
  premium: { credits: 2, variants: 2 },
} as const;

const FORMATS = {
  post: "quadrado 1:1 para post de rede social",
  story: "vertical 9:16 para story",
  banner: "horizontal 16:9 para banner ou capa",
  poster: "retrato 4:5 para cartaz",
} as const;

const TIER_DIRECTIVES: Record<keyof typeof TIERS, string> = {
  simple: "Layout limpo e legível, uma ideia central.",
  premium:
    "Direção de arte de agência: composição equilibrada, hierarquia tipográfica clara, paleta de no máximo três cores, iluminação e profundidade cinematográficas, grid rigoroso, acabamento de marca premium. Sem clip-art, sem elementos genéricos, sem marca d'água.",
};

const VARIATION_ANGLES = [
  "composição central minimalista",
  "composição editorial assimétrica",
  "imagem de fundo com destaque tipográfico",
  "composição tipográfica dominante",
];

const IMAGE_MODEL = "google/gemini-2.0-flash-exp";

const InputSchema = z.object({
  prompt: z.string().trim().min(3).max(1000),
  format: z.enum(["post", "story", "banner", "poster"]),
  tier: z.enum(["simple", "premium"]),
});

Deno.serve(withRefundOnFailure(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const user = await getUser(req.headers.get("Authorization"));
  if (!user) return j(401, { error: "Unauthorized" });

  const parsed = InputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return j(400, { error: "invalid_input" });
  const { prompt, format, tier } = parsed.data;
  const { credits, variants } = TIERS[tier];

  const LK = Deno.env.get("LOVABLE_API_KEY");
  if (!LK) return j(503, { error: "image_provider_unavailable" });

  const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? undefined;
  try {
    // Cobra antes de gerar. Qualquer resposta não-2xx devolve os créditos (withRefundOnFailure).
    const ded = await deductCredits(user.id, credits, "creative_design", { tier, format, variants }, user.email, idempotencyKey);
    if (!ded.ok) return j(ded.status ?? 402, { error: ded.error });

    const angles = VARIATION_ANGLES.slice(0, variants);
    const outputs = await Promise.all(
      angles.map((angle, i) => generateVariant(LK, buildPrompt(prompt, format, tier, angle, i, variants))),
    );
    const urls = outputs.filter((url): url is string => url !== null);
    if (urls.length === 0) {
      console.warn("[creative-design] every variant failed", { tier, format, variants });
      return j(502, { error: "design_generation_failed" });
    }

    const images: { url: string; asset_id: string | null }[] = [];
    for (const [i, url] of urls.entries()) {
      const assetId = await recordAsset(user.id, {
        tool: "design",
        prompt,
        output_url: url,
        // O lote inteiro é cobrado uma vez: o custo fica no primeiro asset.
        credits_spent: i === 0 ? credits : 0,
        metadata: { tier, format, variant: i + 1, variants, provider: "lovable_gemini" },
      });
      images.push({ url, asset_id: assetId ?? null });
    }

    return j(200, {
      ok: true,
      tier,
      format,
      credits_spent: credits,
      images,
      failed_variants: variants - urls.length,
    });
  } catch (e) {
    console.error("[creative-design] error:", e);
    return j(500, { error: sanitizeError(e) });
  }
}));

function buildPrompt(
  prompt: string,
  format: keyof typeof FORMATS,
  tier: keyof typeof TIERS,
  angle: string,
  index: number,
  variants: number,
): string {
  return [
    `Crie um design profissional ${FORMATS[format]}.`,
    `Pedido do cliente: "${prompt}".`,
    TIER_DIRECTIVES[tier],
    variants > 1 ? `Variação ${index + 1} de ${variants}: ${angle}.` : "",
  ].filter(Boolean).join(" ");
}

/** Uma variação. Devolve a URL (ou data URL) da imagem, ou null se o gateway falhar. */
async function generateVariant(apiKey: string, text: string): Promise<string | null> {
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        messages: [{ role: "user", content: text }],
        modalities: ["image", "text"],
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      console.warn("[creative-design] gateway failed:", r.status, data?.error?.message);
      return null;
    }
    return data?.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? null;
  } catch (e) {
    console.warn("[creative-design] variant error:", e);
    return null;
  }
}

function j(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
