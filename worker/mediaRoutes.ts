// Mídia do Vertal Chat (Vertal Navigator, fase 3):
//   POST /api/media/youtube  {query, max?}  → busca vídeos incorporáveis na YouTube Data API v3
// Auth: JWT do Supabase. Chave: segredo YOUTUBE_API_KEY no Worker (opcional).
// Sem chave → {ok:false, status:"not_configured"}: o agente acha o link pelo
// Navigator (ou o usuário cola) e toca pela URL, sem busca.
import { createRateLimiter } from '../supabase/functions/_shared/browserForm';
import { YOUTUBE_LIMITS, parseYoutubeSearch, youtubeSearchApiUrl } from '../supabase/functions/_shared/youtubeCore.ts';
import { isAllowedOrigin } from './spotifyRoutes';
import { getUserId, type SupabaseEnv } from './supabaseRest';

export const MEDIA_API_PREFIX = '/api/media';

export interface MediaEnv extends SupabaseEnv {
  /** Chave da YouTube Data API v3 (Google Cloud → APIs → YouTube Data API v3). Opcional. */
  YOUTUBE_API_KEY?: string;
}

const searchLimiter = createRateLimiter(30, 10 * 60_000);

function headers(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  const h: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
  };
  if (isAllowedOrigin(origin)) h['Access-Control-Allow-Origin'] = origin as string;
  return h;
}

const reply = (request: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: headers(request) });

export async function handleMedia(request: Request, env: MediaEnv, url: URL): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(request) });
  if (request.method !== 'POST' || url.pathname.replace(/\/+$/, '') !== `${MEDIA_API_PREFIX}/youtube`) return reply(request, { ok: false, status: 'bad_request' }, 404);
  let userId: string | null = null;
  try {
    userId = await getUserId(env, request.headers.get('Authorization'));
  } catch {
    return reply(request, { ok: false, status: 'not_configured' }, 503);
  }
  if (!userId) return reply(request, { ok: false, status: 'unauthorized' }, 401);
  if (!env.YOUTUBE_API_KEY) return reply(request, { ok: false, status: 'not_configured' });
  const body = (await request.json().catch(() => null)) as { query?: unknown; max?: unknown } | null;
  const query = typeof body?.query === 'string' ? body.query.trim().slice(0, YOUTUBE_LIMITS.maxQuery) : '';
  if (query.length < 2) return reply(request, { ok: false, status: 'bad_request' }, 400);
  if (!searchLimiter.take(userId)) return reply(request, { ok: false, status: 'rate_limited' }, 429);
  const max = Number.isFinite(Number(body?.max)) ? Number(body?.max) : 5;
  const res = await fetch(youtubeSearchApiUrl(query, env.YOUTUBE_API_KEY, max)).catch(() => null);
  if (!res?.ok) {
    console.error('media: youtube search falhou', res?.status);
    return reply(request, { ok: false, status: res?.status === 403 ? 'quota' : 'error' }, 502);
  }
  return reply(request, { ok: true, status: 'ok', videos: parseYoutubeSearch(await res.json().catch(() => null)) });
}
