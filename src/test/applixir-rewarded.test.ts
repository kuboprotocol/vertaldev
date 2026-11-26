import { describe, expect, it, vi } from 'vitest'
import { showApplixirAd, type ApplixirOptions } from '@/lib/applixirRewarded'

function fakePlayer() {
  let opts: ApplixirOptions | null = null
  const open = vi.fn((o: ApplixirOptions) => {
    opts = o
  })
  const emit = (type: string) => opts?.adStatusCallbackFn({ type })
  const fail = (data: { errorCode?: number; errorMessage?: string }) =>
    opts?.adErrorCallbackFn?.({ getError: () => ({ data }) })
  return { open, emit, fail, opts: () => opts }
}

describe('showApplixirAd', () => {
  it('só concede no "complete" e passa chave, container e customData ao SDK', async () => {
    const p = fakePlayer()
    const onGranted = vi.fn()
    const done = showApplixirAd({ apiKey: 'k', onGranted, customData: { nonce: 'n' }, open: p.open })
    await Promise.resolve()
    expect(p.opts()).toMatchObject({ apiKey: 'k', injectionElementId: 'applixir-ad-container', customData: { nonce: 'n' } })
    p.emit('loaded')
    p.emit('started')
    p.emit('midpoint')
    expect(onGranted).not.toHaveBeenCalled()
    p.emit('complete')
    p.emit('complete')
    p.emit('allAdsCompleted')
    await expect(done).resolves.toEqual({ kind: 'granted' })
    expect(onGranted).toHaveBeenCalledTimes(1)
  })

  it('allAdsCompleted sem anúncio iniciado = sem anúncio (no-fill), sem crédito', async () => {
    const p = fakePlayer()
    const onGranted = vi.fn()
    const done = showApplixirAd({ apiKey: 'k', onGranted, open: p.open })
    await Promise.resolve()
    p.emit('allAdsCompleted')
    await expect(done).resolves.toEqual({ kind: 'no_fill' })
    expect(onGranted).not.toHaveBeenCalled()
  })

  it('pular/fechar antes do fim não concede', async () => {
    for (const type of ['skipped', 'manuallyEnded', 'consentDeclined']) {
      const p = fakePlayer()
      const onGranted = vi.fn()
      const done = showApplixirAd({ apiKey: 'k', onGranted, open: p.open })
      await Promise.resolve()
      p.emit('started')
      p.emit(type)
      await expect(done).resolves.toEqual({ kind: 'closed_without_reward' })
      expect(onGranted).not.toHaveBeenCalled()
    }
  })

  it('erro 303 (No Ads) vira no-fill; outros erros viram erro', async () => {
    const a = fakePlayer()
    const d1 = showApplixirAd({ apiKey: 'k', onGranted: vi.fn(), open: a.open })
    await Promise.resolve()
    a.fail({ errorCode: 303, errorMessage: 'No Ads' })
    await expect(d1).resolves.toEqual({ kind: 'no_fill' })

    const b = fakePlayer()
    const d2 = showApplixirAd({ apiKey: 'k', onGranted: vi.fn(), open: b.open })
    await Promise.resolve()
    b.fail({ errorCode: 1009, errorMessage: 'VAST error' })
    await expect(d2).resolves.toEqual({ kind: 'error', message: 'VAST error' })
  })

  it('sem nenhum sinal do player dentro do prazo = no-fill', async () => {
    vi.useFakeTimers()
    try {
      const p = fakePlayer()
      const done = showApplixirAd({ apiKey: 'k', onGranted: vi.fn(), open: p.open, loadTimeoutMs: 1000 })
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(1001)
      await expect(done).resolves.toEqual({ kind: 'no_fill' })
    } finally {
      vi.useRealTimers()
    }
  })
})
