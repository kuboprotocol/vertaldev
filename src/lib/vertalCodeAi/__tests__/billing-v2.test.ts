import { describe, expect, it } from 'vitest';
import {
  billingFlags,
  billingV2For,
  DEFAULT_BILLING,
  expandBillingEnv,
  freeAllowanceDecision,
  freeWindowKey,
  isPriceError,
  loadBilling,
  lowCreditDecision,
  lowCreditMessage,
  MICRO,
  pickBillingLocale,
  priceRequest,
  priceTable,
  retailCreditsV2,
  settleMicro,
  summarizeUsage,
  wholesaleBalanceGate,
} from '../../../../supabase/functions/_shared/vertalCodeAi/billing';

const VENDORS = /openai|openrouter|deepseek|cerebras|gemini|google|qwen|ollama|modal|anthropic|meta|llama|mistral|nvidia|groq|lovable/i;

describe('cobrança v2 · preço = nosso custo × markup', () => {
  it('padrões: crédito US$0,03; varejo 1,69 / clonagem 2,59 / raspagem 5,50; atacado 1,20', () => {
    expect(DEFAULT_BILLING.usdPerCredit).toBe(0.03);
    expect(DEFAULT_BILLING.retailMarkup).toEqual({ chat: 1.69, code: 1.69, image: 1.69, video: 1.69, clone: 2.59, scrape: 5.5 });
    expect(DEFAULT_BILLING.wholesaleMarkup).toBe(1.2);
    expect(DEFAULT_BILLING.wholesaleBlocked).toEqual(['clone', 'scrape']);
  });

  it('varejo: código a US$0,01 → US$0,0169 → 0,563334 crédito', () => {
    const r = priceRequest(DEFAULT_BILLING, { channel: 'retail', kind: 'code', costUsd: 0.01 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.markup).toBe(1.69);
    expect(r.priceUsd).toBeCloseTo(0.0169, 10);
    expect(r.micro).toBe(563334);
    expect(r.floorApplied).toBe(false);
  });

  it('varejo: clonagem ×2,59 e raspagem ×5,50', () => {
    const c = priceRequest(DEFAULT_BILLING, { channel: 'retail', kind: 'clone', costUsd: 0.05 });
    const s = priceRequest(DEFAULT_BILLING, { channel: 'retail', kind: 'scrape', costUsd: 0.004 });
    expect(c.ok && c.priceUsd).toBeCloseTo(0.1295, 10);
    expect(s.ok && s.priceUsd).toBeCloseTo(0.022, 10);
  });

  it('atacado: ×1,20 em qualquer tipo permitido', () => {
    const r = priceRequest(DEFAULT_BILLING, { channel: 'wholesale', kind: 'image', costUsd: 0.02 });
    expect(r.ok && r.priceUsd).toBeCloseTo(0.024, 10);
    expect(r.ok && r.credits).toBe(0.8);
  });

  it('marca branca recusa clonagem e raspagem com erro claro (403)', () => {
    for (const kind of ['clone', 'scrape'] as const) {
      const r = priceRequest(DEFAULT_BILLING, { channel: 'wholesale', kind, costUsd: 1 });
      expect(r.ok).toBe(false);
      if (!isPriceError(r)) continue;
      expect(r.status).toBe(403);
      expect(r.code).toBe('feature_not_available_white_label');
      expect(r.message).toMatch(/not available/);
      expect(r.message).not.toMatch(VENDORS);
    }
  });

  it('piso: modelo próprio/grátis (custo 0 ou negativo) nunca sai de graça', () => {
    for (const kind of ['chat', 'code', 'image', 'video', 'clone', 'scrape'] as const) {
      const r = priceRequest(DEFAULT_BILLING, { channel: 'retail', kind, costUsd: 0 });
      expect(r.ok && r.micro).toBeGreaterThan(0);
      expect(r.ok && r.floorApplied).toBe(true);
      const neg = priceRequest(DEFAULT_BILLING, { channel: 'retail', kind, costUsd: -5 });
      expect(neg.ok && neg.micro).toBe(r.ok && r.micro);
    }
    // chat: piso US$0,0003 × 1,69 = US$0,000507 → 0,0169 crédito
    const chat = priceRequest(DEFAULT_BILLING, { channel: 'retail', kind: 'chat', costUsd: 0 });
    expect(chat.ok && chat.micro).toBe(16900);
  });

  it('arredonda para cima em microcréditos (nunca cobra menos que o custo × markup)', () => {
    const r = priceRequest(DEFAULT_BILLING, { channel: 'wholesale', kind: 'code', costUsd: 0.0123457 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.micro / MICRO).toBeGreaterThanOrEqual((0.0123457 * 1.2) / 0.03 - 1e-9);
  });

  it('retailCreditsV2 substitui (custo+0,05)×1,5', () => {
    expect(retailCreditsV2(0.03, 'code')).toBe(1.69);
    expect(retailCreditsV2(0, 'video')).toBe(2.82); // piso US$0,05 × 1,69 / 0,03
  });
});

describe('cobrança v2 · config', () => {
  it('sobrescrita parcial por JSON', () => {
    const { config, errors } = loadBilling(JSON.stringify({ retailMarkup: { scrape: 6 }, freeAllowance: { count: 10, period: 'week' } }));
    expect(errors).toEqual([]);
    expect(config.retailMarkup.scrape).toBe(6);
    expect(config.retailMarkup.code).toBe(1.69);
    expect(config.freeAllowance).toMatchObject({ count: 10, period: 'week', kinds: ['chat'] });
  });

  it('sobrescrita inválida volta inteira ao padrão (markup < 1, piso 0, período estranho, JSON quebrado)', () => {
    expect(loadBilling(JSON.stringify({ wholesaleMarkup: 0.9 })).errors.length).toBeGreaterThan(0);
    expect(loadBilling(JSON.stringify({ floorUsd: { chat: 0 } })).errors.length).toBeGreaterThan(0);
    expect(loadBilling(JSON.stringify({ freeAllowance: { period: 'hour' } })).errors.length).toBeGreaterThan(0);
    expect(loadBilling(JSON.stringify({ lowCredit: { thresholdRatio: 1.5 } })).errors.length).toBeGreaterThan(0);
    const bad = loadBilling('{oops');
    expect(bad.config).toBe(DEFAULT_BILLING);
    expect(bad.errors.length).toBe(1);
  });

  it('interruptores desligados por padrão; podem vir de dentro do VERTAL_GPU_CONFIG (sem segredo novo)', () => {
    expect(billingFlags({})).toMatchObject({ v2: false, retailCharge: false, freeAllowance: false, lowCredit: false, lowCreditEmail: false, lowCreditCrm: false });
    const env = expandBillingEnv({
      VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_BILLING_V2_ENABLED: 'true', VERTAL_BILLING_USER_IDS: 'u1', VERTAL_BILLING_CONFIG: { retailMarkup: { chat: 2 } }, OPENROUTER_API_KEY: 'x' }),
    });
    expect(env.OPENROUTER_API_KEY).toBeUndefined(); // só chaves de cobrança
    const f = billingFlags(env);
    expect(f.v2).toBe(true);
    expect(billingV2For(f, 'u1')).toBe(true);
    expect(billingV2For(f, 'u2')).toBe(false);
    expect(loadBilling(env.VERTAL_BILLING_CONFIG).config.retailMarkup.chat).toBe(2);
    // segredo avulso vence
    expect(expandBillingEnv({ VERTAL_BILLING_V2_ENABLED: 'false', VERTAL_GPU_CONFIG: '{"VERTAL_BILLING_V2_ENABLED":"true"}' }).VERTAL_BILLING_V2_ENABLED).toBe('false');
    // interruptor da API também pode morar no VERTAL_GPU_CONFIG
    expect(expandBillingEnv({ VERTAL_GPU_CONFIG: '{"VERTAL_AI_API_ENABLED":"true"}' }).VERTAL_AI_API_ENABLED).toBe('true');
  });
});

describe('cobrança v2 · grátis do varejo', () => {
  it('janela configurável (dia/semana/mês/sempre)', () => {
    const now = new Date('2026-11-26T15:00:00Z'); // quinta
    expect(freeWindowKey('day', now)).toBe('day:2026-11-26');
    expect(freeWindowKey('week', now)).toBe('week:2026-11-23');
    expect(freeWindowKey('month', now)).toBe('month:2026-11');
    expect(freeWindowKey('lifetime', now)).toBe('lifetime');
    expect(freeWindowKey('day', new Date('2026-11-27T01:00:00Z'), 'America/Sao_Paulo')).toBe('day:2026-11-26');
  });

  it('5 mensagens de chat simples por conta; a 6ª é cobrada; só varejo e só chat', () => {
    expect(freeAllowanceDecision(DEFAULT_BILLING, { channel: 'retail', kind: 'chat', usedInWindow: 0 })).toEqual({ free: true, remainingAfter: 4, limit: 5 });
    expect(freeAllowanceDecision(DEFAULT_BILLING, { channel: 'retail', kind: 'chat', usedInWindow: 4 }).free).toBe(true);
    expect(freeAllowanceDecision(DEFAULT_BILLING, { channel: 'retail', kind: 'chat', usedInWindow: 5 }).free).toBe(false);
    expect(freeAllowanceDecision(DEFAULT_BILLING, { channel: 'retail', kind: 'code', usedInWindow: 0 }).free).toBe(false);
    expect(freeAllowanceDecision(DEFAULT_BILLING, { channel: 'wholesale', kind: 'chat', usedInWindow: 0 }).free).toBe(false);
  });
});

describe('cobrança v2 · saldo e fração', () => {
  it('atacado: saldo zero → 402 credits_exhausted (pt/en), positivo passa', () => {
    expect(wholesaleBalanceGate(0.5)).toEqual({ ok: true });
    const en = wholesaleBalanceGate(0);
    expect(en.ok === false && en.status).toBe(402);
    expect(en.ok === false && en.code).toBe('credits_exhausted');
    const pt = wholesaleBalanceGate(-1, 'pt-BR');
    expect(pt.ok === false && pt.message).toMatch(/créditos da Vertal acabaram/);
  });

  it('carry: invariante débitos×1e6 + carry = carry0 + custo', () => {
    let carry = 0;
    let debits = 0;
    const costs = [16900, 563334, 999999, 2, 1_500_000];
    for (const c of costs) {
      const r = settleMicro(carry, c);
      debits += r.debitCredits;
      carry = r.carryMicro;
    }
    expect(debits * MICRO + carry).toBe(costs.reduce((a, b) => a + b, 0));
    expect(() => settleMicro(0.5, 1)).toThrow();
  });
});

describe('cobrança v2 · aviso de crédito baixo', () => {
  const top = { id: 't1', credits: 1000 };
  it('dispara a ≤ 30% da última recarga, uma vez por ciclo', () => {
    expect(lowCreditDecision(DEFAULT_BILLING, { balanceCredits: 301, lastTopUp: top, alreadyNotified: false }).notify).toBe(false);
    const d = lowCreditDecision(DEFAULT_BILLING, { balanceCredits: 300, lastTopUp: top, alreadyNotified: false });
    expect(d).toMatchObject({ notify: true, cycleKey: 'topup:t1', thresholdCredits: 300, pct: 30 });
    expect(lowCreditDecision(DEFAULT_BILLING, { balanceCredits: 10, lastTopUp: top, alreadyNotified: true }).reason).toBe('already_notified');
    expect(lowCreditDecision(DEFAULT_BILLING, { balanceCredits: 0, lastTopUp: null, alreadyNotified: false }).reason).toBe('no_topup');
  });

  it('limiar configurável', () => {
    const cfg = loadBilling(JSON.stringify({ lowCredit: { thresholdRatio: 0.2 } })).config;
    expect(lowCreditDecision(cfg, { balanceCredits: 250, lastTopUp: top, alreadyNotified: false }).notify).toBe(false);
    expect(lowCreditDecision(cfg, { balanceCredits: 200, lastTopUp: top, alreadyNotified: false }).pct).toBe(20);
  });

  it('idioma: pt* → pt-BR, outro → en, nada → en', () => {
    expect(pickBillingLocale([null, 'pt-BR'])).toBe('pt-BR');
    expect(pickBillingLocale(['pt', 'en'])).toBe('pt-BR');
    expect(pickBillingLocale(['es-ES'])).toBe('en');
    expect(pickBillingLocale(['auto', undefined])).toBe('en');
    expect(pickBillingLocale([])).toBe('en');
  });

  it('texto PT aprovado, com variáveis', () => {
    const m = lowCreditMessage('pt-BR', { name: 'Ana', balance: 1234.5, link: 'https://vertal.dev/credits', usageLink: 'https://vertal.dev/u' });
    expect(m.subject).toBe('Seus créditos da Vertal estão acabando');
    expect(m.text).toContain('Olá, Ana.');
    expect(m.text).toContain('Restam 1.234,5 créditos na sua conta Vertal Dev, cerca de 30% da sua última recarga.');
    expect(m.text).toContain('ficam pausados na sua conta até uma nova recarga. Seus projetos, aplicativos e dados continuam salvos e acessíveis.');
    expect(m.text).toContain('faça uma recarga em https://vertal.dev/credits.');
    expect(m.text).toContain('veja o extrato em https://vertal.dev/u ou responda este e-mail.');
    expect(m.text.trim().endsWith('Equipe Vertal')).toBe(true);
    expect(m.html).toContain('<a href="https://vertal.dev/credits">');
  });

  it('texto EN aprovado; sem nome; HTML escapado; sem fornecedor', () => {
    const m = lowCreditMessage('en', { name: '<b>x</b>', balance: 12, link: 'https://vertal.dev/credits', usageLink: 'https://vertal.dev/u' });
    expect(m.subject).toBe('Your Vertal credits are running low');
    expect(m.text).toContain('you have 12 credits left in your Vertal Dev account, about 30% of your last top-up.');
    expect(m.text).toContain('Vertal AI features (chat, code, image, video and the API) will pause on your account until you top up again.');
    expect(m.html).not.toContain('<b>');
    expect(m.text.trim().endsWith('The Vertal team')).toBe(true);
    const noName = lowCreditMessage('en', { balance: 1, link: 'https://a', usageLink: 'https://b' });
    expect(noName.text.startsWith('Hi,')).toBe(true);
    for (const t of [m.subject, m.text, noName.text]) expect(t).not.toMatch(VENDORS);
  });
});

describe('cobrança v2 · extrato', () => {
  it('agrupa por canal+tipo com créditos e markup; linhas antigas da API entram como código', () => {
    const s = summarizeUsage([
      { channel: 'retail', kind: 'code', credits_micro: 563334, markup: 1.69 },
      { channel: 'retail', kind: 'code', credits_micro: 436666, markup: 1.69 },
      { channel: 'retail', kind: 'chat', credits_micro: 0, markup: 1.69, free: true },
      { channel: 'wholesale', kind: 'code', cost_micro: 80000, markup: 1.2 },
      { channel: 'wholesale', kind: 'code', cost_micro: 20000, markup: null },
    ]);
    expect(s.totalCredits).toBe(1.1);
    const code = s.lines.find((l) => l.channel === 'retail' && l.kind === 'code')!;
    expect(code).toMatchObject({ requests: 2, credits: 1, markupPct: 69 });
    expect(s.lines.find((l) => l.kind === 'chat')).toMatchObject({ freeRequests: 1, credits: 0 });
    expect(s.lines.find((l) => l.channel === 'wholesale')).toMatchObject({ requests: 2, markupPct: 20 });
  });

  it('tabela de preços: um exemplo por categoria; atacado sem clonagem/raspagem', () => {
    const t = priceTable();
    expect(t).toHaveLength(12);
    expect(t.filter((r) => r.channel === 'wholesale' && r.note === 'feature_not_available_white_label').map((r) => r.kind)).toEqual(['clone', 'scrape']);
    expect(t.every((r) => r.credits === null || r.credits > 0)).toBe(true);
  });
});
