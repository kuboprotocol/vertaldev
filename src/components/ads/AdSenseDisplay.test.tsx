import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

const auth = { user: { id: 'u1' } as { id: string } | null, isAdmin: false }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }))

let plan: string | null = 'free'
let queryError: { message: string } | null = null
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: plan ? { plan } : null, error: queryError }) }),
      }),
    }),
  },
}))

const slot = { id: '1234567890' }
vi.mock('@/lib/adsense', async (orig) => {
  const real = await orig<typeof import('@/lib/adsense')>()
  return {
    ...real,
    get ADSENSE_DISPLAY_SLOT_ID() {
      return slot.id
    },
  }
})

import { AdSenseDisplay } from './AdSenseDisplay'

const win = window as Window & { adsbygoogle?: unknown[] }
import { __resetAdEligibilityCache } from '@/hooks/useAdEligibility'

describe('AdSenseDisplay (Google AdSense no lugar do TERRA ADS)', () => {
  beforeEach(() => {
    __resetAdEligibilityCache()
    auth.user = { id: 'u1' }
    auth.isAdmin = false
    plan = 'free'
    queryError = null
    slot.id = '1234567890'
    document.head.querySelectorAll('script').forEach((s) => s.remove())
    delete win.adsbygoogle
  })
  afterEach(cleanup)

  it.each(['free', 'starter'])('plano %s vê o bloco responsivo com rótulo Publicidade', async (p) => {
    plan = p
    const openSpy = vi.spyOn(window, 'open')
    render(<AdSenseDisplay placement="t" />)
    const box = await screen.findByTestId('adsense-display')
    expect(box.textContent).toMatch(/Publicidade/)
    const ins = box.querySelector('ins.adsbygoogle')!
    expect(ins.getAttribute('data-ad-client')).toBe('ca-pub-6320473908706491')
    expect(ins.getAttribute('data-ad-slot')).toBe('1234567890')
    expect(ins.getAttribute('data-ad-format')).toBe('auto')
    expect(ins.getAttribute('data-full-width-responsive')).toBe('true')
    const scripts = Array.from(document.querySelectorAll('script')).map((s) => s.src)
    expect(scripts).toEqual([
      'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6320473908706491',
    ])
    expect(win.adsbygoogle).toHaveLength(1)
    expect(document.documentElement.innerHTML).not.toMatch(/effectivecpm|bauval|adsterra|atOptions/i)
    expect(box.querySelector('iframe, button, a')).toBeNull()
    expect(openSpy).not.toHaveBeenCalled()
    openSpy.mockRestore()
  })

  it('dois blocos carregam o script uma vez só', async () => {
    render(
      <>
        <AdSenseDisplay placement="a" />
        <AdSenseDisplay placement="b" />
      </>,
    )
    await waitFor(() => expect(screen.getAllByTestId('adsense-display')).toHaveLength(2))
    expect(document.querySelectorAll('script[src*="adsbygoogle.js"]')).toHaveLength(1)
    expect(win.adsbygoogle).toHaveLength(2)
  })

  it.each(['pro', 'premium_1', 'business_1', 'enterprise', 'beta'])('plano %s não vê anúncio', async (p) => {
    plan = p
    const { container } = render(<AdSenseDisplay />)
    await new Promise((r) => setTimeout(r, 20))
    expect(container.innerHTML).toBe('')
    expect(document.querySelector('script[src*="adsbygoogle"]')).toBeNull()
  })

  it('sem linha de assinatura conta como Free; erro na consulta não mostra anúncio', async () => {
    plan = null
    render(<AdSenseDisplay placement="sem-linha" />)
    expect(await screen.findByTestId('adsense-display')).toBeTruthy()
    cleanup()
    __resetAdEligibilityCache()
    queryError = { message: 'boom' }
    plan = 'free'
    const { container } = render(<AdSenseDisplay />)
    await new Promise((r) => setTimeout(r, 20))
    expect(container.innerHTML).toBe('')
  })

  it('admin e visitante sem login não veem anúncio', async () => {
    auth.isAdmin = true
    const a = render(<AdSenseDisplay />)
    auth.isAdmin = false
    auth.user = null
    const b = render(<AdSenseDisplay />)
    await new Promise((r) => setTimeout(r, 20))
    expect(a.container.innerHTML).toBe('')
    expect(b.container.innerHTML).toBe('')
    expect(document.querySelector('script[src*="adsbygoogle"]')).toBeNull()
  })

  it('sem ID de bloco configurado, nada renderiza e o script não carrega', async () => {
    slot.id = ''
    const { container } = render(<AdSenseDisplay />)
    await new Promise((r) => setTimeout(r, 20))
    expect(container.innerHTML).toBe('')
    expect(document.querySelector('script[src*="adsbygoogle"]')).toBeNull()
  })
})
