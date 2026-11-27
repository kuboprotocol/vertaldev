// @vitest-environment node
import { describe, expect, it } from 'vitest';
import worker, { FRAME_ANCESTORS } from './index';
import { EMBED_FRAME_ANCESTORS, frameAncestorsFor, isEmbedPath } from './embedPolicy';

const assets = {
  fetch: async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }),
};
// Simulates public/_headers adding the strict CSP before the Worker sees the response.
const assetsWithHeaders = {
  fetch: async () =>
    new Response('<html></html>', {
      headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': FRAME_ANCESTORS, 'X-Frame-Options': 'SAMEORIGIN' },
    }),
};

const get = (path: string, env = { ASSETS: assets }) =>
  worker.fetch(new Request(`https://vertal.dev${path}`), env as never);

describe('iframe do Ecossistema Vertal', () => {
  it('libera o iframe só para vertal.app e vertalrun.com, sem X-Frame-Options', async () => {
    const res = await get('/');
    expect(res.headers.get('Content-Security-Policy')).toBe(FRAME_ANCESTORS);
    expect(res.headers.get('X-Frame-Options')).toBeNull();
    expect(FRAME_ANCESTORS).toContain('https://vertal.app');
    expect(FRAME_ANCESTORS).toContain('https://vertalrun.com');
    expect(FRAME_ANCESTORS).not.toContain('*;');
  });
});

describe('embed (/embed) can be framed by any site', () => {
  it('matches only the /embed path family', () => {
    expect(isEmbedPath('/embed')).toBe(true);
    expect(isEmbedPath('/embed/')).toBe(true);
    expect(isEmbedPath('/embed/login')).toBe(true);
    expect(isEmbedPath('/embedded')).toBe(false);
    expect(isEmbedPath('/embed-x')).toBe(false);
    expect(frameAncestorsFor('/auth')).toBe(FRAME_ANCESTORS);
  });

  it.each(['/embed', '/embed?ref=5fe61d6f&theme=light', '/embed/login?nonce=abc'])(
    '%s allows frame-ancestors * and sends no X-Frame-Options',
    async (path) => {
      for (const ASSETS of [assets, assetsWithHeaders]) {
        const res = await get(path, { ASSETS });
        expect(res.headers.get('Content-Security-Policy')).toBe(EMBED_FRAME_ANCESTORS);
        expect(res.headers.get('X-Frame-Options')).toBeNull();
      }
    },
  );

  it.each(['/', '/auth', '/auth?ref=5fe61d6f', '/dashboard', '/builder', '/profile', '/connectors', '/embedded'])(
    '%s stays non-framable by other sites',
    async (path) => {
      for (const ASSETS of [assets, assetsWithHeaders]) {
        const res = await get(path, { ASSETS });
        const csp = res.headers.get('Content-Security-Policy') ?? '';
        expect(csp).toBe(FRAME_ANCESTORS);
        expect(csp).not.toContain('frame-ancestors *');
      }
    },
  );
});
