// Pagamentos do Navigator no Worker: aprovação automática só com pré-aprovação e dentro do teto,
// cartão da carteira (Cofre) preenchido por id, sem cartão → formulário "Precisa de um cartão válido".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __test, saveVaultSecret, vertalPay, type NavigatorEnv } from './navigatorRoutes';
import { decryptWithConnectorKey } from './navigatorCrypto';
import { openAuditDetail } from '../supabase/functions/_shared/navigatorAuditVault.ts';

const KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const USER = '11111111-1111-4111-8111-111111111111';
const env = {
  SUPABASE_URL: 'https://db.example.co', SUPABASE_SECRET_KEY: 'service', CONNECTOR_ENC_KEY: KEY, E2B_API_KEY: 'k', E2B_DOMAIN: 'vertalrun.com',
} as unknown as NavigatorEnv;
const row = { id: '22222222-2222-4222-8222-222222222222', user_id: USER, sandbox_id: 'sbx1', status: 'active', billed_minutes: 1 } as never;
const target = { sandboxId: 'sbx1', token: 't'.repeat(40) };

interface Call { method: string; url: string; body: unknown }
let calls: Call[];
let secrets: Array<Record<string, unknown>>;

beforeEach(() => {
  // jsdom não tem AbortSignal.timeout (o Worker tem).
  if (typeof (AbortSignal as { timeout?: unknown }).timeout !== 'function') {
    (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = () => new AbortController().signal;
  }
  calls = [];
  secrets = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url: url.toString(), body });
    const ok = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.hostname.endsWith('vertalrun.com')) return ok({ ok: true });
    const tableName = url.pathname.replace('/rest/v1/', '');
    if (tableName === 'kubo_secrets') {
      if (method === 'GET') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        const envKey = url.searchParams.get('env_key')?.replace('eq.', '');
        const bound = url.searchParams.get('bound_to')?.replace('eq.', '');
        return ok(secrets.filter((s) => (!id || s.id === id) && (!envKey || s.env_key === envKey) && (!bound || bound === 'not.is.null' || s.bound_to === bound)));
      }
      if (method === 'POST') {
        const rec = { id: `33333333-3333-4333-8333-33333333333${secrets.length}`, ...(body as object) };
        secrets.push(rec);
        return ok([{ id: rec.id }], 201);
      }
      if (method === 'PATCH') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        const s = secrets.find((x) => x.id === id);
        if (s) Object.assign(s, body as object);
        return ok(s ? [s] : []);
      }
    }
    if (tableName === 'kubo_secret_grants') return ok([]);
    return new Response(null, { status: 201 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const req = () => new Request('https://vertal.dev/api/navigator/input', { method: 'POST' });
const navdInputs = () => calls.filter((c) => c.url.includes('vertalrun.com') && c.url.endsWith('/input'));
const auditRows = () => calls.filter((c) => c.url.includes('/navigator_audit')).map((c) => c.body as Record<string, unknown>);
const checkout = (total: string) => ({
  id: 'abcdef1234567890', kind: 'approval', category: 'payment', url: 'https://assinatura.folha.uol.com.br/checkout', target: 'Assinar',
  pageText: `Assinatura digital\nTotal hoje: ${total}`, pageTitle: 'Checkout',
});
const policy = { mode: 'preapproved' as const, perPaymentMaxCents: 5000, currency: 'BRL' as const };

describe('automatizar tudo: pagamento', () => {
  it('dentro do teto paga sozinho, com o total exato, auditoria cifrada e recibo', async () => {
    const r = await __test.autoDecide(env, USER, row, target, checkout('R$ 19,90'), policy, null);
    expect(r).toMatchObject({ kind: 'payment', total: 'R$ 19,90', totalCents: 1990, store: 'assinatura.folha.uol.com.br' });
    expect(navdInputs()[0].body).toMatchObject({ kind: 'approval', approve: true, totalCents: 1990, currency: 'BRL' });
    expect(auditRows().map((a) => a.kind)).toEqual(['auto_approved', 'payment']);
    const detail = await openAuditDetail(env as never, { ...auditRows()[1], user_id: USER } as never);
    expect(detail).toMatchObject({ status: 'auto_approved', cents: 1990, total: 'R$ 19,90' });
  });
  it('acima do teto pergunta (nenhuma resposta ao navd)', async () => {
    expect(await __test.autoDecide(env, USER, row, target, checkout('R$ 89,90'), policy, null)).toBeNull();
    expect(navdInputs()).toHaveLength(0);
  });
  it('sem pré-aprovação (padrão) sempre pergunta, mesmo barato', async () => {
    expect(await __test.autoDecide(env, USER, row, target, checkout('R$ 1,00'), { mode: 'always_ask', perPaymentMaxCents: 0 }, null)).toBeNull();
    expect(navdInputs()).toHaveLength(0);
  });
  it('total que mudou depois da aprovação nunca é automático', async () => {
    expect(await __test.autoDecide(env, USER, row, target, { ...checkout('R$ 19,90'), totalChanged: true }, policy, null)).toBeNull();
  });
  it('envio/confirmação: só no modo automatizar tudo da tarefa', async () => {
    const write = { id: 'abcdef1234567891', kind: 'approval', category: 'write', target: 'Enviar', url: 'https://mail.google.com/mail/u/0/' };
    expect(await __test.autoDecide(env, USER, row, target, write, policy, null)).toBeNull();
    const auto = { mode: 'all' as const, paymentMaxCents: 0, periodMaxCents: 0, merchants: [], allowRecurring: false };
    expect(await __test.autoDecide(env, USER, row, target, write, policy, auto)).toMatchObject({ kind: 'write', target: 'Enviar' });
    expect(auditRows().map((a) => a.kind)).toEqual(['auto_action']);
  });
});

describe('cartão da carteira', () => {
  const card = { id: 'abcdef1234567892', kind: 'card' as const, host: 'assinatura.folha.uol.com.br' };
  it('sem cartão válido: o chat mostra "Precisa de um cartão válido" (falta dado → pergunta)', async () => {
    const r = await __test.fulfillCardFromWallet(env, USER, row, target, card, { fields: ['number', 'exp', 'cvv'], host: card.host });
    expect(r).toMatchObject({ filled: false, view: { cardRequired: true, cardFields: ['number', 'exp', 'cvv'] } });
    expect(navdInputs()).toHaveLength(0);
  });
  it('formulário: guarda na carteira sem CVV (padrão), preenche e não devolve o número', async () => {
    const res = await __test.cardInput(req(), env, USER, row, target, card.id, {
      kind: 'card', number: '4242424242424242', exp: '12/30', cvv: '123', holder: 'LAERCIO BORGES', zip: '04849065', save: true,
    }, { ...card, fields: ['number', 'exp', 'cvv'] });
    const data = await res.json();
    expect(data).toEqual({ ok: true, status: 'ok', saved: ['WALLET_CARD_4242'] });
    expect(navdInputs()[0].body).toEqual({ id: card.id, kind: 'card', value: { number: '4242424242424242', exp: '12/30', cvv: '123' } });
    const s = secrets[0];
    expect(s).toMatchObject({ env_key: 'WALLET_CARD_4242', bound_to: 'vertal-wallet', group_name: 'wallet', masked_hint: 'Visa •••• 4242' });
    const stored = JSON.parse(await decryptWithConnectorKey(KEY, s as never));
    expect(stored.cvv).toBeUndefined();
    for (const a of auditRows()) expect(JSON.stringify(a)).not.toContain('4242424242424242');
  });
  it('próxima vez: cartão salvo sem CVV pede só o CVV; com CVV preenche sozinho', async () => {
    await __test.cardInput(req(), env, USER, row, target, card.id, { kind: 'card', number: '4242424242424242', exp: '12/30', holder: 'L B', zip: '04849065', save: true }, { ...card, fields: ['number'] });
    for (const s of secrets) s.owner_id = USER;
    calls = [];
    const need = await __test.fulfillCardFromWallet(env, USER, row, target, card, { fields: ['number', 'exp', 'cvv'], host: card.host });
    expect(need).toMatchObject({ filled: false, view: { cvvOnlyFor: 'Visa •••• 4242' } });
    const ok = await __test.fulfillCardFromWallet(env, USER, row, target, card, { fields: ['number', 'exp'], host: card.host });
    expect(ok).toEqual({ filled: true });
    expect(navdInputs()[0].body).toMatchObject({ kind: 'card', value: { number: '4242424242424242', exp: '12/30' } });
  });
  it('cartão recusado pelo site: não repete o salvo, mostra o formulário de novo', async () => {
    const r = await __test.fulfillCardFromWallet(env, USER, row, target, card, { fields: ['number'], retry: true, host: card.host });
    expect(r).toMatchObject({ filled: false, view: { cardRequired: true, retry: true } });
  });
  it('cartão inválido é recusado antes de chegar ao site', async () => {
    const res = await __test.cardInput(req(), env, USER, row, target, card.id, { kind: 'card', number: '4242424242424241', exp: '12/30', holder: 'L B', zip: '04849065' }, { ...card, fields: ['number'] });
    expect(res.status).toBe(400);
    expect(navdInputs()).toHaveLength(0);
  });
});

describe('Vertal Vibe Pay', () => {
  it('desligado por padrão (sem flag): sem saldo, sem chamada', async () => {
    const a = vertalPay(env, 'Bearer x');
    expect(a.enabled).toBe(false);
    expect(await a.balance()).toBeNull();
  });
  it('com a flag: lê o saldo real da função wallet; ainda não paga checkout de terceiros', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ totals: [{ currency: 'BRL', availableMinor: 5000 }] }), { status: 200 })));
    const a = vertalPay({ ...env, VERTAL_PAY_NAVIGATOR: 'on' } as NavigatorEnv, 'Bearer x');
    expect(a.canPay).toBe(false);
    expect(await a.balance()).toEqual({ cents: 5000, currency: 'BRL' });
  });
});
