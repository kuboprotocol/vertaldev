// Inicia a conexão com o Spotify: grava um state (anti-CSRF) e devolve a URL de consentimento.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildSpotifyAuthorizeUrl } from '../_shared/spotifyCore.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const ORIGIN_ALLOWLIST: Array<string | RegExp> = [
  'https://kubovibe.dev',
  'https://www.kubovibe.dev',
  'https://vertal.dev',
  'https://www.vertal.dev',
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/i,
  /^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/i,
  /^http:\/\/localhost(:\d+)?$/i,
]
const isAllowedOrigin = (origin: string) =>
  ORIGIN_ALLOWLIST.some((rule) => (typeof rule === 'string' ? rule === origin : rule.test(origin)))
const isSafeReturnUrl = (ret: string) => /^\/[A-Za-z0-9/_\-?=&%.]*$/.test(ret) && !ret.startsWith('//')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'missing auth' }, 401)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return json({ error: 'invalid token' }, 401)

    const clientId = Deno.env.get('SPOTIFY_CLIENT_ID')
    if (!clientId || !Deno.env.get('SPOTIFY_CLIENT_SECRET')) {
      console.error('spotify-oauth-start: credenciais Spotify ausentes')
      return json({ error: 'spotify_not_configured' }, 503)
    }

    const body = await req.json().catch(() => ({})) as { returnUrl?: string; origin?: string }
    const returnUrl = body.returnUrl && isSafeReturnUrl(body.returnUrl) ? body.returnUrl : '/connectors/spotify'
    const origin = body.origin && isAllowedOrigin(body.origin) ? body.origin : 'https://kubovibe.dev'

    const redirectUri = Deno.env.get('SPOTIFY_REDIRECT_URI')
      || `${Deno.env.get('SUPABASE_URL')}/functions/v1/spotify-oauth-callback`
    const nonce = `${crypto.randomUUID()}.${crypto.randomUUID()}`

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { error: insErr } = await admin.from('spotify_oauth_states').insert({
      nonce, user_id: user.id, origin, return_url: returnUrl,
    })
    if (insErr) {
      console.error('spotify-oauth-start: falha ao gravar state', insErr.message)
      return json({ error: 'state_persist_failed' }, 500)
    }

    return json({ url: buildSpotifyAuthorizeUrl({ clientId, redirectUri, state: nonce }) })
  } catch (e) {
    console.error('spotify-oauth-start: erro', e instanceof Error ? e.message : e)
    return json({ error: 'internal' }, 500)
  }
})
