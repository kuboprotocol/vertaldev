import { describe, it, expect } from 'vitest'
import { AD_SUPPORTED_PLANS, PLAN_CONFIG, shouldShowAd } from '@/lib/planConfig'

const HOUR = 3_600_000
const ago = (h: number) => new Date(Date.now() - h * HOUR)

describe('política de anúncios (docs/PLANOS_E_ANUNCIOS.md)', () => {
  it('só Free e Starter têm anúncio', () => {
    expect([...AD_SUPPORTED_PLANS]).toEqual(['free', 'starter'])
  })

  it('Free: a cada 6h', () => {
    expect(shouldShowAd({ plan: 'free', lastShownAt: null })).toBe(true)
    expect(shouldShowAd({ plan: 'free', lastShownAt: ago(5) })).toBe(false)
    expect(shouldShowAd({ plan: 'free', lastShownAt: ago(6) })).toBe(true)
  })

  it('Starter (US$ 4,99): a cada 12h', () => {
    expect(PLAN_CONFIG.starter.priceUsd).toBe(4.99)
    expect(shouldShowAd({ plan: 'starter', lastShownAt: null })).toBe(true)
    expect(shouldShowAd({ plan: 'starter', lastShownAt: ago(11) })).toBe(false)
    expect(shouldShowAd({ plan: 'starter', lastShownAt: ago(12) })).toBe(true)
  })

  it('todos os outros planos nunca mostram anúncio, com ou sem parceria', () => {
    const others = Object.keys(PLAN_CONFIG).filter((p) => p !== 'free' && p !== 'starter')
    expect(others.length).toBeGreaterThan(0)
    for (const plan of others) {
      for (const partnershipSigned of [false, true]) {
        expect(shouldShowAd({ plan, partnershipSigned, lastShownAt: null })).toBe(false)
        expect(shouldShowAd({ plan, partnershipSigned, lastShownAt: ago(10_000) })).toBe(false)
      }
      expect(PLAN_CONFIG[plan].adFrequencyHours).toBeNull()
    }
  })

  it('plano desconhecido não mostra anúncio', () => {
    expect(shouldShowAd({ plan: 'plano-inexistente', lastShownAt: null })).toBe(false)
  })
})
