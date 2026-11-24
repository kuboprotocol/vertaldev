// Downloader Universal — usa a API do cobalt.tools (formato atual: POST / com campo `status`).
// Para produção, aponte COBALT_API_URL para uma instância própria (o host público tem proteção anti-bot
// e não é destinado a outros projetos). COBALT_API_KEY é enviado como "Api-Key" quando configurado.
import { corsHeaders } from "../_shared/cors.ts";
import { getUser, deductCredits, recordAsset, sanitizeError, withRefundOnFailure } from "../_shared/creative.ts";
import { validatePublicUrl } from "../_shared/security.ts";

const COST = 2;
const COBALT = Deno.env.get("COBALT_API_URL") ?? "https://api.cobalt.tools/";
const COBALT_KEY = Deno.env.get("COBALT_API_KEY") ?? "";

type CobaltResponse = {
  status?: "tunnel" | "redirect" | "picker" | "local-processing" | "error";
  url?: string;
  picker?: { type: string; url: string }[];
  error?: { code?: string };
};

/** Extrai o link final da resposta do cobalt. Retorna null quando não há um link único utilizável. */
export function extractDownloadUrl(data: CobaltResponse): string | null {
  if ((data.status === "tunnel" || data.status === "redirect") && typeof data.url === "string") return data.url;
  // Carrossel (picker): usa o primeiro vídeo, se houver.
  if (data.status === "picker" && Array.isArray(data.picker)) {
    const first = data.picker.find((p) => p.type === "video") ?? data.picker[0];
    return first?.url ?? null;
  }
  return null;
}

Deno.serve(withRefundOnFailure(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const user = await getUser(req.headers.get("Authorization"));
  if (!user) return j(401, { error: "Unauthorized" });

  const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? undefined;
  try {
    const { url: rawUrl, format = "mp4" } = await req.json();
    if (!rawUrl) return j(400, { error: "url required" });
    const url = validatePublicUrl(rawUrl).toString();
    const isAudio = format === "mp3";

    const ded = await deductCredits(user.id, COST, "creative_download", { url, format }, user.email, idempotencyKey);
    if (!ded.ok) return j((ded as any).status ?? 402, { error: ded.error });

    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    if (COBALT_KEY) headers.Authorization = `Api-Key ${COBALT_KEY}`;

    const r = await fetch(COBALT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        url,
        downloadMode: isAudio ? "audio" : "auto",
        audioFormat: "mp3",
        videoQuality: "720",
      }),
    });
    const data: CobaltResponse = await r.json().catch(() => ({}));
    const downloadUrl = extractDownloadUrl(data);

    const assetId = await recordAsset(user.id, {
      tool: "downloader",
      prompt: url,
      output_url: downloadUrl ?? undefined,
      credits_spent: COST,
      metadata: { format, status: data.status ?? null, error: data.error?.code ?? null, http: r.status },
      status: downloadUrl ? "completed" : "failed",
    });

    if (!downloadUrl) {
      return j(502, {
        error: "Não foi possível obter o link de download.",
        details: { status: data.status ?? null, code: data.error?.code ?? null, http: r.status },
        asset_id: assetId,
      });
    }

    return j(200, { ok: true, download_url: downloadUrl, asset_id: assetId });
  } catch (e) {
    console.error("[creative-download] error:", e);
    return j(500, { error: sanitizeError(e) });
  }
}));

function j(s: number, b: unknown) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
