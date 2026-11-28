import { describe, expect, it, vi } from 'vitest'
import { embeddedSdkEnabled, getEmbeddedNodeBridge } from './vertalNodeEmbedded'

function capacitor(plugin: Record<string, unknown> | undefined, platform = 'android', native = true) {
  return {
    Capacitor: {
      isNativePlatform: () => native,
      getPlatform: () => platform,
      isPluginAvailable: (n: string) => n === 'VertalNode' && Boolean(plugin),
      Plugins: plugin ? { VertalNode: plugin } : {},
    },
  }
}

describe('vertalNodeEmbedded', () => {
  it('flag desligado por padrão', () => {
    expect(embeddedSdkEnabled(undefined)).toBe(false)
    expect(embeddedSdkEnabled('')).toBe(false)
    expect(embeddedSdkEnabled('false')).toBe(false)
    expect(embeddedSdkEnabled('true')).toBe(true)
    expect(embeddedSdkEnabled('1')).toBe(true)
  })

  it('sem flag: nunca usa o SDK embutido, mesmo dentro do app', () => {
    const plugin = { activate: vi.fn(), status: vi.fn(), pause: vi.fn(), optOut: vi.fn() }
    expect(getEmbeddedNodeBridge(capacitor(plugin), false)).toBeNull()
    expect(plugin.activate).not.toHaveBeenCalled()
  })

  it('web normal, iOS e app sem o plugin: null', () => {
    expect(getEmbeddedNodeBridge({}, true)).toBeNull()
    expect(getEmbeddedNodeBridge(capacitor({ activate: vi.fn(), status: vi.fn() }, 'ios'), true)).toBeNull()
    expect(getEmbeddedNodeBridge(capacitor({ activate: vi.fn(), status: vi.fn() }, 'web', false), true)).toBeNull()
    expect(getEmbeddedNodeBridge(capacitor(undefined), true)).toBeNull()
  })

  it('Capacitor Android: activate repassa accepted e o estado', async () => {
    const plugin = {
      status: vi.fn().mockResolvedValue({ available: true, optedIn: false, running: false, paused: false }),
      activate: vi.fn().mockResolvedValue({ available: true, optedIn: true, running: true, paused: false, accepted: true }),
      pause: vi.fn().mockResolvedValue({ available: true, optedIn: true, running: false, paused: true }),
      optOut: vi.fn().mockResolvedValue({ available: true, optedIn: false, running: false, paused: true }),
    }
    const b = getEmbeddedNodeBridge(capacitor(plugin), true)!
    expect(b.kind).toBe('capacitor')
    // criar a ponte não liga nada
    expect(plugin.activate).not.toHaveBeenCalled()
    expect(await b.activate()).toEqual({ available: true, reason: undefined, optedIn: true, running: true, paused: false, accepted: true })
    expect((await b.pause()).paused).toBe(true)
    expect((await b.optOut()).optedIn).toBe(false)
  })

  it('Electron: usa window.vertalNode do preload (stop = pausar)', async () => {
    const api = {
      status: vi.fn().mockResolvedValue({ enabled: true, optedIn: false, running: false }),
      activate: vi.fn().mockResolvedValue({ enabled: true, optedIn: true, running: true }),
      stop: vi.fn().mockResolvedValue({ enabled: true, optedIn: true, running: false, paused: true }),
      optOut: vi.fn().mockResolvedValue({ enabled: true, optedIn: false, running: false }),
    }
    const b = getEmbeddedNodeBridge({ vertalNode: api }, true)!
    expect(b.kind).toBe('electron')
    expect((await b.activate()).accepted).toBe(true)
    await b.pause()
    expect(api.stop).toHaveBeenCalledTimes(1)
    expect((await b.status()).available).toBe(true)
  })
})
