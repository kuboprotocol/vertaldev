import { describe, expect, it } from 'vitest'
import { activationTarget, androidIntentUrl, DEFAULT_VERTAL_NODE_ANDROID_URL, detectNodePlatform } from './vertalNode'

describe('vertalNode', () => {
  it('detecta a plataforma pelo user agent', () => {
    expect(detectNodePlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/131 Mobile', 5)).toBe('android')
    expect(detectNodePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe('ios')
    expect(detectNodePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605', 5)).toBe('ios') // iPadOS
    expect(detectNodePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/131', 0)).toBe('desktop')
    expect(detectNodePlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131', 0)).toBe('desktop')
    expect(detectNodePlatform('Mozilla/5.0 (X11; Linux x86_64) Firefox/133', 0)).toBe('desktop')
    expect(detectNodePlatform('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/131', 0)).toBe('other')
    expect(detectNodePlatform('', 0)).toBe('other')
  })

  it('intent URL do Android com fallback codificado', () => {
    expect(androidIntentUrl('https://x.dev/a b.apk')).toBe(
      'intent://open?source=recompensas#Intent;scheme=vertalnode;package=dev.vertal.node;S.browser_fallback_url=https%3A%2F%2Fx.dev%2Fa%20b.apk;end',
    )
  })

  it('APK padrão é uma pré-release pública https do vertaldev', () => {
    expect(DEFAULT_VERTAL_NODE_ANDROID_URL).toMatch(/^https:\/\/github\.com\/kuboprotocol\/vertaldev\/releases\/download\/vertal-node-android-test-[0-9a-f]+\/.+\.apk$/)
  })

  it('destino por plataforma', () => {
    const urls = { androidUrl: 'https://a.apk', desktopUrl: 'https://d.exe' }
    expect(activationTarget('android', urls).kind).toBe('android')
    expect(activationTarget('desktop', urls)).toEqual({ kind: 'desktop', url: 'https://d.exe' })
    expect(activationTarget('desktop', { ...urls, desktopUrl: null })).toEqual({ kind: 'desktop_unavailable' })
    expect(activationTarget('ios', urls)).toEqual({ kind: 'unsupported', platform: 'ios' })
    expect(activationTarget('other', urls)).toEqual({ kind: 'unsupported', platform: 'other' })
  })
})
