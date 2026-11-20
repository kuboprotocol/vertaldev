// Vertal Vibe Pay: cliente das ações bank-* / asaas-* da Edge Function `wallet`.
import { call, ERRORS } from '@/lib/wallet/api'
import type { PixKeyType } from '@/lib/wallet/pix'
import type { BankProvider, ReceiveMethod } from './routing'
import type { PayOpenInput, PayOpenResult, PayStatus, StripeSnapshot } from './payOnboarding'

Object.assign(ERRORS, {
  asaas_not_configured: 'Pix, boleto e conta ASAAS ainda não foram ativados na plataforma',
  asaas_not_opened: 'Abra sua conta ASAAS primeiro',
  asaas_already_opened: 'Você já tem uma conta ASAAS',
  asaas_not_approved: 'Sua conta ASAAS ainda está em análise',
  asaas_direct_card_disabled: 'Cobrança direta com cartão está desativada; use a fatura do ASAAS',
  asaas_account_incomplete: 'O ASAAS não devolveu os dados da conta. Fale com o suporte',
  route_not_asaas: 'Este método não sai pelo ASAAS',
  invalid_document: 'CPF ou CNPJ inválido',
  invalid_payer_document: 'CPF/CNPJ do pagador inválido',
  missing_payer_name: 'Informe o nome do pagador',
  missing_fields: 'Preencha todos os campos obrigatórios',
  invalid_phone: 'Celular inválido',
  invalid_income: 'Informe a renda/faturamento mensal',
  invalid_postal_code: 'CEP inválido',
  invalid_birth_date: 'Data de nascimento inválida',
  invalid_company_type: 'Escolha o tipo de empresa',
  boleto_min_amount: 'Boleto a partir de R$ 5,00',
  insufficient_balance: 'Saldo insuficiente',
  pix_out_limit: 'Valor acima do limite por Pix',
  payouts_not_enabled: 'Saques ainda não liberados pelo Stripe',
  invalid_method: 'Método inválido',
  invalid_fields: 'Confira os campos destacados',
  pay_config_error: 'Não conseguimos abrir a conta agora (configuração da plataforma). Tente de novo mais tarde.',
  asaas_error: 'O ASAAS recusou a operação',
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
  pending: 'Pendente',
  paid: 'Concluído',
  failed: 'Falhou',
  refunded: 'Estornado',
  expired: 'Vencido',
  canceled: 'Cancelado',
}

export const METHOD_LABEL: Record<BankTransaction['method'], string> = {
  pix: 'Pix',
  boleto: 'Boleto',
  card: 'Cartão',
  link: 'Link de pagamento',
  transfer: 'Pix enviado',
  payout: 'Saque',
}

export const ASAAS_STATUS_LABEL: Record<NonNullable<BankOverview['asaas']['account']>['status'], string> = {
  pending: 'Cadastro pendente',
  awaiting_approval: 'Em análise',
  approved: 'Conta aprovada',
  rejected: 'Conta recusada',
}
