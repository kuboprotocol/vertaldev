import { BRAND } from '@/config/brand'

/** Comissão de afiliado sobre tudo que o indicado pagar (ver record_affiliate_commission). */
export const AFFILIATE_RATE = 0.05

/** Link público de indicação: sempre no domínio da marca. */
export function referralLink(code: string): string {
  return `https://${BRAND.domain}/auth?ref=${encodeURIComponent(code)}`
}

/** Centavos → "US$ 1,23" (ou a moeda informada). */
export function formatCents(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}
