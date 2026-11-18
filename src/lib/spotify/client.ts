// Cliente da API do Spotify servida pelo Worker do vertal.dev (/api/spotify/*).
// Envia o JWT da sessão do Supabase; os tokens do Spotify ficam só no servidor.
import { supabase } from '@/integrations/supabase/client';
import { SPOTIFY_ERROR_MESSAGES, type SpotifyErrorCode, type SpotifyTrack } from './spotifyCore';

export type SpotifyActionResponse = {
  ok?: boolean;
  code?: SpotifyErrorCode;
  message?: string;
  tracks?: SpotifyTrack[];
  summary?: string;
  connected?: boolean;
  display_name?: string | null;
};

const PRODUCTION_ORIGIN = 'https://vertal.dev';

/**
 * No vertal.dev a API é do mesmo domínio. Em outros lugares (localhost, previews,
 * app nativo) não existe o Worker, então chama o vertal.dev (o CORS libera essas origens).
 */
export function spotifyApiBase(
  location: Pick<Location, 'hostname'> | undefined = typeof window !== 'undefined' ? window.location : undefined,
  override: string | undefined = import.meta.env.VITE_SPOTIFY_API_BASE,
): string {
  if (override) return override.replace(/\/+$/, '');
  const host = location?.hostname ?? '';
  return host === 'vertal.dev' || host === 'www.vertal.dev' ? '/api/spotify' : `${PRODUCTION_ORIGIN}/api/spotify`;
}

async function post<T>(path: 'start' | 'action', body: Record<string, unknown>): Promise<{ data: T | null; status: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { data: null, status: 401 };
  try {
    const res = await fetch(`${spotifyApiBase()}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    return { data: (await res.json().catch(() => null)) as T | null, status: res.status };
  } catch {
    return { data: null, status: 0 };
  }
}

/** Ações do Spotify (status, search, play…). Sempre devolve o mesmo formato, mesmo se o HTTP falhar. */
export async function callSpotify(body: Record<string, unknown>): Promise<SpotifyActionResponse> {
  const { data, status } = await post<SpotifyActionResponse>('action', body);
  if (data) return data;
  if (status === 401) return { ok: false, code: 'reauth_required', message: 'Entre na sua conta para usar o Spotify.' };
  return { ok: false, code: 'spotify_unavailable', message: SPOTIFY_ERROR_MESSAGES.spotify_unavailable };
}

/** Inicia o OAuth e devolve a URL de consentimento do Spotify, ou null se falhar. */
export async function startSpotifyConnect(returnUrl: string, origin: string): Promise<string | null> {
  const { data } = await post<{ url?: string }>('start', { returnUrl, origin });
  return data?.url ?? null;
}
