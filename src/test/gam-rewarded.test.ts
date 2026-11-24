import { describe, expect, it, vi } from 'vitest'
import { showRewardedAd, type GoogleTag, type GptSlot } from '@/lib/gamRewarded'

type Listener = (e: unknown) => void

function fakeGoogletag(opts: { supported?: boolean } = {}) {
  const listeners = new Map<string, Listener[]>()
  const slot = { addService: vi.fn() } as unknown as GptSlot
  ;(slot as unknown as { addService: ReturnType<typeof vi.fn> }).addService.mockReturnValue(slot)
  const pubads = {
    addEventListener: (type: string, fn: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn])
    },
    removeEventListener: vi.fn(),
  }
  const gt = {
    cmd: { push: (fn: () => void) => fn() },
    enums: { OutOfPageFormat: { REWARDED: 4 } },
    defineOutOfPageSlot: vi.fn(() => (opts.supported === false ? null : slot)),
    pubads: () => pubads,
    enableServices: vi.fn(),
    display: vi.fn(),
    destroySlots: vi.fn(() => true),
  }
  const emit = (type: string, extra: Record<string, unknown> = {}) =>
    (listeners.get(type) ?? []).forEach((fn) => fn({ slot, ...extra }))
  return { gt: gt as unknown as GoogleTag, raw: gt, emit, slot }
}

describe('showRewardedAd', () => {
  it('define o slot REWARDED, mostra quando pronto, chama onGranted e destrói ao fechar', async () => {
    const { gt, raw, emit } = fakeGoogletag()
    const onGranted = vi.fn()
    const p = showRewardedAd({ adUnit: '/123/rewarded', onGranted, googletag: gt })
    await Promise.resolve()

    expect(raw.defineOutOfPageSlot).toHaveBeenCalledWith('/123/rewarded', 4)
    const makeRewardedVisible = vi.fn()
    emit('rewardedSlotReady', { makeRewardedVisible })
    expect(makeRewardedVisible).toHaveBeenCalled()
    emit('rewardedSlotGranted')
    emit('rewardedSlotGranted') // duplicado não credita duas vezes
    emit('rewardedSlotClosed')

    await expect(p).resolves.toEqual({ kind: 'granted' })
    expect(onGranted).toHaveBeenCalledTimes(1)
    expect(raw.destroySlots).toHaveBeenCalled()
  })

  it('trata no-fill (slotRenderEnded vazio)', async () => {
    const { gt, emit } = fakeGoogletag()
    const onGranted = vi.fn()
    const p = showRewardedAd({ adUnit: '/123/rewarded', onGranted, googletag: gt })
    await Promise.resolve()
    emit('slotRenderEnded', { isEmpty: true })
    await expect(p).resolves.toEqual({ kind: 'no_fill' })
    expect(onGranted).not.toHaveBeenCalled()
  })

  it('trata timeout sem anúncio como no-fill', async () => {
    vi.useFakeTimers()
    const { gt } = fakeGoogletag()
    const p = showRewardedAd({ adUnit: '/1/r', onGranted: vi.fn(), googletag: gt, readyTimeoutMs: 1000 })
    await vi.advanceTimersByTimeAsync(1001)
    await expect(p).resolves.toEqual({ kind: 'no_fill' })
    vi.useRealTimers()
  })

  it('fechar sem recompensa não chama onGranted', async () => {
    const { gt, emit } = fakeGoogletag()
    const onGranted = vi.fn()
    const p = showRewardedAd({ adUnit: '/1/r', onGranted, googletag: gt })
    await Promise.resolve()
    emit('rewardedSlotReady', { makeRewardedVisible: vi.fn() })
    emit('rewardedSlotClosed')
    await expect(p).resolves.toEqual({ kind: 'closed_without_reward' })
    expect(onGranted).not.toHaveBeenCalled()
  })

  it('navegador sem suporte (slot null)', async () => {
    const { gt } = fakeGoogletag({ supported: false })
    await expect(showRewardedAd({ adUnit: '/1/r', onGranted: vi.fn(), googletag: gt })).resolves.toEqual({ kind: 'unsupported' })
  })
})
