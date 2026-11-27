import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const rpc = vi.fn()
const maybeSingle = vi.fn()
const authState: { user: { id: string } | null } = { user: { id: 'user-1' } }

vi.mock('@/integrations/supabase/client', () => {
  const chain = { eq: () => chain, maybeSingle: () => maybeSingle() }
  return {
    supabase: {
      rpc: (...args: unknown[]) => rpc(...args),
      from: () => ({ select: () => chain }),
    },
  }
})
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }))
vi.mock('@/lib/chatScheduler/client', () => ({ useSchedulerUiLang: () => 'pt-BR' }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import {
  BANDWIDTH_CONSENT_VERSION,
  BW_UI,
  canRunBandwidthSharing,
  DEFAULT_CONSENT,
  nextConsent,
  readLocalConsent,
} from '@/lib/bandwidthSharing'
import { BANDWIDTH_SHARING_FLAGS } from '@/config/features'
import { __resetBandwidthConsentStore } from '@/hooks/useBandwidthConsent'
import { BandwidthPromoBanner } from './BandwidthPromoBanner'
import { BandwidthConsentCard } from './BandwidthConsentCard'

beforeEach(() => {
  localStorage.clear()
  rpc.mockReset()
  maybeSingle.mockReset()
  maybeSingle.mockResolvedValue({ data: null, error: null })
  authState.user = { id: 'user-1' }
  __resetBandwidthConsentStore()
})

describe('consentimento de banda: regras', () => {
  it('SDK desligado por padrão e nada roda sem opt-in', () => {
    expect(BANDWIDTH_SHARING_FLAGS.sdk).toBe(false)
    expect(DEFAULT_CONSENT.optedIn).toBe(false)
    expect(canRunBandwidthSharing(DEFAULT_CONSENT)).toBe(false)
    expect(canRunBandwidthSharing(DEFAULT_CONSENT, true)).toBe(false)
    const accepted = nextConsent(DEFAULT_CONSENT, true, new Date('2026-11-27T12:00:00Z'))
    expect(canRunBandwidthSharing(accepted)).toBe(false) // flag do SDK ainda desligada
    expect(canRunBandwidthSharing(accepted, true)).toBe(true)
    expect(canRunBandwidthSharing(nextConsent(accepted, false), true)).toBe(false)
  })

  it('consentimento salvo para outra versão do texto não vale', () => {
    localStorage.setItem(
      'vertal.bandwidth.consent',
      JSON.stringify({ optedIn: true, version: 'old', optedInAt: '2026-01-01T00:00:00Z' }),
    )
    expect(readLocalConsent().optedIn).toBe(false)
    localStorage.setItem(
      'vertal.bandwidth.consent',
      JSON.stringify({ optedIn: true, version: BANDWIDTH_CONSENT_VERSION, optedInAt: '2026-11-27T00:00:00Z' }),
    )
    expect(readLocalConsent().optedIn).toBe(true)
  })

  it('o texto pt-BR explica parceiro, o que é e o que não é compartilhado, e que dá para desligar', () => {
    const t = BW_UI.pt
    expect(t.title).toBe('Compartilhe sua conexão ociosa e ganhe créditos extras')
    expect(t.intro).toMatch(/Pawns\.app/)
    expect(t.notShared.join(' ')).toMatch(/senhas/)
    expect(t.control).toMatch(/desligar a qualquer momento/)
    expect(BW_UI.en.title).toBeTruthy()
    expect(BW_UI.es.title).toBeTruthy()
  })
})

describe('BandwidthPromoBanner', () => {
  it('mostra o convite, abre a tela de consentimento com a chave DESLIGADA e não abre janelas', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<BandwidthPromoBanner />)
    const banner = screen.getByTestId('bandwidth-promo')
    expect(banner.textContent).toMatch(/Compartilhe sua banda e ganhe créditos/)
    expect(banner.textContent).toMatch(/Use seus créditos à vontade dentro do Vertal Dev/)
    expect(banner.querySelector('script, iframe')).toBeNull()

    fireEvent.click(screen.getByTestId('bandwidth-promo-cta'))
    const sw = await screen.findByTestId('bandwidth-consent-switch')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByTestId('bandwidth-consent-privacy').getAttribute('href')).toMatch(/^\/privacy/)
    expect(rpc).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
  })

  it('pode ser dispensado e continua dispensado', () => {
    const { unmount } = render(<BandwidthPromoBanner variant="compact" />)
    fireEvent.click(screen.getByTestId('bandwidth-promo-dismiss'))
    expect(screen.queryByTestId('bandwidth-promo')).toBeNull()
    unmount()
    render(<BandwidthPromoBanner variant="compact" />)
    expect(screen.queryByTestId('bandwidth-promo')).toBeNull()
  })
})

describe('BandwidthConsentCard', () => {
  it('liga só com o clique do usuário e grava no servidor com a versão do texto', async () => {
    rpc.mockResolvedValue({
      data: { opted_in: true, consent_version: BANDWIDTH_CONSENT_VERSION, opted_in_at: '2026-11-27T13:00:00Z', opted_out_at: null, updated_at: '2026-11-27T13:00:00Z' },
      error: null,
    })
    render(<BandwidthConsentCard />)
    const sw = screen.getByTestId('bandwidth-consent-switch')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    await act(async () => {
      fireEvent.click(sw)
    })
    expect(rpc).toHaveBeenCalledWith(
      'set_bandwidth_sharing_consent',
      expect.objectContaining({ _opted_in: true, _consent_version: BANDWIDTH_CONSENT_VERSION, _provider: 'pawns' }),
    )
    await waitFor(() => expect(screen.getByTestId('bandwidth-consent-switch').getAttribute('aria-checked')).toBe('true'))
    expect(screen.getByTestId('bandwidth-consent-no-sdk')).toBeTruthy()
  })

  it('sem a migração no servidor, guarda a escolha no navegador e avisa', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } })
    render(<BandwidthConsentCard />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('bandwidth-consent-switch'))
    })
    await waitFor(() => expect(screen.getByTestId('bandwidth-consent-local')).toBeTruthy())
    const saved = JSON.parse(localStorage.getItem('vertal.bandwidth.consent') ?? '{}')
    expect(saved).toMatchObject({ optedIn: true, pendingSync: true, userId: 'user-1' })
  })

  it('sem conta: não mostra a chave, só o botão para entrar', () => {
    authState.user = null
    render(<BandwidthConsentCard />)
    expect(screen.queryByTestId('bandwidth-consent-switch')).toBeNull()
    expect(screen.getByTestId('bandwidth-consent-signin').getAttribute('href')).toMatch(/^\/auth\?redirect=/)
  })
})
