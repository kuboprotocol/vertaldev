import { describe, expect, it } from 'vitest'
import {
  canAutoPlayEmbed,
  embedHeightFor,
  hardenSpotifyIframe,
  isIOSDevice,
  isTouchPlaybackDevice,
  mergeIframeAllow,
  spotifyTrackUrl,
  SPOTIFY_EMBED_HEIGHT_COMPACT,
  SPOTIFY_EMBED_HEIGHT_TOUCH,
} from '../lib/spotifyEmbed'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
const IPADOS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

describe('Spotify embed: celular x computador', () => {
  it('iPhone e Android são toque: a página não chama play()', () => {
    expect(isTouchPlaybackDevice({ userAgent: IPHONE })).toBe(true)
    expect(isTouchPlaybackDevice({ userAgent: ANDROID })).toBe(true)
    expect(canAutoPlayEmbed({ userAgent: IPHONE })).toBe(false)
    expect(canAutoPlayEmbed({ userAgent: ANDROID })).toBe(false)
  })

  it('iPadOS (UA de Mac com tela de toque) é iOS e toque', () => {
    expect(isIOSDevice({ userAgent: IPADOS, maxTouchPoints: 5 })).toBe(true)
    expect(isTouchPlaybackDevice({ userAgent: IPADOS, maxTouchPoints: 5 })).toBe(true)
  })

  it('computador continua com play() automático', () => {
    expect(isTouchPlaybackDevice({ userAgent: MAC_CHROME, maxTouchPoints: 0 })).toBe(false)
    expect(canAutoPlayEmbed({ userAgent: MAC_CHROME, maxTouchPoints: 0, finePointer: true })).toBe(true)
    // Notebook com tela de toque mas com mouse/trackpad: segue como computador.
    expect(
      isTouchPlaybackDevice({ userAgent: WINDOWS, maxTouchPoints: 10, coarsePointer: true, finePointer: true }),
    ).toBe(false)
    expect(isIOSDevice({ userAgent: MAC_CHROME, maxTouchPoints: 0 })).toBe(false)
  })

  it('tablet sem UA de celular mas só com dedo é toque', () => {
    expect(isTouchPlaybackDevice({ userAgent: WINDOWS, coarsePointer: true, finePointer: false })).toBe(true)
  })

  it('player maior no celular', () => {
    expect(embedHeightFor(true)).toBe(SPOTIFY_EMBED_HEIGHT_TOUCH)
    expect(embedHeightFor(false)).toBe(SPOTIFY_EMBED_HEIGHT_COMPACT)
    expect(SPOTIFY_EMBED_HEIGHT_TOUCH).toBeGreaterThan(SPOTIFY_EMBED_HEIGHT_COMPACT)
  })

  it('allow sempre tem autoplay e encrypted-media, sem perder o resto', () => {
    expect(mergeIframeAllow(null)).toBe('autoplay; encrypted-media')
    expect(mergeIframeAllow('clipboard-write; fullscreen')).toBe('clipboard-write; fullscreen; autoplay; encrypted-media')
    const spotify = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'
    expect(mergeIframeAllow(spotify)).toBe(spotify)
    expect(mergeIframeAllow("autoplay 'src'; fullscreen")).toBe("autoplay 'src'; fullscreen; encrypted-media")
  })

  it('hardenSpotifyIframe corrige allow e tira o lazy-load', () => {
    const host = document.createElement('div')
    const iframe = document.createElement('iframe')
    iframe.setAttribute('allow', 'clipboard-write')
    iframe.setAttribute('loading', 'lazy')
    host.appendChild(iframe)
    expect(hardenSpotifyIframe(host)).toBe(iframe)
    expect(iframe.getAttribute('allow')).toBe('clipboard-write; autoplay; encrypted-media')
    expect(iframe.getAttribute('loading')).toBe('eager')
    expect(hardenSpotifyIframe(document.createElement('div'))).toBeNull()
    expect(hardenSpotifyIframe(null)).toBeNull()
  })

  it('link de fallback para a faixa', () => {
    expect(spotifyTrackUrl('21WDwktTTX1IYwsrnN7mk9')).toBe('https://open.spotify.com/track/21WDwktTTX1IYwsrnN7mk9')
  })
})
