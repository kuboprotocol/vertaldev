import { describe, it, expect } from 'vitest'
import { LOCALE_CODES, splitLocalePath } from '@/config/locales'
import { SEO_LOCALES } from '@/config/seoLocales'
import { ALTERNATIVES } from '@/config/alternatives'
import { hreflangLinks, localizedUrls, renderLocalizedPages } from '../../vite-plugins/seoLocales'
import { crawlPriceFor } from '../../worker/payPerCrawl'

describe('SEO traduzido', () => {
  it('tem mais de 50 idiomas, um texto para cada código', () => {
    expect(SEO_LOCALES.length).toBeGreaterThan(50)
    expect(SEO_LOCALES.map((l) => l.code)).toEqual([...LOCALE_CODES])
  })

  it('nenhum texto vazio e marcadores só onde o modelo usa', () => {
    for (const l of SEO_LOCALES) {
      for (const [k, v] of Object.entries(l)) {
        const values = Array.isArray(v) ? v : [v]
        for (const s of values) expect(String(s).trim(), `${l.code}.${k}`).not.toBe('')
      }
      expect(l.altTitle, l.code).toContain('{name}')
      expect(l.faq[0], l.code).toContain('{name}')
    }
  })

  it('gera home, índice e cada comparação por idioma, sem marcadores sobrando', () => {
    const pages = renderLocalizedPages('https://vertal.dev')
    expect(pages.size).toBe(SEO_LOCALES.length * (ALTERNATIVES.length + 2))
    const html = pages.get('es/alternativas/lovable.html')!
    expect(html).toContain('<html lang="es">')
    expect(html).toContain('<link rel="canonical" href="https://vertal.dev/es/alternativas/lovable" />')
    expect(html).toContain('"@type":"FAQPage"')
    expect(pages.get('ar.html')).toContain('dir="rtl"')
    for (const [file, page] of pages) expect(page, file).not.toMatch(/\{(app|name|names)\}/)
  })

  it('hreflang liga raiz, todos os idiomas e x-default', () => {
    const links = hreflangLinks('https://vertal.dev', '/alternativas/cursor')
    expect(links).toContain('hreflang="pt-BR" href="https://vertal.dev/alternativas/cursor"')
    expect(links).toContain('hreflang="zh-CN" href="https://vertal.dev/zh-CN/alternativas/cursor"')
    expect(links).toContain('hreflang="x-default" href="https://vertal.dev/alternativas/cursor"')
    expect(localizedUrls('https://vertal.dev')).toContain('https://vertal.dev/ja')
  })

  it('reconhece o prefixo de idioma e aplica o mesmo preço de crawl', () => {
    expect(splitLocalePath('/es/alternativas/lovable')).toEqual(['es', '/alternativas/lovable'])
    expect(splitLocalePath('/zh-CN')).toEqual(['zh-CN', '/'])
    expect(splitLocalePath('/docs')).toEqual([null, '/docs'])
    expect(splitLocalePath('/app/123')).toEqual([null, '/app/123'])
    expect(crawlPriceFor('/fr/alternativas/cursor')).toBe(crawlPriceFor('/alternativas/cursor'))
    expect(crawlPriceFor('/de')).toBe(0)
  })
})
