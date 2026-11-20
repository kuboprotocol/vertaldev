// Vertal Vibe Pay: cadastro único no navegador.
// As regras (validação, status combinado, orquestração) vêm do mesmo arquivo
// que a Edge Function usa, para cliente e servidor nunca divergirem.
export {
  BR_UFS,
  COMPANY_TYPES,
  PAY_FIELD_MESSAGES,
  combinePayStatus,
  normalizeMobile,
  onlyDigits,
  parseBrlAmount,
  validatePayOpen,
} from '../../../supabase/functions/_shared/payOnboarding.ts'
export type {
  AsaasOutcome,
  CompanyType,
  PayField,
  PayFieldError,
  PayOpenInput,
  PayOpenResult,
  PayStatus,
  StripeOutcome,
  StripeSnapshot,
} from '../../../supabase/functions/_shared/payOnboarding.ts'

import { onlyDigits } from '../../../supabase/functions/_shared/payOnboarding.ts'

// ── Máscaras de digitação ──────────────────────────────────────────────────

export function maskCpfCnpj(v: string): string {
  const d = onlyDigits(v).slice(0, 14)
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export function maskPhone(v: string): string {
  let d = onlyDigits(v)
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  d = d.slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function maskCep(v: string): string {
  const d = onlyDigits(v).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

// ── ViaCEP ─────────────────────────────────────────────────────────────────

export interface CepAddress { address: string; province: string; city: string; state: string }

/**
 * Endereço pelo CEP (https://viacep.com.br, sem chave). null se o CEP não
 * existir ou o serviço falhar: o titular preenche à mão.
 */
export async function lookupCep(cep: string, fetchImpl: typeof fetch = fetch): Promise<CepAddress | null> {
  const d = onlyDigits(cep)
  if (d.length !== 8) return null
  try {
    const res = await fetchImpl(`https://viacep.com.br/ws/${d}/json/`)
    if (!res.ok) return null
    const j = (await res.json()) as Record<string, unknown>
    if (j.erro) return null
    return {
      address: String(j.logradouro ?? ''),
      province: String(j.bairro ?? ''),
      city: String(j.localidade ?? ''),
      state: String(j.uf ?? '').toUpperCase(),
    }
  } catch {
    return null
  }
}
