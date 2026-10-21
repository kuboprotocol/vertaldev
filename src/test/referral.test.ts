import { beforeEach, describe, expect, it } from 'vitest'
import {
  AFFILIATE_RATE,
  REFERRAL_STORAGE_KEY,
  REFERRAL_TTL_DAYS,
  captureReferral,
  clearReferral,
  formatCents,
  referralLink,
  storedReferral,
} from '@/lib/referral'

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

describe('?ref= guardado até o cadastro', () => {
  const day = 24 * 60 * 60 * 1000
  const t0 = Date.UTC(2026, 9, 20)
  beforeEach(() => localStorage.clear())

  it('guarda o código de qualquer página e devolve depois', () => {
    captureReferral('?utm_source=x&ref=ab12cd34', t0)
    expect(storedReferral(t0 + day)).toBe('ab12cd34')
  })
  it('mantém o primeiro código enquanto ele vale', () => {
    captureReferral('?ref=first111', t0)
    captureReferral('?ref=second22', t0 + day)
    expect(storedReferral(t0 + 2 * day)).toBe('first111')
  })
  it('expira depois do prazo e aceita um código novo', () => {
    captureReferral('?ref=first111', t0)
    const later = t0 + (REFERRAL_TTL_DAYS + 1) * day
    expect(storedReferral(later)).toBeNull()
    captureReferral('?ref=second22', later)
    expect(storedReferral(later)).toBe('second22')
  })
  it('ignora valores inválidos, na URL ou no storage', () => {
    captureReferral('?ref=', t0)
    captureReferral('?ref=%3Cscript%3E', t0)
    captureReferral('', t0)
    expect(localStorage.getItem(REFERRAL_STORAGE_KEY)).toBeNull()
    localStorage.setItem(REFERRAL_STORAGE_KEY, '{not json')
    expect(storedReferral(t0)).toBeNull()
    localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify({ code: 'ab12cd34', at: t0 + day }))
    expect(storedReferral(t0)).toBeNull()
  })
  it('clearReferral apaga o código depois do cadastro', () => {
    captureReferral('?ref=ab12cd34', t0)
    clearReferral()
    expect(storedReferral(t0)).toBeNull()
  })
})
