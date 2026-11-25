import { describe, expect, it } from 'vitest'
import {
  FREE_CRM_COSTS,
  FREE_CRM_LOCALES,
  freeCrmDocsPath,
  freeCrmPath,
  isFreeCrmSeoEnabled,
  paidPlans,
} from '@/config/freeCrm'
import {
  fillCrm,
  freeCrmAlternates,
  freeCrmFile,
  freeCrmSitemapEntries,
  freeCrmUrls,
  renderFreeCrmPages,
} from '../../vite-plugins/freeCrm'
import { renderSitemap, sitemapUrls } from '../../vite-plugins/seo'
import { renderLocalizedPages } from '../../vite-plugins/seoLocales'
import { renderVibePayPages } from '../../vite-plugins/vibePay'
import { CRM_AI_COST, CRM_SYNC_ACTIVATE_COST, CRM_SYNC_AI_RUN_COST } from '../../supabase/functions/_shared/vertalCrm/core'
import { DESCRIPTION_MAX, TITLE_MAX } from '@/config/seo'
import { LOCALE_CODES } from '@/config/locales'

const ORIGIN = 'https://vertal.dev'
const pages = renderFreeCrmPages(ORIGIN)

describe('Vertal CRM grátis · páginas de SEO', () => {
  it('cobre pelo menos 21 idiomas, sem códigos repetidos, pt-BR na raiz', () => {
    expect(FREE_CRM_LOCALES.length).toBeGreaterThanOrEqual(21)
    const codes = FREE_CRM_LOCALES.map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(freeCrmPath(FREE_CRM_LOCALES[0])).toBe('/crm-gratis')
    expect(freeCrmDocsPath(FREE_CRM_LOCALES[0])).toBe('/docs/vertal-crm')
    for (const l of ['pt-BR', 'pt-PT', 'en', 'es', 'fr', 'de', 'it', 'nl', 'pl', 'tr', 'ru', 'uk', 'ar', 'hi', 'id', 'vi', 'th', 'ja', 'ko', 'zh-CN', 'zh-TW']) {
      expect(codes).toContain(l)
    }
  })

  it('prefixos são idiomas conhecidos do site e slugs são ASCII', () => {
    for (const c of FREE_CRM_LOCALES) {
      if (c.code !== 'pt-BR') expect(LOCALE_CODES as readonly string[]).toContain(c.code)
      expect(c.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
    const paths = FREE_CRM_LOCALES.map(freeCrmPath)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('não sobrescreve nenhuma página que o build já gera', () => {
    const existing = new Set([...renderLocalizedPages(ORIGIN).keys(), ...renderVibePayPages(ORIGIN).keys()])
    for (const file of pages.keys()) expect(existing.has(file)).toBe(false)
    // /crm é a rota do app (React): a landing nunca usa esse caminho.
    expect([...pages.keys()]).not.toContain('crm.html')
  })

  it('títulos e descrições cabem nos limites e são únicos por idioma', () => {
    const titles = new Set<string>()
    for (const c of FREE_CRM_LOCALES) {
      for (const [t, d] of [[c.title, c.description], [c.docsTitle, c.docsDescription]]) {
        expect(t.length, `${c.code}: ${t}`).toBeLessThanOrEqual(TITLE_MAX)
        expect(d.length, `${c.code}: ${d}`).toBeLessThanOrEqual(DESCRIPTION_MAX)
        expect(titles.has(t)).toBe(false)
        titles.add(t)
      }
      expect(c.features).toHaveLength(6)
      expect(c.faq).toHaveLength(5)
      expect(c.docsFaq).toHaveLength(5)
    }
  })

  it('créditos são os mesmos que o servidor cobra', () => {
    expect(FREE_CRM_COSTS).toEqual({ ai: CRM_AI_COST, activate: CRM_SYNC_ACTIVATE_COST, aiSync: CRM_SYNC_AI_RUN_COST, plainSync: 2 })
    expect([CRM_AI_COST, CRM_SYNC_ACTIVATE_COST, CRM_SYNC_AI_RUN_COST]).toEqual([1, 4, 2])
  })

  it('preço do plano vem da configuração real (sem preço inventado)', () => {
    const plans = paidPlans()
    expect(plans.map((p) => p.name)).toEqual(['Starter', 'Pro', 'Premium 1'])
    const en = FREE_CRM_LOCALES.find((c) => c.code === 'en')!
    expect(fillCrm('{price}', en)).toBe('$4.99')
    for (const c of FREE_CRM_LOCALES) {
      const html = pages.get(freeCrmFile('landing', c))!
      expect(html).not.toMatch(/\{(ai|activate|aiSync|plainSync|price)\}/)
    }
  })

  it('cada página tem conteúdo real, canonical, hreflang recíproco + x-default e JSON-LD', () => {
    const alts = freeCrmAlternates('landing', ORIGIN)
    expect(alts.at(-1)).toEqual(['x-default', `${ORIGIN}/en/free-crm`])
    for (const c of FREE_CRM_LOCALES) {
      for (const kind of ['landing', 'docs'] as const) {
        const html = pages.get(freeCrmFile(kind, c))!
        const url = `${ORIGIN}${kind === 'landing' ? freeCrmPath(c) : freeCrmDocsPath(c)}`
        expect(html).toContain(`<html lang="${c.lang}"${c.dir ? ` dir="${c.dir}"` : ''}>`)
        expect(html).toContain(`<link rel="canonical" href="${url}" />`)
        for (const [lang, href] of freeCrmAlternates(kind, ORIGIN)) {
          expect(html).toContain(`<link rel="alternate" hreflang="${lang}" href="${href}" />`)
        }
        expect(html).toContain('"@type":"FAQPage"')
        expect(html).toContain('"@type":"BreadcrumbList"')
        expect(html).toContain('<h1>')
        expect(html).toContain('/auth?redirect=%2Fcrm')
        expect(html).not.toMatch(/<script(?![^>]*application\/ld\+json)/) // sem JS na página
        expect(html).not.toContain('aggregateRating')
        expect(html).not.toContain('display:none')
      }
      const landing = pages.get(freeCrmFile('landing', c))!
      expect(landing).toContain('"@type":"SoftwareApplication"')
      expect(landing).toContain('"price":"0"')
      expect(landing).toContain(c.h1.replace(/&/g, '&amp;'))
      expect(pages.get(freeCrmFile('docs', c))!).toContain('"@type":"TechArticle"')
    }
  })

  it('árabe é RTL', () => {
    const ar = FREE_CRM_LOCALES.find((c) => c.code === 'ar')!
    expect(pages.get(freeCrmFile('landing', ar))).toContain('<html lang="ar" dir="rtl">')
  })

  it('JSON-LD de todas as páginas é JSON válido', () => {
    for (const html of pages.values()) {
      for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        expect(() => JSON.parse(m[1])).not.toThrow()
      }
    }
  })

  it('sitemap traz as URLs com xhtml:link e continua igual com a flag desligada', () => {
    const on = renderSitemap(ORIGIN, '2026-11-25', true)
    const off = renderSitemap(ORIGIN, '2026-11-25', false)
    expect(on).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
    for (const u of freeCrmUrls(ORIGIN)) expect(on).toContain(`<loc>${u}</loc>`)
    expect(on).toContain(`<xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}/en/free-crm" />`)
    expect(off).not.toContain('xhtml')
    expect(off).not.toContain('crm-gratis')
    // Regressão: tudo o que já estava no sitemap continua lá.
    for (const u of sitemapUrls(ORIGIN)) expect(on).toContain(`<loc>${u}</loc>`)
    expect(freeCrmSitemapEntries(ORIGIN, '2026-11-25').match(/<url>/g)).toHaveLength(FREE_CRM_LOCALES.length * 2)
  })

  it('interruptor do build', () => {
    expect(isFreeCrmSeoEnabled({})).toBe(true)
    expect(isFreeCrmSeoEnabled({ VERTAL_FREE_CRM_SEO: 'false' })).toBe(false)
    expect(isFreeCrmSeoEnabled({ VERTAL_FREE_CRM_SEO: '0' })).toBe(false)
  })
})
