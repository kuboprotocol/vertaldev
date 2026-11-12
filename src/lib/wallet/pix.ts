// Regras de chave Pix e países com aceitação de Pix.
//
// ATENÇÃO: este arquivo é espelhado em supabase/functions/_shared/pixKeys.ts
// (a Edge Function não importa de src/). O teste pix.test.ts falha se os dois
// divergirem. Edite aqui e copie para lá.
//
// Sem dependências e sem APIs de Deno/DOM: roda no navegador, no Vitest e na
// Edge Function.

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random'

export const PIX_KEY_TYPES: { value: PixKeyType; label: string; placeholder: string }[] = [
  { value: 'cpf', label: 'CPF', placeholder: '000.000.000-00' },
  { value: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0000-00' },
  { value: 'email', label: 'E-mail', placeholder: 'voce@exemplo.com' },
  { value: 'phone', label: 'Celular', placeholder: '+55 11 91234-5678' },
  { value: 'random', label: 'Chave aleatória', placeholder: '123e4567-e89b-12d3-a456-426614174000' },
]

// Pix é um arranjo doméstico do Banco Central: toda chave Pix pertence a uma
// conta no Brasil. Fora do Brasil, o pagamento com Pix funciona em comércios
// parceiros por meio de empresas de câmbio (eFX) que convertem o valor.
// Lista dos 8 países anunciados pelo gov.br em julho/agosto de 2026. Não é uma
// lista oficial do BC e a aceitação é restrita a estabelecimentos parceiros:
// revise quando novos países entrarem.
export const PIX_COUNTRIES: { code: string; name: string; flag: string; domestic: boolean }[] = [
  { code: 'BR', name: 'Brasil', flag: '🇧🇷', domestic: true },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷', domestic: false },
  { code: 'CL', name: 'Chile', flag: '🇨🇱', domestic: false },
  { code: 'UY', name: 'Uruguai', flag: '🇺🇾', domestic: false },
  { code: 'PY', name: 'Paraguai', flag: '🇵🇾', domestic: false },
  { code: 'US', name: 'Estados Unidos', flag: '🇺🇸', domestic: false },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', domestic: false },
  { code: 'ES', name: 'Espanha', flag: '🇪🇸', domestic: false },
  { code: 'FR', name: 'França', flag: '🇫🇷', domestic: false },
]

export const PIX_COUNTRY_CODES = PIX_COUNTRIES.map((c) => c.code)

const onlyDigits = (s: string) => s.replace(/\D/g, '')

export function isValidCpf(input: string): boolean {
  const cpf = onlyDigits(input)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  const calc = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10])
}

export function isValidCnpj(input: string): boolean {
  const cnpj = onlyDigits(input)
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(cnpj[i]) * weights[i]
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13])
}

/** Normaliza a chave para o formato que o DICT do Pix usa. */
export function normalizePixKey(type: PixKeyType, raw: string): string {
  const v = raw.trim()
  switch (type) {
    case 'cpf':
    case 'cnpj':
      return onlyDigits(v)
    case 'email':
      return v.toLowerCase()
    case 'phone': {
      const d = onlyDigits(v)
      // Aceita "11912345678" (sem DDI) ou "5511912345678".
      return d.length === 10 || d.length === 11 ? `+55${d}` : `+${d}`
    }
    case 'random':
      return v.toLowerCase()
  }
}

/** Retorna null quando a chave é válida, ou a mensagem de erro. */
export function validatePixKey(type: PixKeyType, raw: string): string | null {
  if (!raw || !raw.trim()) return 'Informe a chave Pix'
  const key = normalizePixKey(type, raw)
  switch (type) {
    case 'cpf':
      return isValidCpf(key) ? null : 'CPF inválido'
    case 'cnpj':
      return isValidCnpj(key) ? null : 'CNPJ inválido'
    case 'email':
      return key.length <= 77 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(key) ? null : 'E-mail inválido'
    case 'phone':
      // Pix só aceita celular brasileiro: +55, DDD de 2 dígitos e 9 dígitos começando com 9.
      return /^\+55[1-9][0-9]9\d{8}$/.test(key) ? null : 'Celular inválido (use DDD + número com 9 dígitos)'
    case 'random':
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key) ? null : 'Chave aleatória inválida'
  }
}

/** Mostra só o suficiente para o dono reconhecer a chave. */
export function maskPixKey(type: PixKeyType, key: string): string {
  switch (type) {
    case 'cpf':
      return `***.${key.slice(3, 6)}.${key.slice(6, 9)}-**`
    case 'cnpj':
      return `${key.slice(0, 2)}.${key.slice(2, 5)}.***/****-${key.slice(12, 14)}`
    case 'email': {
      const [user, domain] = key.split('@')
      return `${user.slice(0, 2)}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`
    }
    case 'phone':
      return `+55 (${key.slice(3, 5)}) *****-${key.slice(-4)}`
    case 'random':
      return `${key.slice(0, 8)}-****-****-****-${key.slice(-4)}`
  }
}
