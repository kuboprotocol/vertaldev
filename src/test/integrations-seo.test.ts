import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { applyHead, prerenderPages, renderRobots, renderSitemap, sitemapUrls } from '../../vite-plugins/seo'
import { renderIntegrationPages } from '../../vite-plugins/integrations'
import {
  BANNED_PUBLIC_TERMS,
  INTEGRATIONS,
  INTEGRATIONS_INDEX_SEO,
  findIntegration,
  integrationSeo,
  integrationSlug,
} from '@/config/integrations'
import { INTEGRATION_CONTENT } from '@/config/integrations/content'
import { connectors } from '@/lib/connectorsConfig'
import { HIDDEN_FLUXOS_APPS } from '@/lib/fluxosConnectors'
import { DESCRIPTION_MAX, TITLE_MAX } from '@/config/seo'

const ORIGIN = 'https://vertal.dev'
// index.html de verdade (com o boot-fallback), já com a origem trocada.
const INDEX = readFileSync('index.html', 'utf8').split('%SITE_ORIGIN%').join(ORIGIN)

const textOf = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')

describe('Integrações: uma página pública por conector do catálogo', () => {
  it('cada conector disponível do catálogo tem página (Instagram/WhatsApp Business viram a mesma página)', () => {
    const slugs = new Set(INTEGRATIONS.map((i) => i.slug))
    for (const c of connectors) {
      if (c.status !== 'available') continue
      const slug = c.slug === 'fluxos-instagram' ? 'instagram' : c.slug === 'fluxos-whatsapp' ? 'whatsapp' : integrationSlug(c)
      expect(slugs.has(slug), c.slug).toBe(true)
    }
    expect(INTEGRATIONS.length).toBeGreaterThanOrEqual(95)
  })

  it('apps escondidos e "em breve" nunca ganham página', () => {
    for (const app of HIDDEN_FLUXOS_APPS) expect(findIntegration(app), app).toBeUndefined()
    for (const s of ['openai', 'openrouter', 'azure-openai', 'anthropic', 'mistral-ai', 'together-ai', 'perplexity', 'helix', 'strava', 'flickr', 'web-wallet']) {
      expect(findIntegration(s), s).toBeUndefined()
    }
  })

  it('slugs limpos, únicos e sem nomes internos', () => {
    const slugs = INTEGRATIONS.map((i) => i.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) {
      expect(s).toMatch(/^[a-z0-9-]+$/)
      expect(s.startsWith('fluxos-')).toBe(false)
    }
    expect(findIntegration('vertal-fluxos')?.name).toBe('Vertal Fluxos')
    expect(findIntegration('vertal-agentes')?.name).toBe('Vertal Agentes')
    expect(findIntegration('notion')?.appPath).toBe('/connectors/fluxos-notion')
  })

  it('todo conector atual tem conteúdo próprio (e nenhum texto órfão)', () => {
    for (const i of INTEGRATIONS) expect(INTEGRATION_CONTENT[i.slug], i.slug).toBeDefined()
    // Texto de app escondido fica guardado (volta junto se o app voltar ao catálogo).
    for (const key of Object.keys(INTEGRATION_CONTENT)) if (!HIDDEN_FLUXOS_APPS.has(key)) expect(findIntegration(key), key).toBeDefined()
  })

  it('título, descrição e H1 únicos e dentro dos limites; 3+ exemplos e FAQ', () => {
    const titles = new Set<string>()
    const descs = new Set<string>()
    for (const i of INTEGRATIONS) {
      const seo = integrationSeo(i)
      expect(seo.title.length, i.slug).toBeLessThanOrEqual(TITLE_MAX)
      expect(seo.description.length, i.slug).toBeLessThanOrEqual(DESCRIPTION_MAX)
      expect(seo.title).toContain(i.name.split(' (')[0])
      expect(seo.title.toLowerCase()).toContain('integração')
      titles.add(seo.title)
      descs.add(seo.description)
      expect(i.uses.length, i.slug).toBeGreaterThanOrEqual(3)
      expect(i.faq.length).toBeGreaterThanOrEqual(4)
      expect(i.steps.length).toBeGreaterThanOrEqual(3)
      expect(i.related.length).toBeGreaterThanOrEqual(3)
      for (const r of i.related) expect(findIntegration(r), `${i.slug} → ${r}`).toBeDefined()
    }
    expect(titles.size).toBe(INTEGRATIONS.length)
    expect(descs.size).toBe(INTEGRATIONS.length)
    expect(INTEGRATIONS_INDEX_SEO.title.length).toBeLessThanOrEqual(TITLE_MAX)
  })

  it('ações e gatilhos vêm do motor (ex.: Notion, Google Sheets, Pipedrive)', () => {
    expect(findIntegration('notion')!.actions.map((a) => a.name)).toContain('Criar página')
    expect(findIntegration('google-sheets')!.actions.map((a) => a.name)).toContain('Adicionar linha')
    expect(findIntegration('pipedrive')!.triggers.map((a) => a.name)).toContain('Novo negócio')
    expect(findIntegration('notion')!.connectMode).toBe('oauth')
    expect(findIntegration('deepl')!.connectMode).toBe('key')
    expect(findIntegration('hubspot')!.connectMode).toBe('own-app')
  })

  const pages = renderIntegrationPages(INDEX, applyHead, ORIGIN)

  it('HTML estático completo: title, meta, canonical, H1, OG com logo, JSON-LD e corpo', () => {
    expect(pages.size).toBe(INTEGRATIONS.length + 1)
    for (const i of INTEGRATIONS) {
      const html = pages.get(`integracoes/${i.slug}.html`)!
      const seo = integrationSeo(i)
      expect(html, i.slug).toBeDefined()
      expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/integracoes/${i.slug}" />`)
      expect(html.match(/<h1[ >]/g)?.length, i.slug).toBe(1)
      expect(html).toContain('"@type":"FAQPage"')
      expect(html).toContain('"@type":"BreadcrumbList"')
      expect(html).toContain('"@type":"WebPage"')
      expect(html).not.toContain('<span class="boot-fallback__spinner"')
      expect(html).toContain('src="/src/main.tsx"')
      if (i.logoUrl) {
        expect(html).toContain(`<meta property="og:image" content="${ORIGIN}${i.logoUrl}">`)
        expect(html).toContain('<meta name="twitter:card" content="summary" />')
      }
      expect(html).toContain('<title>')
      expect(html).toContain(seo.heading.replace(/&/g, '&amp;'))
      const words = textOf(html.slice(html.indexOf('<div id="root">'))).split(' ').length
      expect(words, `${i.slug}: ${words} palavras`).toBeGreaterThanOrEqual(300)
    }
    const hub = pages.get('integracoes.html')!
    expect(hub).toContain('"@type":"ItemList"')
    for (const i of INTEGRATIONS) expect(hub).toContain(`href="/integracoes/${i.slug}"`)
  })

  it('white-label: nenhuma página cita o motor nem fornecedores de IA', () => {
    for (const [file, html] of pages) {
      const lower = html.toLowerCase()
      for (const term of BANNED_PUBLIC_TERMS) expect(lower.includes(term), `${file}: ${term}`).toBe(false)
    }
  })

  it('aviso de marcas em todas as páginas', () => {
    for (const [file, html] of pages) expect(html, file).toContain('pertencem aos respectivos donos')
  })

  it('sitemap e robots incluem as integrações; prerender do build também', () => {
    // As integrações ficam nos sitemaps por idioma (sitemap_index.xml), não no principal.
    const urls = sitemapUrls(ORIGIN)
    expect(urls.some((u) => u.includes('/integracoes'))).toBe(false)
    expect(new Set(urls).size).toBe(urls.length)
    expect(renderSitemap(ORIGIN, '2026-11-26')).not.toContain('/integracoes/')
    expect(renderRobots(ORIGIN)).toContain('Allow: /integracoes')
    const all = prerenderPages(INDEX, ORIGIN)
    expect(all.get('integracoes/notion.html')).toContain('Integração Notion')
  })
})
