import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decryptSecret } from '../_shared/connectorCrypto.ts'
import { githubErrorCode, isGithubWrite, parseGithubOp, type GithubOp } from '../_shared/githubOps.ts'

// github-repos
//   GET/POST sem corpo          → lista os repositórios do usuário (comportamento antigo, intacto)
//   POST { op, ...campos }      → Vibe Code + GitHub (Vertal Navigator, fase 3):
//        list_repos | create_repo | create_issue | create_branch | create_pr
//      Escrita exige `confirmed: true` (só o cartão de confirmação do chat envia).
//      Usa o token OAuth já salvo em github_connections (escopo "repo").

const GH = 'https://api.github.com'

function ghHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'KuboVibe', 'X-GitHub-Api-Version': '2022-11-28' }
}

const encRepo = (repo: string) => repo.split('/').map(encodeURIComponent).join('/')

/** Executa uma operação validada. Devolve {status, body} prontos para responder. */
async function runGithubOp(op: GithubOp, token: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const h = { ...ghHeaders(token), 'Content-Type': 'application/json' }
  const gh = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${GH}${path}`, { method, headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
    const data = await res.json().catch(() => ({}))
    return { res, data: data as Record<string, any> }
  }
  const failGh = (status: number, data: Record<string, any>) => ({
    status: status === 401 ? 401 : 400,
    body: { ok: false, code: githubErrorCode(status), detail: String(data?.message ?? '').slice(0, 200) },
  })
  switch (op.op) {
    case 'list_repos': {
      const { res, data } = await gh('GET', `/user/repos?sort=updated&per_page=${op.max}&affiliation=owner,collaborator,organization_member`)
      if (!res.ok) return failGh(res.status, data)
      const repos = (Array.isArray(data) ? data : []).map((r: any) => ({ full_name: r.full_name, private: r.private, html_url: r.html_url, default_branch: r.default_branch, updated_at: r.updated_at }))
      return { status: 200, body: { ok: true, repos } }
    }
    case 'create_repo': {
      const { res, data } = await gh('POST', '/user/repos', { name: op.name, description: op.description, private: op.private, auto_init: true })
      if (!res.ok) return failGh(res.status, data)
      return { status: 200, body: { ok: true, full_name: data.full_name, html_url: data.html_url, private: data.private, default_branch: data.default_branch } }
    }
    case 'create_issue': {
      const { res, data } = await gh('POST', `/repos/${encRepo(op.repo)}/issues`, { title: op.title, body: op.body })
      if (!res.ok) return failGh(res.status, data)
      return { status: 200, body: { ok: true, number: data.number, html_url: data.html_url } }
    }
    case 'create_branch': {
      let from = op.from
      if (!from) {
        const repo = await gh('GET', `/repos/${encRepo(op.repo)}`)
        if (!repo.res.ok) return failGh(repo.res.status, repo.data)
        from = String(repo.data.default_branch || 'main')
      }
      const ref = await gh('GET', `/repos/${encRepo(op.repo)}/git/ref/heads/${from.split('/').map(encodeURIComponent).join('/')}`)
      if (!ref.res.ok) return failGh(ref.res.status, ref.data)
      const sha = ref.data?.object?.sha
      if (typeof sha !== 'string') return { status: 400, body: { ok: false, code: 'not_found' } }
      const { res, data } = await gh('POST', `/repos/${encRepo(op.repo)}/git/refs`, { ref: `refs/heads/${op.branch}`, sha })
      if (!res.ok) return failGh(res.status, data)
      return { status: 200, body: { ok: true, branch: op.branch, from, sha, html_url: `https://github.com/${op.repo}/tree/${op.branch}` } }
    }
    case 'create_pr': {
      let base = op.base
      if (!base) {
        const repo = await gh('GET', `/repos/${encRepo(op.repo)}`)
        if (!repo.res.ok) return failGh(repo.res.status, repo.data)
        base = String(repo.data.default_branch || 'main')
      }
      const { res, data } = await gh('POST', `/repos/${encRepo(op.repo)}/pulls`, { title: op.title, head: op.head, base, body: op.body, draft: op.draft })
      if (!res.ok) return failGh(res.status, data)
      return { status: 200, body: { ok: true, number: data.number, html_url: data.html_url, draft: data.draft, base } }
    }
  }
}


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get GitHub token from DB using service role
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Rate limit: 60 req/min por usuário
    const { data: rl } = await serviceClient.rpc('bump_rate_limit', {
      _bucket: 'github_repos', _user: user.id, _window_seconds: 60,
    })
    if (typeof rl === 'number' && rl > 60) {
      return new Response(JSON.stringify({ error: 'rate_limited', retry_after_seconds: 60 }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' },
      })
    }

    const { data: connection, error: connError } = await serviceClient
      .from('github_connections')
      .select('access_token_ciphertext, access_token_iv, access_token_tag')
      .eq('user_id', user.id)
      .maybeSingle()

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: 'GitHub not connected' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fase 3: operações do agente (POST {op, ...}). Sem "op", segue a listagem antiga.
    const rawBody = req.method === 'POST' ? await req.json().catch(() => null) : null
    if (rawBody && typeof rawBody === 'object' && 'op' in rawBody) {
      const op = parseGithubOp(rawBody)
      if (!op) {
        return new Response(JSON.stringify({ ok: false, code: 'bad_request' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (isGithubWrite(op) && (rawBody as Record<string, unknown>).confirmed !== true) {
        return new Response(JSON.stringify({ ok: false, code: 'bad_request', detail: 'confirmation_required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const token = await decryptSecret({
        ciphertext: connection.access_token_ciphertext,
        iv: connection.access_token_iv,
        tag: connection.access_token_tag,
      })
      const out = await runGithubOp(op, token)
      if (isGithubWrite(op)) console.log('github-repos op', op.op, user.id, out.body.ok ? 'ok' : out.body.code)
      return new Response(JSON.stringify(out.body), { status: out.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Fetch repos from GitHub API
    const url = new URL(req.url)
    const page = url.searchParams.get('page') || '1'
    const perPage = url.searchParams.get('per_page') || '30'
    const sort = url.searchParams.get('sort') || 'updated'

    const accessToken = await decryptSecret({
      ciphertext: connection.access_token_ciphertext,
      iv: connection.access_token_iv,
      tag: connection.access_token_tag,
    })

    const ghRes = await fetch(
      `https://api.github.com/user/repos?sort=${sort}&per_page=${perPage}&page=${page}&affiliation=owner`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,

          Accept: 'application/vnd.github+json',
          'User-Agent': 'KuboVibe',
        },
      }
    )

    if (!ghRes.ok) {
      const errBody = await ghRes.text()
      console.error('GitHub API error:', ghRes.status, errBody)
      return new Response(JSON.stringify({ error: 'GitHub API error', status: ghRes.status }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const repos = await ghRes.json()

    // Return simplified repo data
    const simplified = repos.map((r: any) => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      html_url: r.html_url,
      language: r.language,
      stargazers_count: r.stargazers_count,
      forks_count: r.forks_count,
      updated_at: r.updated_at,
      private: r.private,
    }))

    return new Response(JSON.stringify({ repos: simplified }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
