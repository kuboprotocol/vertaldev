/**
 * Spotify iFrame Embed API (https://developer.spotify.com/documentation/embeds/references/iframe-api).
 * Não usa a Web API nem OAuth: só o player embutido, que manda eventos `playback_update`.
 * Quem não está logado no Spotify ouve prévias de ~30 s.
 */
export const SPOTIFY_IFRAME_API_SRC = "https://open.spotify.com/embed/iframe-api/v1";

export interface SpotifyPlaybackUpdate {
  data: {
    position: number;
    duration: number;
    isPaused: boolean;
    isBuffering: boolean;
    playingURI?: string;
  };
}

export interface SpotifyEmbedController {
  loadUri(uri: string): void;
  play(): void;
  pause(): void;
  resume(): void;
  togglePlay(): void;
  destroy(): void;
  addListener(event: "ready", cb: () => void): void;
  addListener(event: "playback_update", cb: (e: SpotifyPlaybackUpdate) => void): void;
}

export interface SpotifyIFrameAPI {
  createController(
    element: HTMLElement,
    options: { uri: string; width?: string | number; height?: string | number },
    callback: (controller: SpotifyEmbedController) => void,
  ): void;
}

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIFrameAPI) => void;
    __vertalSpotifyIframeApi?: SpotifyIFrameAPI;
  }
}

let loading: Promise<SpotifyIFrameAPI> | null = null;

/** Carrega o script uma vez por página e devolve a API. */
export function loadSpotifyIframeApi(timeoutMs = 15000): Promise<SpotifyIFrameAPI> {
  if (typeof window === "undefined") return Promise.reject(new Error("no_window"));
  if (window.__vertalSpotifyIframeApi) return Promise.resolve(window.__vertalSpotifyIframeApi);
  if (loading) return loading;
  loading = new Promise<SpotifyIFrameAPI>((resolve, reject) => {
    const timer = setTimeout(() => {
      loading = null;
      reject(new Error("spotify_iframe_api_timeout"));
    }, timeoutMs);
    const previous = window.onSpotifyIframeApiReady;
    window.onSpotifyIframeApiReady = (api) => {
      clearTimeout(timer);
      window.__vertalSpotifyIframeApi = api;
      previous?.(api);
      resolve(api);
    };
    if (!document.querySelector(`script[src="${SPOTIFY_IFRAME_API_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = SPOTIFY_IFRAME_API_SRC;
      script.async = true;
      script.onerror = () => {
        clearTimeout(timer);
        loading = null;
        reject(new Error("spotify_iframe_api_failed"));
      };
      document.body.appendChild(script);
    }
  });
  return loading;
}

// ---------------------------------------------------------------------------
// Celular (iPhone/Android): política de autoplay.
//
// O navegador do celular só deixa o iframe do Spotify tocar COM SOM depois de um toque
// DENTRO do próprio iframe. `controller.play()` (postMessage da página) não é gesto do
// usuário lá dentro: no iOS o play é bloqueado ou fica sem som, e o loadUri() recarrega o
// iframe (perde qualquer ativação). No celular o embed também roda sempre em modo prévia
// (~30 s). Por isso, em toque: nunca chamar play(); o usuário toca no botão do player.
// ---------------------------------------------------------------------------

export interface PlaybackEnv {
  userAgent?: string;
  maxTouchPoints?: number;
  /** `(pointer: coarse)`: o ponteiro principal é o dedo. */
  coarsePointer?: boolean;
  /** `(any-pointer: fine)`: existe mouse/trackpad. */
  finePointer?: boolean;
}

export function readPlaybackEnv(): PlaybackEnv {
  if (typeof window === "undefined" || typeof navigator === "undefined") return {};
  const mq = (q: string) => {
    try {
      return typeof window.matchMedia === "function" && window.matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    coarsePointer: mq("(pointer: coarse)"),
    finePointer: mq("(any-pointer: fine)"),
  };
}

/** iPhone/iPod/iPad, incluindo o iPadOS que se apresenta como "Macintosh" com tela de toque. */
export function isIOSDevice(env: PlaybackEnv): boolean {
  const ua = env.userAgent ?? "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && (env.maxTouchPoints ?? 0) > 1;
}

/** Celular/tablet: o som só sai depois de um toque dentro do player. */
export function isTouchPlaybackDevice(env: PlaybackEnv): boolean {
  const ua = env.userAgent ?? "";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  if (isIOSDevice(env)) return true;
  return Boolean(env.coarsePointer && !env.finePointer);
}

/** A página pode dar play() pelo postMessage? Só no computador. */
export function canAutoPlayEmbed(env: PlaybackEnv): boolean {
  return !isTouchPlaybackDevice(env);
}

/** 152 = player compacto (computador). No celular, o player padrão (352) com botão de play grande. */
export const SPOTIFY_EMBED_HEIGHT_COMPACT = 152;
export const SPOTIFY_EMBED_HEIGHT_TOUCH = 352;

export function embedHeightFor(touch: boolean): number {
  return touch ? SPOTIFY_EMBED_HEIGHT_TOUCH : SPOTIFY_EMBED_HEIGHT_COMPACT;
}

/** Permissões que o iframe do Spotify precisa: som (autoplay) e áudio protegido (EME). */
export const SPOTIFY_IFRAME_REQUIRED_ALLOW = ["autoplay", "encrypted-media"] as const;

/** Junta as permissões que faltam ao atributo `allow`, sem remover as que já existem. */
export function mergeIframeAllow(current: string | null | undefined): string {
  const parts = (current ?? "")
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  const names = new Set(parts.map((p) => p.split(/\s+/)[0].toLowerCase()));
  for (const feature of SPOTIFY_IFRAME_REQUIRED_ALLOW) {
    if (!names.has(feature)) parts.push(feature);
  }
  return parts.join("; ");
}

/**
 * Ajusta o iframe criado pela iFrame API: garante `allow` com autoplay + encrypted-media e
 * troca `loading="lazy"` por `eager` (no celular o card fica abaixo da dobra, dentro de um
 * bloco animado com opacity/transform, e o iframe preguiçoso podia nem carregar).
 */
export function hardenSpotifyIframe(host: ParentNode | null): HTMLIFrameElement | null {
  const iframe = host?.querySelector("iframe") ?? null;
  if (!iframe) return null;
  const allow = iframe.getAttribute("allow");
  const merged = mergeIframeAllow(allow);
  if (merged !== allow) iframe.setAttribute("allow", merged);
  if (iframe.getAttribute("loading") !== "eager") iframe.setAttribute("loading", "eager");
  iframe.style.display = "block";
  iframe.style.border = "0";
  return iframe;
}

/** Link público da faixa (fallback "Open in Spotify"). */
export const spotifyTrackUrl = (trackId: string) => `https://open.spotify.com/track/${trackId}`;
