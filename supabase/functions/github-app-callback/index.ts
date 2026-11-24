// github-app-callback (verify_jwt = false)
//   GitHub redireciona para cá depois que o cliente instala o GitHub App e
//   escolhe os repositórios. Com "Request user authorization during
//   installation" ativo, o GitHub também envia `code`.
//
//   1) valida o state (nonce de uso único, dentro do prazo) e acha o usuário;
//   2) troca o code por um token de usuário (limitado aos repositórios
//      escolhidos, porque é o token do app) e grava cifrado em github_connections;
//   3) confirma que o installation_id está entre as instalações do próprio
//      usuário (GET /user/installations) e do nosso app (app_id), e grava em
//      github_app_installations.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encryptSecret } from '../_shared/connectorCrypto.ts'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateParam = url.searchParams.get('state')
  const installationIdParam = url.searchParams.get('installation_id')
  const setupAction = url.searchParams.get('setup_action')

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let appBaseUrl = ''
  let uid: string | null = null

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
          const allowedHost = u.hostname === 'kubovibe.dev' || u.hostname.endsWith('.kubovibe.dev') || u.hostname === 'vertal.dev' || u.hostname.endsWith('.vertal.dev') || u.hostname === 'localhost'
          if (allowedHost) appBaseUrl = u.origin
          else console.warn(`Untrusted returnUrl origin: ${u.origin}`)
        }
      } catch { /* ignore */ }
      // Uso único
      await admin.from('github_oauth_states').update({ consumed_at: new Date().toISOString() }).eq('nonce', stateParam)
    }
  }

  const redirect = (path: string) => {
    const target = appBaseUrl ? `${appBaseUrl}${path}` : path
    return new Response(`<html><head><meta http-equiv="refresh" content="0;url=${target}"></head></html>`, {
      headers: { 'Content-Type': 'text/html' }, status: 200,
    })
  }

  if (!uid) return redirect('/connectors/github?error=invalid_state')
  if (setupAction === 'request') return redirect('/connectors/github?error=github_pending_approval')
  if (!installationIdParam) return redirect('/connectors/github?error=installation_missing')
  if (!code) return redirect('/connectors/github?error=github_authorization_required')

  const installationId = Number(installationIdParam)
  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    return redirect('/connectors/github?error=installation_invalid')
  }

  try {
    const clientId = Deno.env.get('GITHUB_CLIENT_ID')
    const clientSecret = Deno.env.get('GITHUB_CLIENT_SECRET')
    const appId = Number(Deno.env.get('GITHUB_APP_ID') ?? '')
    if (!clientId || !clientSecret || !appId) throw new Error('GitHub App credentials not configured')

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    })
    const tokenData = await tokenRes.json()
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error)
    const accessToken: string = tokenData.access_token

    const gh = (path: string) => fetch(`https://api.github.com${path}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'KuboVibe' },
    })

    const userRes = await gh('/user')
    const ghUser = await userRes.json()

    // O usuário precisa enxergar essa instalação; evita vincular a instalação de outra pessoa.
    const instRes = await gh('/user/installations?per_page=100')
    const instData = await instRes.json()
    const installation = (Array.isArray(instData?.installations) ? instData.installations : [])
      .find((i: any) => Number(i.id) === installationId)
    if (!installation) throw new Error('installation_not_accessible')
    if (Number(installation.app_id) !== appId) throw new Error('installation_wrong_app')

    const enc = await encryptSecret(accessToken)
    const now = new Date().toISOString()
    const { error: connErr } = await admin.from('github_connections').upsert({
      user_id: uid,
      access_token_ciphertext: enc.ciphertext,
      access_token_iv: enc.iv,
      access_token_tag: enc.tag,
      github_username: ghUser.login || null,
      github_avatar_url: ghUser.avatar_url || null,
      scope: tokenData.scope || 'github_app',
      updated_at: now,
    }, { onConflict: 'user_id' })
    if (connErr) throw new Error('failed_to_save_connection')

    const { error: instErr } = await admin.from('github_app_installations').upsert({
      user_id: uid,
      installation_id: installationId,
      account_login: installation.account?.login ?? null,
      account_type: installation.account?.type ?? null,
      repository_selection: installation.repository_selection ?? null,
      updated_at: now,
    }, { onConflict: 'user_id' })
    if (instErr) throw new Error('failed_to_save_installation')

    const params = new URLSearchParams({ success: 'true', username: ghUser.login || '' })
    return redirect(`/connectors/github?${params.toString()}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('GitHub App callback error:', msg)
    return redirect(`/connectors/github?error=${encodeURIComponent(msg)}`)
  }
})
