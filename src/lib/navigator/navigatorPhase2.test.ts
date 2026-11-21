import { describe, expect, it } from 'vitest';
import {
  NAVIGATOR_LIMITS, auditDetail, autoApproveDecision, describeAudit, extractCheckoutSummary, findMoney, formatCents,
  parseMoneyAmount, parseSettingsBody, pickSecretForHost, pickTotpForHost, sanitizePending, secretMatchesHost, type VaultSecretMeta,
} from './navigatorCore';

const BR_CHECKOUT = `Minha Loja
Carrinho
Fone Bluetooth XZ
R$ 199,90
Cabo USB-C 2m R$ 39,90
Subtotal R$ 239,80
Frete R$ 15,00
Desconto -R$ 10,00
Total do pedido
R$ 244,80
em até 10x de R$ 24,48
Finalizar compra`;

const US_CHECKOUT = `Order summary
Wireless Mouse $25.99
Items: $25.99
Shipping & handling: $4.99
Order total: $30.98
Place your order`;

describe('dinheiro na página', () => {
  it('lê formatos BR e US', () => {
    expect(parseMoneyAmount('1.234,56')).toBe(123456);
    expect(parseMoneyAmount('1,234.56')).toBe(123456);
    expect(parseMoneyAmount('99')).toBe(9900);
    expect(parseMoneyAmount('12,5')).toBe(1250);
    expect(findMoney('Total: R$ 1.299,00 ou US$ 250.00').map((m) => [m.cents, m.currency])).toEqual([[129900, 'BRL'], [25000, 'USD']]);
    expect(formatCents(123456)).toBe('R$ 1.234,56');
  });
});

describe('resumo do checkout (cartão de aprovação)', () => {
  it('acha loja, itens e o total do pedido (não o subtotal nem a parcela)', () => {
    const s = extractCheckoutSummary(BR_CHECKOUT, 'Checkout - Minha Loja', 'https://www.minhaloja.com.br/checkout');
    expect(s.store).toBe('minhaloja.com.br');
    expect(s.total?.cents).toBe(24480);
    expect(s.total?.currency).toBe('BRL');
    expect(s.confidence).toBe('high');
    expect(s.items).toContain('Cabo USB-C 2m — R$ 39,90');
    expect(s.items.some((i) => /Subtotal|Frete|Desconto|10x/.test(i))).toBe(false);
  });
  it('funciona em inglês', () => {
    const s = extractCheckoutSummary(US_CHECKOUT, 'Amazon Checkout', 'https://www.amazon.com/checkout');
    expect(s.total).toMatchObject({ cents: 3098, currency: 'USD' });
    expect(s.confidence).toBe('high');
    expect(s.items[0]).toBe('Wireless Mouse — $ 25.99');
  });
  it('sem rótulo de total: palpite com confiança baixa; sem valores: nada', () => {
    expect(extractCheckoutSummary('Plano VPS R$ 29,99\nPlano Pro R$ 59,99').confidence).toBe('low');
    expect(extractCheckoutSummary('Confirme seu e-mail').total).toBeNull();
  });
});

describe('aprovar automático até R$X (desligado por padrão)', () => {
  const high = extractCheckoutSummary(BR_CHECKOUT);
  it('por padrão sempre pede', () => {
    expect(autoApproveDecision(null, high).auto).toBe(false);
    expect(autoApproveDecision({ autoApproveEnabled: false, autoApproveMaxCents: 100000 }, high).auto).toBe(false);
  });
  it('só aprova com total confiável, em reais e dentro do limite', () => {
    expect(autoApproveDecision({ autoApproveEnabled: true, autoApproveMaxCents: 30000 }, high)).toEqual({ auto: true, reason: 'within_limit' });
    expect(autoApproveDecision({ autoApproveEnabled: true, autoApproveMaxCents: 20000 }, high).reason).toBe('over_limit');
    expect(autoApproveDecision({ autoApproveEnabled: true, autoApproveMaxCents: 30000 }, extractCheckoutSummary('Plano R$ 9,99')).reason).toBe('total_unknown');
    expect(autoApproveDecision({ autoApproveEnabled: true, autoApproveMaxCents: 30000 }, extractCheckoutSummary(US_CHECKOUT)).reason).toBe('currency');
    // Teto duro mesmo se o banco tiver valor maior.
    const huge = { total: { text: 'R$ 1.500,00', cents: 150000, currency: 'BRL' as const }, confidence: 'high' as const };
    expect(autoApproveDecision({ autoApproveEnabled: true, autoApproveMaxCents: 9_999_999 }, huge).auto).toBe(false);
  });
  it('a preferência exige clique explícito e respeita o teto', () => {
    expect(parseSettingsBody({ autoApproveEnabled: false })).toEqual({ ok: true, data: { autoApproveEnabled: false, autoApproveMaxCents: 0 } });
    expect(parseSettingsBody({ autoApproveEnabled: true, autoApproveMaxCents: 5000 })).toMatchObject({ ok: false, detail: 'confirmation_required' });
    expect(parseSettingsBody({ autoApproveEnabled: true, autoApproveMaxCents: 5000, confirmed: true })).toEqual({ ok: true, data: { autoApproveEnabled: true, autoApproveMaxCents: 5000 } });
    expect(parseSettingsBody({ autoApproveEnabled: true, autoApproveMaxCents: NAVIGATOR_LIMITS.autoApproveMaxCentsCap + 1, confirmed: true }).ok).toBe(false);
    expect(parseSettingsBody({ autoApproveEnabled: true, autoApproveMaxCents: 0, confirmed: true }).ok).toBe(false);
    expect(parseSettingsBody({}).ok).toBe(false);
  });
});

describe('pedidos pendentes e segredos TOTP', () => {
  it('o cartão recebe loja/total/itens e screenshot JPEG limitado; texto da página nunca', () => {
    const shot = 'data:image/jpeg;base64,AAAA';
    const [p] = sanitizePending([{ id: 'abcdef1234567890', kind: 'approval', store: 'loja.com', total: 'R$ 10,00', totalCents: 1000, items: ['A — R$ 10,00'], screenshot: shot, pageText: 'segredo' }]);
    expect(p).toMatchObject({ store: 'loja.com', total: 'R$ 10,00', totalCents: 1000, items: ['A — R$ 10,00'], screenshot: shot });
    expect((p as unknown as Record<string, unknown>).pageText).toBeUndefined();
    const [code] = sanitizePending([{ id: 'abcdef1234567890', kind: 'code', screenshot: shot }]);
    expect(code.screenshot).toBeUndefined();
    const [png] = sanitizePending([{ id: 'abcdef1234567890', kind: 'approval', screenshot: 'data:image/png;base64,AA' }]);
    expect(png.screenshot).toBeUndefined();
    expect(sanitizePending([{ id: 'abcdef1234567890', kind: 'totp', name: 'GITHUB_TOTP', host: 'github.com' }])[0].kind).toBe('totp');
  });
  it('semente TOTP nunca é digitada por fill_secret; só gera código para o site vinculado', () => {
    const secrets: VaultSecretMeta[] = [
      { id: '1', owner_id: 'u', env_key: 'GITHUB_TOTP', bound_to: 'github', role: 'owner' },
      { id: '2', owner_id: 'u', env_key: 'GITHUB_PASSWORD', bound_to: 'github', role: 'owner' },
    ];
    expect(pickSecretForHost(secrets, 'GITHUB_TOTP', 'github.com')).toBeNull();
    expect(pickSecretForHost(secrets, 'GITHUB_PASSWORD', 'github.com')?.id).toBe('2');
    expect(pickTotpForHost(secrets, 'github.com')?.id).toBe('1');
    expect(pickTotpForHost(secrets, 'evil-github.com.attacker.io')).toBeNull();
    expect(pickTotpForHost(secrets, 'gitlab.com')).toBeNull();
    expect(secretMatchesHost('github', 'github.com')).toBe(true);
  });
});

describe('auditoria (aba Atividade)', () => {
  it('guarda só metadados conhecidos', () => {
    const d = auditDetail({ name: 'GITHUB_PASSWORD', host: 'github.com', value: 'hunter2', code: '123456', task: 'x'.repeat(500) });
    expect(d).toEqual({ name: 'GITHUB_PASSWORD', host: 'github.com', task: 'x'.repeat(300) });
  });
  it('descreve cada tipo em português', () => {
    expect(describeAudit({ kind: 'approval_granted', detail: { store: 'loja.com', total: 'R$ 10,00' } })).toBe('Pagamento aprovado por você em loja.com · R$ 10,00');
    expect(describeAudit({ kind: 'secret_used', detail: { name: 'GITHUB_PASSWORD', host: 'github.com' } })).toBe('Segredo usado: GITHUB_PASSWORD em github.com');
    expect(describeAudit({ kind: 'settings_changed', detail: {} })).toMatch(/sempre pedir/);
    expect(describeAudit({ kind: 'auto_approved', detail: { limit: 'R$ 50,00', total: 'R$ 20,00' } })).toMatch(/automaticamente \(até R\$ 50,00\)/);
  });
});
