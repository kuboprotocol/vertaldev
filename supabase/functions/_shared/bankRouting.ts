// VERTAL Bank: qual provedor atende cada operação.
// Espelho de src/lib/bank/routing.ts (teste garante igualdade).
//
//   BRL + Pix / boleto            -> ASAAS
//   BRL + cartão nacional         -> ASAAS se houver conta ASAAS ativa, senão Stripe
//   Qualquer outra moeda / cartão
//   internacional / link global   -> Stripe (Connect, conta global)
//   Pix de saída (transferência)  -> ASAAS
//   Saque para banco no exterior  -> Stripe (payout da conta conectada)

export type BankProvider = 'stripe' | 'asaas'
export type ReceiveMethod = 'pix' | 'boleto' | 'card' | 'link'
export type SendMethod = 'pix' | 'payout'

export interface RouteInput {
  method: ReceiveMethod
  currency: string
  /** Conta ASAAS (subconta) ativa e chave configurada. */
  asaasReady: boolean
  /** Conta Stripe conectada com charges_enabled. */
  stripeReady: boolean
}

export type RouteResult =
  | { provider: BankProvider; reason: string }
  | { provider: null; reason: string }

export function routeReceive({ method, currency, asaasReady, stripeReady }: RouteInput): RouteResult {
  const brl = currency.toUpperCase() === 'BRL'
  if (method === 'pix' || method === 'boleto') {
    if (!brl) return { provider: null, reason: 'Pix e boleto só existem em BRL' }
    return asaasReady
      ? { provider: 'asaas', reason: 'Pix e boleto saem pelo ASAAS' }
      : { provider: null, reason: 'Abra sua conta ASAAS para receber por Pix e boleto' }
  }
  if (brl && asaasReady && method === 'card') {
    return { provider: 'asaas', reason: 'Cartão em reais pelo ASAAS (taxas nacionais)' }
  }
  if (brl && asaasReady && method === 'link' && !stripeReady) {
    return { provider: 'asaas', reason: 'Link de pagamento ASAAS (Pix, boleto e cartão)' }
  }
  if (stripeReady) return { provider: 'stripe', reason: brl ? 'Stripe (cartões nacionais e internacionais)' : `Stripe em ${currency.toUpperCase()}` }
  if (brl && asaasReady) return { provider: 'asaas', reason: 'Link de pagamento ASAAS' }
  return { provider: null, reason: brl ? 'Ative a conta ASAAS ou a conta global Stripe' : 'Ative a conta global Stripe para receber em outras moedas' }
}

export function routeSend(method: SendMethod): BankProvider {
  return method === 'pix' ? 'asaas' : 'stripe'
}
