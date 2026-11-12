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

const ERRORS: Record<string, string> = {
  limit_reached: 'Limite de 10 itens deste tipo na carteira',
  duplicate_card: 'Este cartão já está na sua carteira',
  duplicate_pix_key: 'Esta chave Pix já está na sua carteira',
  not_found: 'Item não encontrado',
  invalid_amount: 'Valor inválido',
  missing_merchant: 'Informe nome e cidade do recebedor',
  'STRIPE_PUBLISHABLE_KEY not configured': 'Pagamentos com cartão ainda não estão configurados',
}

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
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
  cardSetup: () => call<{ clientSecret: string; publishableKey: string }>('card-setup'),
  cardAttach: (setupIntentId: string, label?: string, makeDefault?: boolean) =>
    call<{ card: WalletCard }>('card-attach', { setupIntentId, label, makeDefault }),
  pixAdd: (p: { keyType: PixKeyType; key: string; label?: string; countries?: string[]; makeDefault?: boolean }) =>
    call<{ pix: WalletPix }>('pix-add', p),
  pixBrCode: (p: { id: string; amount?: number; merchantName: string; merchantCity: string; description?: string }) =>
    call<{ brCode: string }>('pix-brcode', p),
  setDefault: (id: string) => call<{ ok: true }>('set-default', { id }),
  remove: (id: string) => call<{ ok: true }>('remove', { id }),
}

export { FUNDING_LABEL, brandLabel, isExpired } from './format'
