// Vertal Vibe Pay: cliente das ações bank-* / asaas-* da Edge Function `wallet`.
import { call, ERRORS } from '@/lib/wallet/api'
import type { PixKeyType } from '@/lib/wallet/pix'
import type { BankProvider, ReceiveMethod } from './routing'
import type { PayOpenInput, PayOpenResult, PayStatus, StripeSnapshot } from './payOnboarding'

Object.assign(ERRORS, {
  asaas_not_configured: 'Pix, boleto and the ASAAS account are not turned on for the platform yet',
  asaas_not_opened: 'Open your ASAAS account first',
  asaas_already_opened: 'You already have an ASAAS account',
  asaas_not_approved: 'Your ASAAS account is still under review',
  asaas_direct_card_disabled: 'Direct card charges are turned off. Use the ASAAS invoice instead',
  asaas_account_incomplete: 'ASAAS did not return the account details. Please contact support',
  route_not_asaas: 'This method does not go through ASAAS',
  invalid_document: 'Invalid CPF or CNPJ',
  invalid_payer_document: 'Invalid payer CPF or CNPJ',
  missing_payer_name: 'Enter the payer name',
  missing_fields: 'Fill in all required fields',
  invalid_phone: 'Invalid mobile number',
  invalid_income: 'Enter your monthly income or revenue',
  invalid_postal_code: 'Invalid CEP (postal code)',
  invalid_birth_date: 'Invalid date of birth',
  invalid_company_type: 'Choose the company type',
  boleto_min_amount: 'Boleto starts at R$ 5,00',
  insufficient_balance: 'Not enough balance',
  pix_out_limit: 'Amount is above the limit per Pix',
  payouts_not_enabled: 'Stripe has not turned on payouts yet',
  invalid_method: 'Invalid method',
  invalid_fields: 'Check the highlighted fields',
  pay_config_error: 'We could not open the account right now (platform setup). Please try again later.',
  asaas_error: 'ASAAS declined the operation',
})

export interface ProviderBalance { currency: string; availableMinor: number; pendingMinor: number }

export interface BankOverview {
  flags: {
    asaasConfigured: boolean
    asaasEnv: 'sandbox' | 'production'
    asaasDirectCard: boolean
    stripeTreasury: boolean
    stripeGlobalPayouts: boolean
    platformFeeRate: number
    pixOutMaxBrl: number
  }
  stripe: {
    configured: boolean
    account: {
      id: string
      country: string | null
      defaultCurrency: string | null
      chargesEnabled: boolean
      payoutsEnabled: boolean
      detailsSubmitted: boolean
    } | null
    balances: ProviderBalance[]
    externalAccounts: { id: string; kind: string; bankName: string | null; last4: string; currency: string; country: string | null; isDefault: boolean }[]
    payoutSchedule: string | null
    financialAccounts: { id: string; status: string; currencies: string[]; cashMinor: Record<string, number> }[] | { unavailable: string } | null
    error: string | null
  }
  asaas: {
    configured: boolean
    account: {
      env: string
      holderName: string | null
      document: string | null
      personType: 'FISICA' | 'JURIDICA' | null
      status: 'pending' | 'awaiting_approval' | 'approved' | 'rejected'
      statusDetail: Record<string, unknown> | null
    } | null
    balance: { currency: 'BRL'; availableMinor: number } | null
    error: string | null
  }
  totals: ProviderBalance[]
}

export type TxStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'expired' | 'canceled'

export interface BankTransaction {
  id: string
  provider: BankProvider
  direction: 'in' | 'out'
  method: ReceiveMethod | 'transfer' | 'payout'
  status: TxStatus
  amountMinor: number
  netMinor: number | null
  currency: string
  description: string | null
  counterparty: string | null
  url: string | null
  pixPayload: string | null
  boletoLine: string | null
  receiptUrl: string | null
  failureReason: string | null
  dueDate: string | null
  settledAt: string | null
  createdAt: string
}

export interface ProviderStatementItem {
  id: string
  date: string
  type: string
  description: string | null
  amountMinor: number
  currency: string
  feeMinor?: number
  netMinor?: number
  status?: string
}

export interface Payer { name: string; cpfCnpj: string; email?: string; phone?: string }

export interface AsaasOpenInput {
  name: string
  email: string
  cpfCnpj: string
  birthDate?: string
  companyType?: 'MEI' | 'LIMITED' | 'INDIVIDUAL' | 'ASSOCIATION'
  mobilePhone: string
  incomeValue: number
  address: string
  addressNumber: string
  complement?: string
  province: string
  postalCode: string
}

export const bankApi = {
  overview: () => call<BankOverview>('bank-overview'),
  statement: (limit = 50) => call<{ items: BankTransaction[] }>('bank-statement', { limit }),
  providerStatement: (provider: BankProvider, days = 30) =>
    call<{ items: ProviderStatementItem[] }>('bank-provider-statement', { provider, days }),
  receive: (p: { method: ReceiveMethod; amount: number; description?: string; payer?: Payer; dueDays?: number }) =>
    call<{ transaction: BankTransaction; pixImage?: string | null }>('bank-receive', p),
  sendPix: (p: { amount: number; description?: string } & ({ pixId: string } | { pixKeyType: PixKeyType; pixKey: string })) =>
    call<{ transaction: BankTransaction; authorized: boolean }>('bank-send-pix', p),
  payout: (p: { amount: number; currency: string; idempotencyKey: string }) =>
    call<{ transaction: BankTransaction }>('bank-payout', p),
  payoutMode: (mode: 'automatic' | 'manual') => call<{ ok: true; interval: string }>('bank-payout-mode', { mode }),
  asaasOpen: (p: AsaasOpenInput) => call<{ ok: true; status: string; webhookConfigured: boolean }>('asaas-open', p as unknown as Record<string, unknown>),
  asaasStatus: () => call<{ account: BankOverview['asaas']['account'] }>('asaas-status'),
  /** Cadastro único: abre a conta Brasil (ASAAS) e a conta global (Stripe) de uma vez. Idempotente. */
  payOpen: (p: PayOpenInput) =>
    call<PayOpenResult>('pay-open', { ...p, returnPath: '/pay' } as unknown as Record<string, unknown>),
  payStatus: () =>
    call<{
      status: PayStatus
      asaas: { status: string; holderName: string | null; document: string | null; personType: string | null } | null
      stripe: (StripeSnapshot & { error: string | null }) | null
    }>('pay-status'),
}

export const TX_STATUS_LABEL: Record<TxStatus, string> = {
  pending: 'Pending',
  paid: 'Completed',
  failed: 'Failed',
  refunded: 'Refunded',
  expired: 'Expired',
  canceled: 'Canceled',
}

export const METHOD_LABEL: Record<BankTransaction['method'], string> = {
  pix: 'Pix',
  boleto: 'Boleto',
  card: 'Card',
  link: 'Payment link',
  transfer: 'Pix sent',
  payout: 'Payout',
}

export const ASAAS_STATUS_LABEL: Record<NonNullable<BankOverview['asaas']['account']>['status'], string> = {
  pending: 'Sign-up pending',
  awaiting_approval: 'Under review',
  approved: 'Account approved',
  rejected: 'Account declined',
}
