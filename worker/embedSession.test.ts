// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { handleEmbedSession } from './embedSession';
import worker from './index';

const env = {
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
  SUPABASE_SECRET_KEY: 'sb_secret_x',
  APP_ORIGIN: 'https://vertal.dev',
};

function fakeFetch(calls: Array<{ url: string; init?: RequestInit }>) {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/v1/user')) {
      const auth = new Headers(init?.headers).get('Authorization');
      return auth === 'Bearer good'
        ? new Response(JSON.stringify({ id: 'u1', email: 'a@b.c' }))
        : new Response('{}', { status: 401 });
    }
    if (url.endsWith('/auth/v1/admin/generate_link')) {
      return new Response(JSON.stringify({ hashed_token: 'hash123', action_link: 'https://x' }));
    }
    return new Response('nope', { status: 500 });
  }) as unknown as typeof fetch;
}

const req = (headers: Record<string, string>, method = 'POST') =>
  new Request('https://vertal.dev/embed/api/session', { method, headers, body: method === 'POST' ? '{}' : undefined });

describe('POST /embed/api/session', () => {
  it('returns a single-use token hash for a signed-in user (no email sent)', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const res = await handleEmbedSession(req({ Origin: 'https://vertal.dev', Authorization: 'Bearer good' }), env, fakeFetch(calls));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token_hash: 'hash123' });
    const link = calls.find((c) => c.url.endsWith('/admin/generate_link'))!;
    expect(JSON.parse(String(link.init?.body))).toEqual({ type: 'magiclink', email: 'a@b.c' });
    expect(new Headers(link.init?.headers).get('apikey')).toBe('sb_secret_x');
  });

  it('rejects other origins, missing or bad tokens and non-POST', async () => {
    const f = fakeFetch([]);
    expect((await handleEmbedSession(req({ Origin: 'https://evil.example', Authorization: 'Bearer good' }), env, f)).status).toBe(403);
    expect((await handleEmbedSession(req({ Authorization: 'Bearer good' }), env, f)).status).toBe(403);
    expect((await handleEmbedSession(req({ Origin: 'https://vertal.dev' }), env, f)).status).toBe(401);
    expect((await handleEmbedSession(req({ Origin: 'https://vertal.dev', Authorization: 'Bearer bad' }), env, f)).status).toBe(401);
    expect((await handleEmbedSession(req({ Origin: 'https://vertal.dev' }, 'GET'), env, f)).status).toBe(405);
  });

  it('answers 503 when the Worker has no Supabase secret', async () => {
    const res = await handleEmbedSession(
      req({ Origin: 'https://vertal.dev', Authorization: 'Bearer good' }),
      { ...env, SUPABASE_SECRET_KEY: undefined },
      fakeFetch([]),
    );
    expect(res.status).toBe(503);
  });

  it('is routed by the Worker before static assets', async () => {
    const assets = { fetch: async () => new Response('<html></html>') };
    const res = await worker.fetch(
      new Request('https://vertal.dev/embed/api/session', { method: 'GET' }),
      { ASSETS: assets } as never,
    );
    expect(res.status).toBe(405);
  });
});
