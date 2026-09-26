import { describe, it, expect } from 'vitest'
import { canAccessCreativeEconomy, CREATIVE_ECONOMY_COPY, FEATURES } from '@/config/features'

describe('Economia Criativa em construção', () => {
  it('módulo desligado para clientes, liberado para admin', () => {
    expect(FEATURES.creativeEconomy).toBe(false)
    expect(canAccessCreativeEconomy(false)).toBe(false)
    expect(canAccessCreativeEconomy(true)).toBe(true)
  })

  it('mensagem do aviso', () => {
    expect(CREATIVE_ECONOMY_COPY.title).toBe('Economia Criativa em Construção')
    expect(CREATIVE_ECONOMY_COPY.message).toBe('Estamos construindo um ecossistema poderoso pra você e por você.')
  })
})
