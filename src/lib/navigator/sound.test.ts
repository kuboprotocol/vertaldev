import { describe, expect, it } from 'vitest';
import { catchUpTarget, DEFAULT_SOUND_PREFS, loadSoundPrefs, mediaEmbedFor, saveSoundPrefs } from './sound';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('escolha de som do Navigator (lembrada por usuário)', () => {
  it('sem escolha salva → Sem som, volume cheio', () => {
    expect(loadSoundPrefs('u1', memStore())).toEqual(DEFAULT_SOUND_PREFS);
    expect(DEFAULT_SOUND_PREFS.mode).toBe('off');
  });

  it('salva e lê por usuário, sem misturar usuários', () => {
    const st = memStore();
    saveSoundPrefs({ mode: 'cloud', volume: 0.4 }, 'u1', st);
    saveSoundPrefs({ mode: 'device', volume: 1 }, 'u2', st);
    expect(loadSoundPrefs('u1', st)).toEqual({ mode: 'cloud', volume: 0.4 });
    expect(loadSoundPrefs('u2', st).mode).toBe('device');
    expect(loadSoundPrefs(null, st)).toEqual(DEFAULT_SOUND_PREFS);
  });

  it('valor estragado ou fora da faixa volta ao padrão / é limitado', () => {
    const st = memStore();
    st.setItem('vertal.navigator.sound.u1', '{x');
    expect(loadSoundPrefs('u1', st)).toEqual(DEFAULT_SOUND_PREFS);
    st.setItem('vertal.navigator.sound.u1', JSON.stringify({ mode: 'hack', volume: 9 }));
    expect(loadSoundPrefs('u1', st)).toEqual({ mode: 'off', volume: 1 });
  });

  it('sem localStorage não quebra', () => {
    expect(() => saveSoundPrefs({ mode: 'cloud', volume: 1 }, 'u1', null)).not.toThrow();
    expect(loadSoundPrefs('u1', null)).toEqual(DEFAULT_SOUND_PREFS);
  });
});

describe('correção de atraso do Som da nuvem', () => {
  it('só pula quando o buffer passa do limite', () => {
    expect(catchUpTarget(10, 9)).toBeNull();
    expect(catchUpTarget(10, 5)).toBeCloseTo(9.6);
    expect(catchUpTarget(Number.NaN, 1)).toBeNull();
  });
});

describe('mediaEmbedFor (Tocar no meu aparelho — só players oficiais)', () => {
  it('YouTube watch / youtu.be / shorts → youtube-nocookie com autoplay e início', () => {
    const e = mediaEmbedFor('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m5s');
    expect(e?.provider).toBe('youtube');
    expect(e?.embedUrl).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
    expect(e?.embedUrl).toContain('start=65');
    expect(e?.embedUrl).toContain('autoplay=1');
    expect(mediaEmbedFor('https://youtu.be/dQw4w9WgXcQ')?.openUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(mediaEmbedFor('https://m.youtube.com/shorts/dQw4w9WgXcQ')?.provider).toBe('youtube');
  });

  it('startSeconds da aba na nuvem tem prioridade', () => {
    expect(mediaEmbedFor('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5', 120)?.embedUrl).toContain('start=120');
  });

  it('YouTube Music usa o mesmo vídeo e abre no YT Music', () => {
    const e = mediaEmbedFor('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVMdQw4w9WgXcQ');
    expect(e?.label).toBe('YouTube Music');
    expect(e?.openUrl.startsWith('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
  });

  it('playlist do YouTube sem vídeo → videoseries', () => {
    expect(mediaEmbedFor('https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG')?.embedUrl).toContain('/embed/videoseries?list=');
  });

  it('Spotify (com intl-pt) → open.spotify.com/embed', () => {
    const e = mediaEmbedFor('https://open.spotify.com/intl-pt/track/4uLU6hMCjMI75M1A2tKUQC?si=abc');
    expect(e?.embedUrl).toBe('https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC');
    expect(e?.kind).toBe('audio');
  });

  it('SoundCloud → widget oficial; páginas de navegação não', () => {
    const e = mediaEmbedFor('https://soundcloud.com/artista/faixa-legal');
    expect(e?.embedUrl).toMatch(/^https:\/\/w\.soundcloud\.com\/player\/\?url=https%3A%2F%2Fsoundcloud\.com%2Fartista%2Ffaixa-legal/);
    expect(mediaEmbedFor('https://soundcloud.com/discover/sets')).toBeNull();
  });

  it('Vimeo → player.vimeo.com com dnt', () => {
    expect(mediaEmbedFor('https://vimeo.com/76979871')?.embedUrl).toBe('https://player.vimeo.com/video/76979871?autoplay=1&dnt=1');
  });

  it('outras páginas, IDs inválidos e esquemas estranhos → null', () => {
    for (const u of [
      'https://www.netflix.com/watch/80100172', 'https://www.youtube.com/', 'https://www.youtube.com/watch?v=curto',
      'javascript:alert(1)', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
      'https://open.spotify.com/track/../../x', '', null, undefined,
    ]) expect(mediaEmbedFor(u)).toBeNull();
  });
});
