import { describe, it, expect } from 'vitest'
import { applyHead, prerenderPages, renderRobots, renderRss, renderSitemap, sitemapUrls } from '../../vite-plugins/seo'
import { ALTERNATIVES, findAlternative } from '@/config/alternatives'
import { BRAND, SITE_ORIGIN } from '@/config/brand'

describe('SEO: sitemap, robots e páginas de comparação', () => {
  it('SITE_ORIGIN segue a chave de troca de domínio', () => {
    const expected = BRAND.primaryDomainLive ? BRAND.domain : BRAND.legacyDomain
    expect(SITE_ORIGIN).toBe(`https://${expected}`)
  })

  it('sitemap usa a origem informada e inclui cada página de comparação', () => {
    const urls = sitemapUrls('https://vertal.dev')
    expect(urls).toContain('https://vertal.dev/')
    expect(urls).toContain('https://vertal.dev/alternativas')
    for (const a of ALTERNATIVES) {
      expect(urls).toContain(`https://vertal.dev/alternativas/${a.slug}`)
    }
    expect(urls.every((u) => u.startsWith('https://vertal.dev/'))).toBe(true)
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('sitemap não expõe áreas logadas nem admin', () => {
    const xml = renderSitemap('https://vertal.dev')
    expect(xml).toMatch(/^<\?xml version="1.0"/)
    expect(xml).not.toMatch(/\/admin|\/dashboard|\/builder/)
  })

  it('robots aponta para o sitemap e bloqueia /admin/', () => {
    const txt = renderRobots('https://vertal.dev')
    expect(txt).toContain('Sitemap: https://vertal.dev/sitemap.xml')
    expect(txt).toContain('Disallow: /admin/')
  })

  it('slugs de comparação são únicos e em minúsculas', () => {
    const slugs = ALTERNATIVES.map((a) => a.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/)
    expect(findAlternative('lovable')?.name).toBe('Lovable')
    expect(findAlternative('nao-existe')).toBeUndefined()
  })

  it('cobre as ferramentas mais pesquisadas', () => {
    for (const slug of ['vercel', 'lovable', 'replit', 'cursor', 'trae', 'emergent', 'v0', 'claude', 'codex']) {
      expect(findAlternative(slug), slug).toBeDefined()
    }
  })

  const INDEX = `<html><head><title>x</title>
<meta name="description" content="x">
<link rel="canonical" href="https://vertal.dev/" />
<meta property="og:url" content="https://vertal.dev/" />
<meta property="og:title" content="x">
</head><body><div id="root">
<div class="boot-fallback"><div class="boot-fallback__content"><span></span>Loading…</div>
</div>
</div><script type="module" src="/assets/app.js"></script></body></html>`

  it('applyHead troca título, descrição e canonical escapando HTML', () => {
    const html = applyHead(INDEX, { title: 'A & B', description: 'Diz "oi"' }, 'https://vertal.dev/x')
    expect(html).toContain('<title>A &amp; B</title>')
    expect(html).toContain('<meta name="description" content="Diz &quot;oi&quot;">')
    expect(html).toContain('<link rel="canonical" href="https://vertal.dev/x" />')
    expect(html).toContain('<meta property="og:url" content="https://vertal.dev/x" />')
  })

  it('pré-renderiza cada comparação com conteúdo, canonical e FAQ em JSON-LD', () => {
    const pages = prerenderPages(INDEX, 'https://vertal.dev')
    for (const a of ALTERNATIVES) {
      const html = pages.get(`alternativas/${a.slug}.html`)
      expect(html, a.slug).toBeDefined()
      expect(html).toContain(`href="https://vertal.dev/alternativas/${a.slug}"`)
      expect(html).toContain('<h1>')
      expect(html).toContain('"@type":"FAQPage"')
      expect(html).toContain('src="/assets/app.js"')
      expect(html).not.toContain('Loading…')
    }
    expect(pages.get('pricing.html')).toContain('<link rel="canonical" href="https://vertal.dev/pricing" />')
    expect([...pages.keys()].some((k) => /admin|dashboard|builder/.test(k))).toBe(false)
  })

  it('RSS 2.0 lista home, índice e cada comparação com link absoluto', () => {
    const xml = renderRss('https://vertal.dev', new Date('2026-10-16T00:00:00Z'))
    expect(xml).toMatch(/^<\?xml version="1.0"/)
    expect(xml).toContain('<rss version="2.0"')
    expect(xml).toContain('<atom:link href="https://vertal.dev/rss.xml" rel="self"')
    for (const a of ALTERNATIVES) expect(xml).toContain(`<link>https://vertal.dev/alternativas/${a.slug}</link>`)
    expect(xml.match(/<item>/g)?.length).toBe(ALTERNATIVES.length + 2)
    expect(xml).toContain('<pubDate>Fri, 16 Oct 2026 00:00:00 GMT</pubDate>')
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/)
  })
})
