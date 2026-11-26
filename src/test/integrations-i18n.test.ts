import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import {
  integrationHreflang,
  integrationPagePath,
  loadDict,
  renderIntegrationI18nPages,
  renderIntegrationSitemaps,
  renderSitemapIndex,
} from '../../vite-plugins/integrationsI18n'
import { renderRobots } from '../../vite-plugins/seo'
import { BANNED_PUBLIC_TERMS, INTEGRATIONS } from '@/config/integrations'
import { integrationSourceStrings } from '@/config/integrations/i18n'
import { ALL_INTEGRATION_LOCALES, INTEGRATION_LOCALES } from '@/config/integrations/locales'
import { crawlPriceFor } from '../../worker/payPerCrawl'
import { HIDDEN_FLUXOS_APPS } from '@/lib/fluxosConnectors'

/** Traduções de app escondido ficam guardadas (voltam junto se o app voltar ao catálogo). */
const hiddenKey = (k: string) => HIDDEN_FLUXOS_APPS.has(k.match(/^[ec]\.([a-z0-9-]+)\./)?.[1] ?? '')

const ORIGIN = 'https://vertal.dev'
const pages = renderIntegrationI18nPages(ORIGIN)
const source = integrationSourceStrings()
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')

describe('Integrações em 22 idiomas', () => {
  it('21 idiomas + pt-BR, códigos e segmentos únicos', () => {
    expect(INTEGRATION_LOCALES).toHaveLength(21)
    expect(ALL_INTEGRATION_LOCALES.map((l) => l.code)).toEqual(
      ['pt-BR', 'zh-CN', 'es', 'en', 'hi', 'bn', 'ru', 'ja', 'pa', 'vi', 'tr', 'mr', 'te', 'ko', 'fr', 'ta', 'ar', 'de', 'ur', 'jv', 'it', 'fa'],
    )
    for (const l of ALL_INTEGRATION_LOCALES) expect(l.segment).toMatch(/^[a-z-]+$/)
    expect(integrationPagePath(INTEGRATION_LOCALES.find((l) => l.code === 'en')!, 'notion')).toBe('/en/integrations/notion')
    expect(integrationPagePath(INTEGRATION_LOCALES.find((l) => l.code === 'es')!, 'notion')).toBe('/es/integraciones/notion')
  })

  it('uma página por conector e um índice em cada idioma', () => {
    expect(pages.size).toBe(INTEGRATION_LOCALES.length * (INTEGRATIONS.length + 1))
    for (const l of INTEGRATION_LOCALES) {
      expect(pages.has(`${l.code}/${l.segment}.html`), l.code).toBe(true)
      for (const i of INTEGRATIONS) expect(pages.has(`${l.code}/${l.segment}/${i.slug}.html`), `${l.code} ${i.slug}`).toBe(true)
    }
  })

  it('lang, dir=rtl (ar, ur, fa), canonical, hreflang completo com x-default', () => {
    for (const l of INTEGRATION_LOCALES) {
      const html = pages.get(`${l.code}/${l.segment}/notion.html`)!
      expect(html).toContain(`<html lang="${l.lang}"${l.dir ? ' dir="rtl"' : ''}>`)
      expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/${l.code}/${l.segment}/notion" />`)
      expect(html.match(/hreflang="[^"]+" href=/g)?.length).toBeGreaterThanOrEqual(23)
      expect(html).toContain(`<link rel="alternate" hreflang="x-default" href="${ORIGIN}/integracoes/notion" />`)
      expect(html.match(/<h1>/g)).toHaveLength(1)
      expect(html).toContain('"@type":"FAQPage"')
    }
    for (const code of ['ar', 'ur', 'fa']) expect(pages.get(`${code}/integrations/notion.html`)).toContain('dir="rtl"')
    expect(integrationHreflang(ORIGIN, 'gmail')).toContain('hreflang="pt-BR" href="https://vertal.dev/integracoes/gmail"')
  })

  it('traduções guardam marcadores e não citam o motor nem fornecedores de IA', () => {
    for (const l of INTEGRATION_LOCALES) {
      const dict = loadDict(l.code)
      for (const [k, v] of Object.entries(dict)) {
        if (hiddenKey(k)) continue
        expect(k in source, `${l.code}: chave órfã ${k}`).toBe(true)
        expect(placeholders(v), `${l.code} ${k}`).toBe(placeholders(source[k]))
      }
    }
    for (const [file, html] of pages) {
      const lower = html.toLowerCase()
      for (const term of BANNED_PUBLIC_TERMS) expect(lower.includes(term), `${file}: ${term}`).toBe(false)
      expect(html, file).not.toMatch(/\{(name|app|n|a|t|list|fields)\}/)
    }
  })

  it('cada idioma tem o seu arquivo de traduções quase completo', () => {
    const total = Object.keys(source).length
    for (const l of INTEGRATION_LOCALES) {
      expect(existsSync(`src/config/integrations/i18n/${l.code}.json`), l.code).toBe(true)
      expect(Object.keys(loadDict(l.code)).length / total, l.code).toBeGreaterThan(0.9)
    }
    const committed = JSON.parse(readFileSync('src/config/integrations/i18n/source.pt-BR.json', 'utf8'))
    expect(Object.keys(committed).length).toBeGreaterThan(1000)
  })

  it('app escondido do catálogo não tem página nem entra nos sitemaps', () => {
    const maps = renderIntegrationSitemaps(ORIGIN, '2026-11-26')
    for (const app of ['placetel', 'flowers-software', 'strava', 'flickr']) {
      for (const [file] of pages) expect(file.includes(`/${app}.html`), file).toBe(false)
      for (const [name, xml] of maps) expect(xml.includes(`/${app}</loc>`), `${name}: ${app}`).toBe(false)
    }
  })

  it('FreeScout, Firefly III, VirtualQ e Airbrake voltaram: página em todos os idiomas e nos 22 sitemaps', () => {
    const maps = renderIntegrationSitemaps(ORIGIN, '2026-11-26')
    for (const app of ['freescout', 'firefly-iii', 'virtualq', 'airbrake']) {
      const files = [...pages.keys()].filter((f) => f.endsWith(`/${app}.html`))
      expect(files.length, app).toBe(INTEGRATION_LOCALES.length)
      for (const [name, xml] of maps) expect(xml.includes(`/${app}</loc>`), `${name}: ${app}`).toBe(true)
      const en = pages.get(files.find((f) => f.startsWith('en/'))!)!
      // Pergunta de nicho "X tem OAuth?" traduzida, no FAQ e no JSON-LD.
      expect(en, app).toMatch(/OAuth\?/)
      expect(en, app).not.toMatch(/\{(name|app|n|a|t|list|fields)\}/)
    }
  })

  it('sitemap por idioma com alternates + índice de sitemaps + robots', () => {
    const maps = renderIntegrationSitemaps(ORIGIN, '2026-11-26')
    expect(maps.size).toBe(22)
    const en = maps.get('sitemap-integrations-en.xml')!
    expect(en).toContain('<loc>https://vertal.dev/en/integrations/notion</loc>')
    expect(en).toContain('hreflang="x-default" href="https://vertal.dev/integracoes/notion"')
    expect(en.match(/<url>/g)).toHaveLength(INTEGRATIONS.length + 1)
    expect(maps.get('sitemap-integrations-pt-BR.xml')).toContain('<loc>https://vertal.dev/integracoes/notion</loc>')
    const index = renderSitemapIndex(ORIGIN, '2026-11-26')
    expect(index).toContain('<sitemapindex')
    expect(index).toContain('<loc>https://vertal.dev/sitemap.xml</loc>')
    expect(index).toContain('<loc>https://vertal.dev/sitemap-integrations-ar.xml</loc>')
    expect(renderRobots(ORIGIN)).toContain('Sitemap: https://vertal.dev/sitemap_index.xml')
  })

  it('Pay Per Crawl: páginas de integração e sitemaps grátis em todos os idiomas', () => {
    expect(crawlPriceFor('/integracoes/notion')).toBe(0)
    expect(crawlPriceFor('/en/integrations/notion')).toBe(0)
    expect(crawlPriceFor('/pa/integrations/notion')).toBe(0)
    expect(crawlPriceFor('/sitemap-integrations-jv.xml')).toBe(0)
  })
})
