import { describe, expect, it } from 'vitest'
import { AFFILIATE_RATE, formatCents, referralLink } from '@/lib/referral'

describe('referral', () => {
  it('link de indicação usa o domínio da marca', () => {
    expect(referralLink('ab12cd34')).toBe('https://vertal.dev/auth?ref=ab12cd34')
  })
  it('comissão de afiliado é 5%', () => {
    expect(AFFILIATE_RATE).toBe(0.05)
    expect(Math.floor(4999 * AFFILIATE_RATE)).toBe(249)
  })
  it('formata centavos', () => {
    expect(formatCents(249)).toContain('2,49')
  })
})
