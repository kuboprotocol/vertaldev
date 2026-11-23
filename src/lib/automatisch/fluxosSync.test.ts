import { describe, expect, it } from 'vitest';
import { brokerToken, makeFluxosKey, verifyFluxosKey } from '../../../supabase/functions/_shared/fluxosBroker';
import { parseAutomatischOp, runAutomatischOp } from '../../../supabase/functions/_shared/automatischCore';

const SECRET = 'x'.repeat(40);
const UID = '5441b397-7be8-44fc-87e8-8057fdb79a0e';

describe('Conta do Vertal: chave do Fluxos', () => {
  it('verifica a própria chave e recusa adulteração', async () => {
    const key = await makeFluxosKey(UID, SECRET);
    expect(await verifyFluxosKey(key, SECRET)).toBe(UID);
    expect(await verifyFluxosKey(key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A'), SECRET)).toBeNull();
    expect(await verifyFluxosKey(key, 'y'.repeat(40))).toBeNull();
    expect(await verifyFluxosKey(key, undefined)).toBeNull();
  });

  it('entrega token por app sem refresh token', async () => {
    const deps = {
      gmail: async () => 'g-tok', spotify: async () => ({ access_token: 's-tok', expires_in: 3600 }),
      apiKey: async (_u: string, slug: string) => (slug === 'discord' ? 'd-tok' : null),
    };
    expect(await brokerToken(UID, 'gmail', deps)).toMatchObject({ access_token: 'g-tok', token_type: 'Bearer' });
    expect(await brokerToken(UID, 'spotify', deps)).toMatchObject({ access_token: 's-tok', expires_in: 3000 });
    expect(await brokerToken(UID, 'discord', deps)).toMatchObject({ token_type: 'Bot' });
    expect(await brokerToken(UID, 'slack', deps)).toBeNull();
  });
});

describe('sync_connection', () => {
  it('só aceita apps compartilhados', () => {
    expect(parseAutomatischOp({ op: 'sync_connection', app_key: 'gmail' })).toEqual({ op: 'sync_connection', app_key: 'gmail' });
    expect(parseAutomatischOp({ op: 'sync_connection', app_key: 'notion' })).toBeNull();
  });

  it('cria a conexão do app e a do app Vertal só com a chave, e nunca a devolve', async () => {
    const calls: Array<{ method: string; url: string; body?: string }> = [];
    const fetch = async (url: string, init: { method: string; body?: string }) => {
      calls.push({ method: init.method, url, body: init.body });
      const path = new URL(url).pathname;
      let data: unknown = {};
      if (path.endsWith('/access-tokens') && init.method === 'POST') data = { token: 'tok123456' };
      else if (path.endsWith('/connections') && init.method === 'GET') data = [];
      else if (path.endsWith('/connections') && init.method === 'POST') data = { id: '11111111-1111-4111-8111-111111111111' };
      else if (path.endsWith('/verify')) data = { verified: true };
      return { status: 200, ok: true, text: async () => JSON.stringify({ data }) };
    };
    const res = await runAutomatischOp(
      { op: 'sync_connection', app_key: 'gmail' },
      { url: 'https://fluxos.example.com', email: 'a@b.c', password: 'pw123456', vertalKey: 'vfk1_secretkey' },
      { fetch },
    );
    expect(res.ok).toBe(true);
    const posts = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/connections'));
    expect(posts.map((c) => new URL(c.url).pathname)).toEqual([
      '/internal/api/v1/apps/gmail/connections', '/internal/api/v1/apps/vertal/connections',
    ]);
    expect(JSON.parse(posts[0].body!).formattedData).toEqual({ screenName: 'Conta do Vertal', vertalBroker: true, vertalKey: 'vfk1_secretkey' });
    expect(JSON.stringify(res)).not.toContain('vfk1_secretkey');
  });
});
