// Instagram por usuário: "Entrar com Instagram" (login da Meta, app do Vertal) em /connectors/instagram,
// canal do operador em "Avançado".
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }))

import { platformOAuthData, userAuthFields, type FluxosAppDef } from '../../supabase/functions/_shared/fluxosApps'
import { safeReturnPath } from '@/lib/fluxos/apps'
import { getConnectorBySlug } from '@/lib/connectorsConfig'

const root = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

const META_FIELDS = [
  { key: 'oAuthRedirectUrl', label: 'OAuth Redirect URL', readOnly: true },
  { key: 'clientId', label: 'App ID', required: true },
  { key: 'clientSecret', label: 'App Secret', required: true },
  { key: 'configId', label: 'Login configuration ID (Facebook Login for Business)', required: false },
]
const ig: FluxosAppDef = { key: 'instagram', name: 'Instagram', supportsConnections: true, oauth: true, authFields: META_FIELDS, actions: [], searches: [] }

describe('Instagram por OAuth', () => {
  it('usa o app da Meta do Vertal (FLUXOS_OAUTH_META_*) e o usuário final não vê App ID, secret nem config', () => {
    const env = (k: string) => ({ FLUXOS_OAUTH_META_ID: '1145586658064572', FLUXOS_OAUTH_META_SECRET: 's' } as Record<string, string>)[k]
    const platform = platformOAuthData('instagram', env)
    expect(platform).toEqual({ clientId: '1145586658064572', clientSecret: 's' })
    expect(userAuthFields(ig, platform).map((f) => f.key)).toEqual(['oAuthRedirectUrl'])
  })

  it('sem o app da Meta, o usuário pode informar o próprio app (inclusive a configuração)', () => {
    expect(userAuthFields(ig, null).map((f) => f.key)).toEqual(['oAuthRedirectUrl', 'clientId', 'clientSecret', 'configId'])
  })

  it('volta só para páginas internas de /connectors depois do login', () => {
    expect(safeReturnPath('/connectors/instagram')).toBe('/connectors/instagram')
    expect(safeReturnPath('/connectors/fluxos-instagram/setup')).toBe('/connectors/fluxos-instagram/setup')
    expect(safeReturnPath('https://evil.example')).toBeNull()
    expect(safeReturnPath('//evil.example/connectors/x')).toBeNull()
    expect(safeReturnPath(null)).toBeNull()
  })

  it('catálogo: Instagram é OAuth e a página mostra "Entrar com Instagram" com o operador em "Avançado"', () => {
    expect(getConnectorBySlug('instagram')!.authType).toBe('oauth')
    const page = read('src/pages/ConnectorChannelPage.tsx')
    expect(page).toMatch(/<FluxosConnectPanel\s+app="instagram"/)
    expect(page).toMatch(/returnPath="\/connectors\/instagram"/)
    expect(page).toMatch(/Avançado: canal do operador/)
  })

  it('não mostra nomes do motor na tela', () => {
    for (const p of ['src/pages/ConnectorChannelPage.tsx', 'src/components/connectors/FluxosConnectPanel.tsx']) {
      expect(read(p)).not.toMatch(/automatisch|huginn/i)
    }
  })
})
