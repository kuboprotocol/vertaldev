// Som do Vertal Navigator: a escolha do usuário (Som da nuvem / Tocar no meu aparelho /
// Sem som), lembrada no aparelho, e a detecção de mídia com player oficial embutível.
//
// Opção B ("Tocar no meu aparelho"): só players OFICIAIS de embed (YouTube via
// youtube-nocookie, Spotify, SoundCloud, Vimeo). Nada de baixar mídia nem contornar
// DRM: o player do próprio serviço roda no aparelho do usuário, com a conta dele.

export type NavigatorSoundMode = 'cloud' | 'device' | 'off';

export const SOUND_MODES: ReadonlyArray<{ id: NavigatorSoundMode; label: string; hint: string }> = [
  { id: 'cloud', label: 'Som da nuvem', hint: 'Ouvir aqui o som que o navegador da nuvem está tocando.' },
  { id: 'device', label: 'Tocar no meu aparelho', hint: 'Abrir o vídeo/música no player oficial, direto no seu aparelho.' },
  { id: 'off', label: 'Sem som', hint: 'Não tocar som.' },
];

const PREFIX = 'vertal.navigator.sound';
const keyOf = (userId?: string | null) => (userId ? `${PREFIX}.${userId}` : PREFIX);

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStore = (): Store | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export interface NavigatorSoundPrefs {
  mode: NavigatorSoundMode;
  /** 0–1 (o iOS ignora volume em <audio>; lá só vale o mudo). */
  volume: number;
}

export const DEFAULT_SOUND_PREFS: NavigatorSoundPrefs = { mode: 'off', volume: 1 };

/** Lê a escolha deste usuário neste aparelho (sem escolha → "Sem som"). */
export function loadSoundPrefs(userId?: string | null, store: Store | null = defaultStore()): NavigatorSoundPrefs {
  try {
    const raw = store?.getItem(keyOf(userId));
    if (!raw) return { ...DEFAULT_SOUND_PREFS };
    const p = JSON.parse(raw) as Partial<NavigatorSoundPrefs>;
    const mode = SOUND_MODES.some((m) => m.id === p.mode) ? (p.mode as NavigatorSoundMode) : DEFAULT_SOUND_PREFS.mode;
    const volume = typeof p.volume === 'number' && Number.isFinite(p.volume) ? Math.min(1, Math.max(0, p.volume)) : 1;
    return { mode, volume };
  } catch {
    return { ...DEFAULT_SOUND_PREFS };
  }
}

export function saveSoundPrefs(prefs: NavigatorSoundPrefs, userId?: string | null, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(keyOf(userId), JSON.stringify({ mode: prefs.mode, volume: Math.min(1, Math.max(0, prefs.volume)) }));
  } catch {
    // Modo privado / armazenamento cheio: a escolha vale só nesta tela.
  }
}

/**
 * Latência do "Som da nuvem": o <audio> de um stream MP3 vai acumulando buffer. Se a
 * folga passar de `maxLag` segundos, devolve para onde pular (perto da ponta); senão null.
 */
export function catchUpTarget(bufferedEnd: number, currentTime: number, maxLag = 2.5, keep = 0.4): number | null {
  if (!Number.isFinite(bufferedEnd) || !Number.isFinite(currentTime)) return null;
  return bufferedEnd - currentTime > maxLag ? Math.max(0, bufferedEnd - keep) : null;
}

export interface MediaEmbed {
  provider: 'youtube' | 'spotify' | 'soundcloud' | 'vimeo';
  /** Nome para mostrar ("YouTube"). */
  label: string;
  /** URL do player oficial para o <iframe>. */
  embedUrl: string;
  /** Link para abrir no app/site do serviço no aparelho. */
  openUrl: string;
  /** Altura sugerida do player (áudio é baixo; vídeo usa 16:9). */
  kind: 'video' | 'audio';
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_TYPES = new Set(['track', 'album', 'playlist', 'episode', 'show', 'artist']);

function safeUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

/**
 * Se a página do navegador da nuvem é uma mídia com player oficial embutível, devolve o
 * embed para tocar no aparelho do usuário. `startSeconds` continua do ponto em que a aba
 * na nuvem estava (YouTube e Vimeo aceitam).
 */
export function mediaEmbedFor(raw: string | null | undefined, startSeconds = 0): MediaEmbed | null {
  const u = safeUrl(raw);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  const start = Math.max(0, Math.floor(Number.isFinite(startSeconds) ? startSeconds : 0));

  // YouTube e YouTube Music (o vídeo de uma faixa do YT Music é o mesmo ID do YouTube).
  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    let id: string | null = null;
    let list: string | null = null;
    if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
    else if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/);
      if (m) id = m[1];
    }
    if (u.pathname === '/playlist' || u.searchParams.has('list')) {
      const l = u.searchParams.get('list');
      if (l && /^[A-Za-z0-9_-]{10,64}$/.test(l)) list = l;
    }
    const t = start || parseYtTime(u.searchParams.get('t') ?? u.searchParams.get('start'));
    if (id && YT_ID.test(id)) {
      const q = new URLSearchParams({ autoplay: '1', playsinline: '1', rel: '0' });
      if (t) q.set('start', String(t));
      if (list) q.set('list', list);
      const open = new URL(host === 'music.youtube.com' ? 'https://music.youtube.com/watch' : 'https://www.youtube.com/watch');
      open.searchParams.set('v', id);
      if (t) open.searchParams.set('t', `${t}s`);
      return { provider: 'youtube', label: host === 'music.youtube.com' ? 'YouTube Music' : 'YouTube', embedUrl: `https://www.youtube-nocookie.com/embed/${id}?${q}`, openUrl: open.toString(), kind: 'video' };
    }
    if (list) {
      const q = new URLSearchParams({ list, autoplay: '1', playsinline: '1', rel: '0' });
      return { provider: 'youtube', label: 'YouTube', embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?${q}`, openUrl: `https://www.youtube.com/playlist?list=${list}`, kind: 'video' };
    }
    return null;
  }

  // Spotify: open.spotify.com/(intl-xx/)?<tipo>/<id> → player oficial de embed.
  if (host === 'open.spotify.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0]?.startsWith('intl-')) parts.shift();
    if (parts[0] === 'embed') parts.shift();
    const [type, id] = parts;
    if (type && SPOTIFY_TYPES.has(type) && id && /^[A-Za-z0-9]{22}$/.test(id)) {
      return { provider: 'spotify', label: 'Spotify', embedUrl: `https://open.spotify.com/embed/${type}/${id}`, openUrl: `https://open.spotify.com/${type}/${id}`, kind: 'audio' };
    }
    return null;
  }

  // SoundCloud: o widget oficial recebe a URL da faixa/playlist.
  if (host === 'soundcloud.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    const reserved = new Set(['discover', 'search', 'stream', 'you', 'upload', 'charts', 'feed', 'notifications', 'messages', 'settings', 'pages', 'signin']);
    if (parts.length >= 2 && !reserved.has(parts[0])) {
      const track = `https://soundcloud.com/${parts.map(encodeURIComponent).join('/')}`;
      const q = new URLSearchParams({ url: track, auto_play: 'true', visual: 'false' });
      return { provider: 'soundcloud', label: 'SoundCloud', embedUrl: `https://w.soundcloud.com/player/?${q}`, openUrl: track, kind: 'audio' };
    }
    return null;
  }

  // Vimeo: vimeo.com/<id> → player.vimeo.com/video/<id>.
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = u.pathname.match(/^\/(?:video\/)?(\d{5,12})(?:\/|$)/);
    if (m) {
      const q = new URLSearchParams({ autoplay: '1', dnt: '1' });
      return { provider: 'vimeo', label: 'Vimeo', embedUrl: `https://player.vimeo.com/video/${m[1]}?${q}${start ? `#t=${start}s` : ''}`, openUrl: `https://vimeo.com/${m[1]}`, kind: 'video' };
    }
    return null;
  }
  return null;
}

/** "90", "90s", "1m30s", "1h2m3s" → segundos. */
function parseYtTime(raw: string | null): number {
  if (!raw) return 0;
  if (/^\d+s?$/.test(raw)) return Math.min(parseInt(raw, 10), 24 * 3600);
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return 0;
  return Math.min((Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0), 24 * 3600);
}
