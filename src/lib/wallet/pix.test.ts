import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isValidCpf, isValidCnpj, normalizePixKey, validatePixKey, maskPixKey, PIX_COUNTRIES } from './pix'
import { isExpired, brandLabel } from './format'

describe('pix keys', () => {
  it('valida CPF e CNPJ pelos dígitos verificadores', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
    expect(isValidCpf('529.982.247-24')).toBe(false)
    expect(isValidCpf('111.111.111-11')).toBe(false)
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true)
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false)
  })

  it('normaliza celular para +55 e valida', () => {
    expect(normalizePixKey('phone', '(11) 91234-5678')).toBe('+5511912345678')
    expect(validatePixKey('phone', '11 91234-5678')).toBeNull()
    expect(validatePixKey('phone', '11 3123-4567')).not.toBeNull() // fixo não
  })

  it('valida e-mail e chave aleatória', () => {
    expect(validatePixKey('email', 'Dev@Vertal.dev')).toBeNull()
    expect(validatePixKey('email', 'sem-arroba')).not.toBeNull()
    expect(validatePixKey('random', '123e4567-e89b-12d3-a456-426614174000')).toBeNull()
    expect(validatePixKey('random', 'abc')).not.toBeNull()
  })

  it('mascara sem expor a chave inteira', () => {
    expect(maskPixKey('cpf', '52998224725')).toBe('***.982.247-**')
    expect(maskPixKey('phone', '+5511912345678')).toBe('+55 (11) *****-5678')
    expect(maskPixKey('email', 'laercio@vertal.dev')).toBe('la*****@vertal.dev')
  })

  it('lista Brasil e os 8 países com aceitação de Pix', () => {
    expect(PIX_COUNTRIES.map((c) => c.code)).toEqual(['BR', 'AR', 'CL', 'UY', 'PY', 'US', 'PT', 'ES', 'FR'])
  })

  it('espelho da Edge Function está idêntico', () => {
    const root = path.resolve(__dirname, '../../..')
    const a = readFileSync(path.join(root, 'src/lib/wallet/pix.ts'), 'utf8')
    const b = readFileSync(path.join(root, 'supabase/functions/_shared/pixKeys.ts'), 'utf8')
    expect(b).toBe(a)
  })
})

describe('cards', () => {
  it('detecta cartão vencido', () => {
    const now = new Date(2026, 10, 11)
    expect(isExpired({ expMonth: 10, expYear: 2026 }, now)).toBe(true)
    expect(isExpired({ expMonth: 11, expYear: 2026 }, now)).toBe(false)
  })
  it('formata bandeira', () => {
    expect(brandLabel('elo')).toBe('Elo')
    expect(brandLabel('mastercard')).toBe('Mastercard')
  })
})
