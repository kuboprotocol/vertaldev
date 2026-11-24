// github-app-install
//   Inicia a instalação do GitHub App da Vertal. O cliente escolhe no GitHub
//   quais repositórios liberar ("Only select repositories") e autoriza o app.
//   Devolve { url } para o navegador redirecionar. O state é um nonce gravado
//   em github_oauth_states (validado no callback, uso único).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
    })

  try {
    const appSlug = Deno.env.get('GITHUB_APP_SLUG')
    if (!appSlug) return json(503, { error: 'github_app_not_configured' })

    const auth = req.headers.get('Authorization') ?? ''
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0')
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    )
    const { data: u } = await userClient.auth.getUser()
    if (!u?.user) return json(401, { error: 'unauthorized' })

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: rl } = await adminClient.rpc('bump_rate_limit', {
      _bucket: 'github_app_install', _user: u.user.id, _window_seconds: 60,
    })
    if (typeof rl === 'number' && rl > 30) {
      return json(429, { error: 'rate_limited', retry_after_seconds: 60 }, { 'Retry-After': '60' })
    }

    const { returnUrl } = await req.json().catch(() => ({ returnUrl: '' }))

    const nonce = crypto.randomUUID()
    const { error: insertErr } = await adminClient.from('github_oauth_states').insert({
      nonce,
      user_id: u.user.id,
      return_url: returnUrl || '',
    })
    if (insertErr) return json(500, { error: 'failed_to_persist_state' })

    const url = `https://github.com/apps/${encodeURIComponent(appSlug)}/installations/new?${new URLSearchParams({ state: nonce }).toString()}`
    return json(200, { url, state: nonce })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    const safe = (msg.includes('database') || msg.includes('sql')) ? 'Internal server error' : msg
    return json(500, { error: safe })
  }
})
