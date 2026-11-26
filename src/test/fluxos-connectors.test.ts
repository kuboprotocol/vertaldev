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
  it('Appwrite mostra o logo oficial no catálogo', () => {
    const appwrite = getConnectorBySlug('fluxos-appwrite')
    expect(appwrite?.name).toBe('Appwrite')
    expect(appwrite?.logoUrl).toBe('/connectors/appwrite.png')
  })
  it('nenhum texto de UI cita fornecedores do motor', () => {
    const ui = JSON.stringify(connectors.filter(c => c.slug.startsWith('fluxos-')).map(c => [c.name, c.description, c.longDescription, c.features, c.setupSteps]))
    expect(ui).not.toMatch(/automatisch|huginn|railway/i)
  })
})

describe('apps escondidos do catálogo', () => {
  it('Flickr não aparece em /connectors', async () => {
    const { fluxosConnectors, HIDDEN_FLUXOS_APPS } = await import('@/lib/fluxosConnectors')
    expect(HIDDEN_FLUXOS_APPS.has('flickr')).toBe(true)
    expect(fluxosConnectors.some(c => c.slug === 'fluxos-flickr')).toBe(false)
  })
  it('Strava não aparece em /connectors', async () => {
    const { fluxosConnectors, HIDDEN_FLUXOS_APPS } = await import('@/lib/fluxosConnectors')
    expect(HIDDEN_FLUXOS_APPS.has('strava')).toBe(true)
    expect(fluxosConnectors.some(c => c.slug === 'fluxos-strava')).toBe(false)
  })
  it('OpenAI, OpenRouter e Azure OpenAI fora do catálogo, da busca e das páginas de setup', async () => {
    const { fluxosConnectors, HIDDEN_FLUXOS_APPS } = await import('@/lib/fluxosConnectors')
    for (const app of ['openai', 'openrouter', 'azure-openai']) {
      expect(HIDDEN_FLUXOS_APPS.has(app)).toBe(true)
      expect(getConnectorBySlug(`fluxos-${app}`)).toBeUndefined()
    }
    const text = JSON.stringify(connectors.map(c => [c.slug, c.name, c.description, c.longDescription, c.logoUrl, c.fluxosApp]))
    expect(text).not.toMatch(/openai|openrouter|open router/i)
    expect(fluxosConnectors.some(c => /openai|openrouter/i.test(c.slug))).toBe(false)
  })
  it('lista do servidor igual à do catálogo', async () => {
    const { HIDDEN_FLUXOS_APPS } = await import('@/lib/fluxosConnectors')
    const server = await import('../../supabase/functions/_shared/hiddenFluxosApps.ts')
    expect([...server.HIDDEN_FLUXOS_APPS].sort()).toEqual([...HIDDEN_FLUXOS_APPS].sort())
    expect(server.isHiddenFluxosApp('OpenAI')).toBe(true)
    expect(server.isHiddenFluxosApp('notion')).toBe(false)
    expect(server.withoutHiddenApps([{ key: 'openrouter' }, { key: 'notion' }])).toEqual([{ key: 'notion' }])
  })
  it('pendentes importantes continuam no catálogo', () => {
    for (const app of ['linkedin', 'ebay', 'tiktok-ads', 'kwai-ads', 'amazon-ads', 'reddit', 'hubspot', 'trello']) {
      expect(getConnectorBySlug(`fluxos-${app}`)?.fluxosApp).toBe(app)
    }
    expect(getConnectorBySlug('discord')?.fluxosApp).toBe('discord')
  })
})

describe('LinkedIn e X no catálogo', () => {
  it('LinkedIn aparece com logo próprio', () => {
    const li = getConnectorBySlug('fluxos-linkedin')
    expect(li?.name).toBe('LinkedIn')
    expect(li?.logoUrl).toBe('/connectors/linkedin.svg')
  })
  it('Twitter aparece como X (Twitter), mesmo slug e app', () => {
    const x = getConnectorBySlug('fluxos-twitter')
    expect(x?.name).toBe('X (Twitter)')
    expect(x?.fluxosApp).toBe('twitter')
  })
})
