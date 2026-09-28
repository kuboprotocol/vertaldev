// Public endpoint (verify_jwt = false): starts GitHub OAuth sign-in flow.
// Secrets stay server-side. Returns { url } for the browser to redirect to.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function signState(payload: object, secret: string) {
  const json = JSON.stringify(payload)
  const data = b64url(new TextEncoder().encode(json))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
  return `${data}.${b64url(sig)}`
}

// Mesma allowlist do github-signin-callback.
function allowedOrigin(raw: string | null): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    const h = u.hostname
    const ok = ['kubovibe.dev', 'vertal.dev', 'localhost', '127.0.0.1'].includes(h) ||
      h.endsWith('.kubovibe.dev') || h.endsWith('.vertal.dev') || h.endsWith('.lovable.app')
    return ok ? u.origin : null
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const reqId = crypto.randomUUID()
  const log = (event: string, data: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ ts: new Date().toISOString(), fn: 'github-signin-initiate', reqId, event, ...data }))

  try {
    const clientId = Deno.env.get('GITHUB_CLIENT_ID')
    const stateSecret = Deno.env.get('CONNECTOR_ENC_KEY') || Deno.env.get('SUPABASE_JWT_SECRET')
    if (!clientId) {
      log('initiate_error', { err: 'github_not_configured' })
      return new Response(JSON.stringify({ error: 'github_not_configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!stateSecret) {
      log('initiate_error', { err: 'state_secret_missing' })
      return new Response(JSON.stringify({ error: 'state_secret_missing' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const returnUrl: string = typeof body?.returnUrl === 'string' ? body.returnUrl : ''
    const safeReturn = returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/dashboard'

    // Domínio em que o login começou (o callback volta para ele).
    const origin = allowedOrigin(req.headers.get('origin'))
    // Código de indicação (?ref=) para contas novas criadas pelo GitHub.
    const ref = typeof body?.referralCode === 'string' && /^[a-z0-9]{4,32}$/i.test(body.referralCode)
      ? body.referralCode
      : null

    const state = await signState({
      n: crypto.randomUUID(),
      r: safeReturn,
      ...(origin ? { o: origin } : {}),
      ...(ref ? { f: ref } : {}),
      t: Date.now(),
      p: 'signin',
    }, stateSecret)

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${Deno.env.get('SUPABASE_URL')}/functions/v1/github-signin-callback`,
      scope: 'read:user user:email',
      state,
      allow_signup: 'true',
    })

    log('initiate_success', { returnUrl: safeReturn })
    return new Response(JSON.stringify({
      url: `https://github.com/login/oauth/authorize?${params.toString()}`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown_error'
    log('initiate_exception', { err: msg })
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
