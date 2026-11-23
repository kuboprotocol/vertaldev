// API do conector Spotify no Worker do vertal.dev (antes eram 3 edge functions do
// Supabase, que bateram no limite de funções do plano):
//   POST /api/spotify/start     → grava o state anti-CSRF e devolve a URL de consentimento
//   GET  /api/spotify/callback  → valida o state, troca o code e guarda os tokens criptografados
//   POST /api/spotify/action    → status, search, play, queue, pause, next, previous,
//                                 now_playing, devices, disconnect
// Os tokens do Spotify nunca saem do servidor. O banco continua sendo o Supabase.
import {
  buildSpotifyAuthorizeUrl, clampSearchLimit, describeTracks, extractTrackId, mapSpotifyTrack,
  parseSearchTracks, SPOTIFY_ERROR_MESSAGES, SPOTIFY_OPS, type SpotifyErrorCode, type SpotifyOp,
  type SpotifyTrack,
} from '../src/lib/spotify/spotifyCore';
import {
  accountRow, accounts, exchangeAuthCode, getFreshAccessToken, SpotifyApiError, spotifyCall, type SpotifyAccountRow, type SpotifyEnv,
} from './spotifyApi';
import { getUserId, table } from './supabaseRest';

export const SPOTIFY_API_PREFIX = '/api/spotify';

export interface SpotifyRoutesEnv extends SpotifyEnv {
  /** Para onde o callback volta quando o state não indica a origem. Padrão: https://vertal.dev. */
  APP_ORIGIN?: string;
  /** Segredo compartilhado com as funções do Supabase (corretor do Vertal Fluxos). */
  NAVIGATOR_INTERNAL_TOKEN?: string;
}

/** Origens que podem chamar a API e para onde o callback pode voltar. */
const ORIGIN_ALLOWLIST: Array<string | RegExp> = [
  'https://vertal.dev',
  'https://www.vertal.dev',
  'https://vertal.app',
  /^https:\/\/[a-z0-9-]+\.vertal\.app$/i,
  'https://kubovibe.dev',
  'https://www.kubovibe.dev',
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/i,
  /^https?:\/\/localhost(:\d+)?$/i,
  'capacitor://localhost',
];

export const isAllowedOrigin = (origin: string | null | undefined): origin is string =>
  !!origin && ORIGIN_ALLOWLIST.some((rule) => (typeof rule === 'string' ? rule === origin : rule.test(origin)));

export const isSafeReturnUrl = (ret: string) => /^\/[A-Za-z0-9/_\-?=&%.]*$/.test(ret) && !ret.startsWith('//');

const appOrigin = (env: SpotifyRoutesEnv) => env.APP_ORIGIN || 'https://vertal.dev';

/** Precisa ser idêntica à cadastrada em developer.spotify.com (Redirect URIs). */
export const redirectUriFor = (env: SpotifyRoutesEnv) =>
  env.SPOTIFY_REDIRECT_URI || `${appOrigin(env)}${SPOTIFY_API_PREFIX}/callback`;

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const redirect = (to: string) => new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'no-store' } });

// Erros de negócio voltam com HTTP 200 e ok:false: o cliente trata sempre o mesmo formato.
const fail = (request: Request, code: SpotifyErrorCode) =>
  json(request, { ok: false, code, message: SPOTIFY_ERROR_MESSAGES[code] });

const isConfigured = (env: SpotifyEnv) =>
  Boolean(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET && env.SPOTIFY_TOKEN_ENC_KEY
    && env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY && env.SUPABASE_SECRET_KEY);

export async function handleSpotify(request: Request, env: SpotifyRoutesEnv, url: URL): Promise<Response> {
  const route = url.pathname.slice(SPOTIFY_API_PREFIX.length).replace(/\/+$/, '');
  try {
    if (route === '/callback' && request.method === 'GET') return await callback(env, url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
    if (request.method !== 'POST') return json(request, { ok: false, code: 'bad_request', message: 'Use POST.' }, 405);
    if (route === '/start') return await start(request, env);
    if (route === '/action') return await action(request, env);
    if (route === '/internal/token') return await internalToken(request, env);
    return json(request, { ok: false, code: 'bad_request', message: 'Rota desconhecida.' }, 404);
  } catch (e) {
    console.error('spotify: erro', route, e instanceof Error ? e.message : e);
    if (route === '/callback') return redirect(`${appOrigin(env)}/connectors/spotify?error=internal`);
    return json(request, { ok: false, code: 'spotify_unavailable', message: SPOTIFY_ERROR_MESSAGES.spotify_unavailable }, 500);
  }
}

async function start(request: Request, env: SpotifyRoutesEnv): Promise<Response> {
  if (!isConfigured(env)) return json(request, { error: 'spotify_not_configured' }, 503);
  const userId = await getUserId(env, request.headers.get('Authorization'));
  if (!userId) return json(request, { error: 'invalid token' }, 401);

  const body = (await request.json().catch(() => ({}))) as { returnUrl?: string; origin?: string };
  const returnUrl = body.returnUrl && isSafeReturnUrl(body.returnUrl) ? body.returnUrl : '/connectors/spotify';
  const origin = isAllowedOrigin(body.origin) ? body.origin : appOrigin(env);
  const nonce = `${crypto.randomUUID()}.${crypto.randomUUID()}`;

  await table(env, 'spotify_oauth_states').insert({ nonce, user_id: userId, origin, return_url: returnUrl });
  return json(request, {
    url: buildSpotifyAuthorizeUrl({ clientId: env.SPOTIFY_CLIENT_ID!, redirectUri: redirectUriFor(env), state: nonce }),
  });
}

type StateRow = { user_id: string; origin: string; return_url: string; expires_at: string };

async function callback(env: SpotifyRoutesEnv, url: URL): Promise<Response> {
  const fallback = `${appOrigin(env)}/connectors/spotify`;
  const code = url.searchParams.get('code');
  const nonce = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');
  if (errorParam) return redirect(`${fallback}?error=${encodeURIComponent(errorParam)}`);
  if (!code || !nonce) return redirect(`${fallback}?error=missing_code`);

  // Consome o state de forma atômica: só a primeira chamada com consumed_at nulo acha a linha.
  const [state] = await table(env, 'spotify_oauth_states').update<StateRow>(
    { nonce: `eq.${nonce}`, consumed_at: 'is.null' },
    { consumed_at: new Date().toISOString() },
  );
  if (!state) return redirect(`${fallback}?error=bad_state`);
  const back = `${isAllowedOrigin(state.origin) ? state.origin : appOrigin(env)}${isSafeReturnUrl(state.return_url) ? state.return_url : '/connectors/spotify'}`;
  if (new Date(state.expires_at).getTime() < Date.now()) return redirect(`${back}?error=state_expired`);

  try {
    const tokens = await exchangeAuthCode(env, code, redirectUriFor(env));
    const me = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    const profile = me.ok ? ((await me.json()) as { id?: string; display_name?: string }) : {};
    await accounts(env).upsert(await accountRow(env, state.user_id, tokens, profile), 'user_id');
    return redirect(`${back}?spotify=connected`);
  } catch (e) {
    // Só códigos conhecidos vão para a URL; a mensagem bruta fica no log.
    console.error('spotify callback: erro', e instanceof Error ? e.message : e);
    const reason = e instanceof SpotifyApiError ? e.code : 'token_exchange_failed';
    return redirect(`${back}?error=${encodeURIComponent(reason)}`);
  }
}

type ActionInput = { op?: string; query?: string; track?: string; max?: number };

/** Resolve a faixa de um pedido: id/URL direto ou a primeira do resultado da busca. */
async function resolveTrack(env: SpotifyEnv, account: SpotifyAccountRow, input: ActionInput): Promise<SpotifyTrack | null> {
  const direct = extractTrackId(input.track);
  if (direct) return mapSpotifyTrack((await spotifyCall(env, account, 'play', 'GET', `/tracks/${direct}`)).data);
  const query = (input.query ?? input.track ?? '').trim();
  if (!query) throw new SpotifyApiError('bad_request', 400);
  const { data } = await spotifyCall(env, account, 'search', 'GET', '/search', { query: { q: query, type: 'track', limit: 1 } });
  return parseSearchTracks(data)[0] ?? null;
}

async function action(request: Request, env: SpotifyRoutesEnv): Promise<Response> {
  if (!isConfigured(env)) return fail(request, 'spotify_unavailable');
  const userId = await getUserId(env, request.headers.get('Authorization'));
  if (!userId) return json(request, { ok: false, code: 'reauth_required', message: 'Sessão inválida.' }, 401);

  const input = (await request.json().catch(() => ({}))) as ActionInput;
  const op = String(input.op ?? '') as SpotifyOp;
  if (!(SPOTIFY_OPS as readonly string[]).includes(op)) return fail(request, 'bad_request');

  const byUser = { user_id: `eq.${userId}` };
  if (op === 'disconnect') {
    await accounts(env).delete(byUser);
    return json(request, { ok: true, op, connected: false });
  }
  const [row] = await accounts(env).select<SpotifyAccountRow>(byUser);
  if (op === 'status') {
    return json(request, row ? { ok: true, op, connected: true, display_name: row.display_name } : { ok: true, op, connected: false });
  }
  if (!row) return fail(request, 'not_connected');

  try {
    return json(request, await runOp(env, row, op, input));
  } catch (e) {
    if (e instanceof SpotifyApiError) {
      const code = (e.code in SPOTIFY_ERROR_MESSAGES ? e.code : 'spotify_unavailable') as SpotifyErrorCode;
      return fail(request, code);
    }
    throw e;
  }
}

async function runOp(env: SpotifyEnv, account: SpotifyAccountRow, op: SpotifyOp, input: ActionInput): Promise<Record<string, unknown>> {
  if (op === 'search') {
    const query = (input.query ?? '').trim();
    if (!query) throw new SpotifyApiError('bad_request', 400);
    const { data } = await spotifyCall(env, account, op, 'GET', '/search', {
      query: { q: query, type: 'track', limit: clampSearchLimit(input.max) },
    });
    const tracks = parseSearchTracks(data);
    return { ok: true, op, tracks, summary: describeTracks(tracks) };
  }

  if (op === 'play' || op === 'queue') {
    const track = await resolveTrack(env, account, input);
    if (!track) throw new SpotifyApiError('not_found', 404);
    if (op === 'play') {
      await spotifyCall(env, account, op, 'PUT', '/me/player/play', { body: { uris: [track.uri] } });
      return { ok: true, op, tracks: [track], summary: `Tocando ${track.title} — ${track.artist} no aparelho ativo.` };
    }
    await spotifyCall(env, account, op, 'POST', '/me/player/queue', { query: { uri: track.uri } });
    return { ok: true, op, tracks: [track], summary: `Adicionado à fila: ${track.title} — ${track.artist}.` };
  }

  if (op === 'pause' || op === 'next' || op === 'previous') {
    const map = { pause: ['PUT', '/me/player/pause'], next: ['POST', '/me/player/next'], previous: ['POST', '/me/player/previous'] } as const;
    const [method, path] = map[op];
    await spotifyCall(env, account, op, method, path);
    return { ok: true, op, summary: { pause: 'Pausado.', next: 'Próxima faixa.', previous: 'Faixa anterior.' }[op] };
  }

  if (op === 'now_playing') {
    const { status, data } = await spotifyCall(env, account, op, 'GET', '/me/player/currently-playing');
    if (status === 204 || !data) return { ok: true, op, playing: false, summary: 'Nada tocando agora.' };
    const d = data as { is_playing?: boolean; item?: unknown };
    const track = mapSpotifyTrack(d.item);
    return {
      ok: true, op, playing: Boolean(d.is_playing), tracks: track ? [track] : [],
      summary: track ? `${d.is_playing ? 'Tocando' : 'Pausado'}: ${track.title} — ${track.artist}.` : 'Nada tocando agora.',
    };
  }

  if (op === 'devices') {
    const { data } = await spotifyCall(env, account, op, 'GET', '/me/player/devices');
    const devices = ((data as { devices?: unknown[] })?.devices ?? []).map((d) => {
      const x = d as { id?: string; name?: string; type?: string; is_active?: boolean };
      return { id: x.id ?? '', name: x.name ?? 'Aparelho', type: x.type ?? '', active: Boolean(x.is_active) };
    });
    return {
      ok: true, op, devices,
      summary: devices.length ? devices.map((d) => `${d.name}${d.active ? ' (ativo)' : ''}`).join(', ') : 'Nenhum aparelho disponível.',
    };
  }

  throw new SpotifyApiError('bad_request', 400);
}

const sameSecret = (a: string, b: string) => {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

/**
 * Corretor do Vertal Fluxos: só o servidor do Vertal (com o segredo interno)
 * pede um access token de curta duração do Spotify de um usuário.
 */
async function internalToken(request: Request, env: SpotifyRoutesEnv): Promise<Response> {
  const secret = env.NAVIGATOR_INTERNAL_TOKEN ?? '';
  if (!secret || !sameSecret(request.headers.get('x-navigator-token') ?? '', secret)) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  if (!isConfigured(env)) return new Response(JSON.stringify({ error: 'spotify_not_configured' }), { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { user_id?: string };
  const userId = String(body.user_id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400 });
  const [row] = await accounts(env).select<SpotifyAccountRow>({ user_id: `eq.${userId}` });
  if (!row) return new Response(JSON.stringify({ error: 'not_connected' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  const access_token = await getFreshAccessToken(env, row);
  return new Response(JSON.stringify({ access_token, expires_in: 3000 }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
