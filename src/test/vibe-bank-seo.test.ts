import { describe, it, expect } from 'vitest'
import { LOCALE_CODES } from '@/config/locales'
import { DESCRIPTION_MAX, TITLE_MAX } from '@/config/seo'
import { VIBE_BANK_COPY, vibeBankPath } from '@/config/vibeBank'
import { renderVibeBankPages, vibeBankHreflang, vibeBankUrls } from '../../vite-plugins/vibeBank'
import { renderRobots, sitemapUrls } from '../../vite-plugins/seo'
import { crawlPriceFor } from '../../worker/payPerCrawl'

const ORIGIN = 'https://vertal.dev'
const REQUIRED = ['pt-BR', 'en', 'es', 'fr', 'de', 'it', 'ja', 'zh-CN', 'hi', 'ar']

describe('Vertal Vibe Bank: landing e SEO internacional', () => {
  it('cobre os idiomas exigidos, com códigos conhecidos e textos completos', () => {
    const codes = VIBE_BANK_COPY.map((c) => c.code)
    for (const r of REQUIRED) expect(codes).toContain(r)
    expect(new Set(codes).size).toBe(codes.length)
    for (const c of VIBE_BANK_COPY) {
      if (c.code !== 'pt-BR') expect(LOCALE_CODES as readonly string[]).toContain(c.code)
      expect(c.title.length, `${c.code} title`).toBeLessThanOrEqual(TITLE_MAX)
      expect(c.description.length, `${c.code} description`).toBeLessThanOrEqual(DESCRIPTION_MAX)
      expect(c.features).toHaveLength(6)
      expect(c.faq.length).toBeGreaterThanOrEqual(5)
      for (const [k, v] of Object.entries(c)) {
        const values = Array.isArray(v) ? v.flat() : [v]
        for (const s of values) expect(String(s).trim(), `${c.code}.${k}`).not.toBe('')
      }
    }
  })

  it('aviso de conformidade cita Stripe e ASAAS em todos os idiomas', () => {
    for (const c of VIBE_BANK_COPY) {
      expect(c.disclaimer, c.code).toContain('Stripe')
      expect(c.disclaimer, c.code).toContain('ASAAS')
      expect(c.faq[0][1], c.code).toContain('Stripe')
    }
  })

  it('gera HTML estático com canonical, hreflang, OG, Twitter e JSON-LD', () => {
    const pages = renderVibeBankPages(ORIGIN)
    expect(pages.size).toBe(VIBE_BANK_COPY.length)
    const root = pages.get('vibe-bank.html')!
    expect(root).toContain('<html lang="pt-BR">')
    expect(root).toContain(`<link rel="canonical" href="${ORIGIN}/vibe-bank" />`)
    const es = pages.get('es/vibe-bank.html')!
    expect(es).toContain(`<link rel="canonical" href="${ORIGIN}/es/vibe-bank" />`)
    expect(es).toContain('twitter:card" content="summary_large_image"')
    expect(es).toContain(`og:image" content="${ORIGIN}/vibe-bank/og-image.jpg"`)
    for (const type of ['Organization', 'WebSite', 'WebPage', 'FAQPage', 'SoftwareApplication', 'BreadcrumbList']) {
      expect(es).toContain(`"@type":"${type}"`)
    }
    expect(pages.get('ar/vibe-bank.html')).toContain('dir="rtl"')
    for (const [file, html] of pages) {
      expect(html, file).not.toContain('BankOrCreditUnion')
      expect(html, file).toContain('ASAAS')
      expect(html, file).toContain('/auth?redirect=%2Fbank')
    }
  })

  it('hreflang liga todas as versões e x-default vai para o inglês', () => {
    const links = vibeBankHreflang(ORIGIN)
    expect(links).toContain(`hreflang="pt-BR" href="${ORIGIN}/vibe-bank"`)
    expect(links).toContain(`hreflang="zh-CN" href="${ORIGIN}/zh-CN/vibe-bank"`)
    expect(links).toContain(`hreflang="x-default" href="${ORIGIN}/en/vibe-bank"`)
    expect(links.match(/hreflang=/g)).toHaveLength(VIBE_BANK_COPY.length + 1)
  })

  it('sitemap, robots e Pay Per Crawl deixam as landings abertas', () => {
    const urls = sitemapUrls(ORIGIN)
    for (const u of vibeBankUrls(ORIGIN)) expect(urls).toContain(u)
    expect(renderRobots(ORIGIN)).toContain('Allow: /vibe-bank')
    expect(crawlPriceFor('/vibe-bank')).toBe(0)
    expect(crawlPriceFor(vibeBankPath('ja'))).toBe(0)
  })
})
