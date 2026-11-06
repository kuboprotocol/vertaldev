import { describe, expect, it } from 'vitest'
import { formatCountdown, formatCredits, isValidPixKey } from '@/lib/rewards'
import { MIN_WITHDRAW_CREDITS, REWARD_COOLDOWN_MS, REWARD_PER_VIDEO } from '@/config/rewardsConfig'

describe('rewards config', () => {
  it('mantém os valores acordados: 0,020 por vídeo, 1 hora e saque mínimo de 5', () => {
    expect(REWARD_PER_VIDEO).toBe(0.02)
    expect(REWARD_COOLDOWN_MS).toBe(60 * 60 * 1000)
    expect(MIN_WITHDRAW_CREDITS).toBe(5)
  })
})

describe('formatCredits', () => {
  it('formata com 3 casas no padrão pt-BR', () => {
    expect(formatCredits(0.02)).toBe('0,020')
    expect(formatCredits(5)).toBe('5,000')
  })

  it('trata valores inválidos como zero', () => {
    expect(formatCredits(Number.NaN)).toBe('0,000')
  })
})

describe('formatCountdown', () => {
  it('formata HH:MM:SS', () => {
    expect(formatCountdown(59 * 60 * 1000 + 1000)).toBe('00:59:01')
    expect(formatCountdown(3_600_000)).toBe('01:00:00')
  })

  it('arredonda para cima e nunca fica negativo', () => {
    expect(formatCountdown(1)).toBe('00:00:01')
    expect(formatCountdown(-5000)).toBe('00:00:00')
  })
})

describe('isValidPixKey', () => {
  it('aceita chaves entre 3 e 140 caracteres, ignorando espaços nas pontas', () => {
    expect(isValidPixKey('  abc  ')).toBe(true)
    expect(isValidPixKey('ab')).toBe(false)
    expect(isValidPixKey('a'.repeat(141))).toBe(false)
  })
})
