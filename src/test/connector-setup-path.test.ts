import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { connectorSetupPath } from '@/lib/connectorSetupPath'
import { getConnectorBySlug } from '@/lib/connectorsConfig'

describe('conectar app do Vertal Fluxos pela página do conector', () => {
  it('leva ao painel de setup real', () => {
    const x = getConnectorBySlug('fluxos-twitter')!
    expect(x.fluxosApp).toBe('twitter')
    expect(connectorSetupPath(x)).toBe('/connectors/fluxos-twitter/setup')
  })
  it('a página do conector não simula conexão para apps do Vertal Fluxos', () => {
    const src = readFileSync('src/pages/ConnectorDetailPage.tsx', 'utf8')
    const fluxosBranch = src.indexOf('connector.fluxosApp')
    const fake = src.indexOf('setFakeConnecting(true)')
    expect(fluxosBranch).toBeGreaterThan(0)
    expect(fluxosBranch).toBeLessThan(fake)
  })
})
