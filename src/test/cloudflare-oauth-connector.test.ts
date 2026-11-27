// Cloudflare por usuário: "Entrar com Cloudflare" (OAuth self-managed da Cloudflare, app Vertal Dev)
// em /connectors/cloudflare/setup, com o API token em "Avançado".
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { platformOAuthData, userAuthFields, PUBLIC_OAUTH_CLIENT_IDS, type FluxosAppDef } from '../../supabase/functions/_shared/fluxosApps'
import { getConnectorBySlug } from '@/lib/connectorsConfig'

const root = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

const CF_FIELDS = [
  { key: 'oAuthRedirectUrl', label: 'OAuth Redirect URL', readOnly: true },
  { key: 'clientId', label: 'Client ID', required: true },
  { key: 'clientSecret', label: 'Client Secret', required: true },
]
const cf: FluxosAppDef = { key: 'cloudflare', name: 'Cloudflare', supportsConnections: true, oauth: true, authFields: CF_FIELDS, actions: [], searches: [] }

describe('Cloudflare por OAuth', () => {
  it('usa o cliente OAuth do Vertal (ID público no código + FLUXOS_OAUTH_CLOUDFLARE_SECRET)', () => {
    expect(PUBLIC_OAUTH_CLIENT_IDS.CLOUDFLARE).toMatch(/^[0-9a-f]{32}$/)
    const env = (k: string) => ({ FLUXOS_OAUTH_CLOUDFLARE_SECRET: 's' } as Record<string, string>)[k]
    const platform = platformOAuthData('cloudflare', env)
    expect(platform).toEqual({ clientId: PUBLIC_OAUTH_CLIENT_IDS.CLOUDFLARE, clientSecret: 's' })
    expect(userAuthFields(cf, platform).map((f) => f.key)).toEqual(['oAuthRedirectUrl'])
  })

  it('sem o segredo, não finge ter cliente (o usuário informaria o próprio app)', () => {
    expect(platformOAuthData('cloudflare', () => undefined)).toBeNull()
  })

  it('catálogo: Cloudflare é OAuth e o token avançado abre a Cloudflare com as permissões marcadas', () => {
    const c = getConnectorBySlug('cloudflare')!
    expect(c.authType).toBe('oauth')
    const url = new URL(c.apiKeyDocsUrl!)
    expect(url.origin + url.pathname).toBe('https://dash.cloudflare.com/profile/api-tokens')
    const perms = JSON.parse(url.searchParams.get('permissionGroupKeys')!) as Array<{ key: string; type: string }>
    expect(perms).toContainEqual({ key: 'dns', type: 'edit' })
    expect(perms).toContainEqual({ key: 'workers_scripts', type: 'edit' })
    expect(perms.every((p) => ['read', 'edit'].includes(p.type))).toBe(true)
  })

  it('a página mostra "Entrar com Cloudflare" e deixa o API token em "Avançado"', () => {
    const page = read('src/pages/ConnectorSetupPage.tsx')
    expect(page).toMatch(/<FluxosConnectPanel\s+app="cloudflare"/)
    expect(page).toMatch(/returnPath="\/connectors\/cloudflare\/setup"/)
    expect(page).toMatch(/Advanced: use an API token/)
    expect(page).toMatch(/slug !== 'cloudflare'/)
    // Texto visível do bloco da Cloudflare sem nomes do motor (o import do módulo de sincronização não aparece na tela).
    const block = page.slice(page.indexOf('cloudflare-oauth-panel'), page.indexOf("{slug === 'github' && githubProfile"))
    expect(block.length).toBeGreaterThan(100)
    expect(block).not.toMatch(/automatisch|huginn/i)
  })
})
