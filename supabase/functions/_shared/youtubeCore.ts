// Mídia no Vertal Chat (Vertal Navigator, fase 3): tocar YouTube num player
// embutido (IFrame Player do YouTube, domínio youtube-nocookie.com).
// Busca pela YouTube Data API v3 quando o Worker tem YOUTUBE_API_KEY; sem chave,
// o agente acha o link pelo Navigator (ou o usuário cola) e toca pela URL.
// Puro: usado pelo contrato do chat, pelo Worker (/api/media/youtube) e pelo front.

export interface YoutubeVideo {
  id: string;
  title: string;
  channel: string;
  thumbnail?: string;
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
export const isYoutubeVideoId = (v: unknown): v is string => typeof v === "string" && VIDEO_ID_RE.test(v);

/** Id do vídeo a partir de um link do YouTube (watch, youtu.be, shorts, embed, live, music). null se não for. */
export function youtubeVideoId(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (isYoutubeVideoId(s)) return s;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname);
      id = m ? m[1] : null;
    }
  }
  return isYoutubeVideoId(id) ? id : null;
}

/** URL do player embutido (IFrame Player API habilitada; sem cookies de rastreio). */
export function youtubeEmbedUrl(id: string, opts: { autoplay?: boolean; origin?: string } = {}): string {
  if (!isYoutubeVideoId(id)) throw new Error("invalid_video_id");
  const p = new URLSearchParams({ enablejsapi: "1", playsinline: "1", rel: "0", modestbranding: "1" });
  if (opts.autoplay) p.set("autoplay", "1");
  if (opts.origin) p.set("origin", opts.origin);
  return `https://www.youtube-nocookie.com/embed/${id}?${p.toString()}`;
}

export const youtubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export const YOUTUBE_LIMITS = { maxQuery: 200, maxResults: 8 } as const;

/** URL da busca na YouTube Data API v3 (search.list, só vídeos incorporáveis). */
export function youtubeSearchApiUrl(query: string, apiKey: string, max = 5, regionCode = "BR"): string {
  const p = new URLSearchParams({
    part: "snippet", type: "video", videoEmbeddable: "true", safeSearch: "moderate", regionCode, relevanceLanguage: "pt",
    maxResults: String(Math.max(1, Math.min(max, YOUTUBE_LIMITS.maxResults))), q: query.slice(0, YOUTUBE_LIMITS.maxQuery), key: apiKey,
  });
  return `https://www.googleapis.com/youtube/v3/search?${p.toString()}`;
}

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Resposta do search.list → vídeos válidos (descarta o que não tem id de vídeo). */
export function parseYoutubeSearch(json: unknown): YoutubeVideo[] {
  const items = (json as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const out: YoutubeVideo[] = [];
  for (const it of items) {
    const id = (it as { id?: { videoId?: unknown } })?.id?.videoId;
    const sn = (it as { snippet?: Record<string, unknown> })?.snippet ?? {};
    if (!isYoutubeVideoId(id)) continue;
    const thumbs = (sn.thumbnails ?? {}) as Record<string, { url?: unknown }>;
    const thumb = [thumbs.medium?.url, thumbs.high?.url, thumbs.default?.url].find((u) => typeof u === "string" && u.startsWith("https://"));
    out.push({
      id,
      title: decodeEntities(String(sn.title ?? "Vídeo do YouTube")).slice(0, 200),
      channel: decodeEntities(String(sn.channelTitle ?? "")).slice(0, 120),
      ...(typeof thumb === "string" ? { thumbnail: thumb } : {}),
    });
  }
  return out;
}

/** A conversa recente fala de vídeo/YouTube/tocar música? (liga a ferramenta youtube no prompt) */
const MEDIA_HINTS = /\b(youtube|you tube|yt|v[ií]deo ?clipe|clipe|toc(a|ar|e)|play|ouvir|escutar|m[uú]sica|playlist|spotify|assistir)\b/i;
export function wantsMedia(recent: Array<string | { content?: unknown; summary?: unknown; tool?: unknown }>, lookback = 6): boolean {
  return recent.slice(-lookback).some((m) => {
    if (typeof m === "string") return MEDIA_HINTS.test(m);
    if (m && typeof m === "object") {
      if (m.tool === "youtube" || m.tool === "spotify") return true;
      return MEDIA_HINTS.test(String(m.content ?? "")) || MEDIA_HINTS.test(String(m.summary ?? ""));
    }
    return false;
  });
}
