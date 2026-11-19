import { describe, it, expect } from 'vitest'
import { LOCALE_CODES } from '@/config/locales'
import { DESCRIPTION_MAX, TITLE_MAX } from '@/config/seo'
import { VIBE_PAY, VIBE_PAY_COPY, vibePayPath } from '@/config/vibePay'
import { renderVibePayPages, vibePayHreflang, vibePayUrls } from '../../vite-plugins/vibePay'
import { renderRobots, sitemapUrls } from '../../vite-plugins/seo'
import { crawlPriceFor } from '../../worker/payPerCrawl'
import { legacyRedirect, legacyRedirectPath } from '../../worker/legacyRedirects'

const ORIGIN = 'https://vertal.dev'
const REQUIRED = ['pt-BR', 'en', 'es', 'fr', 'de', 'it', 'ja', 'zh-CN', 'hi', 'ar']

/**
 * "Banco"/"bank" em cada idioma da landing. A Res. Conjunta CMN/BCB 17/2025
 * veda o termo para quem não tem licença bancária e a 16/2025 impede que BaaS
 * (ex.: ASAAS) contratem com parceiros que o usem. Nome, título, descrição,
 * H1 e selo nunca podem trazê-lo; só o FAQ "É um banco? Não…" e o aviso de
 * conformidade falam de banco, para negar.
 */
const BANK_WORDS = /bank|banco|banque|banca|銀行|银行|बैंक|بنك|은행|банк|banka/i

describe('Vertal Vibe Pay: landing e SEO internacional', () => {
  it('cobre os idiomas exigidos, com códigos conhecidos e textos completos', () => {
    const codes = VIBE_PAY_COPY.map((c) => c.code)
    for (const r of REQUIRED) expect(codes).toContain(r)
    expect(new Set(codes).size).toBe(codes.length)
    for (const c of VIBE_PAY_COPY) {
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

  it('nenhum idioma usa "banco/bank" como alegação no nome, título, descrição ou H1', () => {
    for (const s of [VIBE_PAY.name, VIBE_PAY.wordmark, VIBE_PAY.landingPath, VIBE_PAY.appPath]) {
      expect(s).not.toMatch(BANK_WORDS)
    }
    for (const c of VIBE_PAY_COPY) {
      for (const k of ['title', 'description', 'keywords', 'eyebrow', 'h1', 'featuresTitle'] as const) {
        expect(c[k], `${c.code}.${k}`).not.toMatch(BANK_WORDS)
      }
      expect(c.title, c.code).toContain(VIBE_PAY.name)
    }
  })

  it('aviso de conformidade cita Stripe e ASAAS e nega ser banco em todos os idiomas', () => {
    for (const c of VIBE_PAY_COPY) {
      expect(c.disclaimer, c.code).toContain('Stripe')
      expect(c.disclaimer, c.code).toContain('ASAAS')
      expect(c.faq[0][0], c.code).toContain(VIBE_PAY.name)
      expect(c.faq[0][1], c.code).toContain('Stripe')
      expect(c.faq[0][1], c.code).toContain('ASAAS')
    }
  })

  it('gera HTML estático com canonical, hreflang, OG, Twitter e JSON-LD', () => {
    const pages = renderVibePayPages(ORIGIN)
    expect(pages.size).toBe(VIBE_PAY_COPY.length)
    const root = pages.get('vibe-pay.html')!
    expect(root).toContain('<html lang="pt-BR">')
    expect(root).toContain(`<link rel="canonical" href="${ORIGIN}/vibe-pay" />`)
    const es = pages.get('es/vibe-pay.html')!
    expect(es).toContain(`<link rel="canonical" href="${ORIGIN}/es/vibe-pay" />`)
    expect(es).toContain('twitter:card" content="summary_large_image"')
    expect(es).toContain(`og:image" content="${ORIGIN}/vibe-pay/og-image.jpg"`)
    for (const type of ['Organization', 'WebSite', 'WebPage', 'FAQPage', 'SoftwareApplication', 'BreadcrumbList']) {
      expect(es).toContain(`"@type":"${type}"`)
    }
    expect(pages.get('ar/vibe-pay.html')).toContain('dir="rtl"')
    for (const [file, html] of pages) {
      expect(html, file).not.toContain('BankOrCreditUnion')
      expect(html, file).not.toContain('vibe-bank')
      expect(html, file).not.toMatch(/Vibe Bank/i)
      expect(html, file).toContain('ASAAS')
      expect(html, file).toContain('/auth?redirect=%2Fpay')
      const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''
      expect(title, file).not.toMatch(BANK_WORDS)
    }
  })

  it('hreflang liga todas as versões e x-default vai para o inglês', () => {
    const links = vibePayHreflang(ORIGIN)
    expect(links).toContain(`hreflang="pt-BR" href="${ORIGIN}/vibe-pay"`)
    expect(links).toContain(`hreflang="zh-CN" href="${ORIGIN}/zh-CN/vibe-pay"`)
    expect(links).toContain(`hreflang="x-default" href="${ORIGIN}/en/vibe-pay"`)
    expect(links.match(/hreflang=/g)).toHaveLength(VIBE_PAY_COPY.length + 1)
  })

  it('sitemap, robots e Pay Per Crawl deixam as landings abertas', () => {
    const urls = sitemapUrls(ORIGIN)
    for (const u of vibePayUrls(ORIGIN)) expect(urls).toContain(u)
    expect(urls.some((u) => u.includes('vibe-bank'))).toBe(false)
    expect(renderRobots(ORIGIN)).toContain('Allow: /vibe-pay')
    expect(crawlPriceFor('/vibe-pay')).toBe(0)
    expect(crawlPriceFor(vibePayPath('ja'))).toBe(0)
  })

  it('rotas antigas redirecionam (301) para as novas, mantendo idioma e query', () => {
    expect(legacyRedirectPath('/vibe-bank')).toBe('/vibe-pay')
    expect(legacyRedirectPath('/vibe-bank/')).toBe('/vibe-pay')
    expect(legacyRedirectPath('/vertal-vibe-bank')).toBe('/vibe-pay')
    expect(legacyRedirectPath('/es/vibe-bank')).toBe('/es/vibe-pay')
    expect(legacyRedirectPath('/zh-CN/vibe-bank')).toBe('/zh-CN/vibe-pay')
    expect(legacyRedirectPath('/bank')).toBe('/pay')
    expect(legacyRedirectPath('/carteira')).toBe('/pay')
    expect(legacyRedirectPath('/vibe-bank/og-image.jpg')).toBe('/vibe-pay/og-image.jpg')
    expect(legacyRedirectPath('/vibe-pay')).toBeNull()
    expect(legacyRedirectPath('/pay')).toBeNull()
    expect(legacyRedirectPath('/es/pricing')).toBeNull()
    const res = legacyRedirect(new URL(`${ORIGIN}/bank?tab=contas`))!
    expect(res.status).toBe(301)
    expect(res.headers.get('Location')).toBe(`${ORIGIN}/pay?tab=contas`)
  })
})
