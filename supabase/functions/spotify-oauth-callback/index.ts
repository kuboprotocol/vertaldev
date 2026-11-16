// Callback do Spotify: valida o state, troca o code, guarda o refresh token criptografado.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { encryptSecret } from '../_shared/connectorCrypto.ts'
import { exchangeAuthCode, SpotifyApiError, type AdminClient } from '../_shared/spotifyApi.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const DEFAULT_ORIGIN = Deno.env.get('APP_ORIGIN') || 'https://kubovibe.dev'
const redirect = (to: string) => new Response(null, { status: 302, headers: { ...corsHeaders, Location: to } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const nonce = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')
  const admin: AdminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  if (errorParam) return redirect(`${DEFAULT_ORIGIN}/connectors/spotify?error=${encodeURIComponent(errorParam)}`)
  if (!code || !nonce) return redirect(`${DEFAULT_ORIGIN}/connectors/spotify?error=missing_code`)

  // State de uso único e com prazo.
  const { data: row } = await admin.from('spotify_oauth_states').select('*').eq('nonce', nonce).maybeSingle()
  if (!row) return redirect(`${DEFAULT_ORIGIN}/connectors/spotify?error=bad_state`)
  const s = row as { user_id: string; origin: string; return_url: string; expires_at: string; consumed_at: string | null }
  const back = `${s.origin}${s.return_url}`
  if (s.consumed_at) return redirect(`${back}?error=state_replayed`)
  if (new Date(s.expires_at).getTime() < Date.now()) return redirect(`${back}?error=state_expired`)
  await admin.from('spotify_oauth_states').update({ consumed_at: new Date().toISOString() }).eq('nonce', nonce)

  try {
    const redirectUri = Deno.env.get('SPOTIFY_REDIRECT_URI')
      || `${Deno.env.get('SUPABASE_URL')}/functions/v1/spotify-oauth-callback`
    const tokens = await exchangeAuthCode(code, redirectUri)

    const me = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })
    const profile = me.ok ? await me.json() as { id?: string; display_name?: string } : {}

    const enc = await encryptSecret(tokens.refreshToken)
    const { error: upErr } = await admin.from('spotify_accounts').upsert({
      user_id: s.user_id,
      display_name: profile.display_name ?? null,
      spotify_user_id: profile.id ?? null,
      refresh_token_ciphertext: enc.ciphertext,
      refresh_token_iv: enc.iv,
      refresh_token_tag: enc.tag,
      access_token_cache: tokens.accessToken,
      access_token_expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (upErr) {
      console.error('spotify-oauth-callback: falha ao gravar conta', upErr.message)
      return redirect(`${back}?error=save_failed`)
    }
    return redirect(`${back}?spotify=connected`)
  } catch (e) {
    // Só códigos conhecidos vão para a URL; a mensagem bruta fica no log.
    const reason = e instanceof SpotifyApiError ? e.code : 'token_exchange_failed'
    console.error('spotify-oauth-callback: erro', e instanceof Error ? e.message : e)
    return redirect(`${back}?error=${encodeURIComponent(reason)}`)
  }
})
