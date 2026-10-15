import { beforeEach, describe, expect, it } from 'vitest'
import {
  AFFILIATE_RATE, captureReferral, clearStoredReferral, formatCents, getStoredReferral, referralLink,
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

describe('referral guardado', () => {
  beforeEach(() => localStorage.clear())

  it('guarda o ?ref= de qualquer página e devolve depois', () => {
    captureReferral('?utm_source=x&ref=ab12cd34')
    expect(getStoredReferral()).toBe('ab12cd34')
  })
  it('ignora código inválido e mantém o anterior', () => {
    captureReferral('?ref=ab12cd34')
    captureReferral('?ref=<script>')
    expect(getStoredReferral()).toBe('ab12cd34')
  })
  it('expira depois de 30 dias', () => {
    captureReferral('?ref=ab12cd34')
    expect(getStoredReferral(Date.now() + 31 * 24 * 60 * 60 * 1000)).toBe('')
    expect(localStorage.getItem('vertal_ref')).toBeNull()
  })
  it('limpa após o cadastro', () => {
    captureReferral('?ref=ab12cd34')
    clearStoredReferral()
    expect(getStoredReferral()).toBe('')
  })
})
