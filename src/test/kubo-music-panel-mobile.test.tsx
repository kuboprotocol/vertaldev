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
