/**
 * Guards the copy of the pages moved to the shared Apple-style design system
 * and to English: plain words that translate well, no hype phrases, no emoji,
 * no em-dash chains, and no Portuguese left in the UI. Reads the source files.
 * Also keeps the English route list in index.html in sync with siteLanguage.ts.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ENGLISH_ROUTES, isEnglishRoute } from '@/config/siteLanguage'
import { ROUTE_SEO } from '@/config/seo'

const ROOT = join(__dirname, '..')

/** Files whose visible copy was rewritten in plain English. */
const FILES = [
  'components/site/siteUi.tsx',
  'components/site/SiteNav.tsx',
  'components/site/SiteFooter.tsx',
  'components/site/SitePage.tsx',
  'components/site/AppShell.tsx',
  'components/landing/Navbar.tsx',
  'pages/PricingPage.tsx',
  'components/pricing/ContactDialog.tsx',
  'pages/EcosystemPage.tsx',
  'components/ecosystem/EcosystemShowcase.tsx',
  'components/ecosystem/EcosystemDialogs.tsx',
  'lib/ecosystem.ts',
  'pages/DownloadPage.tsx',
  'components/download/LocalAgentTokens.tsx',
  'pages/SupportPage.tsx',
  'pages/DataDeletionPage.tsx',
  'pages/DocsMcpPage.tsx',
  'pages/NotFound.tsx',
  'pages/ResetPasswordPage.tsx',
]

function visibleText(file: string): string {
  const src = readFileSync(join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  const jsxText = [...src.matchAll(/>([^<>{}]+)</g)].map((m) => m[1])
  const strings = [...src.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)]
    .map((m) => m[2])
    .filter((s) => /\s/.test(s))
  return [...jsxText, ...strings].join('\n')
}

const BANNED = [
  /\bunleash/i,
  /\bsupercharg/i,
  /\brevolutioni[sz]e/i,
  /\bseamless/i,
  /\beffortless/i,
  /\belevate/i,
  /\bempower/i,
  /game[- ]changer/i,
  /\bamazing\b/i,
  /superpower/i,
  /\bblazing/i,
  /—/, // no em-dash chains
]

const PORTUGUESE =
  /\b(você|seu|sua|créditos|grátis|começar|pagamentos|integrações|alternativas|ecossistema|recompensas|conta|aqui|não|para|criar|entrar|salvar|carregando|erro|planos|preços|suporte|mensagem|enviar|baixar|em breve)\b/i

const EMOJI = /\p{Extended_Pictographic}/u

describe('site copy (English, Apple-style pages)', () => {
  for (const file of FILES) {
    it(`${file} has plain English copy`, () => {
      // Route paths like "/alternativas" or "/recompensas" are links, not copy.
      const text = visibleText(file).replace(/\/[a-z0-9-/]+/g, '')
      for (const re of BANNED) expect(text, `${file}: ${re}`).not.toMatch(re)
      expect(text, `${file}: Portuguese word`).not.toMatch(PORTUGUESE)
      expect(text, `${file}: emoji`).not.toMatch(EMOJI)
    })
  }

  it('index.html lists the same English routes as siteLanguage.ts', () => {
    const html = readFileSync(join(ROOT, '..', 'index.html'), 'utf8')
    const m = html.match(/var en = (\[[^\]]*\]);/)
    expect(m).not.toBeNull()
    expect(JSON.parse(m![1])).toEqual([...ENGLISH_ROUTES])
  })

  it('routes in Portuguese multilingual sets are not marked English', () => {
    for (const p of ['/alternativas', '/alternativas/lovable', '/integracoes', '/vibe-pay', '/crm-gratis', '/en/free-crm']) {
      expect(isEnglishRoute(p), p).toBe(false)
    }
    expect(isEnglishRoute('/pricing/')).toBe(true)
  })

  it('SEO titles of English routes are in English', () => {
    for (const p of ENGLISH_ROUTES) {
      const seo = ROUTE_SEO[p]
      if (!seo) continue
      expect(`${seo.title} ${seo.description}`, p).not.toMatch(PORTUGUESE)
    }
  })
})
