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
  it('todo conector visível de marca tem logo próprio que existe em public/', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    // Sem marca: ficam com o ícone genérico (Vertal Fluxos/Agentes, RPC próprio, carteira, LLM próprio, SMTP).
    const generic = new Set(['automatisch', 'huginn', 'custom-rpc', 'web-wallet', 'fluxos-self-hosted-llm', 'fluxos-smtp'])
    const seen = new Map<string, string>()
    for (const c of connectors) {
      if (generic.has(c.slug)) continue
      expect(c.logoUrl, c.slug).toBeTruthy()
      expect(fs.existsSync(path.join(process.cwd(), 'public', c.logoUrl!)), `${c.slug} → ${c.logoUrl}`).toBe(true)
      // Logo de uma marca não serve para outra (ex.: o mesmo quadrado da Microsoft em Outlook e Teams).
      // Instagram e WhatsApp têm dois cartões (nativo e via Vertal Fluxos) com o mesmo app.
      const owner = seen.get(c.logoUrl!)
      if (owner) expect(c.name.split(' ')[0], `${c.slug} repete o logo de ${owner}`).toBe(owner.split(' ')[0])
      else seen.set(c.logoUrl!, c.name)
    }
  })
  it('Airtable mostra o logo oficial no catálogo', () => {
    const airtable = getConnectorBySlug('fluxos-airtable')
    expect(airtable?.name).toBe('Airtable')
    expect(airtable?.logoUrl).toBe('/connectors/airtable.png')
  })
  it('DeepL mostra o logo oficial no catálogo', () => {
    const deepl = getConnectorBySlug('fluxos-deepl')
    expect(deepl?.name).toBe('DeepL')
    expect(deepl?.logoUrl).toBe('/connectors/deepl.png')
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
  it('conectores sem uso para o público ou sem função real ficam fora (auditoria 26/11/2026)', async () => {
    const { fluxosConnectors, HIDDEN_FLUXOS_APPS } = await import('@/lib/fluxosConnectors')
    for (const app of ['airbrake', 'flowers-software', 'freescout', 'placetel', 'virtualq', 'firefly-iii']) {
      expect(HIDDEN_FLUXOS_APPS.has(app), app).toBe(true)
      expect(getConnectorBySlug(`fluxos-${app}`), app).toBeUndefined()
      expect(fluxosConnectors.some(c => c.fluxosApp === app), app).toBe(false)
    }
    // úteis continuam (chave/token ou app próprio)
    for (const app of ['postgresql', 'telegram-bot', 'smtp', 'monday', 'zendesk', 'wordpress', 'linkedin']) {
      expect(getConnectorBySlug(`fluxos-${app}`), app).toBeDefined()
    }
  })
  it('lista do servidor igual à do catálogo', async () => {
    const { HIDDEN_FLUXOS_APPS } = await import('@/lib/fluxosConnectors')
    const fs = await import('node:fs')
    const src = fs.readFileSync('supabase/functions/_shared/hiddenFluxosApps.ts', 'utf8')
    const body = src.slice(src.indexOf('new Set(['), src.indexOf(']);'))
    const server = new Set([...body.matchAll(/"([a-z0-9-]+)"/g)].map(m => m[1]))
    expect([...server].sort()).toEqual([...HIDDEN_FLUXOS_APPS].sort())
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
  it('Anthropic, Mistral AI, Together AI, Perplexity e Helix fora do catálogo e da busca', async () => {
    const { fluxosConnectors, HIDDEN_FLUXOS_APPS } = await import('@/lib/fluxosConnectors')
    for (const app of ['anthropic', 'mistral-ai', 'together-ai', 'perplexity', 'helix']) {
      expect(HIDDEN_FLUXOS_APPS.has(app)).toBe(true)
      expect(getConnectorBySlug(`fluxos-${app}`)).toBeUndefined()
    }
    const text = JSON.stringify(connectors.map(c => [c.slug, c.name, c.description, c.longDescription, c.logoUrl, c.fluxosApp, c.setupSteps]))
    expect(text).not.toMatch(/anthropic|claude|chatgpt|mistral|together ai|together-ai|perplexity|tryhelix|gemini|deepseek|groq|cohere|hugging ?face|replicate|stability ai/i)
    expect(fluxosConnectors.some(c => c.slug === 'fluxos-helix')).toBe(false)
    // genéricos/não-fornecedores de IA continuam
    for (const app of ['self-hosted-llm', 'deepl', 'notion']) expect(getConnectorBySlug(`fluxos-${app}`)).toBeDefined()
  })
  it('card do Slack não cita o gateway de terceiros', () => {
    const slack = getConnectorBySlug('slack')
    expect(JSON.stringify([slack?.longDescription, slack?.apiKeyHelp, slack?.setupSteps])).not.toMatch(/lovable/i)
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
