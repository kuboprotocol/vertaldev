// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import worker from './index';

// O player do Spotify em /recompensas (iframe de open.spotify.com) precisa de autoplay e
// encrypted-media delegados pelo atributo `allow`. Se o Permissions-Policy da página
// bloquear esses recursos (ex.: `autoplay=()`), o player fica mudo, sobretudo no celular.
const BLOCKED = /(^|,\s*)(autoplay|encrypted-media)=\(\s*\)/;

const assets = {
  fetch: async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }),
};

describe('Permissions-Policy não bloqueia o som do player do Spotify', () => {
  it('Worker (/recompensas)', async () => {
    const res = await worker.fetch(new Request('https://vertal.dev/recompensas'), { ASSETS: assets } as never);
    const policy = res.headers.get('Permissions-Policy') ?? '';
    expect(policy).not.toMatch(BLOCKED);
  });

  it('public/_headers', () => {
    const headers = readFileSync(join(__dirname, '..', 'public', '_headers'), 'utf8');
    for (const line of headers.split('\n').filter((l) => /Permissions-Policy:/i.test(l))) {
      expect(line.split(':').slice(1).join(':')).not.toMatch(BLOCKED);
    }
  });
});
