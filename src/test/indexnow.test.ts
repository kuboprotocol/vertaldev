import { describe, it, expect } from 'vitest'
import { INDEXNOW_KEY } from '@/config/indexnow'
import { parseSitemap } from '../../scripts/indexnow.mjs'
import { renderSitemap } from '../../vite-plugins/seo'

describe('IndexNow', () => {
  it('chave em hexadecimal com tamanho aceito pelo protocolo', () => {
    expect(INDEXNOW_KEY).toMatch(/^[0-9a-f]{8,128}$/)
  })

  it('extrai todas as URLs do sitemap gerado', () => {
    const urls = parseSitemap(renderSitemap('https://vertal.dev'))
    expect(urls.length).toBeGreaterThan(900)
    expect(urls).toContain('https://vertal.dev/alternativas/lovable')
    expect(urls.every((u: string) => u.startsWith('https://vertal.dev/'))).toBe(true)
  })
})
