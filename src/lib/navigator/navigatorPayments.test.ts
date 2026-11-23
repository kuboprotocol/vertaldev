// Pagamentos do Navigator: assinatura/paywall, uma aprovação = um total, modo automático com teto, cartão.
import { describe, expect, it } from 'vitest';
import {
  approvalMatchesPending, autoPayDecision, cardFillValues, cardVaultValue, detectSubscription, effectivePolicy, isWalletSecret, luhnOk,
  merchantMatches, parseAutomation, parseCardInput, parseCardVaultValue, paymentRecheck, vertalPayBalanceFrom, vertalPayLine, walletCardName,
  ALWAYS_ASK, type PaymentPolicy,
} from '../../../supabase/functions/_shared/navigatorPayments';
import { extractCheckoutSummary, formatCents, pickSecretForHost, sanitizePending } from './navigatorCore';

const brl = (cents: number) => ({ cents, currency: 'BRL' as const, text: formatCents(cents) });
const policy: PaymentPolicy = { mode: 'preapproved', perPaymentMaxCents: 5000, currency: 'BRL' };
const high = (cents: number, store = 'folha.uol.com.br') => ({ total: brl(cents), confidence: 'high' as const, store });

describe('paywall / assinatura', () => {
  it('lê recorrência, período e termos de renovação como a página diz', () => {
    const page = 'Assine a Folha\nR$ 1,90 no 1º mês, depois R$ 29,90/mês\nRenovação automática. Cancele quando quiser.\nTotal hoje: R$ 1,90';
    const sub = detectSubscription(page);
    expect(sub).toEqual({ recurring: true, period: 'mensal', renewalTerms: 'Renovação automática. Cancele quando quiser.' });
    expect(extractCheckoutSummary(page, 'Assinatura', 'https://assinatura.folha.uol.com.br/checkout').total?.cents).toBe(190);
  });
  it('compra única não vira assinatura', () => {
    expect(detectSubscription('Camiseta R$ 50,00\nTotal do pedido: R$ 50,00').recurring).toBe(false);
    expect(detectSubscription('Plano anual: US$ 99 per year, renews automatically').period).toBe('anual');
  });
  it('o cartão recebe recorrência/termos/fonte, nunca o texto da página', () => {
    const [p] = sanitizePending([{ id: 'abcdef1234567890', kind: 'approval', recurring: true, period: 'mensal', renewalTerms: 'Renova todo mês', paySource: { kind: 'card', last4: '4242' }, totalChanged: true, pageText: 'x' }]);
    expect(p).toMatchObject({ recurring: true, period: 'mensal', renewalTerms: 'Renova todo mês', paySource: { kind: 'card', last4: '4242' }, totalChanged: true });
    expect((p as unknown as Record<string, unknown>).pageText).toBeUndefined();
  });
});

describe('gate: uma aprovação = um pagamento no total exato', () => {
  it('total igual segue; total, moeda ou loja diferente pergunta de novo; sem leitura pergunta de novo', () => {
    const ok = { cents: 1990, currency: 'BRL' as const, store: 'loja.com.br' };
    expect(paymentRecheck(ok, { total: brl(1990), store: 'loja.com.br' })).toEqual({ ok: true });
    expect(paymentRecheck(ok, { total: brl(2490), store: 'loja.com.br' })).toEqual({ ok: false, reason: 'total_changed' });
    expect(paymentRecheck(ok, { total: { ...brl(1990), currency: 'USD' }, store: 'loja.com.br' })).toEqual({ ok: false, reason: 'currency_changed' });
    expect(paymentRecheck(ok, { total: brl(1990), store: 'outra.com' })).toEqual({ ok: false, reason: 'merchant_changed' });
    expect(paymentRecheck(ok, { total: null, store: '' })).toEqual({ ok: false, reason: 'unreadable' });
    expect(paymentRecheck(null, { total: brl(1990), store: '' })).toEqual({ ok: false, reason: 'unreadable' });
  });
  it('o toque só vale para o total que o cartão mostrou', () => {
    expect(approvalMatchesPending({ totalCents: 1990, currency: 'BRL' }, { total: brl(1990) })).toBe(true);
    expect(approvalMatchesPending({ totalCents: 1990, currency: 'BRL' }, { total: brl(2490) })).toBe(false);
    expect(approvalMatchesPending({}, { total: brl(1990) })).toBe(false);
    expect(approvalMatchesPending({}, { total: null })).toBe(true);
  });
});

describe('"automatizar tudo": pré-aprovação com teto', () => {
  it('padrão: sempre pergunta', () => {
    expect(autoPayDecision(ALWAYS_ASK, high(100))).toEqual({ auto: false, reason: 'always_ask' });
    expect(effectivePolicy(null, null)).toBe(ALWAYS_ASK);
    expect(effectivePolicy({ autoApproveEnabled: false, autoApproveMaxCents: 0 }, null)).toBe(ALWAYS_ASK);
  });
  it('dentro do teto paga sozinho', () => {
    expect(autoPayDecision(policy, high(1990))).toEqual({ auto: true, reason: 'within_cap' });
  });
  it('acima do teto, total sem rótulo, outra moeda, total que mudou → pergunta', () => {
    expect(autoPayDecision(policy, high(5001)).reason).toBe('over_cap');
    expect(autoPayDecision(policy, { total: brl(100), confidence: 'low', store: 'x.com' }).reason).toBe('total_unreadable');
    expect(autoPayDecision(policy, { total: null, confidence: 'none', store: 'x.com' }).reason).toBe('total_unreadable');
    expect(autoPayDecision(policy, { total: { ...brl(100), currency: 'USD' }, confidence: 'high', store: 'x.com' }).reason).toBe('currency');
    expect(autoPayDecision(policy, high(100), { totalChanged: true }).reason).toBe('total_changed');
  });
  it('teto por loja no período e lojas permitidas', () => {
    const p: PaymentPolicy = { ...policy, periodMaxCents: 3000, merchants: ['uol.com.br'] };
    expect(autoPayDecision(p, high(1000), { spentInPeriodCents: 1500 })).toEqual({ auto: true, reason: 'within_cap' });
    expect(autoPayDecision(p, high(1000), { spentInPeriodCents: 2500 }).reason).toBe('over_period_cap');
    expect(autoPayDecision(p, high(1000, 'amazon.com.br')).reason).toBe('merchant');
    expect(merchantMatches(['uol.com.br'], 'folha.uol.com.br')).toBe(true);
    expect(merchantMatches(['uol.com.br'], 'fakeuol.com.br')).toBe(false);
  });
  it('assinatura recorrente só com opt-in', () => {
    const sub = { recurring: true, period: 'mensal' as const };
    expect(autoPayDecision(policy, high(190), { subscription: sub }).reason).toBe('recurring');
    expect(autoPayDecision({ ...policy, allowRecurring: true }, high(190), { subscription: sub }).auto).toBe(true);
  });
  it('pré-aprovação do chat só com o toque (confirmed) e com tetos válidos; vence as configurações', () => {
    expect(parseAutomation({ paymentMaxCents: 5000 })).toEqual({ ok: false, detail: 'confirmation_required' });
    expect(parseAutomation({ confirmed: true, paymentMaxCents: 10_000_000 })).toEqual({ ok: false, detail: 'payment_cap' });
    const a = parseAutomation({ confirmed: true, paymentMaxCents: 5000, merchants: ['Folha.UOL.com.br', 'x y'] });
    expect(a).toEqual({ ok: true, data: { mode: 'all', paymentMaxCents: 5000, periodMaxCents: 0, merchants: ['folha.uol.com.br'], allowRecurring: false } });
    if (!a.ok || !a.data) throw new Error('parse');
    expect(effectivePolicy({ autoApproveEnabled: true, autoApproveMaxCents: 100 }, a.data).perPaymentMaxCents).toBe(5000);
    expect(effectivePolicy({ autoApproveEnabled: true, autoApproveMaxCents: 100 }, { ...a.data, paymentMaxCents: 0 }).perPaymentMaxCents).toBe(100);
    expect(parseAutomation(undefined)).toEqual({ ok: true, data: null });
  });
});

describe('cartão no Cofre (carteira)', () => {
  const now = new Date('2026-11-22T12:00:00Z');
  it('valida número (Luhn), validade futura, CVV, titular e CEP', () => {
    expect(luhnOk('4242424242424242')).toBe(true);
    expect(parseCardInput({ number: '4242 4242 4242 4242', exp: '12/28', cvv: '123', holder: 'LAERCIO BORGES', zip: '04849-065' }, now))
      .toEqual({ ok: true, data: { number: '4242424242424242', expMonth: '12', expYear: '2028', holder: 'LAERCIO BORGES', zip: '04849-065', cvv: '123' }, saveCvv: false, save: true });
    expect(parseCardInput({ number: '4242424242424241', exp: '12/28', holder: 'A B', zip: '01000' }, now)).toEqual({ ok: false, detail: 'number' });
    expect(parseCardInput({ number: '4242424242424242', exp: '10/26', holder: 'A B', zip: '01000' }, now)).toEqual({ ok: false, detail: 'expired' });
    expect(parseCardInput({ number: '4242424242424242', exp: '12/28', cvv: '12', holder: 'A B', zip: '01000' }, now)).toEqual({ ok: false, detail: 'cvv' });
    expect(parseCardInput({ number: '378282246310005', exp: '12/28', cvv: '123', holder: 'A B', zip: '01000' }, now)).toEqual({ ok: false, detail: 'cvv' });
  });
  it('guarda sem CVV por padrão; preenche por campo', () => {
    const p = parseCardInput({ number: '4242424242424242', exp: '12/28', cvv: '123', holder: 'A B', zip: '01000' }, now);
    if (!p.ok) throw new Error('card');
    const stored = parseCardVaultValue(cardVaultValue(p.data, false))!;
    expect(stored.cvv).toBeUndefined();
    expect(cardFillValues(stored, ['number', 'exp', 'cvv', 'zip'])).toEqual({ number: '4242424242424242', exp: '12/28', zip: '01000' });
    expect(cardFillValues({ ...stored, cvv: '999' }, ['expMonth', 'expYear', 'cvv'])).toEqual({ expMonth: '12', expYear: '2028', cvv: '999' });
    expect(walletCardName('4242424242424242')).toBe('WALLET_CARD_4242');
  });
  it('cartão da carteira nunca serve para fill_secret em site nenhum', () => {
    const card = { id: '1', owner_id: 'u', env_key: 'WALLET_CARD_4242', bound_to: 'vertal-wallet', role: 'owner' as const };
    expect(isWalletSecret(card)).toBe(true);
    for (const host of ['vertal.wallet', 'wallet.vertal.dev', 'checkout.stripe.com', 'vertal-wallet.com']) expect(pickSecretForHost([card], 'WALLET_CARD_4242', host)).toBeNull();
  });
});

describe('Vertal Vibe Pay (adaptador)', () => {
  it('saldo só quando a API devolve; sem saldo, sem linha (nunca inventa)', () => {
    const bal = vertalPayBalanceFrom({ totals: [{ currency: 'USD', availableMinor: 5 }, { currency: 'BRL', availableMinor: 12345 }] });
    expect(bal).toEqual({ cents: 12345, currency: 'BRL' });
    expect(vertalPayLine(bal, brl(1990), formatCents)).toBe(`Você tem ${formatCents(12345)} no Vertal Pay. Pagar ${formatCents(1990)}?`);
    expect(vertalPayBalanceFrom({ error: 'x' })).toBeNull();
    expect(vertalPayLine(null, brl(1990), formatCents)).toBeNull();
  });
});
