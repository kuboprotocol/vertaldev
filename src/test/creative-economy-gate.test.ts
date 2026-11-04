import { describe, it, expect } from 'vitest'
import { canAccessCreativeEconomy, CREATIVE_ECONOMY_COPY, FEATURES } from '@/config/features'

describe('Economia Criativa em construção', () => {
  it('módulo aberto ao público geral', () => {
    expect(FEATURES.creativeEconomy).toBe(true)
    expect(canAccessCreativeEconomy(false)).toBe(true)
    expect(canAccessCreativeEconomy(true)).toBe(true)
  })

  it('mensagem do aviso', () => {
    expect(CREATIVE_ECONOMY_COPY.title).toBe('Painel de Economia Criativa em construção')
    expect(CREATIVE_ECONOMY_COPY.message).toBe(
      'O Painel de Economia Criativa está em construção, estamos criando algo poderoso pra você e por você.',
    )
    expect(CREATIVE_ECONOMY_COPY.founderWelcome(27)).toContain('Fundador nº 27')
  })
})
