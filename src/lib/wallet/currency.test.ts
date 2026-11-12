import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { toMinorUnits, formatMinor, platformFeeFor, PLATFORM_FEE_RATE, CHARGE_CURRENCIES } from './currency'

describe('wallet currency', () => {
  it('converte para a menor unidade', () => {
    expect(toMinorUnits(12.34, 'BRL')).toBe(1234)
    expect(toMinorUnits(10, 'usd')).toBe(1000)
    expect(toMinorUnits(500, 'JPY')).toBe(500)
    expect(toMinorUnits(1500, 'CLP')).toBe(1500)
  })
  it('recusa valores inválidos ou que não cobrem a taxa', () => {
    expect(toMinorUnits(0, 'BRL')).toBeNull()
    expect(toMinorUnits(-1, 'BRL')).toBeNull()
    expect(toMinorUnits(0.01, 'BRL')).toBeNull()
    expect(toMinorUnits(10, 'XYZ')).toBeNull()
  })
  it('taxa de 1% por cobrança, mínimo 1 unidade', () => {
    expect(PLATFORM_FEE_RATE).toBe(0.01)
    expect(platformFeeFor(10000)).toBe(100) // R$ 100,00 -> R$ 1,00
    expect(platformFeeFor(1234)).toBe(12)   // R$ 12,34 -> R$ 0,12
    expect(platformFeeFor(50)).toBe(1)      // piso
    expect(formatMinor(platformFeeFor(10000), 'BRL')).toMatch(/1,00/)
  })
  it('tem BRL e USD', () => {
    expect(CHARGE_CURRENCIES.map((c) => c.code)).toEqual(expect.arrayContaining(['BRL', 'USD']))
  })
  it('espelho do servidor é idêntico', () => {
    const strip = (s: string) => s.split('\n').filter((l) => !l.includes('Mantido em espelho') && !l.includes('Espelho de')).join('\n')
    const a = readFileSync(resolve(__dirname, 'currency.ts'), 'utf8')
    const b = readFileSync(resolve(__dirname, '../../../supabase/functions/_shared/walletCurrency.ts'), 'utf8')
    expect(strip(b)).toBe(strip(a))
  })
})
