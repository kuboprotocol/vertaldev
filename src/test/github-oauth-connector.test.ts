import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Conector GitHub por OAuth ("Entrar com GitHub") com PAT como opção avançada.
const invoke = vi.hoisted(() => vi.fn())
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }))

import { getGitHubOAuthUrl, githubOAuthErrorMessage, GITHUB_OAUTH_SCOPES } from '@/lib/github/oauth'
import { getConnectorBySlug } from '@/lib/connectorsConfig'

const root = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

beforeEach(() => invoke.mockReset())

describe('GitHub OAuth connector', () => {
  it('returns the authorize URL from github-auth', async () => {
    invoke.mockResolvedValueOnce({ data: { url: 'https://github.com/login/oauth/authorize?client_id=a' }, error: null })
    await expect(getGitHubOAuthUrl('https://vertal.dev/connectors/github')).resolves.toBe('https://github.com/login/oauth/authorize?client_id=a')
    expect(invoke).toHaveBeenCalledWith('github-auth', { body: { returnUrl: 'https://vertal.dev/connectors/github' } })
  })

  it('refuses anything that is not a GitHub authorize URL', async () => {
    invoke.mockResolvedValueOnce({ data: { url: 'https://evil.example/login' }, error: null })
    await expect(getGitHubOAuthUrl('x')).rejects.toThrow()
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(getGitHubOAuthUrl('x')).rejects.toThrow('boom')
  })

  it('maps callback errors to friendly pt-BR text', () => {
    expect(githubOAuthErrorMessage('oauth_denied')).toMatch(/cancelado/)
    expect(githubOAuthErrorMessage(null)).toBe('')
  })

  it('catalog marks GitHub as OAuth and keeps the token fields for the advanced option', () => {
    const gh = getConnectorBySlug('github')!
    expect(gh.authType).toBe('oauth')
    expect(gh.apiKeyLabel).toMatch(/PAT/)
  })

  it('edge functions: callback reachable without JWT and scopes match the client', () => {
    expect(read('supabase/config.toml')).toMatch(/\[functions\.github-callback\]\s*\n\s*verify_jwt = false/)
    const auth = read('supabase/functions/github-auth/index.ts')
    expect(auth).toContain(`scope: '${GITHUB_OAUTH_SCOPES.join(' ')}'`)
    expect(auth).not.toMatch(/workflow/)
  })

  it('PAT connections keep working (token save path untouched)', () => {
    const save = read('supabase/functions/connector-credentials-save/index.ts')
    expect(save).toContain("scope: 'pat'")
  })
})
