// Cliente servidor do Spotify (Deno): renova o access token, guarda o refresh
// token criptografado e chama a Web API. Usado pelas edge functions
// spotify-oauth-callback e spotify-action. Não importe este arquivo no front-end.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { decryptSecret, encryptSecret } from './connectorCrypto.ts'
import { SPOTIFY_ACCOUNTS_URL, SPOTIFY_API_URL, spotifyErrorCode, type SpotifyOp } from './spotifyCore.ts'

// deno-lint-ignore no-explicit-any
export type AdminClient = SupabaseClient<any, any, any>

export interface SpotifyAccountRow {
  user_id: string
  display_name: string | null
  refresh_token_ciphertext: string
  refresh_token_iv: string
  refresh_token_tag: string
  access_token_cache: string | null
  access_token_expires_at: string | null
}

export class SpotifyApiError extends Error {
  constructor(public code: string, public status = 0) {
    super(code)
  }
}

function clientCredentials() {
  const id = Deno.env.get('SPOTIFY_CLIENT_ID')
  const secret = Deno.env.get('SPOTIFY_CLIENT_SECRET')
  if (!id || !secret) throw new SpotifyApiError('spotify_not_configured')
  return { id, secret, basic: btoa(`${id}:${secret}`) }
}

/** Troca o code do callback por tokens. Devolve o refresh token para guardar criptografado. */
export async function exchangeAuthCode(code: string, redirectUri: string) {
  const { basic } = clientCredentials()
  const res = await fetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  })
  const json = await res.json().catch(() => ({})) as {
    access_token?: string; refresh_token?: string; expires_in?: number; error?: string
  }
  if (!res.ok || !json.access_token || !json.refresh_token) {
    throw new SpotifyApiError(json.error || 'token_exchange_failed', res.status)
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in ?? 3600,
  }
}

/** Garante um access token válido; renova com o refresh token quando faltar pouco para expirar. */
export async function getFreshAccessToken(admin: AdminClient, account: SpotifyAccountRow): Promise<string> {
  const exp = account.access_token_expires_at ? new Date(account.access_token_expires_at).getTime() : 0
  if (account.access_token_cache && exp > Date.now() + 60_000) return account.access_token_cache

  const refresh = await decryptSecret({
    ciphertext: account.refresh_token_ciphertext,
    iv: account.refresh_token_iv,
    tag: account.refresh_token_tag,
  })
  const { basic } = clientCredentials()
  const res = await fetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }),
  })
  const json = await res.json().catch(() => ({})) as {
    access_token?: string; refresh_token?: string; expires_in?: number; error?: string
  }
  if (!res.ok || !json.access_token) {
    // invalid_grant = o usuário revogou o acesso: pedir nova conexão.
    throw new SpotifyApiError('reauth_required', res.status || 401)
  }

  const update: Record<string, unknown> = {
    access_token_cache: json.access_token,
    access_token_expires_at: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }
  // O Spotify às vezes gira o refresh token: guarde o novo, criptografado.
  if (json.refresh_token && json.refresh_token !== refresh) {
    const enc = await encryptSecret(json.refresh_token)
    update.refresh_token_ciphertext = enc.ciphertext
    update.refresh_token_iv = enc.iv
    update.refresh_token_tag = enc.tag
  }
  await admin.from('spotify_accounts').update(update).eq('user_id', account.user_id)
  return json.access_token
}

/** Chamada à Web API com um retry após renovar o token (uma vez só). */
export async function spotifyCall(
  admin: AdminClient,
  account: SpotifyAccountRow,
  op: SpotifyOp,
  method: 'GET' | 'PUT' | 'POST' | 'DELETE',
  path: string,
  opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  retried = false,
): Promise<{ status: number; data: unknown }> {
  const token = await getFreshAccessToken(admin, account)
  const url = new URL(`${SPOTIFY_API_URL}${path}`)
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v))
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  if (res.status === 401 && !retried) {
    // Token recusado antes do prazo: zera o cache e tenta de novo uma vez.
    await admin.from('spotify_accounts').update({ access_token_expires_at: null }).eq('user_id', account.user_id)
    return spotifyCall(admin, { ...account, access_token_expires_at: null }, op, method, path, opts, true)
  }
  if (res.status >= 400) throw new SpotifyApiError(spotifyErrorCode(res.status, op), res.status)
  if (res.status === 204 || !res.headers.get('content-type')?.includes('application/json')) {
    return { status: res.status, data: null }
  }
  return { status: res.status, data: await res.json() }
}
