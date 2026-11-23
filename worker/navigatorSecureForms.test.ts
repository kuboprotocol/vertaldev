// @vitest-environment node
// Formulários seguros do Navigator no Worker: o valor vai do cartão ao navd e ao Cofre
// (cifrado, vinculado ao domínio), nunca para a resposta, a auditoria ou o log.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __test, saveVaultSecret, type NavigatorEnv } from './navigatorRoutes';
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
        return ok(secrets.filter((s) => (!id || s.id === id) && (!envKey || s.env_key === envKey)));
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

describe('cartão de login', () => {
  const asked = { id: 'abcdef1234567890', kind: 'login', host: 'accounts.google.com', fields: ['username', 'password'] };

  it('entrega usuário e senha ao navd, salva no Cofre vinculado a google-com e não devolve nem audita valores', async () => {
    const res = await __test.authInput(req(), env, USER, row, target, asked.id, { kind: 'login', username: 'laercio@gmail.com', password: 'S3nh@Forte!', save: true }, asked);
    const data = await res.json();
    expect(data).toMatchObject({ ok: true, saved: ['GOOGLE_COM_LOGIN', 'GOOGLE_COM_PASSWORD'] });
    expect(JSON.stringify(data)).not.toContain('S3nh@Forte!');
    expect(navdInputs()[0].body).toEqual({ id: asked.id, kind: 'login', value: { username: 'laercio@gmail.com', password: 'S3nh@Forte!' } });
    // Cofre: cifrado, vinculado ao domínio, dica de senha sem nada do valor.
    const pw = secrets.find((s) => s.env_key === 'GOOGLE_COM_PASSWORD')!;
    expect(pw.bound_to).toBe('google-com');
    expect(pw.masked_hint).toBe('••••');
    expect(JSON.stringify(pw)).not.toContain('S3nh@Forte!');
    expect(await decryptWithConnectorKey(KEY, pw as never)).toBe('S3nh@Forte!');
    // Auditoria: cifrada e sem o valor nem dentro da cifra.
    for (const r of auditRows()) {
      expect(JSON.stringify(r)).not.toContain('S3nh@Forte!');
      const detail = await openAuditDetail(env as never, { ...r, user_id: USER } as never);
      expect(JSON.stringify(detail)).not.toContain('S3nh@Forte!');
    }
    expect(auditRows().map((r) => r.kind)).toEqual(expect.arrayContaining(['login_entered', 'secret_saved']));
  });

  it('sem "guardar no Cofre": usa só nesta tarefa', async () => {
    await __test.authInput(req(), env, USER, row, target, asked.id, { kind: 'login', username: 'a@b.com', password: 'x1', save: false }, asked);
    expect(secrets).toHaveLength(0);
    expect(navdInputs()).toHaveLength(1);
  });

  it('atualiza o segredo existente (rotate) em vez de duplicar', async () => {
    await saveVaultSecret(env, USER, { envKey: 'GOOGLE_COM_PASSWORD', value: 'velha', boundTo: 'ai-providers', label: 'x', identifier: false, host: 'accounts.google.com' });
    await saveVaultSecret(env, USER, { envKey: 'GOOGLE_COM_PASSWORD', value: 'nova', boundTo: 'google-com', label: 'x', identifier: false, host: 'accounts.google.com' });
    expect(secrets).toHaveLength(1);
    expect(secrets[0].bound_to).toBe('google-com');
    expect(await decryptWithConnectorKey(KEY, secrets[0] as never)).toBe('nova');
  });

  it('só aceita os campos que o site pediu e recusa pedido de outro tipo', async () => {
    const onlyPw = { ...asked, fields: ['password'] };
    const bad = await __test.authInput(req(), env, USER, row, target, asked.id, { kind: 'login', password: '' }, onlyPw);
    expect(bad.status).toBe(400);
    const wrong = await __test.authInput(req(), env, USER, row, target, asked.id, { kind: 'phone', value: '+5511999998888' }, onlyPw);
    expect(wrong.status).toBe(400);
    expect(navdInputs()).toHaveLength(0);
  });

  it('conector do Gmail no lugar da senha', async () => {
    const res = await __test.authInput(req(), env, USER, row, target, asked.id, { kind: 'connector', connector: 'gmail' }, asked);
    expect((await res.json()).ok).toBe(true);
    expect(navdInputs()[0].body).toEqual({ id: asked.id, kind: 'login', value: { connector: 'gmail' } });
  });
});

describe('login salvo', () => {
  beforeEach(async () => {
    await saveVaultSecret(env, USER, { envKey: 'GOOGLE_COM_LOGIN', value: 'laercio@gmail.com', boundTo: 'google-com', label: 'l', identifier: true, host: 'accounts.google.com' });
    await saveVaultSecret(env, USER, { envKey: 'GOOGLE_COM_PASSWORD', value: 'S3nh@', boundTo: 'google-com', label: 'p', identifier: false, host: 'accounts.google.com' });
    for (const s of secrets) s.owner_id = USER;
    calls = [];
  });

  it('preenche sozinho na próxima vez (por id do segredo, sem cartão)', async () => {
    const p = { id: 'abcdef1234567890', kind: 'login' as const, host: 'accounts.google.com', loginFields: ['username', 'password'] as Array<'username' | 'password'> };
    const r = await __test.fulfillLoginFromVault(env, USER, row, target, p, { fields: ['username', 'password'] });
    expect(r.filled).toBe(true);
    expect(navdInputs()[0].body).toMatchObject({ kind: 'login', value: { username: 'laercio@gmail.com', password: 'S3nh@' } });
  });

  it('login recusado: não repete o salvo; o cartão volta com o usuário preenchido', async () => {
    const p = { id: 'abcdef1234567890', kind: 'login' as const, host: 'accounts.google.com', loginFields: ['username', 'password'] as Array<'username' | 'password'> };
    const r = await __test.fulfillLoginFromVault(env, USER, row, target, p, { retry: true });
    expect(r).toEqual({ filled: false, prefillUsername: 'laercio@gmail.com' });
    expect(navdInputs()).toHaveLength(0);
  });

  it('domínio diferente não usa o login (vínculo do Cofre)', async () => {
    const p = { id: 'abcdef1234567890', kind: 'login' as const, host: 'github.com', loginFields: ['username', 'password'] as Array<'username' | 'password'> };
    const r = await __test.fulfillLoginFromVault(env, USER, row, target, p, {});
    expect(r.filled).toBe(false);
    expect(navdInputs()).toHaveLength(0);
  });
});

describe('código 2FA e telefone', () => {
  it('semente TOTP com consentimento: salva no Cofre e o servidor gera o código', async () => {
    const asked = { id: 'abcdef1234567890', kind: 'code', host: 'github.com', otpKind: 'totp' };
    const res = await __test.authInput(req(), env, USER, row, target, asked.id, { kind: 'code', totpSeed: 'JBSWY3DPEHPK3PXP', confirmed: true }, asked);
    expect((await res.json()).saved).toEqual(['GITHUB_COM_TOTP']);
    expect(String((navdInputs()[0].body as { value: string }).value)).toMatch(/^\d{6}$/);
    expect(auditRows().map((r) => r.kind)).toEqual(expect.arrayContaining(['totp_consent', 'secret_saved', 'code_entered']));
  });

  it('semente sem consentimento é recusada', async () => {
    const asked = { id: 'abcdef1234567890', kind: 'code', host: 'github.com' };
    const res = await __test.authInput(req(), env, USER, row, target, asked.id, { kind: 'code', totpSeed: 'JBSWY3DPEHPK3PXP' }, asked);
    expect(res.status).toBe(400);
    expect(secrets).toHaveLength(0);
  });

  it('telefone em E.164, salvo só se o usuário marcar', async () => {
    const asked = { id: 'abcdef1234567890', kind: 'phone', host: 'www.itau.com.br' };
    await __test.authInput(req(), env, USER, row, target, asked.id, { kind: 'phone', value: '+55 11 99999-8888', save: true }, asked);
    expect(navdInputs()[0].body).toMatchObject({ kind: 'phone', value: '+5511999998888' });
    expect(secrets[0]).toMatchObject({ env_key: 'ITAU_COM_BR_PHONE', bound_to: 'itau-com-br' });
  });
});
