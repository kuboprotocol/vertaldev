import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const invoke = vi.fn()
const showRewardedAd = vi.fn()

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))
vi.mock('@/lib/gamRewarded', () => ({
  rewardedAdUnit: () => null,
  showRewardedAd: (...args: unknown[]) => showRewardedAd(...args),
}))
const showApplixirAd = vi.fn()
vi.mock('@/lib/applixirRewarded', () => ({
  APPLIXIR_CONTAINER_ID: 'applixir-ad-container',
  applixirApiKey: () => null,
  loadApplixirSdk: () => Promise.resolve(() => undefined),
  showApplixirAd: (...args: unknown[]) => showApplixirAd(...args),
}))
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
  vi.mocked(toast.info).mockReset()
  vi.mocked(toast.success).mockReset()
  vi.mocked(toast.error).mockReset()
})

describe('RewardedVideoPanel', () => {
  it('sem provedor configurado o clique avisa o usuário (não fica mudo) e não chama o backend', async () => {
    render(<RewardedVideoPanel adUnit={null} applixirKey={null} />)
    const button = screen.getByTestId('rewarded-video-button')
    expect(button).toBeEnabled()
    await userEvent.click(button)
    expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/are not available yet/))
    expect(invoke).not.toHaveBeenCalled()
  })

  it('AppLixir: pede nonce com provider, abre o vídeo com o nonce e só credita pelo backend', async () => {
    const nonce = 'c'.repeat(64)
    invoke.mockImplementation((name: string) => {
      if (name.includes('action=status')) return Promise.resolve({ data: status, error: null })
      if (name.includes('action=start')) return Promise.resolve({ data: { ...status, nonce }, error: null })
      return Promise.resolve({ data: { ...status, claimed_today: 3, success: true, credits_earned: 1 }, error: null })
    })
    showApplixirAd.mockImplementation(async ({ onGranted }: { onGranted: () => Promise<void> }) => {
      await onGranted()
      return { kind: 'granted' }
    })
    const onCredited = vi.fn()
    render(<RewardedVideoPanel adUnit={null} applixirKey="5a4db0c5-0000-4000-8000-5a4db0c50001" onCredited={onCredited} />)

    expect(screen.getByTestId('applixir-ad-container')).toBeInTheDocument()
    expect(await screen.findByTestId('rewarded-video-progress')).toHaveTextContent('2/10')
    await userEvent.click(screen.getByTestId('rewarded-video-button'))

    await waitFor(() => expect(onCredited).toHaveBeenCalled())
    expect(invoke).toHaveBeenCalledWith('rewarded-video-claim?action=start', {
      method: 'POST',
      body: { provider: 'applixir', action: 'start' },
    })
    expect(showApplixirAd).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: '5a4db0c5-0000-4000-8000-5a4db0c50001', customData: { nonce } }),
    )
    expect(showRewardedAd).not.toHaveBeenCalled()
    expect(invoke).toHaveBeenCalledWith('rewarded-video-claim?action=claim', {
      method: 'POST',
      body: { nonce, action: 'claim' },
    })
    expect(toast.success).toHaveBeenCalled()
  })

  it('falha do backend no start mostra erro em vez de ficar mudo', async () => {
    invoke.mockImplementation((name: string) =>
      name.includes('action=start')
        ? Promise.resolve({ data: null, error: new Error('boom') })
        : Promise.resolve({ data: status, error: null }),
    )
    render(<RewardedVideoPanel adUnit={null} applixirKey="k" />)
    await screen.findByTestId('rewarded-video-progress')
    await userEvent.click(screen.getByTestId('rewarded-video-button'))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/We could not start/)))
    expect(showApplixirAd).not.toHaveBeenCalled()
  })

  it('pede nonce, mostra o anúncio e resgata com o nonce no rewardedSlotGranted', async () => {
    const nonce = 'a'.repeat(64)
    invoke.mockImplementation((name: string) => {
      if (name.includes('action=status')) return Promise.resolve({ data: status, error: null })
      if (name.includes('action=start')) return Promise.resolve({ data: { ...status, nonce }, error: null })
      return Promise.resolve({ data: { ...status, claimed_today: 3, success: true, credits_earned: 1 }, error: null })
    })
    showRewardedAd.mockImplementation(async ({ onGranted }: { onGranted: () => Promise<void> }) => {
      await onGranted()
      return { kind: 'granted' }
    })
    const onCredited = vi.fn()
    render(<RewardedVideoPanel applixirKey={null} adUnit="/123/rewarded" onCredited={onCredited} />)

    expect(await screen.findByTestId('rewarded-video-progress')).toHaveTextContent('2/10')
    await userEvent.click(screen.getByTestId('rewarded-video-button'))

    await waitFor(() => expect(onCredited).toHaveBeenCalled())
    expect(invoke).toHaveBeenCalledWith('rewarded-video-claim?action=claim', {
      method: 'POST',
      body: { nonce, action: 'claim' },
    })
    expect(showRewardedAd).toHaveBeenCalledWith(expect.objectContaining({ adUnit: '/123/rewarded' }))
    expect(screen.getByTestId('rewarded-video-progress')).toHaveTextContent('3/10')
  })

  it('no-fill não credita e avisa o usuário', async () => {
    invoke.mockImplementation((name: string) =>
      Promise.resolve({ data: name.includes('start') ? { ...status, nonce: 'b'.repeat(64) } : status, error: null }),
    )
    showRewardedAd.mockResolvedValue({ kind: 'no_fill' })
    render(<RewardedVideoPanel applixirKey={null} adUnit="/123/rewarded" />)
    await screen.findByTestId('rewarded-video-progress')
    await userEvent.click(screen.getByTestId('rewarded-video-button'))
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/No video is available/)))
    expect(invoke).not.toHaveBeenCalledWith('rewarded-video-claim?action=claim', expect.anything())
  })

  it('limite diário atingido desabilita o botão', async () => {
    invoke.mockResolvedValue({
      data: { ...status, claimed_today: 10, remaining_today: 0, can_watch: false, reason: 'daily_cap_reached' },
      error: null,
    })
    render(<RewardedVideoPanel applixirKey={null} adUnit="/123/rewarded" />)
    await waitFor(() => expect(screen.getByTestId('rewarded-video-button')).toHaveTextContent('Daily limit reached'))
    expect(screen.getByTestId('rewarded-video-button')).toBeDisabled()
  })
})
