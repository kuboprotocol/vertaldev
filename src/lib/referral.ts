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

// ?ref= de qualquer página fica guardado no navegador até o cadastro, para a
// indicação não se perder quando a pessoa entra pela home ou /pricing e só depois
// vai para /auth. Vale o primeiro link (quem trouxe a pessoa) por REFERRAL_TTL_DAYS.
export const REFERRAL_STORAGE_KEY = 'vertal.referral'
export const REFERRAL_TTL_DAYS = 30
const TTL_MS = REFERRAL_TTL_DAYS * 24 * 60 * 60 * 1000
const CODE_RE = /^[A-Za-z0-9_-]{4,64}$/

export function isReferralCode(v: unknown): v is string {
  return typeof v === 'string' && CODE_RE.test(v)
}

/** Código guardado e ainda válido, ou null. */
export function storedReferral(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(REFERRAL_STORAGE_KEY)
    if (!raw) return null
    const { code, at } = JSON.parse(raw) as { code?: unknown; at?: unknown }
    if (!isReferralCode(code) || typeof at !== 'number' || now - at > TTL_MS || at > now) return null
    return code
  } catch {
    return null
  }
}

/** Guarda o ?ref= da URL, se for válido e não houver outro código ainda válido. */
export function captureReferral(search: string, now = Date.now()): void {
  const code = new URLSearchParams(search).get('ref')
  if (!isReferralCode(code) || storedReferral(now)) return
  try {
    localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify({ code, at: now }))
  } catch {
    // Sem storage (aba privada, bloqueado): o ?ref= da própria /auth continua valendo.
  }
}

export function clearReferral(): void {
  try {
    localStorage.removeItem(REFERRAL_STORAGE_KEY)
  } catch {
    // ignore
  }
}
