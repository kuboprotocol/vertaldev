import { supabase } from '@/integrations/supabase/client'
import type { PixKeyType } from './pix'

import type { CardFunding } from './format'
export type { CardFunding } from './format'

export interface WalletCard {
  id: string
  label: string | null
  isDefault: boolean
  brand: string
  last4: string
  expMonth: number
  expYear: number
  funding: CardFunding
  country: string | null
  holderName: string | null
  createdAt: string
}

export interface WalletPix {
  id: string
  label: string | null
  isDefault: boolean
  keyType: PixKeyType
  maskedKey: string
  countries: string[]
  createdAt: string
}

export interface ConnectAccount {
  id: string
  country: string | null
  defaultCurrency: string | null
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  pendingRequirements: number
  /** Itens com prazo vencido (requirements.past_due). */
  pastDue?: number
  /** requirements.disabled_reason do Stripe, p.ex. "requirements.past_due". */
  disabledReason?: string | null
  /** Prazo (unix, s) dos itens pendentes, se houver. */
  currentDeadline?: number | null
}

/** Texto de status da conta conectada quando ainda não pode cobrar. */
export function connectPendingText(a: ConnectAccount): string {
  const n = a.pendingRequirements
  if (a.disabledReason === 'requirements.past_due' || (a.pastDue ?? 0) > 0) {
    return `Cobranças pausadas: o Stripe pede ${n || 'alguns'} ${n === 1 ? 'item' : 'itens'} com prazo vencido (p.ex. verificação de identidade). Conclua a verificação para liberar.`
  }
  if (a.disabledReason === 'requirements.pending_verification' || (a.detailsSubmitted && n === 0)) {
    return 'Dados enviados. O Stripe está analisando sua conta.'
  }
  if (a.disabledReason?.startsWith('rejected')) return 'Conta recusada pelo Stripe. Fale com o suporte.'
  return `Faltam ${n || 'alguns'} dados no Stripe para liberar as cobranças`
}

export interface WalletCharge {
  id: string
  description: string | null
  amountMinor: number
  currency: string
  platformFeeMinor: number
  status: 'open' | 'paid' | 'expired' | 'failed'
  url: string | null
  paidAt: string | null
  createdAt: string
}

export const ERRORS: Record<string, string> = {
  invalid_country: 'País não disponível para a conta global',
  connect_not_started: 'Ative os recebimentos com Stripe primeiro',
  connect_not_ready: 'Sua conta Stripe ainda está em verificação',
  invalid_currency: 'Moeda não suportada',
  limit_reached: 'Limite de 10 itens deste tipo no Vertal Vibe Pay',
  duplicate_card: 'Este cartão já está no seu Vertal Vibe Pay',
  duplicate_pix_key: 'Esta chave Pix já está no seu Vertal Vibe Pay',
  not_found: 'Item não encontrado',
  invalid_amount: 'Valor inválido',
  missing_merchant: 'Informe nome e cidade do recebedor',
  'STRIPE_PUBLISHABLE_KEY not configured': 'Pagamentos com cartão ainda não estão configurados',
}

export async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>('wallet', {
    body: { action, ...payload },
  })
  if (error) {
    // FunctionsHttpError carrega o corpo da resposta em error.context
    let msg = error.message
    try {
      const body = await (error as { context?: Response }).context?.json()
      if (body?.error) msg = body.error
    } catch { /* corpo não-JSON */ }
    throw new Error(ERRORS[msg] ?? msg)
  }
  if (data && (data as { error?: string }).error) {
    const msg = (data as { error: string }).error
    throw new Error(ERRORS[msg] ?? msg)
  }
  return data as T
}

export const walletApi = {
  list: () => call<{ cards: WalletCard[]; pix: WalletPix[]; publishableKey: string | null }>('list'),
  /**
   * Inicia o cadastro de cartão. Com a chave publicável do Stripe configurada,
   * devolve o `clientSecret` do SetupIntent (Payment Element); sem ela, devolve
   * `checkoutUrl` (página hospedada do Stripe, modo setup).
   */
  cardSetup: (returnPath?: string) =>
    call<{ clientSecret?: string; publishableKey: string | null; checkoutUrl?: string; hosted?: boolean }>('card-setup', { returnPath }),
  cardAttach: (setupIntentId: string, label?: string, makeDefault?: boolean) =>
    call<{ card: WalletCard }>('card-attach', { setupIntentId, label, makeDefault }),
  /** Conclui o cadastro feito na página hospedada do Stripe (`?setup_session=cs_…`). */
  cardAttachSession: (checkoutSessionId: string) =>
    call<{ card: WalletCard }>('card-attach', { checkoutSessionId }),
  pixAdd: (p: { keyType: PixKeyType; key: string; label?: string; countries?: string[]; makeDefault?: boolean }) =>
    call<{ pix: WalletPix }>('pix-add', p),
  pixBrCode: (p: { id: string; amount?: number; merchantName: string; merchantCity: string; description?: string }) =>
    call<{ brCode: string }>('pix-brcode', p),
  setDefault: (id: string) => call<{ ok: true }>('set-default', { id }),
  remove: (id: string) => call<{ ok: true }>('remove', { id }),
  connectStatus: () =>
    call<{ account: ConnectAccount | null; charges: WalletCharge[]; platformFeeRate: number }>('connect-status'),
  connectOnboard: (p: { country?: string; returnPath?: '/pay' | '/bank' | '/profile' } = {}) =>
    call<{ url: string }>('connect-onboard', p),
  connectDashboard: (returnPath?: '/pay' | '/bank' | '/profile') => call<{ url: string }>('connect-dashboard', { returnPath }),
  connectCharge: (p: { amount: number; currency: string; description?: string }) =>
    call<{ charge: WalletCharge }>('connect-charge', p),
}

export { FUNDING_LABEL, brandLabel, isExpired } from './format'
