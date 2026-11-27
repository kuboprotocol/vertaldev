/**
 * Guards the copy of the public landing page ("/"): English only, plain words
 * that translate well, and no hype phrases. Reads the source files, so it does
 * not need to render the page.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HOME_SEO } from '@/config/seo'
import { prerenderPages } from '../../vite-plugins/seo'

const ROOT = join(__dirname, '..')
const FILES = [
  'pages/Index.tsx',
  'components/landing/landingUi.tsx',
  'components/landing/LandingNav.tsx',
  'components/landing/LandingFooter.tsx',
  'components/landing/HeroSection.tsx',
  'components/landing/HowItWorksSection.tsx',
  'components/landing/ConnectorSection.tsx',
  'components/landing/DomainSection.tsx',
  'components/landing/EcosystemSection.tsx',
  'components/landing/VibePaySection.tsx',
  'components/landing/CreditsPromoSection.tsx',
  'components/landing/FAQSection.tsx',
]

/** Visible text only: JSX text and string literals, without comments. */
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
  /fast-paced world/i,
  /\bamazing\b/i,
  /—/, // no em-dash chains
]

// Common Portuguese words that appeared on the old landing.
const PORTUGUESE = /\b(você|seu|sua|créditos|grátis|começar|pagamentos|integrações|alternativas|ecossistema|recompensas|conta|aqui|não)\b/i

const EMOJI = /\p{Extended_Pictographic}/u

describe('landing copy', () => {
  for (const file of FILES) {
    it(`${file} has plain English copy`, () => {
      const text = visibleText(file)
      for (const re of BANNED) expect(text, `${file}: ${re}`).not.toMatch(re)
      expect(text, `${file}: Portuguese word`).not.toMatch(PORTUGUESE)
      expect(text, `${file}: emoji`).not.toMatch(EMOJI)
    })
  }

  it('home SEO is in English and fits the search limits', () => {
    expect(HOME_SEO.title).toMatch(/build apps with AI/)
    expect(HOME_SEO.description).not.toMatch(PORTUGUESE)
  })

  it('index.html marks the home page as English', () => {
    const html = readFileSync(join(ROOT, '..', 'index.html'), 'utf8')
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('if (location.pathname !== "/") document.documentElement.lang = "pt-BR"')
  })

  it('pre-rendered Portuguese pages keep lang="pt-BR"', () => {
    const html = readFileSync(join(ROOT, '..', 'index.html'), 'utf8').split('%SITE_ORIGIN%').join('https://vertal.dev')
    const pricing = prerenderPages(html, 'https://vertal.dev').get('pricing.html')
    expect(pricing).toContain('<html lang="pt-BR">')
    expect(pricing).toContain('<meta property="og:locale" content="pt_BR" />')
    expect(pricing).not.toContain('og:locale:alternate')
  })
})
