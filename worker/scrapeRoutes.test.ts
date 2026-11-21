// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleScrape, __test } from './scrapeRoutes';
import { CONSENT_CATEGORIES } from '../supabase/functions/_shared/consentGate';

const USER = '11111111-2222-4333-8444-555555555555';
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'pk', SUPABASE_SECRET_KEY: 'sk', E2B_API_KEY: 'e2b', E2B_API_URL: 'https://api.e2b.test', E2B_DOMAIN: 'e2b.test',
};

interface Calls { e2b: string[]; rpc: Array<Record<string, unknown>>; audit: Array<Record<string, unknown>>; consentAudit: Array<Record<string, unknown>>; scrapeBody?: Record<string, unknown> }

function mockFetch(opts: { accepted: boolean; balance?: number; robots?: string; pages?: unknown[] }): Calls {
  const calls: Calls = { e2b: [], rpc: [], audit: [], consentAudit: [] };
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const ok = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.endsWith('/auth/v1/user')) return ok({ id: USER });
    if (url.endsWith('/robots.txt')) return opts.robots ? new Response(opts.robots, { status: 200 }) : new Response('nope', { status: 404 });
    if (url.includes('/rest/v1/consent_acceptances')) return ok(opts.accepted ? [{ category: 'web_scraping', terms_version: CONSENT_CATEGORIES.web_scraping.version }] : []);
    if (url.includes('/rest/v1/consent_audit')) {
      calls.consentAudit.push(body);
      return new Response(null, { status: 201 });
    }
    if (url.includes('/rest/v1/navigator_audit')) {
      calls.audit.push(body);
      return new Response(null, { status: 201 });
    }
    if (url.includes('/rest/v1/subscriptions')) return ok([{ edits_limit: opts.balance ?? 100, edits_used: 0 }]);
    if (url.includes('/rest/v1/scrape_runs')) return init?.method === 'POST' || init?.method === 'PATCH' ? new Response(init?.method === 'PATCH' ? '[]' : null, { status: init?.method === 'PATCH' ? 200 : 201 }) : ok([]);
    if (url.includes('/rest/v1/rpc/execute_atomic_credit_deduction')) {
      calls.rpc.push(body);
      return ok({ success: true });
    }
    if (url.startsWith('https://api.e2b.test')) {
      calls.e2b.push(`${init?.method} ${url}`);
      if (init?.method === 'POST' && url.endsWith('/sandboxes')) return ok({ sandboxID: 'sbx12345678' });
      return new Response(null, { status: 204 });
    }
    if (url.startsWith('https://8787-sbx12345678.e2b.test')) {
      calls.e2b.push(`${init?.method} ${url}`);
      if (url.endsWith('/health')) return ok({ ok: true });
      if (url.endsWith('/init')) return ok({ ok: true, mode: 'scrape' });
      if (url.endsWith('/scrape')) {
        calls.scrapeBody = body;
        return ok({ ok: true, pages: opts.pages ?? [] });
      }
    }
    return new Response('unexpected ' + url, { status: 500 });
  }));
  return calls;
}

const call = (route: string, body: Record<string, unknown>) =>
  handleScrape(new Request(`https://vertal.dev/api/scrape/${route}`, { method: 'POST', headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env, new URL(`https://vertal.dev/api/scrape/${route}`));

beforeEach(() => {
  __test.robotsCache.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/api/scrape: consent gate, robots e créditos', () => {
  it('sem o termo assinado, BLOQUEIA (consent_required) e não abre sandbox nem cobra', async () => {
    const calls = mockFetch({ accepted: false });
    const res = await call('page', { url: 'https://loja.com/produto', selectors: [{ name: 'preco', css: '.price' }] });
    const data = (await res.json()) as Record<string, unknown>;
    expect(data).toMatchObject({ ok: false, status: 'consent_required', category: 'web_scraping', version: CONSENT_CATEGORIES.web_scraping.version });
    expect(calls.e2b).toEqual([]);
    expect(calls.rpc).toEqual([]);
    expect(calls.consentAudit[0]).toMatchObject({ action: 'require_terms', surface: 'scrape' });
  });

  it('pedido proibido é bloqueado mesmo com o termo assinado (e auditado)', async () => {
    const calls = mockFetch({ accepted: true });
    const res = await call('page', { url: 'https://jornal.com/materia', purpose: 'burlar o paywall do jornal' });
    expect(await res.json()).toMatchObject({ ok: false, status: 'prohibited' });
    expect(calls.e2b).toEqual([]);
    expect(calls.consentAudit[0]).toMatchObject({ action: 'block', level: 'prohibited' });
    expect(calls.audit[0]).toMatchObject({ kind: 'consent_blocked' });
  });

  it('robots.txt que proíbe: não coleta nem cobra', async () => {
    const calls = mockFetch({ accepted: true, robots: 'User-agent: *\nDisallow: /' });
    const res = await call('page', { url: 'https://loja.com/produto' });
    expect(await res.json()).toMatchObject({ ok: false, status: 'robots' });
    expect(calls.e2b).toEqual([]);
    expect(calls.rpc).toEqual([]);
  });

  it('sem saldo para o custo máximo: recusa antes de abrir o sandbox', async () => {
    const calls = mockFetch({ accepted: true, balance: 1 });
    const res = await call('page', { url: 'https://loja.com/produto', mode: 'stealth' });
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ status: 'insufficient_credits', needed: 6 });
    expect(calls.e2b).toEqual([]);
  });

  it('com termo e saldo: coleta no sandbox, cobra 2 créditos por página obtida (fetch) e mascara dados pessoais', async () => {
    const calls = mockFetch({
      accepted: true,
      pages: [{ url: 'https://loja.com/produto', status: 200, title: 'Produto', items: { preco: ['R$ 99,90'], contato: ['ana@x.com'] } }],
    });
    const res = await call('page', { url: 'https://loja.com/produto', selectors: [{ name: 'preco', css: '.price' }] });
    const data = (await res.json()) as { ok: boolean; credits: number; pages: Array<{ items: Record<string, string[]> }> };
    expect(data).toMatchObject({ ok: true, credits: 2, unitCredits: 2, billedPages: 1, source: 'scrapling' });
    expect(data.pages[0].items.contato).toEqual(['[e-mail oculto]']);
    expect(calls.rpc[0]).toMatchObject({ _amount: 2, _reason: 'scrapling_scrape' });
    expect(String(calls.rpc[0]._idempotency_key)).toMatch(/^scrape:/);
    expect(calls.scrapeBody).toMatchObject({ mode: 'fetch', urls: ['https://loja.com/produto'] });
    // O sandbox é sempre encerrado.
    expect(calls.e2b.some((c) => c.startsWith('DELETE'))).toBe(true);
    expect(calls.audit.some((a) => a.kind === 'scrape')).toBe(true);
  });

  it('tabela de preços é pública', async () => {
    mockFetch({ accepted: false });
    const res = await handleScrape(new Request('https://vertal.dev/api/scrape/pricing', { method: 'POST', body: '{}' }), env, new URL('https://vertal.dev/api/scrape/pricing'));
    const data = (await res.json()) as { markupPercent: number; table: unknown[] };
    expect(data.markupPercent).toBe(145);
    expect(data.table.length).toBeGreaterThan(5);
  });
});
