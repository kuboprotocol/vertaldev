import { describe, expect, it } from 'vitest'
import {
  countTargetSeconds,
  isAtEnd,
  isInAppBrowser,
  isStalled,
  previewSecondsFrom,
} from '@/lib/spotifyEmbed'
import { kuboOwnAudioUrl, ownAudioMode, shouldUseOwnAudio } from '@/lib/kuboOwnAudio'
import { musicThresholdSeconds, parsePreviewSeconds } from '../../supabase/functions/_shared/rewardsCore'

describe('prévia do Spotify', () => {
  it('detecta prévia pela duração (< limite) e ignora faixa inteira', () => {
    expect(previewSecondsFrom(15_224, 30)).toBeCloseTo(15.224)
    expect(previewSecondsFrom(28_659, 30)).toBeCloseTo(28.659)
    expect(previewSecondsFrom(162_000, 30)).toBeNull()
    expect(previewSecondsFrom(0, 30)).toBeNull()
    expect(previewSecondsFrom(undefined, 30)).toBeNull()
  })

  it('meta do cliente = meta do servidor + 2 s de folga', () => {
    for (const p of [15.224, 20.9, 28.659]) expect(countTargetSeconds(30, p)).toBe(musicThresholdSeconds(30, p))
    expect(countTargetSeconds(30, null)).toBe(30)
    expect(countTargetSeconds(30, 15.224)).toBe(13)
    expect(countTargetSeconds(30, 8)).toBe(12)
  })

  it('servidor: prévia de 15 s conta com 13 s; sem prévia continua 28 s; valores inválidos ignorados', () => {
    expect(musicThresholdSeconds(30, null)).toBe(28)
    expect(musicThresholdSeconds(30, 15.2)).toBe(13)
    expect(musicThresholdSeconds(30, 28.6)).toBe(26)
    expect(musicThresholdSeconds(30, 6)).toBe(12)
    expect(parsePreviewSeconds(15.2, 30)).toBe(15.2)
    expect(parsePreviewSeconds('15.2', 30)).toBe(15.2)
    expect(parsePreviewSeconds(30, 30)).toBeNull()
    expect(parsePreviewSeconds(2, 30)).toBeNull()
    expect(parsePreviewSeconds('x', 30)).toBeNull()
    expect(parsePreviewSeconds(undefined, 30)).toBeNull()
  })

  it('fim: position == duration (o embed não manda isPaused no fim)', () => {
    expect(isAtEnd(15_224, 15_224)).toBe(true)
    expect(isAtEnd(14_000, 15_224)).toBe(false)
    expect(isAtEnd(0, 0)).toBe(false)
  })

  it('travado: tocando sem avançar por 5 s, menos no fim', () => {
    const last = { position: 1000, duration: 15_000, wallMs: 0, playing: true }
    expect(isStalled(last, 0, 4000)).toBe(false)
    expect(isStalled(last, 0, 5000)).toBe(true)
    expect(isStalled({ ...last, playing: false }, 0, 9000)).toBe(false)
    expect(isStalled({ ...last, position: 15_000 }, 0, 9000)).toBe(false)
    expect(isStalled(null, 0, 9000)).toBe(false)
  })

  it('navegador dentro de app', () => {
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/X; wv) AppleWebKit/537.36 Chrome/131 Mobile')).toBe(true)
    expect(isInAppBrowser('... Instagram 350.0')).toBe(true)
    expect(isInAppBrowser('... [FBAN/FB4A;FBAV/450.0]')).toBe(true)
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36')).toBe(false)
  })
})

describe('áudio próprio do Kubo (flag)', () => {
  it('flag desligada por padrão', () => {
    expect(ownAudioMode(undefined)).toBe('off')
    expect(ownAudioMode('')).toBe('off')
    expect(ownAudioMode('mobile')).toBe('mobile')
    expect(ownAudioMode('ALL')).toBe('all')
    expect(shouldUseOwnAudio('off', true)).toBe(false)
    expect(shouldUseOwnAudio('mobile', true)).toBe(true)
    expect(shouldUseOwnAudio('mobile', false)).toBe(false)
    expect(shouldUseOwnAudio('all', false)).toBe(true)
  })

  it('URL pública do Storage, nunca do Spotify', () => {
    const url = kuboOwnAudioUrl('https://x.supabase.co/', '21WDwktTTX1IYwsrnN7mk9')
    expect(url).toBe('https://x.supabase.co/storage/v1/object/public/kubo-music/21WDwktTTX1IYwsrnN7mk9.mp3')
    expect(url).not.toMatch(/scdn|spotify/)
  })
})
