import { describe, it, expect } from 'vitest'
import { INDEXNOW_KEY } from '@/config/indexnow'
import { parseSitemap, prioritizeForBing } from '../../scripts/indexnow.mjs'
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

  it('Bing recebe primeiro as páginas em pt-BR, depois inglês e espanhol', () => {
    const o = 'https://vertal.dev'
    const out = prioritizeForBing([`${o}/ja`, `${o}/es/alternativas/v0`, `${o}/en`, `${o}/alternativas/lovable`, `${o}/`, `${o}/pricing`], o)
    expect(out.slice(0, 3).sort()).toEqual([`${o}/`, `${o}/alternativas/lovable`, `${o}/pricing`].sort())
    expect(out[3]).toBe(`${o}/en`)
    expect(out[4]).toBe(`${o}/es/alternativas/v0`)
    expect(out[5]).toBe(`${o}/ja`)
  })
})
