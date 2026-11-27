import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/components/shortlinks/RewardedVideoPanel', () => ({
  default: () => <div data-testid="rewarded-video-panel">vídeo premiado</div>,
}))
const fetchDailyChecklist = vi.fn()
const reportTerraUnavailable = vi.fn()
vi.mock('@/lib/dailyRewards', async (orig) => ({
  ...(await orig<typeof import('@/lib/dailyRewards')>()),
  fetchDailyChecklist: () => fetchDailyChecklist(),
  reportTerraUnavailable: (...a: unknown[]) => reportTerraUnavailable(...a),
}))

import { CreativeRewardsPanel } from './CreativeRewardsPanel'

describe('CreativeRewardsPanel', () => {
  it('mostra vídeo premiado e progresso do dia, sem anúncio TERRA/Adsterra', async () => {
    fetchDailyChecklist.mockResolvedValue({
      day: '2026-11-27', video_done: true, videos_today: 1, music_done: false, music_tracks_counted: 2,
      music_tracks_total: 5, tracks: [], terra_done: false, terra_today: 0, terra_unavailable: true,
      completed: false, completed_at: null, pending_credits: 3, released_credits: 0, expired_credits: 0,
    })
    const { container } = render(<CreativeRewardsPanel />)
    expect(screen.getByTestId('rewarded-video-panel')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('daily-checklist-progress').textContent).toMatch(/1\/3/))
    expect(container.innerHTML).not.toMatch(/terra|adsterra|effectivecpm|bauval/i)
    expect(container.querySelector('script, iframe')).toBeNull()
    expect(reportTerraUnavailable).not.toHaveBeenCalled()
  })
})
