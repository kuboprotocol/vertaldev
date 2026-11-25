import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encryptSecret } from '../_shared/connectorCrypto.ts'


Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const stateParam = url.searchParams.get('state')

  // The state parameter is now an opaque nonce; user_id and returnUrl are looked up server-side.
  // Sem returnUrl válido, volta para o app (nunca um caminho relativo no domínio do Supabase).
  const fallbackOrigin = (() => {
    try { return new URL(Deno.env.get('APP_ORIGIN') || 'https://vertal.dev').origin } catch { return 'https://vertal.dev' }
  })()
  let appBaseUrl = fallbackOrigin
  let uid: string | null = null

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  if (stateParam) {
    const { data: stateRow } = await admin
      .from('github_oauth_states')
      .select('user_id, return_url, expires_at, consumed_at')
      .eq('nonce', stateParam)
      .maybeSingle()
    if (stateRow && !stateRow.consumed_at && new Date(stateRow.expires_at).getTime() > Date.now()) {
      uid = String(stateRow.user_id)
      try { 
        if (stateRow.return_url) {
          const u = new URL(stateRow.return_url)
          // Security: Only allow redirects to kubovibe.dev / vertal.dev and their subdomains, or localhost for dev
          const allowedHost = u.hostname === 'kubovibe.dev' || u.hostname.endsWith('.kubovibe.dev') || u.hostname === 'vertal.dev' || u.hostname.endsWith('.vertal.dev') || u.hostname === 'localhost'
          if (allowedHost) {
            appBaseUrl = u.origin 
          } else {
            console.warn(`Untrusted returnUrl origin: ${u.origin}`)
          }
        }
      } catch { /* ignore */ }
      // One-shot consume
      await admin.from('github_oauth_states').update({ consumed_at: new Date().toISOString() }).eq('nonce', stateParam)
    }
  }

  const redirect = (path: string) => {
    const target = `${appBaseUrl}${path}`
    return new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'no-store' } })
  }

  if (error || !code || !uid) return redirect('/connectors/github?error=oauth_denied')

  try {
    const clientId = Deno.env.get('GITHUB_CLIENT_ID')
    const clientSecret = Deno.env.get('GITHUB_CLIENT_SECRET')
    if (!clientId || !clientSecret) throw new Error('GitHub OAuth credentials not configured')

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    })
    const tokenData = await tokenRes.json()
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error)

    const accessToken = tokenData.access_token
    const scope = tokenData.scope || ''

    if (!accessToken) throw new Error('no_access_token')

    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Vertal' },
    })
    if (!userRes.ok) throw new Error(`github_user_${userRes.status}`)
    const ghUser = await userRes.json()

    // Persist token server-side via service role — never trafega pelo client
    // (admin client already created above for state validation)
    const enc = await encryptSecret(accessToken)
    const now = new Date().toISOString()
    // Substitui a conexão anterior do usuário (inclusive uma feita por token/PAT).
    const { error: upsertErr } = await admin.from('github_connections').upsert({
      user_id: uid,
      access_token_ciphertext: enc.ciphertext,
      access_token_iv: enc.iv,
      access_token_tag: enc.tag,

      github_username: ghUser.login || null,
      github_avatar_url: ghUser.avatar_url || null,
      scope: scope || 'oauth',
      connected_at: now,
      updated_at: now,
    }, { onConflict: 'user_id' })
    if (upsertErr) throw new Error('save_failed')

    const params = new URLSearchParams({ success: 'true', username: ghUser.login || '' })
    return redirect(`/connectors/github?${params.toString()}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('GitHub callback error:', msg)
    return redirect(`/connectors/github?error=${encodeURIComponent(msg)}`)
  }
})
