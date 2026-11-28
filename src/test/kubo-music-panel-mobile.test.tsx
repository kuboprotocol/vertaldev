import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

// ---- Mocks (antes de importar o painel) ----
vi.mock('@/lib/dailyRewards', async () => {
  const { ListeningMeter } = await import('@/lib/listeningMeter')
  return {
    KUBO_MUSIC_MIN_SECONDS: 30,
    KUBO_SPOTIFY_ARTIST_URL: 'https://open.spotify.com/artist/kubo',
    KUBO_TRACKS: [
      { track_id: 'trackA', title: 'Song A', duration_seconds: 160 },
      { track_id: 'trackB', title: 'Song B', duration_seconds: 180 },
    ],
    ListeningMeter,
    startMusicSession: vi.fn(async () => ({ ok: true, nonce: 'n1' })),
    reportMusicProgress: vi.fn(async () => ({ ok: true })),
  }
})

type Listener = (e?: unknown) => void
interface FakeController {
  loadUri: ReturnType<typeof vi.fn>
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  resume: ReturnType<typeof vi.fn>
  togglePlay: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  listeners: Record<string, Listener[]>
  addListener: (event: string, cb: Listener) => void
  emit: (event: string, data?: unknown) => void
}

const fake: { controller: FakeController | null; options: { height?: number | string } | null } = {
  controller: null,
  options: null,
}

vi.mock('@/lib/spotifyEmbed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/spotifyEmbed')>()
  return {
    ...actual,
    loadSpotifyIframeApi: () =>
      Promise.resolve({
        createController: (target: HTMLElement, options: { height?: number }, cb: (c: FakeController) => void) => {
          // Como a iFrame API real: troca o alvo por um iframe (lazy).
          const iframe = document.createElement('iframe')
          iframe.setAttribute('allow', 'clipboard-write; fullscreen')
          iframe.setAttribute('loading', 'lazy')
          target.parentElement?.replaceChild(iframe, target)
          const listeners: Record<string, Listener[]> = {}
          const controller: FakeController = {
            loadUri: vi.fn(),
            play: vi.fn(),
            pause: vi.fn(),
            resume: vi.fn(),
            togglePlay: vi.fn(),
            destroy: vi.fn(),
            listeners,
            addListener: (event, cb) => {
              ;(listeners[event] ??= []).push(cb)
            },
            emit: (event, data) => listeners[event]?.forEach((cb) => cb({ data })),
          }
          fake.controller = controller
          fake.options = options
          cb(controller)
        },
      }),
  }
})

import KuboMusicPanel from '@/components/shortlinks/KuboMusicPanel'
import { reportMusicProgress } from '@/lib/dailyRewards'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
const DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const originalUA = navigator.userAgent
function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
}

async function mount() {
  const utils = render(<KuboMusicPanel checklist={null} />)
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return utils
}

beforeEach(() => {
  fake.controller = null
  fake.options = null
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  setUserAgent(originalUA)
})

describe('KuboMusicPanel no celular', () => {
  it('iPhone: player maior, allow com autoplay+encrypted-media, sem lazy, aviso de toque', async () => {
    setUserAgent(IPHONE)
    await mount()
    expect(fake.options?.height).toBe(352)
    const iframe = screen.getByTestId('kubo-spotify-embed').querySelector('iframe')!
    expect(iframe.getAttribute('allow')).toContain('autoplay')
    expect(iframe.getAttribute('allow')).toContain('encrypted-media')
    expect(iframe.getAttribute('loading')).toBe('eager')
    expect(screen.getByTestId('kubo-tap-hint')).toHaveTextContent(/Tap the play button inside the Spotify player/)
  })

  it('iPhone: trocar de faixa carrega a faixa mas NUNCA chama play() pela página', async () => {
    setUserAgent(IPHONE)
    await mount()
    await act(async () => {
      fireEvent.click(screen.getByTestId('kubo-track-trackB'))
    })
    expect(fake.controller!.loadUri).toHaveBeenCalledWith('spotify:track:trackB')
    expect(fake.controller!.play).not.toHaveBeenCalled()
    expect(screen.getByTestId('kubo-open-in-spotify')).toHaveAttribute('href', 'https://open.spotify.com/track/trackB')
    expect(screen.getByTestId('kubo-tap-hint')).toBeInTheDocument()
  })

  it('iPhone: tocando, troca o aviso de toque pela dica do modo Silencioso', async () => {
    setUserAgent(IPHONE)
    await mount()
    await act(async () => {
      fake.controller!.emit('playback_update', {
        position: 1000,
        duration: 30000,
        isPaused: false,
        isBuffering: false,
        playingURI: 'spotify:track:trackA',
      })
    })
    expect(screen.queryByTestId('kubo-tap-hint')).toBeNull()
    expect(screen.getByTestId('kubo-sound-hint')).toHaveTextContent(/Silent mode/)
  })

  it('Android: sem play() automático e dica de volume (sem falar de iPhone)', async () => {
    setUserAgent(ANDROID)
    await mount()
    await act(async () => {
      fireEvent.click(screen.getByTestId('kubo-track-trackB'))
    })
    expect(fake.controller!.play).not.toHaveBeenCalled()
    await act(async () => {
      fake.controller!.emit('playback_update', {
        position: 1000,
        duration: 30000,
        isPaused: false,
        isBuffering: false,
        playingURI: 'spotify:track:trackB',
      })
    })
    expect(screen.getByTestId('kubo-sound-hint')).toHaveTextContent(/media volume/)
    expect(screen.getByTestId('kubo-sound-hint')).not.toHaveTextContent(/iPhone/)
  })

  it('fim da prévia no celular: carrega a próxima faixa sem play() (o usuário toca)', async () => {
    setUserAgent(IPHONE)
    await mount()
    const c = fake.controller!
    await act(async () => {
      c.emit('playback_update', { position: 29_000, duration: 30_000, isPaused: false, isBuffering: false, playingURI: 'spotify:track:trackA' })
      c.emit('playback_update', { position: 30_000, duration: 30_000, isPaused: true, isBuffering: false, playingURI: 'spotify:track:trackA' })
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(c.loadUri).toHaveBeenCalledWith('spotify:track:trackB')
    expect(c.play).not.toHaveBeenCalled()
  })
})

describe('KuboMusicPanel no computador', () => {
  it('mantém o player compacto e o play() ao escolher a faixa', async () => {
    setUserAgent(DESKTOP)
    await mount()
    expect(fake.options?.height).toBe(152)
    expect(screen.queryByTestId('kubo-tap-hint')).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByTestId('kubo-track-trackB'))
    })
    expect(fake.controller!.loadUri).toHaveBeenCalledWith('spotify:track:trackB')
    expect(fake.controller!.play).toHaveBeenCalledTimes(1)
  })
})

// ---- Android/Chrome (27/11/2026): prévia de ~15 s, fim sem "pausado", travas, áudio próprio ----

const PIXEL_INSTAGRAM =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36 Instagram 350.0'

const upd = (position: number, duration: number, isPaused = false, uri = 'spotify:track:trackA') => ({
  position,
  duration,
  isPaused,
  isBuffering: false,
  playingURI: uri,
})

describe('KuboMusicPanel no Android (prévia do Spotify)', () => {
  it('prévia de 15 s: mostra o aviso, a meta vira 13 s e o relatório leva preview_seconds', async () => {
    setUserAgent(ANDROID)
    const now = vi.spyOn(Date, 'now')
    let t = 1_000_000
    now.mockImplementation(() => t)
    await mount()
    const c = fake.controller!
    await act(async () => {
      for (let p = 0; p <= 15_224; p += 1000) {
        c.emit('playback_update', upd(Math.min(p, 15_224), 15_224))
        t += 1000
      }
      await Promise.resolve()
    })
    expect(screen.getByTestId('kubo-preview-hint')).toHaveTextContent(/15-second preview/)
    expect(screen.getByTestId('kubo-track-trackB')).toHaveTextContent('0/13s')
    const calls = vi.mocked(reportMusicProgress).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    expect(calls[calls.length - 1][2]).toBeCloseTo(15.224, 2)
    now.mockRestore()
  })

  it('fim da prévia SEM isPaused (como o embed real): avança para a próxima e pede o toque', async () => {
    setUserAgent(ANDROID)
    await mount()
    const c = fake.controller!
    await act(async () => {
      c.emit('playback_update', upd(14_000, 15_224))
      c.emit('playback_update', upd(15_224, 15_224))
      c.emit('playback_update', upd(15_224, 15_224))
      for (let i = 0; i < 6; i++) await Promise.resolve()
    })
    expect(c.loadUri).toHaveBeenCalledWith('spotify:track:trackB')
    expect(c.loadUri).toHaveBeenCalledTimes(1)
    expect(c.play).not.toHaveBeenCalled()
    expect(screen.getByTestId('kubo-tap-hint')).toHaveTextContent(/Next song loaded/)
  })

  it('"tocando" sem a posição andar por 5 s: mostra o aviso de player travado', async () => {
    setUserAgent(ANDROID)
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
    try {
      await mount()
      const c = fake.controller!
      await act(async () => {
        c.emit('playback_update', upd(1000, 15_224))
        c.emit('playback_update', upd(1000, 15_224))
      })
      expect(screen.queryByTestId('kubo-stalled-hint')).toBeNull()
      await act(async () => {
        vi.advanceTimersByTime(6000)
      })
      expect(screen.getByTestId('kubo-stalled-hint')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('navegador dentro de app (WebView/Instagram): pede para abrir no Chrome', async () => {
    setUserAgent(PIXEL_INSTAGRAM)
    await mount()
    expect(screen.getByTestId('kubo-inapp-hint')).toHaveTextContent(/open vertal.dev\/recompensas in Chrome/)
  })

  it('Chrome normal: sem aviso de app', async () => {
    setUserAgent(ANDROID)
    await mount()
    expect(screen.queryByTestId('kubo-inapp-hint')).toBeNull()
    expect(screen.getByTestId('kubo-player-status')).toHaveTextContent(/Spotify/)
  })
})

describe('KuboMusicPanel com áudio próprio (flag)', () => {
  it('modo "mobile" no Android: usa <audio> com o MP3 do Storage e o toque na faixa dá play()', async () => {
    setUserAgent(ANDROID)
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
    render(<KuboMusicPanel checklist={null} ownAudioMode="mobile" />)
    await act(async () => {
      await Promise.resolve()
    })
    const audio = screen.getByTestId('kubo-own-audio') as HTMLAudioElement
    expect(audio.getAttribute('src')).toMatch(/\/storage\/v1\/object\/public\/kubo-music\/trackA\.mp3$/)
    expect(screen.queryByTestId('kubo-spotify-embed')).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByTestId('kubo-track-trackB'))
    })
    expect(play).toHaveBeenCalled()
    expect(audio.src).toMatch(/kubo-music\/trackB\.mp3$/)
    play.mockRestore()
  })

  it('MP3 indisponível: volta para o player do Spotify', async () => {
    setUserAgent(ANDROID)
    render(<KuboMusicPanel checklist={null} ownAudioMode="all" />)
    await act(async () => {
      fireEvent.error(screen.getByTestId('kubo-own-audio'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.queryByTestId('kubo-own-audio')).toBeNull()
    expect(screen.getByTestId('kubo-spotify-embed')).toBeInTheDocument()
    expect(screen.getByTestId('kubo-own-audio-fallback')).toBeInTheDocument()
  })

  it('modo "mobile" no computador: continua no Spotify', async () => {
    setUserAgent(DESKTOP)
    render(<KuboMusicPanel checklist={null} ownAudioMode="mobile" />)
    expect(screen.queryByTestId('kubo-own-audio')).toBeNull()
  })
})
