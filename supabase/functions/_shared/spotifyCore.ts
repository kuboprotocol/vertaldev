// Núcleo puro do conector Spotify: URL de autorização, normalização de IDs,
// mapeamento de faixas e de erros. Sem APIs do Deno nem do DOM, para que o
// front-end (re-export em src/lib/spotify) e as edge functions usem a mesma regra.
//
// Adaptado de hermes-official-plugins/spotify (MIT, NousResearch), reescrito
// para o modelo do Vertal: OAuth no servidor com client secret, tokens
// criptografados e ações de chat em vez de ferramentas de agente.

export const SPOTIFY_ACCOUNTS_URL = "https://accounts.spotify.com";
export const SPOTIFY_API_URL = "https://api.spotify.com/v1";

/** Escopos mínimos: busca não precisa de escopo; controle e leitura do player precisam. */
export const SPOTIFY_SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
] as const;

export const SPOTIFY_SCOPE_STRING = SPOTIFY_SCOPES.join(" ");

/** Operações que o chat e a tela de conexão podem pedir ao servidor. */
export const SPOTIFY_OPS = [
  "status",
  "search",
  "play",
  "queue",
  "pause",
  "next",
  "previous",
  "now_playing",
  "devices",
  "disconnect",
] as const;
export type SpotifyOp = (typeof SPOTIFY_OPS)[number];

/** Operações que dependem de um aparelho Spotify Connect ativo (e de Premium). */
export const SPOTIFY_PLAYER_OPS: ReadonlySet<SpotifyOp> = new Set<SpotifyOp>([
  "play", "queue", "pause", "next", "previous",
]);

export interface SpotifyTrack {
  id: string;
  uri: string;
  title: string;
  artist: string;
  album: string;
  imageUrl?: string;
  durationMs: number;
}

/** Códigos estáveis de erro: o servidor devolve o código, o cliente escolhe a mensagem. */
export type SpotifyErrorCode =
  | "not_connected"
  | "reauth_required"
  | "no_active_device"
  | "premium_required"
  | "not_found"
  | "rate_limited"
  | "bad_request"
  | "spotify_unavailable";

export const SPOTIFY_ERROR_MESSAGES: Record<SpotifyErrorCode, string> = {
  not_connected: "O Spotify não está conectado. Conecte em Conectores.",
  reauth_required: "A conexão com o Spotify expirou. Conecte de novo em Conectores.",
  no_active_device: "Nenhum aparelho do Spotify está tocando agora. Abra o Spotify no celular ou no computador e tente de novo.",
  premium_required: "Controlar a reprodução exige Spotify Premium. Para ouvir sem Premium, use a busca: as faixas tocam no próprio chat.",
  not_found: "O Spotify não encontrou isso.",
  rate_limited: "O Spotify pediu para esperar um pouco. Tente de novo em instantes.",
  bad_request: "Pedido inválido para o Spotify.",
  spotify_unavailable: "Não foi possível falar com o Spotify agora.",
};

/** Gera a URL de consentimento do Spotify (Authorization Code, com state anti-CSRF). */
export function buildSpotifyAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  accountsBaseUrl?: string;
}): string {
  const base = params.accountsBaseUrl ?? SPOTIFY_ACCOUNTS_URL;
  const search = new URLSearchParams({
    client_id: params.clientId,
    response_type: "code",
    redirect_uri: params.redirectUri,
    scope: SPOTIFY_SCOPE_STRING,
    state: params.state,
    show_dialog: "false",
  });
  return `${base}/authorize?${search.toString()}`;
}

const BARE_ID = /^[A-Za-z0-9]{22}$/;

/**
 * Aceita um id de faixa, um URI `spotify:track:<id>` ou uma URL
 * `open.spotify.com/[intl-xx/]track/<id>` e devolve só o id. Null se não reconhecer.
 */
export function extractTrackId(input: string | null | undefined): string | null {
  const cleaned = (input ?? "").trim();
  if (!cleaned) return null;
  if (BARE_ID.test(cleaned)) return cleaned;
  const uri = /^spotify:track:([A-Za-z0-9]{22})$/.exec(cleaned);
  if (uri) return uri[1];
  try {
    const url = new URL(cleaned);
    if (url.hostname !== "open.spotify.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const at = parts[0]?.startsWith("intl-") ? 1 : 0;
    if (parts[at] !== "track" || !parts[at + 1]) return null;
    const id = parts[at + 1];
    return BARE_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** URL do player embutido do Spotify (funciona sem Premium). */
export function spotifyEmbedUrl(trackId: string): string {
  return `https://open.spotify.com/embed/track/${encodeURIComponent(trackId)}?utm_source=vertal`;
}

/** Limita o número de resultados ao intervalo aceito pelo chat. */
export function clampSearchLimit(raw: unknown, fallback = 5, max = 10): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(n)));
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null;

/** Converte uma faixa crua da Web API em SpotifyTrack. Null se faltar id ou título. */
export function mapSpotifyTrack(raw: unknown): SpotifyTrack | null {
  if (!isObj(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  const title = typeof raw.name === "string" ? raw.name : "";
  if (!id || !title) return null;
  const artists = Array.isArray(raw.artists) ? raw.artists : [];
  const artist = artists
    .map((a) => (isObj(a) && typeof a.name === "string" ? a.name : ""))
    .filter(Boolean)
    .join(", ");
  const album = isObj(raw.album) ? raw.album : {};
  const images = Array.isArray(album.images) ? album.images : [];
  const firstImage = images.find((img) => isObj(img) && typeof img.url === "string") as Json | undefined;
  return {
    id,
    uri: typeof raw.uri === "string" ? raw.uri : `spotify:track:${id}`,
    title,
    artist: artist || "Artista desconhecido",
    album: typeof album.name === "string" ? album.name : "",
    imageUrl: firstImage ? (firstImage.url as string) : undefined,
    durationMs: typeof raw.duration_ms === "number" ? raw.duration_ms : 0,
  };
}

/** Extrai as faixas de uma resposta de /search?type=track. */
export function parseSearchTracks(payload: unknown): SpotifyTrack[] {
  if (!isObj(payload) || !isObj(payload.tracks)) return [];
  const items = Array.isArray(payload.tracks.items) ? payload.tracks.items : [];
  return items.map(mapSpotifyTrack).filter((t): t is SpotifyTrack => t !== null);
}

/** Traduz o status HTTP da Web API no código de erro do conector. */
export function spotifyErrorCode(status: number, op: SpotifyOp): SpotifyErrorCode {
  if (status === 401) return "reauth_required";
  if (status === 403) return SPOTIFY_PLAYER_OPS.has(op) ? "premium_required" : "bad_request";
  if (status === 404) return SPOTIFY_PLAYER_OPS.has(op) ? "no_active_device" : "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 400 && status < 500) return "bad_request";
  return "spotify_unavailable";
}

/** Texto curto para o modelo e para o toast, a partir de uma lista de faixas. */
export function describeTracks(tracks: SpotifyTrack[]): string {
  if (tracks.length === 0) return "Nenhuma faixa encontrada.";
  return tracks
    .map((t, i) => `${i + 1}. ${t.title} — ${t.artist}${t.album ? ` (${t.album})` : ""} [id:${t.id}]`)
    .join("\n");
}
