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
})

describe('RewardedVideoPanel', () => {
  it('sem ad unit fica desabilitado com "em breve" e não chama o backend', () => {
    render(<RewardedVideoPanel adUnit={null} />)
    expect(screen.getByTestId('rewarded-video-button')).toBeDisabled()
    expect(screen.getByTestId('rewarded-video-button')).toHaveTextContent('em breve')
    expect(invoke).not.toHaveBeenCalled()
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
    render(<RewardedVideoPanel adUnit="/123/rewarded" onCredited={onCredited} />)

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
    render(<RewardedVideoPanel adUnit="/123/rewarded" />)
    await screen.findByTestId('rewarded-video-progress')
    await userEvent.click(screen.getByTestId('rewarded-video-button'))
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/Nenhum vídeo disponível/)))
    expect(invoke).not.toHaveBeenCalledWith('rewarded-video-claim?action=claim', expect.anything())
  })

  it('limite diário atingido desabilita o botão', async () => {
    invoke.mockResolvedValue({
      data: { ...status, claimed_today: 10, remaining_today: 0, can_watch: false, reason: 'daily_cap_reached' },
      error: null,
    })
    render(<RewardedVideoPanel adUnit="/123/rewarded" />)
    await waitFor(() => expect(screen.getByTestId('rewarded-video-button')).toHaveTextContent('Limite de hoje atingido'))
    expect(screen.getByTestId('rewarded-video-button')).toBeDisabled()
  })
})
