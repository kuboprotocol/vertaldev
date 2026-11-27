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
