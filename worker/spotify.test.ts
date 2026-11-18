// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';
import { decryptSecret, encryptSecret } from './tokenCrypto';
import { isAllowedOrigin, isSafeReturnUrl, redirectUriFor } from './spotifyRoutes';

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)));
const USER_ID = '11111111-2222-3333-4444-555555555555';

const assets = { fetch: vi.fn(async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } })) };

const env: Env = {
  ASSETS: assets,
  APP_ORIGIN: 'https://vertal.dev',
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
  SUPABASE_SECRET_KEY: 'sb_secret_x',
  SPOTIFY_CLIENT_ID: 'client-id',
  SPOTIFY_CLIENT_SECRET: 'client-secret',
  SPOTIFY_TOKEN_ENC_KEY: KEY,
};

type Call = { url: URL; method: string; headers: Headers; body: string | null };
let calls: Call[];
let routes: Array<[RegExp, (c: Call) => Response | Promise<Response>]>;

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  calls = [];
  routes = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const call: Call = { url, method: init?.method ?? 'GET', headers: new Headers(init?.headers), body: (init?.body as string) ?? null };
    calls.push(call);
    const match = routes.find(([re]) => re.test(`${call.method} ${url.origin}${url.pathname}`));
    if (!match) throw new Error(`fetch inesperado: ${call.method} ${url.href}`);
    return match[1](call);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const loggedIn = () => routes.push([/^GET https:\/\/proj\.supabase\.co\/auth\/v1\/user$/, (c) =>
  c.headers.get('Authorization') === 'Bearer user-jwt' ? jsonRes({ id: USER_ID }) : jsonRes({ msg: 'bad jwt' }, 401)]);

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  worker.fetch(new Request(`https://vertal.dev${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-jwt', ...headers }, body: JSON.stringify(body),
  }), env);

async function storedAccount(overrides: Record<string, unknown> = {}) {
  const refresh = await encryptSecret(KEY, 'refresh-1');
  const access = await encryptSecret(KEY, 'access-1');
  return {
    user_id: USER_ID, display_name: 'Ana',
    refresh_token_ciphertext: refresh.ciphertext, refresh_token_iv: refresh.iv, refresh_token_tag: refresh.tag,
    access_token_cache: access.ciphertext, access_token_iv: access.iv, access_token_tag: access.tag,
    access_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    ...overrides,
  };
}

describe('tokenCrypto', () => {
  it('criptografa e decifra; o texto puro não aparece no resultado', async () => {
    const enc = await encryptSecret(KEY, 'segredo-do-spotify');
    expect(JSON.stringify(enc)).not.toContain('segredo');
    expect(await decryptSecret(KEY, enc)).toBe('segredo-do-spotify');
  });

  it('falha com chave errada ou ausente', async () => {
    const enc = await encryptSecret(KEY, 'x');
    const other = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
    await expect(decryptSecret(other, enc)).rejects.toThrow();
    await expect(encryptSecret(undefined, 'x')).rejects.toThrow('SPOTIFY_TOKEN_ENC_KEY');
  });
});

describe('regras de origem e retorno', () => {
  it('aceita só origens do ecossistema e caminhos relativos seguros', () => {
    expect(isAllowedOrigin('https://vertal.dev')).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
    expect(isAllowedOrigin('https://vertal.dev.evil.example')).toBe(false);
    expect(isSafeReturnUrl('/connectors/spotify')).toBe(true);
    expect(isSafeReturnUrl('//evil.example')).toBe(false);
    expect(isSafeReturnUrl('https://evil.example')).toBe(false);
  });

  it('usa o callback do vertal.dev por padrão', () => {
    expect(redirectUriFor(env)).toBe('https://vertal.dev/api/spotify/callback');
  });
});

describe('roteamento do Worker', () => {
  it('/api/spotify não cai nos assets e não é indexado', async () => {
    const res = await worker.fetch(new Request('https://vertal.dev/api/spotify/nada', { method: 'POST' }), env);
    expect(res.status).toBe(404);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(assets.fetch).not.toHaveBeenCalled();
  });

  it('preflight libera só origens conhecidas', async () => {
    const ok = await worker.fetch(new Request('https://vertal.dev/api/spotify/action', {
      method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' },
    }), env);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');

    const bad = await worker.fetch(new Request('https://vertal.dev/api/spotify/action', {
      method: 'OPTIONS', headers: { Origin: 'https://evil.example' },
    }), env);
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('o resto do site continua indo para os assets', async () => {
    await worker.fetch(new Request('https://vertal.dev/pricing'), env);
    expect(assets.fetch).toHaveBeenCalled();
  });
});

describe('POST /api/spotify/start', () => {
  it('recusa sem sessão válida', async () => {
    loggedIn();
    const res = await post('/api/spotify/start', {}, { Authorization: 'Bearer outra' });
    expect(res.status).toBe(401);
  });

  it('grava o state e devolve a URL de consentimento', async () => {
    loggedIn();
    routes.push([/^POST https:\/\/proj\.supabase\.co\/rest\/v1\/spotify_oauth_states$/, () => new Response(null, { status: 201 })]);
    const res = await post('/api/spotify/start', { returnUrl: '/connectors/spotify', origin: 'https://evil.example' });
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    const auth = new URL(url);
    expect(auth.origin).toBe('https://accounts.spotify.com');
    expect(auth.searchParams.get('redirect_uri')).toBe('https://vertal.dev/api/spotify/callback');

    const insert = calls.find((c) => c.url.pathname.endsWith('/spotify_oauth_states'))!;
    expect(insert.headers.get('apikey')).toBe('sb_secret_x');
    const row = JSON.parse(insert.body!);
    expect(row.user_id).toBe(USER_ID);
    expect(row.origin).toBe('https://vertal.dev'); // origem desconhecida cai no padrão
    expect(row.nonce).toBe(auth.searchParams.get('state'));
  });
});

describe('GET /api/spotify/callback', () => {
  const callback = (qs: string) => worker.fetch(new Request(`https://vertal.dev/api/spotify/callback?${qs}`), env);

  it('state já usado ou inexistente volta com bad_state', async () => {
    routes.push([/^PATCH .*\/spotify_oauth_states$/, () => jsonRes([])]);
    const res = await callback('code=c&state=n');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://vertal.dev/connectors/spotify?error=bad_state');
    const patch = calls[0];
    expect(patch.url.searchParams.get('consumed_at')).toBe('is.null');
  });

  it('troca o code, guarda os tokens só criptografados e volta conectado', async () => {
    routes.push([/^PATCH .*\/spotify_oauth_states$/, () => jsonRes([{
      user_id: USER_ID, origin: 'http://localhost:5173', return_url: '/connectors/spotify',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }])]);
    routes.push([/^POST https:\/\/accounts\.spotify\.com\/api\/token$/, (c) => {
      expect(c.headers.get('Authorization')).toBe(`Basic ${btoa('client-id:client-secret')}`);
      expect(new URLSearchParams(c.body!).get('redirect_uri')).toBe('https://vertal.dev/api/spotify/callback');
      return jsonRes({ access_token: 'ACCESS-PLAIN', refresh_token: 'REFRESH-PLAIN', expires_in: 3600 });
    }]);
    routes.push([/^GET https:\/\/api\.spotify\.com\/v1\/me$/, () => jsonRes({ id: 'sp1', display_name: 'Ana' })]);
    routes.push([/^POST .*\/rest\/v1\/spotify_accounts$/, () => new Response(null, { status: 201 })]);

    const res = await callback('code=abc&state=n1');
    expect(res.headers.get('Location')).toBe('http://localhost:5173/connectors/spotify?spotify=connected');

    const upsert = calls.find((c) => c.url.pathname.endsWith('/spotify_accounts'))!;
    expect(upsert.url.searchParams.get('on_conflict')).toBe('user_id');
    expect(upsert.body).not.toContain('PLAIN');
    const row = JSON.parse(upsert.body!);
    expect(row.display_name).toBe('Ana');
    expect(await decryptSecret(KEY, { ciphertext: row.refresh_token_ciphertext, iv: row.refresh_token_iv, tag: row.refresh_token_tag }))
      .toBe('REFRESH-PLAIN');
  });

  it('Spotify negou o acesso: volta com o erro', async () => {
    const res = await callback('error=access_denied&state=n');
    expect(res.headers.get('Location')).toBe('https://vertal.dev/connectors/spotify?error=access_denied');
  });
});

describe('POST /api/spotify/action', () => {
  it('status sem conta conectada', async () => {
    loggedIn();
    routes.push([/^GET .*\/rest\/v1\/spotify_accounts$/, () => jsonRes([])]);
    const res = await post('/api/spotify/action', { op: 'status' });
    expect(await res.json()).toEqual({ ok: true, op: 'status', connected: false });
  });

  it('op desconhecida é bad_request', async () => {
    loggedIn();
    const body = (await (await post('/api/spotify/action', { op: 'rm -rf' })).json()) as { code: string };
    expect(body.code).toBe('bad_request');
  });

  it('busca usa o token salvo e devolve faixas', async () => {
    loggedIn();
    routes.push([/^GET .*\/rest\/v1\/spotify_accounts$/, async () => jsonRes([await storedAccount()])]);
    routes.push([/^GET https:\/\/api\.spotify\.com\/v1\/search$/, (c) => {
      expect(c.headers.get('Authorization')).toBe('Bearer access-1');
      expect(c.url.searchParams.get('q')).toBe('evidencias');
      return jsonRes({ tracks: { items: [{ id: '4cOdK2wGLETKBW3PvgPWqT', uri: 'spotify:track:4cOdK2wGLETKBW3PvgPWqT', name: 'Evidências', artists: [{ name: 'Chitãozinho & Xororó' }], album: { name: 'X', images: [] }, duration_ms: 1 }] } });
    }]);
    const body = (await (await post('/api/spotify/action', { op: 'search', query: 'evidencias' })).json()) as { ok: boolean; tracks: Array<{ title: string }> };
    expect(body.ok).toBe(true);
    expect(body.tracks[0].title).toBe('Evidências');
  });

  it('token expirado é renovado e salvo criptografado', async () => {
    loggedIn();
    routes.push([/^GET .*\/rest\/v1\/spotify_accounts$/, async () => jsonRes([await storedAccount({ access_token_expires_at: null })])]);
    routes.push([/^POST https:\/\/accounts\.spotify\.com\/api\/token$/, (c) => {
      expect(new URLSearchParams(c.body!).get('refresh_token')).toBe('refresh-1');
      return jsonRes({ access_token: 'access-2', expires_in: 3600 });
    }]);
    routes.push([/^PATCH .*\/rest\/v1\/spotify_accounts$/, () => jsonRes([])]);
    routes.push([/^POST https:\/\/api\.spotify\.com\/v1\/me\/player\/next$/, (c) => {
      expect(c.headers.get('Authorization')).toBe('Bearer access-2');
      return new Response(null, { status: 204 });
    }]);
    const body = (await (await post('/api/spotify/action', { op: 'next' })).json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.body).not.toContain('access-2');
  });

  it('sem Premium vira premium_required', async () => {
    loggedIn();
    routes.push([/^GET .*\/rest\/v1\/spotify_accounts$/, async () => jsonRes([await storedAccount()])]);
    routes.push([/^PUT https:\/\/api\.spotify\.com\/v1\/me\/player\/pause$/, () => jsonRes({ error: {} }, 403)]);
    const body = (await (await post('/api/spotify/action', { op: 'pause' })).json()) as { ok: boolean; code: string };
    expect(body).toMatchObject({ ok: false, code: 'premium_required' });
  });

  it('sem configuração não chama ninguém', async () => {
    const res = await worker.fetch(new Request('https://vertal.dev/api/spotify/action', {
      method: 'POST', headers: { Authorization: 'Bearer user-jwt' }, body: '{"op":"status"}',
    }), { ASSETS: assets });
    expect(((await res.json()) as { code: string }).code).toBe('spotify_unavailable');
    expect(calls).toHaveLength(0);
  });
});
