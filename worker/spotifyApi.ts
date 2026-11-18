// Cliente do Spotify no Worker: troca o code, renova o access token, guarda os
// tokens criptografados no Supabase e chama a Web API com um retry.
import { SPOTIFY_ACCOUNTS_URL, SPOTIFY_API_URL, spotifyErrorCode, type SpotifyOp } from '../src/lib/spotify/spotifyCore';
import { table, type SupabaseEnv } from './supabaseRest';
import { decryptSecret, encryptSecret } from './tokenCrypto';

export interface SpotifyEnv extends SupabaseEnv {
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
  SPOTIFY_TOKEN_ENC_KEY?: string;
  /** Opcional: padrão é https://vertal.dev/api/spotify/callback. */
  SPOTIFY_REDIRECT_URI?: string;
}

export interface SpotifyAccountRow {
  user_id: string;
  display_name: string | null;
  refresh_token_ciphertext: string;
  refresh_token_iv: string;
  refresh_token_tag: string;
  access_token_cache: string | null;
  access_token_iv: string | null;
  access_token_tag: string | null;
  access_token_expires_at: string | null;
}

export class SpotifyApiError extends Error {
  constructor(public code: string, public status = 0) {
    super(code);
  }
}

export const accounts = (env: SpotifyEnv) => table(env, 'spotify_accounts');

function basicAuth(env: SpotifyEnv): string {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) throw new SpotifyApiError('spotify_not_configured');
  return `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };

async function tokenRequest(env: SpotifyEnv, body: Record<string, string>): Promise<{ res: Response; json: TokenResponse }> {
  const res = await fetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
    method: 'POST',
    headers: { Authorization: basicAuth(env), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  return { res, json: (await res.json().catch(() => ({}))) as TokenResponse };
}

/** Troca o code do callback por tokens. */
export async function exchangeAuthCode(env: SpotifyEnv, code: string, redirectUri: string) {
  const { res, json } = await tokenRequest(env, { grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  if (!res.ok || !json.access_token || !json.refresh_token) {
    throw new SpotifyApiError(json.error || 'token_exchange_failed', res.status);
  }
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresIn: json.expires_in ?? 3600 };
}

const expiresAt = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

/** Garante um access token válido; renova com o refresh token quando falta menos de 1 min. */
export async function getFreshAccessToken(env: SpotifyEnv, account: SpotifyAccountRow): Promise<string> {
  const key = env.SPOTIFY_TOKEN_ENC_KEY;
  const exp = account.access_token_expires_at ? new Date(account.access_token_expires_at).getTime() : 0;
  if (account.access_token_cache && account.access_token_iv && account.access_token_tag && exp > Date.now() + 60_000) {
    return decryptSecret(key, {
      ciphertext: account.access_token_cache, iv: account.access_token_iv, tag: account.access_token_tag,
    });
  }

  const refresh = await decryptSecret(key, {
    ciphertext: account.refresh_token_ciphertext, iv: account.refresh_token_iv, tag: account.refresh_token_tag,
  });
  const { res, json } = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: refresh });
  // invalid_grant = o usuário revogou o acesso: pedir nova conexão.
  if (!res.ok || !json.access_token) throw new SpotifyApiError('reauth_required', res.status || 401);

  const access = await encryptSecret(key, json.access_token);
  const patch: Record<string, unknown> = {
    access_token_cache: access.ciphertext,
    access_token_iv: access.iv,
    access_token_tag: access.tag,
    access_token_expires_at: expiresAt(json.expires_in ?? 3600),
    updated_at: new Date().toISOString(),
  };
  // O Spotify às vezes gira o refresh token: guarda o novo.
  if (json.refresh_token && json.refresh_token !== refresh) {
    const enc = await encryptSecret(key, json.refresh_token);
    patch.refresh_token_ciphertext = enc.ciphertext;
    patch.refresh_token_iv = enc.iv;
    patch.refresh_token_tag = enc.tag;
  }
  await accounts(env).update({ user_id: `eq.${account.user_id}` }, patch);
  return json.access_token;
}

/** Monta a linha de conta com os tokens recém-obtidos no callback. */
export async function accountRow(
  env: SpotifyEnv,
  userId: string,
  tokens: { accessToken: string; refreshToken: string; expiresIn: number },
  profile: { id?: string; display_name?: string },
): Promise<Record<string, unknown>> {
  const refresh = await encryptSecret(env.SPOTIFY_TOKEN_ENC_KEY, tokens.refreshToken);
  const access = await encryptSecret(env.SPOTIFY_TOKEN_ENC_KEY, tokens.accessToken);
  return {
    user_id: userId,
    display_name: profile.display_name ?? null,
    spotify_user_id: profile.id ?? null,
    refresh_token_ciphertext: refresh.ciphertext,
    refresh_token_iv: refresh.iv,
    refresh_token_tag: refresh.tag,
    access_token_cache: access.ciphertext,
    access_token_iv: access.iv,
    access_token_tag: access.tag,
    access_token_expires_at: expiresAt(tokens.expiresIn),
    updated_at: new Date().toISOString(),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Chamada à Web API. 401: renova o token e tenta uma vez. 429: espera até 5 s e tenta uma vez. */
export async function spotifyCall(
  env: SpotifyEnv,
  account: SpotifyAccountRow,
  op: SpotifyOp,
  method: 'GET' | 'PUT' | 'POST' | 'DELETE',
  path: string,
  opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  retried = false,
): Promise<{ status: number; data: unknown }> {
  const token = await getFreshAccessToken(env, account);
  const url = new URL(`${SPOTIFY_API_URL}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && !retried) {
    await accounts(env).update({ user_id: `eq.${account.user_id}` }, { access_token_expires_at: null });
    return spotifyCall(env, { ...account, access_token_expires_at: null }, op, method, path, opts, true);
  }
  if (res.status === 429 && !retried) {
    const wait = Number(res.headers.get('Retry-After') ?? '1');
    if (Number.isFinite(wait) && wait <= 5) {
      await sleep(Math.max(wait, 0) * 1000);
      return spotifyCall(env, account, op, method, path, opts, true);
    }
  }
  if (res.status >= 400) throw new SpotifyApiError(spotifyErrorCode(res.status, op), res.status);
  if (res.status === 204 || !res.headers.get('content-type')?.includes('application/json')) {
    return { status: res.status, data: null };
  }
  return { status: res.status, data: await res.json() };
}
