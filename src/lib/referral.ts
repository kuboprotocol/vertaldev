import { BRAND } from '@/config/brand'

/** Comissão de afiliado sobre tudo que o indicado pagar (ver record_affiliate_commission). */
export const AFFILIATE_RATE = 0.05

/** Link público de indicação: sempre no domínio da marca. */
export function referralLink(code: string): string {
  return `https://${BRAND.domain}/auth?ref=${encodeURIComponent(code)}`
}

const REF_KEY = 'vertal_ref'
const REF_TTL_MS = 30 * 24 * 60 * 60 * 1000
const REF_RE = /^[a-z0-9]{4,32}$/i

/**
 * Guarda o ?ref= da URL atual (qualquer página) por 30 dias, para que a
 * indicação não se perca se a pessoa navegar antes de se cadastrar.
 * Um código novo e válido substitui o anterior.
 */
export function captureReferral(search: string = window.location.search): void {
  try {
    const code = new URLSearchParams(search).get('ref')
    if (!code || !REF_RE.test(code)) return
    localStorage.setItem(REF_KEY, JSON.stringify({ code, at: Date.now() }))
  } catch { /* storage bloqueado: segue sem guardar */ }
}

/** Código guardado por captureReferral, ou '' se não houver ou tiver expirado. */
export function getStoredReferral(now: number = Date.now()): string {
  try {
    const raw = localStorage.getItem(REF_KEY)
    if (!raw) return ''
    const { code, at } = JSON.parse(raw)
    if (typeof code === 'string' && REF_RE.test(code) && typeof at === 'number' && now - at < REF_TTL_MS) return code
    localStorage.removeItem(REF_KEY)
  } catch { /* ignora valor corrompido ou storage bloqueado */ }
  return ''
}

export function clearStoredReferral(): void {
  try { localStorage.removeItem(REF_KEY) } catch { /* noop */ }
}

/** Centavos → "US$ 1,23" (ou a moeda informada). */
export function formatCents(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}
