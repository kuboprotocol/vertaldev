// Cliente do cobalt (API v10+). Funções puras: sem Deno.env nem fetch global,
// para poderem ser testadas fora do runtime das Edge Functions.
//
// A API v7 (`POST /api/json`) foi desligada, e a instância pública
// api.cobalt.tools exige Turnstile/JWT — não serve para servidores de terceiros.
// O downloader precisa de uma instância própria (self-host) em COBALT_API_URL,
// com COBALT_API_KEY quando a instância exige `Authorization: Api-Key`.

export type CobaltConfig = { base: string; apiKey?: string };

/** Hosts que não aceitam chamadas de servidores de terceiros. */
const PUBLIC_HOSTS = new Set(["api.cobalt.tools", "co.wuk.sh"]);

/**
 * Normaliza COBALT_API_URL. Aceita a forma antiga `.../api/json` (v7) cortando o
 * caminho, e devolve null quando não há instância utilizável configurada.
 */
export function resolveCobaltConfig(rawUrl: string | undefined, apiKey?: string): CobaltConfig | null {
  const raw = rawUrl?.trim();
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (PUBLIC_HOSTS.has(u.hostname.toLowerCase())) return null;
  const path = u.pathname.replace(/\/api\/json\/?$/, "/").replace(/\/+$/, "");
  return { base: `${u.origin}${path}/`, apiKey: apiKey?.trim() || undefined };
}

export function buildCobaltRequest(cfg: CobaltConfig, url: string, format: string): { url: string; init: RequestInit } {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (cfg.apiKey) headers.Authorization = `Api-Key ${cfg.apiKey}`;
  const audio = format === "mp3";
  return {
    url: cfg.base,
    init: {
      method: "POST",
      headers,
      body: JSON.stringify({
        url,
        downloadMode: audio ? "audio" : "auto",
        audioFormat: "mp3",
        videoQuality: "720",
        // h264 abre em qualquer navegador (o Vertal Clips decodifica o vídeo no cliente).
        youtubeVideoCodec: "h264",
        filenameStyle: "basic",
      }),
    },
  };
}

export type CobaltResult =
  | { ok: true; url: string; filename?: string }
  | { ok: false; code: string; status: number };

type PickerItem = { type?: string; url?: string };

/** Interpreta a resposta do cobalt e traduz erros para códigos estáveis do app. */
export function parseCobaltResponse(httpStatus: number, data: unknown): CobaltResult {
  const d = (data ?? {}) as {
    status?: string;
    url?: string;
    filename?: string;
    picker?: PickerItem[];
    error?: { code?: string };
  };
  if ((d.status === "tunnel" || d.status === "redirect" || d.status === "stream") && d.url) {
    return { ok: true, url: d.url, filename: d.filename };
  }
  if (d.status === "picker" && Array.isArray(d.picker)) {
    const item = d.picker.find((p) => p.type === "video" && p.url) ?? d.picker.find((p) => p.url);
    if (item?.url) return { ok: true, url: item.url };
  }
  const code = d.error?.code ?? "";
  if (code.startsWith("error.api.auth")) return { ok: false, code: "downloader_auth_failed", status: 503 };
  if (code.startsWith("error.api.rate_exceeded")) return { ok: false, code: "rate_limit_downloader", status: 429 };
  if (code.startsWith("error.api.link") || code.startsWith("error.api.service.unsupported")) {
    return { ok: false, code: "unsupported_link", status: 422 };
  }
  if (code.startsWith("error.api.content.too_long")) return { ok: false, code: "video_too_long", status: 422 };
  if (code.startsWith("error.api.content")) return { ok: false, code: "video_unavailable", status: 422 };
  if (code.startsWith("error.api.youtube.login") || code.startsWith("error.api.youtube.decipher") || code.startsWith("error.api.fetch")) {
    return { ok: false, code: "platform_blocked", status: 502 };
  }
  if (httpStatus === 404 || httpStatus === 405) return { ok: false, code: "downloader_not_configured", status: 503 };
  return { ok: false, code: "download_failed", status: 502 };
}
