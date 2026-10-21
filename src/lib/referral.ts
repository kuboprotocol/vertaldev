import { BRAND } from '@/config/brand'

/** Comissão de afiliado sobre tudo que o indicado pagar (ver record_affiliate_commission). */
export const AFFILIATE_RATE = 0.05

/** Link público de indicação: sempre no domínio da marca. */
export function referralLink(code: string): string {
  return `https://${BRAND.domain}/auth?ref=${encodeURIComponent(code)}`
}

const REFERRAL_STORAGE_KEY = 'vertal:referral-code'
const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]{4,64}$/

/** Guarda o ?ref= para a indicação não se perder se o visitante sair de /auth antes de se cadastrar. */
export function storeReferralCode(code: string): void {
  if (!REFERRAL_CODE_PATTERN.test(code)) return
  try {
    localStorage.setItem(REFERRAL_STORAGE_KEY, code)
  } catch {
    // Armazenamento bloqueado (aba privada, cookies desligados): segue sem persistir.
  }
}

/** Código de indicação guardado, ou string vazia. */
export function getStoredReferralCode(): string {
  try {
    const code = localStorage.getItem(REFERRAL_STORAGE_KEY) ?? ''
    return REFERRAL_CODE_PATTERN.test(code) ? code : ''
  } catch {
    return ''
  }
}

/** Remove a indicação guardada depois do cadastro, para não valer para contas futuras. */
export function clearStoredReferralCode(): void {
  try {
    localStorage.removeItem(REFERRAL_STORAGE_KEY)
  } catch {
    // Nada a limpar se o armazenamento não está disponível.
  }
}

/** Centavos → "US$ 1,23" (ou a moeda informada). */
export function formatCents(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}
