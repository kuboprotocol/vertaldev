import { describe, expect, it } from 'vitest';
import { checkDownloaderHost } from './platforms';

describe('checkDownloaderHost', () => {
  it.each([
    'https://www.tiktok.com/@usuario/video/123',
    'https://vm.tiktok.com/ZMabc/',
    'https://v.kwai.com/abc123',
    'https://www.instagram.com/reel/XYZ/',
    'https://x.com/usuario/status/1',
    'https://twitter.com/usuario/status/1',
  ])('accepts %s', (url) => {
    expect(checkDownloaderHost(url).ok).toBe(true);
  });

  it('keeps YouTube as coming soon, with the message the panel shows', () => {
    const r = checkDownloaderHost('https://youtu.be/p9C_3MyQo_4?is=BV2zObW7cA2twBjZ') as { ok: boolean; code?: string; message?: string };
    expect(r.ok).toBe(false);
    expect(r.code).toBe('coming_soon');
    expect(r.message).toMatch(/chega em breve/);
  });

  it('refuses other sites and broken links', () => {
    const other = checkDownloaderHost('https://vimeo.com/123') as { ok: boolean; code?: string };
    expect(other.ok).toBe(false);
    expect(other.code).toBe('unsupported_platform');
    expect(checkDownloaderHost('não é link').ok).toBe(false);
  });

  it('does not accept look-alike domains', () => {
    expect(checkDownloaderHost('https://tiktok.com.evil.io/video').ok).toBe(false);
    expect(checkDownloaderHost('https://notx.com/a').ok).toBe(false);
  });
});
