import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  REFERRAL_RATE,
  REFERRAL_HOLD_DAYS,
  INFLIGHT,
  availableAt,
  choosePayoutProvider,
  commissionAfterRefund,
  commissionMinor,
  ledgerRef,
  ledgerStatusFor,
  nextStep,
  type CommissionState,
} from '../../supabase/functions/_shared/referralCommission'
import { AFFILIATE_RATE, formatCommissionTotals, summarizeCommissions } from '@/lib/referral'

const MIGRATION = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20261119200000_referral_commission_vibe_pay.sql'),
  'utf8',
)

const stripeOk = { stripeAccountId: 'acct_1', country: 'BR', chargesEnabled: true, payoutsEnabled: true }
const asaasOk = { walletId: 'w_1', status: 'approved' }
const now = new Date('2026-12-01T12:00:00Z')
const past = new Date('2026-11-01T12:00:00Z')
const future = new Date('2026-12-20T12:00:00Z')

const base = (over: Partial<CommissionState> = {}): CommissionState => ({
  status: 'pending',
  commissionMinor: 500,
  currency: 'brl',
  availableAt: future,
  payoutProvider: null,
  payoutRef: null,
  ...over,
})

describe('Indique e Ganhe — cálculo da comissão', () => {
  it('taxa é 5% e igual no cliente, no servidor e no SQL', () => {
    expect(REFERRAL_RATE).toBe(0.05)
    expect(AFFILIATE_RATE).toBe(REFERRAL_RATE)
    expect(MIGRATION).toMatch(/_rate constant numeric := 0\.05;/)
  })
  it('5% arredondado para baixo, sem erro de ponto flutuante', () => {
    expect(commissionMinor(10_000)).toBe(500)
    expect(commissionMinor(4999)).toBe(249)
    expect(commissionMinor(5499)).toBe(274)
    expect(commissionMinor(20)).toBe(1)
    expect(commissionMinor(19)).toBe(0)
    expect(commissionMinor(0)).toBe(0)
    expect(commissionMinor(-100)).toBe(0)
    expect(commissionMinor(Number.NaN)).toBe(0)
  })
  it('estorno parcial reduz proporcionalmente; total zera', () => {
    // compra de US$ 10 liquidada em R$ 54,99; estorno de metade
    expect(commissionAfterRefund(5499, 1000, 500)).toBe(commissionMinor(2749))
    expect(commissionAfterRefund(5499, 1000, 1000)).toBe(0)
    expect(commissionAfterRefund(5499, 1000, 0)).toBe(274)
    expect(commissionAfterRefund(5499, 1000, 5000)).toBe(0)
  })
  it('carência padrão de 30 dias, ou a liberação do Stripe se for depois', () => {
    expect(REFERRAL_HOLD_DAYS).toBe(30)
    const paid = new Date('2026-11-19T00:00:00Z')
    expect(availableAt(paid).toISOString()).toBe('2026-12-19T00:00:00.000Z')
    const later = new Date('2026-12-25T00:00:00Z')
    expect(availableAt(paid, 30, later)).toEqual(later)
    expect(availableAt(paid, 30, new Date('2026-12-01T00:00:00Z')).toISOString()).toBe('2026-12-19T00:00:00.000Z')
  })
})

describe('Indique e Ganhe — para onde vai o dinheiro', () => {
  it('Stripe BR apto primeiro, depois ASAAS aprovado, senão fica no razão', () => {
    expect(choosePayoutProvider({ currency: 'brl', stripe: stripeOk, asaas: asaasOk })).toBe('stripe')
    expect(choosePayoutProvider({ currency: 'brl', stripe: null, asaas: asaasOk })).toBe('asaas')
    expect(choosePayoutProvider({ currency: 'brl', stripe: null, asaas: null })).toBeNull()
  })
  it('Stripe de outro país ou sem saque liberado não recebe', () => {
    expect(choosePayoutProvider({ currency: 'brl', stripe: { ...stripeOk, country: 'US' } })).toBeNull()
    expect(choosePayoutProvider({ currency: 'brl', stripe: { ...stripeOk, payoutsEnabled: false }, asaas: asaasOk })).toBe('asaas')
  })
  it('ASAAS em análise não recebe; moeda diferente de BRL não sai', () => {
    expect(choosePayoutProvider({ currency: 'brl', asaas: { walletId: 'w', status: 'awaiting_approval' } })).toBeNull()
    expect(choosePayoutProvider({ currency: 'usd', stripe: stripeOk, asaas: asaasOk })).toBeNull()
  })
})

describe('Indique e Ganhe — próximo passo', () => {
  it('Stripe transfere já (source_transaction segura até liquidar)', () => {
    expect(nextStep(base(), { stripe: stripeOk }, now)).toEqual({ kind: 'transfer', provider: 'stripe' })
  })
  it('transferido no Stripe: espera a carência e depois marca pago', () => {
    const s = base({ payoutProvider: 'stripe', payoutRef: 'tr_1' })
    expect(nextStep(s, {}, now)).toEqual({ kind: 'wait' })
    expect(nextStep({ ...s, availableAt: past }, {}, now)).toEqual({ kind: 'mark_paid' })
  })
  it('ASAAS só depois da carência', () => {
    expect(nextStep(base(), { asaas: asaasOk }, now)).toEqual({ kind: 'wait' })
    expect(nextStep(base({ availableAt: past }), { asaas: asaasOk }, now)).toEqual({ kind: 'transfer', provider: 'asaas' })
  })
  it('sem conta: fica disponível e não repete', () => {
    expect(nextStep(base({ availableAt: past }), {}, now)).toEqual({ kind: 'mark_available' })
    expect(nextStep(base({ availableAt: past, status: 'approved' }), {}, now)).toEqual({ kind: 'none' })
    expect(nextStep(base(), {}, now)).toEqual({ kind: 'wait' })
  })
  it('abrir conta depois libera o pagamento', () => {
    expect(nextStep(base({ availableAt: past, status: 'approved' }), { stripe: stripeOk }, now)).toEqual({ kind: 'transfer', provider: 'stripe' })
    expect(nextStep(base({ availableAt: past, status: 'approved' }), { asaas: asaasOk }, now)).toEqual({ kind: 'transfer', provider: 'asaas' })
  })
  it('envio interrompido: Stripe repete (idempotente), ASAAS vai para revisão', () => {
    expect(nextStep(base({ payoutProvider: 'stripe', payoutRef: INFLIGHT }), {}, now)).toEqual({ kind: 'transfer', provider: 'stripe' })
    expect(nextStep(base({ payoutProvider: 'asaas', payoutRef: INFLIGHT, availableAt: past }), {}, now)).toEqual({ kind: 'manual_review' })
    expect(nextStep(base({ payoutProvider: 'asaas', payoutRef: 'tra_1', availableAt: past }), {}, now)).toEqual({ kind: 'check_asaas_transfer' })
  })
  it('paga, estornada ou zerada não faz nada', () => {
    expect(nextStep(base({ status: 'paid' }), { stripe: stripeOk }, now).kind).toBe('none')
    expect(nextStep(base({ status: 'void' }), { stripe: stripeOk }, now).kind).toBe('none')
    expect(nextStep(base({ commissionMinor: 0 }), { stripe: stripeOk }, now).kind).toBe('none')
  })
  it('status do extrato', () => {
    expect(ledgerStatusFor('pending')).toBe('pending')
    expect(ledgerStatusFor('approved')).toBe('available')
    expect(ledgerStatusFor('paid')).toBe('paid')
    expect(ledgerStatusFor('void')).toBe('refunded')
  })
})

describe('Indique e Ganhe — idempotência (migration)', () => {
  it('uma comissão por compra e uma linha no extrato por comissão', () => {
    expect(ledgerRef('in_123')).toBe('referral:in_123')
    expect(MIGRATION).toMatch(/ON CONFLICT \(source_ref\) DO NOTHING\s+RETURNING id INTO _commission_id/)
    expect(MIGRATION).toMatch(/IF _commission_id IS NOT NULL AND _commission > 0 THEN/)
    expect(MIGRATION).toMatch(/'referral:' \|\| _source_ref/)
    expect(MIGRATION).toMatch(/ON CONFLICT \(provider, provider_ref\) DO NOTHING/)
    expect(MIGRATION).toMatch(/affiliate_commissions_payout_ref_idx/)
  })
  it('a função continua só para o service role e a tabela só leitura para o dono', () => {
    expect(MIGRATION).toMatch(/REVOKE ALL ON FUNCTION public\.record_affiliate_commission\([^)]*\) FROM PUBLIC, anon, authenticated;/)
    expect(MIGRATION).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_affiliate_commission\([^)]*\) TO service_role;/)
    expect(MIGRATION).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.affiliate_commissions FROM anon, authenticated;/)
    expect(MIGRATION).toMatch(/REVOKE ALL ON FUNCTION public\.kick_referral_sweep\(\) FROM PUBLIC, anon, authenticated;/)
  })
  it('extrato aceita o lançamento interno', () => {
    expect(MIGRATION).toMatch(/provider IN \('stripe', 'asaas', 'internal'\)/)
    expect(MIGRATION).toMatch(/'payout', 'referral'\)/)
    expect(MIGRATION).toMatch(/'pending', 'available', 'paid'/)
  })
})

describe('Indique e Ganhe — somas na tela', () => {
  it('agrupa por moeda da comissão e ignora estornadas', () => {
    const out = summarizeCommissions([
      { commission_cents: 274, status: 'pending', currency: 'usd', commission_currency: 'brl' },
      { commission_cents: 100, status: 'approved', currency: 'usd', commission_currency: 'brl' },
      { commission_cents: 50, status: 'paid', currency: 'usd', commission_currency: 'brl' },
      { commission_cents: 999, status: 'void', currency: 'usd', commission_currency: 'brl' },
      { commission_cents: 25, status: 'pending', currency: 'usd' },
    ])
    expect(out[0]).toEqual({ currency: 'brl', pending: 374, paid: 50, total: 424 })
    expect(out[1]).toEqual({ currency: 'usd', pending: 25, paid: 0, total: 25 })
    expect(formatCommissionTotals([], 'pending')).toMatch(/R\$\s?0,00/)
    expect(formatCommissionTotals(out, 'paid')).toMatch(/R\$\s?0,50/)
  })
})
