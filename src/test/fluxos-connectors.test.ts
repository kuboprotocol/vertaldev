import { describe, it, expect } from 'vitest'
import { connectors, getConnectorBySlug } from '@/lib/connectorsConfig'
import { FLUXOS_NATIVE_APPS, FLUXOS_SHARED_APPS } from '@/lib/fluxosConnectors'

describe('catálogo unificado Vertal Dev ↔ Vertal Fluxos', () => {
  it('slugs são únicos', () => {
    const slugs = connectors.map(c => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
  it('conectores compartilhados apontam para o mesmo app do Vertal Fluxos', () => {
    for (const [slug, app] of Object.entries(FLUXOS_SHARED_APPS)) {
      expect(getConnectorBySlug(slug)?.fluxosApp).toBe(app)
    }
  })
  it('apps nativos do Vertal Fluxos aparecem como conectores "via Vertal Fluxos"', () => {
    expect(FLUXOS_NATIVE_APPS.length).toBeGreaterThan(50)
    const notion = getConnectorBySlug('fluxos-notion')
    expect(notion?.fluxosApp).toBe('notion')
    expect(notion?.status).toBe('available')
    for (const a of FLUXOS_NATIVE_APPS) expect(Object.keys(FLUXOS_SHARED_APPS)).not.toContain(a.app)
  })
  it('Airbrake mostra o logo oficial no catálogo', () => {
    const airbrake = getConnectorBySlug('fluxos-airbrake')
    expect(airbrake?.name).toBe('Airbrake')
    expect(airbrake?.logoUrl).toBe('/connectors/airbrake.png')
  })
  it('Airtable mostra o logo oficial no catálogo', () => {
    const airtable = getConnectorBySlug('fluxos-airtable')
    expect(airtable?.name).toBe('Airtable')
    expect(airtable?.logoUrl).toBe('/connectors/airtable.png')
  })
  it('Anthropic mostra o logo oficial no catálogo', () => {
    const anthropic = getConnectorBySlug('fluxos-anthropic')
    expect(anthropic?.name).toBe('Anthropic')
    expect(anthropic?.logoUrl).toBe('/connectors/anthropic.png')
  })
  it('nenhum texto de UI cita fornecedores do motor', () => {
    const ui = JSON.stringify(connectors.filter(c => c.slug.startsWith('fluxos-')).map(c => [c.name, c.description, c.longDescription, c.features, c.setupSteps]))
    expect(ui).not.toMatch(/automatisch|huginn|railway/i)
  })
})
