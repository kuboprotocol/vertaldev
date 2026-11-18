import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: vi.fn() } } }));

import { spotifyApiBase } from './client';

describe('spotifyApiBase', () => {
  it('no vertal.dev usa o mesmo domínio', () => {
    expect(spotifyApiBase({ hostname: 'vertal.dev' }, '')).toBe('/api/spotify');
    expect(spotifyApiBase({ hostname: 'www.vertal.dev' }, '')).toBe('/api/spotify');
  });

  it('fora do vertal.dev chama a API de produção', () => {
    expect(spotifyApiBase({ hostname: 'localhost' }, '')).toBe('https://vertal.dev/api/spotify');
    expect(spotifyApiBase({ hostname: 'abc.lovable.app' }, '')).toBe('https://vertal.dev/api/spotify');
  });

  it('VITE_SPOTIFY_API_BASE sobrescreve', () => {
    expect(spotifyApiBase({ hostname: 'vertal.dev' }, 'http://127.0.0.1:8787/api/spotify/')).toBe('http://127.0.0.1:8787/api/spotify');
  });
});
