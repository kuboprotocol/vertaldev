// @vitest-environment node
import { describe, expect, it } from 'vitest';
import worker, { FRAME_ANCESTORS } from './index';

const assets = {
  fetch: async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }),
};

describe('iframe do Ecossistema Vertal', () => {
  it('libera o iframe só para vertal.app e vertalrun.com, sem X-Frame-Options', async () => {
    const res = await worker.fetch(new Request('https://vertal.dev/'), { ASSETS: assets });
    expect(res.headers.get('Content-Security-Policy')).toBe(FRAME_ANCESTORS);
    expect(res.headers.get('X-Frame-Options')).toBeNull();
    expect(FRAME_ANCESTORS).toContain('https://vertal.app');
    expect(FRAME_ANCESTORS).toContain('https://vertalrun.com');
    expect(FRAME_ANCESTORS).not.toContain('*;');
  });
});
