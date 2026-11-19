// @vitest-environment node
// Rotas /api/browser/* do Worker: autenticação, validação e guardas que rodam
// ANTES de abrir o navegador (o Browser Run em si não roda no Vitest).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';

const USER_ID = '11111111-2222-3333-4444-555555555555';
const assets = { fetch: vi.fn(async () => new Response('<html></html>')) };
const launch = vi.fn();
vi.mock('@cloudflare/puppeteer', () => ({ default: { launch } }));

const baseEnv: Env = {
  ASSETS: assets,
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
  SUPABASE_SECRET_KEY: 'sb_secret_x',
  BROWSER: { fetch: (async () => new Response('')) as typeof fetch },
};

beforeEach(() => {
  launch.mockReset();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') {
      const auth = new Headers(init?.headers).get('Authorization');
      return auth === 'Bearer good' ? new Response(JSON.stringify({ id: USER_ID })) : new Response('{}', { status: 401 });
    }
    throw new Error(`fetch inesperado: ${url.href}`);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const call = (path: string, body: unknown, { token = 'good', env = baseEnv, method = 'POST' } = {}) =>
  worker.fetch(new Request(`https://vertal.dev/api/browser${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: 'https://vertal.dev', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  }), env);

describe('/api/browser/*', () => {
  it('pede sessão válida', async () => {
    const res = await call('/inspect', { url: 'https://example.com' }, { token: 'bad' });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, status: 'unauthorized' });
    expect(launch).not.toHaveBeenCalled();
  });

  it('sem o binding BROWSER responde not_configured', async () => {
    const res = await call('/inspect', { url: 'https://example.com' }, { env: { ...baseEnv, BROWSER: undefined } });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'not_configured' });
  });

  it('bloqueia endereços internos antes de abrir o navegador', async () => {
    const res = await call('/inspect', { url: 'http://169.254.169.254/latest/meta-data' });
    expect(await res.json()).toMatchObject({ ok: false, status: 'blocked_url' });
    expect(launch).not.toHaveBeenCalled();
  });

  it('submit exige confirmação explícita e runId', async () => {
    const noConfirm = await call('/submit', { url: 'https://example.com/form', values: { a: 'b' }, runId: 'abcdefgh-1234' });
    expect(noConfirm.status).toBe(400);
    expect(await noConfirm.json()).toMatchObject({ detail: 'confirmation_required' });
    const noRun = await call('/submit', { url: 'https://example.com/form', values: { a: 'b' }, confirmed: true });
    expect(await noRun.json()).toMatchObject({ detail: 'run_id_required' });
    expect(launch).not.toHaveBeenCalled();
  });

  it('recusa corpo grande, rota desconhecida e GET', async () => {
    const big = await call('/inspect', { url: 'https://example.com', values: { a: 'x'.repeat(70_000) } });
    expect(big.status).toBe(400);
    expect((await call('/apagar', { url: 'https://example.com' })).status).toBe(404);
    expect((await call('/inspect', null, { method: 'GET' })).status).toBe(405);
  });

  it('libera CORS só para origens do Vertal', async () => {
    const res = await worker.fetch(new Request('https://vertal.dev/api/browser/inspect', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), baseEnv);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('fecha o navegador mesmo quando a página falha', async () => {
    const close = vi.fn(async () => undefined);
    const page = {
      setViewport: vi.fn(async () => undefined),
      setRequestInterception: vi.fn(async () => undefined),
      on: vi.fn(),
      goto: vi.fn(async () => { throw new Error('net::ERR_NAME_NOT_RESOLVED'); }),
      url: () => 'https://example.com/',
    };
    launch.mockResolvedValue({ newPage: vi.fn(async () => page), close });
    const res = await call('/inspect', { url: 'https://example.com/form' });
    expect(await res.json()).toMatchObject({ ok: false, status: 'navigation_failed' });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
