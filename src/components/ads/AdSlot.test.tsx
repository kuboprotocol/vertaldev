import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

const auth = { user: { id: 'u1' } as { id: string } | null, isAdmin: false }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }))

let plan: string | null = 'free'
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: plan ? { plan } : null, error: null }) }),
      }),
    }),
  },
}))

vi.mock('@/lib/adsense', async (orig) => {
  const real = await orig<typeof import('@/lib/adsense')>()
  return { ...real, ADSENSE_DISPLAY_SLOT_ID: '1234567890' }
})

const slotVisible = vi.fn()
vi.mock('@/lib/admob', async (orig) => {
  const real = await orig<typeof import('@/lib/admob')>()
  return { ...real, setNativeAdSlotVisible: (...a: [string, boolean]) => slotVisible(...a) }
})

import { AdSlot } from './AdSlot'
import { __resetAdEligibilityCache } from '@/hooks/useAdEligibility'

const g = globalThis as unknown as { Capacitor?: unknown; IntersectionObserver?: unknown }

describe('AdSlot: AdSense no site, AdMob no app — nunca os dois', () => {
  beforeEach(() => {
    __resetAdEligibilityCache()
    auth.user = { id: 'u1' }
    auth.isAdmin = false
    plan = 'free'
    slotVisible.mockReset()
    document.head.querySelectorAll('script').forEach((s) => s.remove())
    delete (window as Window & { adsbygoogle?: unknown }).adsbygoogle
  })
  afterEach(() => {
    cleanup()
    delete g.Capacitor
  })

  it('site: bloco do AdSense, sem marcador do AdMob', async () => {
    render(<AdSlot placement="p" />)
    expect(await screen.findByTestId('adsense-display')).toBeTruthy()
    expect(screen.queryByTestId('admob-slot-anchor')).toBeNull()
    expect(slotVisible).not.toHaveBeenCalled()
  })

  it.each(['free', 'starter'])('app nativo (%s): marcador do AdMob, nada do AdSense', async (p) => {
    plan = p
    g.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' }
    render(<AdSlot placement="p" />)
    const anchor = await screen.findByTestId('admob-slot-anchor')
    expect(anchor.getAttribute('data-placement')).toBe('p')
    expect(screen.queryByTestId('adsense-display')).toBeNull()
    expect(document.querySelector('ins.adsbygoogle')).toBeNull()
    expect(document.querySelector('script[src*="adsbygoogle"]')).toBeNull()
    // jsdom não tem IntersectionObserver: conta como visível.
    await waitFor(() => expect(slotVisible).toHaveBeenCalledWith(expect.any(String), true))
    cleanup()
    expect(slotVisible).toHaveBeenLastCalledWith(expect.any(String), false)
  })

  it.each(['pro', 'business_1'])('app nativo, plano pago (%s): nada', async (p) => {
    plan = p
    g.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' }
    render(<AdSlot placement="p" />)
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByTestId('admob-slot-anchor')).toBeNull()
    expect(screen.queryByTestId('adsense-display')).toBeNull()
    expect(slotVisible).not.toHaveBeenCalled()
  })

  it('app nativo, admin: nada', async () => {
    auth.isAdmin = true
    g.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' }
    render(<AdSlot placement="p" />)
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByTestId('admob-slot-anchor')).toBeNull()
    expect(slotVisible).not.toHaveBeenCalled()
  })
})
