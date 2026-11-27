import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const invoke = vi.fn()
const showRewardedAd = vi.fn()
const showApplixirAd = vi.fn()
const showNativeRewarded = vi.fn()

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))
vi.mock('@/lib/gamRewarded', () => ({
  rewardedAdUnit: () => '/123/rewarded',
  showRewardedAd: (...args: unknown[]) => showRewardedAd(...args),
}))
vi.mock('@/lib/applixirRewarded', () => ({
  APPLIXIR_CONTAINER_ID: 'applixir-ad-container',
  applixirApiKey: () => 'k',
  loadApplixirSdk: () => Promise.resolve(() => undefined),
  showApplixirAd: (...args: unknown[]) => showApplixirAd(...args),
}))
vi.mock('@/lib/admob', async (orig) => {
  const real = await orig<typeof import('@/lib/admob')>()
  return { ...real, showNativeRewarded: (...args: unknown[]) => showNativeRewarded(...args) }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }))

import RewardedVideoPanel from './RewardedVideoPanel'
import { toast } from 'sonner'

const status = {
  amount: 1,
  daily_cap: 10,
  cooldown_seconds: 60,
  claimed_today: 2,
  remaining_today: 8,
  next_available_at: null,
  can_watch: true,
  reason: null,
}

beforeEach(() => {
  invoke.mockReset()
  showRewardedAd.mockReset()
  showApplixirAd.mockReset()
  showNativeRewarded.mockReset()
  vi.mocked(toast.info).mockReset()
  vi.mocked(toast.success).mockReset()
})

function backend(nonce: string) {
  invoke.mockImplementation((name: string) => {
    if (name.includes('action=status')) return Promise.resolve({ data: status, error: null })
    if (name.includes('action=start')) return Promise.resolve({ data: { ...status, nonce }, error: null })
    return Promise.resolve({ data: { ...status, claimed_today: 3, success: true, credits_earned: 1 }, error: null })
  })
}

describe('RewardedVideoPanel no app nativo (AdMob premiado)', () => {
  it('usa o AdMob no lugar de AppLixir/GAM e credita só pelo backend com o nonce', async () => {
    const nonce = 'd'.repeat(64)
    backend(nonce)
    showNativeRewarded.mockResolvedValue({ kind: 'granted' })
    const onCredited = vi.fn()
    render(<RewardedVideoPanel nativeAdMob onCredited={onCredited} />)

    expect(screen.queryByTestId('applixir-ad-container')).toBeNull()
    await screen.findByTestId('rewarded-video-progress')
    await userEvent.click(screen.getByTestId('rewarded-video-button'))

    await waitFor(() => expect(onCredited).toHaveBeenCalled())
    expect(invoke).toHaveBeenCalledWith('rewarded-video-claim?action=start', {
      method: 'POST',
      body: { provider: 'admob', action: 'start' },
    })
    expect(showNativeRewarded).toHaveBeenCalledWith({ nonce })
    expect(showApplixirAd).not.toHaveBeenCalled()
    expect(showRewardedAd).not.toHaveBeenCalled()
    expect(invoke).toHaveBeenCalledWith('rewarded-video-claim?action=claim', {
      method: 'POST',
      body: { nonce, action: 'claim' },
    })
  })

  it('fechou antes do fim: não credita e avisa', async () => {
    backend('e'.repeat(64))
    showNativeRewarded.mockResolvedValue({ kind: 'closed_without_reward' })
    render(<RewardedVideoPanel nativeAdMob />)
    await screen.findByTestId('rewarded-video-progress')
    await userEvent.click(screen.getByTestId('rewarded-video-button'))
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/até o fim/)))
    expect(invoke).not.toHaveBeenCalledWith('rewarded-video-claim?action=claim', expect.anything())
  })

  it('sem bloco premiado do AdMob, o app mantém o provedor que já existia', async () => {
    backend('f'.repeat(64))
    showApplixirAd.mockResolvedValue({ kind: 'no_fill' })
    render(<RewardedVideoPanel nativeAdMob={false} />)
    await screen.findByTestId('rewarded-video-progress')
    await userEvent.click(screen.getByTestId('rewarded-video-button'))
    await waitFor(() => expect(showApplixirAd).toHaveBeenCalled())
    expect(showNativeRewarded).not.toHaveBeenCalled()
  })
})
