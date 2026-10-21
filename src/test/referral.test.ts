import { describe, expect, it } from 'vitest'
import {
  AFFILIATE_RATE,
  clearStoredReferralCode,
  formatCents,
  getStoredReferralCode,
  referralLink,
  storeReferralCode,
} from '@/lib/referral'

describe('referral', () => {
  it('link de indicação usa o domínio da marca', () => {
    expect(referralLink('ab12cd34')).toBe('https://vertal.dev/auth?ref=ab12cd34')
  })
  it('guarda o código e lê de volta até ser limpo', () => {
    localStorage.clear()
    storeReferralCode('5fe61d6f')
    expect(getStoredReferralCode()).toBe('5fe61d6f')
    clearStoredReferralCode()
    expect(getStoredReferralCode()).toBe('')
  })
  it('ignora código com caracteres inválidos ou curto demais', () => {
    localStorage.clear()
    storeReferralCode('<script>')
    storeReferralCode('ab')
    expect(getStoredReferralCode()).toBe('')
  })
  it('descarta valor inválido já guardado', () => {
    localStorage.setItem('vertal:referral-code', 'x y z')
    expect(getStoredReferralCode()).toBe('')
  })
  it('comissão de afiliado é 5%', () => {
    expect(AFFILIATE_RATE).toBe(0.05)
    expect(Math.floor(4999 * AFFILIATE_RATE)).toBe(249)
  })
  it('formata centavos', () => {
    expect(formatCents(249)).toContain('2,49')
  })
})
