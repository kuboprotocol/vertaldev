// Downloader Universal — usa uma instância própria do cobalt (API v10+).
// Configuração: COBALT_API_URL (ex.: https://cobalt.seudominio.com/) e,
// se a instância exigir, COBALT_API_KEY. Ver docs/COBALT_DOWNLOADER.md.
import { corsHeaders } from "../_shared/cors.ts";
import { getUser, deductCredits, recordAsset, sanitizeError, withRefundOnFailure } from "../_shared/creative.ts";
import { validatePublicUrl } from "../_shared/security.ts";
import { buildCobaltRequest, parseCobaltResponse, resolveCobaltConfig } from "../_shared/cobalt.ts";

const COST = 2;
const TIMEOUT_MS = 45_000;

Deno.serve(withRefundOnFailure(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const user = await getUser(req.headers.get("Authorization"));
  if (!user) return j(401, { error: "Unauthorized" });

  const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? undefined;
  try {
    const { url: rawUrl, format = "mp4" } = await req.json();
    if (!rawUrl) return j(400, { error: "url required" });
    const url = validatePublicUrl(rawUrl).toString();

    // Sem instância configurada não há o que cobrar: falha antes de debitar.
    const cfg = resolveCobaltConfig(Deno.env.get("COBALT_API_URL"), Deno.env.get("COBALT_API_KEY"));
    if (!cfg) {
      console.error("[creative-download] COBALT_API_URL ausente ou aponta para a instância pública (desativada para terceiros).");
      return j(503, { error: "downloader_not_configured" });
    }

    const ded = await deductCredits(user.id, COST, "creative_download", { url, format }, user.email, idempotencyKey);
    if (!ded.ok) return j((ded as any).status ?? 402, { error: ded.error });

    const call = buildCobaltRequest(cfg, url, format);
    let httpStatus = 0;
    let data: unknown = {};
    try {
      const r = await fetch(call.url, { ...call.init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      httpStatus = r.status;
      data = await r.json().catch(() => ({}));
    } catch (e) {
      console.error("[creative-download] cobalt indisponível:", e);
      return j(504, { error: "downloader_unavailable" });
    }
    const result = parseCobaltResponse(httpStatus, data);

    const assetId = await recordAsset(user.id, {
      tool: "downloader",
      prompt: url,
      output_url: result.ok ? result.url : undefined,
      credits_spent: result.ok ? COST : 0,
      metadata: { format, ...(result.ok ? { filename: result.filename } : { error: result.code, raw: data }) },
      status: result.ok ? "completed" : "failed",
    });

    if (!result.ok) {
      console.error("[creative-download] falha:", httpStatus, JSON.stringify(data));
      return j(result.status, { error: result.code, asset_id: assetId });
    }

    return j(200, { ok: true, download_url: result.url, filename: result.filename, asset_id: assetId });
  } catch (e) {
    console.error("[creative-download] error:", e);
    return j(500, { error: sanitizeError(e) });
  }
}));

function j(s: number, b: unknown) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
