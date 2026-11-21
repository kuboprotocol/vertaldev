import { describe, expect, it } from 'vitest';
import { isYoutubeVideoId, mediaApiBase, parseYoutubeSearch, wantsMedia, youtubeEmbedUrl, youtubeSearchApiUrl, youtubeVideoId } from './youtube';

describe('YouTube no chat', () => {
  it('extrai o id de vários formatos de link', () => {
    for (const u of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?t=10', 'youtube.com/shorts/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ',
    ]) expect(youtubeVideoId(u)).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeVideoId('https://youtube.com/watch?v=curto')).toBeNull();
    expect(youtubeVideoId('javascript:alert(1)')).toBeNull();
  });
  it('monta o player embutido (IFrame API, sem cookies) e recusa id inválido', () => {
    const u = new URL(youtubeEmbedUrl('dQw4w9WgXcQ', { autoplay: true, origin: 'https://vertal.dev' }));
    expect(u.host).toBe('www.youtube-nocookie.com');
    expect(u.searchParams.get('enablejsapi')).toBe('1');
    expect(u.searchParams.get('autoplay')).toBe('1');
    expect(() => youtubeEmbedUrl('<script>')).toThrow();
    expect(isYoutubeVideoId('dQw4w9WgXcQ')).toBe(true);
  });
  it('busca: URL da API e parse da resposta', () => {
    const api = new URL(youtubeSearchApiUrl('lofi hip hop', 'KEY', 50));
    expect(api.searchParams.get('maxResults')).toBe('8');
    expect(api.searchParams.get('videoEmbeddable')).toBe('true');
    const videos = parseYoutubeSearch({ items: [
      { id: { videoId: 'dQw4w9WgXcQ' }, snippet: { title: 'Rick &amp; Roll', channelTitle: 'Canal', thumbnails: { medium: { url: 'https://i.ytimg.com/x.jpg' } } } },
      { id: { channelId: 'UCxxx' }, snippet: { title: 'canal' } },
    ] });
    expect(videos).toEqual([{ id: 'dQw4w9WgXcQ', title: 'Rick & Roll', channel: 'Canal', thumbnail: 'https://i.ytimg.com/x.jpg' }]);
    expect(parseYoutubeSearch(null)).toEqual([]);
  });
  it('base da API e quando ligar a ferramenta', () => {
    expect(mediaApiBase({ hostname: 'vertal.dev' }, undefined)).toBe('/api/media');
    expect(mediaApiBase({ hostname: 'localhost' }, undefined)).toBe('https://vertal.dev/api/media');
    expect(wantsMedia(['toca um lofi no youtube'])).toBe(true);
    expect(wantsMedia([{ tool: 'spotify' }])).toBe(true);
    expect(wantsMedia(['faça uma planilha de gastos'])).toBe(false);
  });
});
