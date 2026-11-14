// Downloader Universal — usa uma instância do cobalt (https://github.com/imputnet/cobalt).
// O endpoint legado /api/json (cobalt v7) foi desligado; a API atual (v10+) é POST na raiz da instância
// e a instância pública exige chave. Configure COBALT_API_URL (e COBALT_API_KEY se a instância pedir).
import { corsHeaders } from "../_shared/cors.ts";
import { getUser, deductCredits, recordAsset, sanitizeError, withRefundOnFailure } from "../_shared/creative.ts";
import { validatePublicUrl } from "../_shared/security.ts";

const COST = 2;
const COBALT = Deno.env.get("COBALT_API_URL") ?? "https://api.cobalt.tools/";
const COBALT_KEY = Deno.env.get("COBALT_API_KEY");
const LEGACY = /\/api\/json\/?$/.test(COBALT);

Deno.serve(withRefundOnFailure(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const user = await getUser(req.headers.get("Authorization"));
  if (!user) return j(401, { error: "Unauthorized" });

  const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? undefined;
  try {
    const { url: rawUrl, format = "mp4" } = await req.json();
    if (!rawUrl) return j(400, { error: "url required" });
    const url = validatePublicUrl(rawUrl).toString();

    const ded = await deductCredits(user.id, COST, "creative_download", { url, format }, user.email, idempotencyKey);
    if (!ded.ok) return j((ded as any).status ?? 402, { error: ded.error });

    const audio = format === "mp3";
    const r = await fetch(COBALT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(COBALT_KEY ? { Authorization: `Api-Key ${COBALT_KEY}` } : {}),
      },
      body: JSON.stringify(LEGACY
        ? { url, isAudioOnly: audio, aFormat: "mp3", vQuality: "720" }
        : { url, downloadMode: audio ? "audio" : "auto", audioFormat: "mp3", videoQuality: "720" }),
    }).catch((e) => {
      console.error("[creative-download] cobalt unreachable:", e);
      return null;
    });
    const data = await r?.json().catch(() => ({})) ?? {};
    const downloadUrl = pickDownloadUrl(data, audio);

    const assetId = await recordAsset(user.id, {
      tool: "downloader",
      prompt: url,
      output_url: downloadUrl ?? undefined,
      credits_spent: COST,
      metadata: { format, raw: data },
      status: downloadUrl ? "completed" : "failed",
    });

    if (!downloadUrl) {
      const code = String(data?.error?.code ?? data?.text ?? "");
      console.warn("[creative-download] no url:", r?.status, code);
      // auth/jwt errors mean the instance needs COBALT_API_KEY (or isn't configured): not the user's fault.
      const unavailable = !r || r.status === 401 || r.status === 403 || r.status === 404 || /auth|jwt|api\.key/i.test(code);
      return j(502, {
        error: unavailable ? "import_unavailable" : "Não foi possível obter o link de download.",
        details: code || undefined,
        asset_id: assetId,
      });
    }

    return j(200, { ok: true, download_url: downloadUrl, asset_id: assetId });
  } catch (e) {
    console.error("[creative-download] error:", e);
    return j(500, { error: sanitizeError(e) });
  }
}));

/** Handles both cobalt v10 (tunnel/redirect/picker) and v7 (stream/redirect/picker) answers. */
function pickDownloadUrl(data: any, audio: boolean): string | null {
  if (!data || data.status === "error") return null;
  if (typeof data.url === "string" && data.url) return data.url;
  if (data.status === "picker" && Array.isArray(data.picker)) {
    if (audio && typeof data.audio === "string") return data.audio;
    const item = data.picker.find((p: any) => p?.type === "video") ?? data.picker[0];
    if (typeof item?.url === "string") return item.url;
  }
  return typeof data?.data?.url === "string" ? data.data.url : null;
}

function j(s: number, b: unknown) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
