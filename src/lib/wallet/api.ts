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
    return `Payments paused: Stripe needs ${n || 'some'} overdue ${n === 1 ? 'item' : 'items'} (for example, identity verification). Finish the verification to turn payments back on.`
  }
  if (a.disabledReason === 'requirements.pending_verification' || (a.detailsSubmitted && n === 0)) {
    return 'Details sent. Stripe is reviewing your account.'
  }
  if (a.disabledReason?.startsWith('rejected')) return 'Stripe declined the account. Please contact support.'
  return `Stripe needs ${n || 'some'} more ${n === 1 ? 'detail' : 'details'} before you can take payments`
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
  invalid_country: 'This country is not available for the global account',
  connect_not_started: 'Turn on Stripe payments first',
  connect_not_ready: 'Your Stripe account is still being verified',
  invalid_currency: 'Currency not supported',
  limit_reached: 'Vertal Vibe Pay allows up to 10 items of this type',
  duplicate_card: 'This card is already in your Vertal Vibe Pay',
  duplicate_pix_key: 'This Pix key is already in your Vertal Vibe Pay',
  not_found: 'Item not found',
  invalid_amount: 'Invalid amount',
  missing_merchant: 'Enter the receiver name and city',
  'STRIPE_PUBLISHABLE_KEY not configured': 'Card payments are not set up yet',
}

/** Erro de uma ação da função `wallet`: `code` é o código do servidor e `details` o corpo inteiro. */
export class WalletError extends Error {
  code: string
  details: Record<string, unknown> | null
  constructor(message: string, code: string, details: Record<string, unknown> | null = null) {
    super(message)
    this.code = code
    this.details = details
  }
}

function toWalletError(code: string, body: Record<string, unknown> | null) {
  // Sem tradução conhecida, prefere a mensagem do provedor (ex.: asaas_error) ao código cru.
  const providerMsg = body && typeof body.message === 'string' ? body.message : null
  return new WalletError(ERRORS[code] ?? providerMsg ?? code, code, body)
}

export async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>('wallet', {
    body: { action, ...payload },
  })
  if (error) {
    // FunctionsHttpError carrega o corpo da resposta em error.context
    let code = error.message
    let body: Record<string, unknown> | null = null
    try {
      body = await (error as { context?: Response }).context?.json()
      if (typeof body?.error === 'string') code = body.error
    } catch { /* corpo não-JSON */ }
    throw toWalletError(code, body)
  }
  if (data && (data as { error?: string }).error) {
    throw toWalletError((data as { error: string }).error, data as unknown as Record<string, unknown>)
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
