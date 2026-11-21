// YouTube no Vertal Chat (fase 3): busca pelo Worker do vertal.dev (/api/media/youtube,
// chave YOUTUBE_API_KEY só no servidor) e player embutido (IFrame Player, youtube-nocookie).
import { supabase } from '@/integrations/supabase/client';
import type { YoutubeVideo } from '../../../supabase/functions/_shared/youtubeCore';

export * from '../../../supabase/functions/_shared/youtubeCore';

export interface YoutubeSearchResponse {
  ok: boolean;
  status: 'ok' | 'not_configured' | 'unauthorized' | 'rate_limited' | 'quota' | 'bad_request' | 'error';
  videos?: YoutubeVideo[];
}

/** Mesmo esquema do Navigator: no vertal.dev é o mesmo domínio; fora dele chama o vertal.dev. */
export function mediaApiBase(
  location: Pick<Location, 'hostname'> | undefined = typeof window !== 'undefined' ? window.location : undefined,
  override: string | undefined = import.meta.env.VITE_BROWSER_API_BASE,
): string {
  if (override) return `${override.replace(/\/+$/, '').replace(/\/api\/browser$/, '')}/api/media`;
  const host = location?.hostname ?? '';
  return host === 'vertal.dev' || host === 'www.vertal.dev' ? '/api/media' : 'https://vertal.dev/api/media';
}

export async function searchYoutube(query: string, max = 5): Promise<YoutubeSearchResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, status: 'unauthorized' };
  try {
    const res = await fetch(`${mediaApiBase()}/youtube`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ query, max }),
    });
    const data = (await res.json().catch(() => null)) as YoutubeSearchResponse | null;
    if (data && typeof data.status === 'string') return data;
    return { ok: false, status: res.status === 404 ? 'not_configured' : 'error' };
  } catch {
    return { ok: false, status: 'error' };
  }
}
