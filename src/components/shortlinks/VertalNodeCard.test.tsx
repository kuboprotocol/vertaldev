import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const invoke = vi.fn()
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))

import VertalNodeCard from './VertalNodeCard'
import { DEFAULT_VERTAL_NODE_ANDROID_URL, VERTAL_NODE_CONSENT_VERSION } from '@/lib/vertalNode'

beforeEach(() => {
  invoke.mockReset()
  invoke.mockResolvedValue({
    data: {
      daily_credits: 2,
      total_credits: 6,
      active_days: 3,
      credited_today: true,
      devices: [
        { device_id: 'desk-1', platform: 'desktop', provider: 'cashraven', opted_in: true, running: true, last_seen_at: '2026-11-24T20:00:00Z' },
      ],
    },
    error: null,
  })
})

describe('VertalNodeCard', () => {
  it('explica o exit node e o consentimento só com a marca Vertal (sem nome de fornecedor)', async () => {
    render(<VertalNodeCard desktopUrl={null} androidUrl={null} partner={null} />)
    const text = screen.getByTestId('vertal-node-disclosure').textContent ?? ''
    expect(text).toMatch(/exit node/)
    expect(text).toMatch(/consent/)
    const card = screen.getByTestId('vertal-node-card').textContent ?? ''
    expect(card).toMatch(/Vertal Node/)
    expect(card).not.toMatch(/Honeygain|Cash Raven|Pawns|Bright|Infatica|EarnFM/i)
    expect(screen.queryByTestId('vertal-node-partner')).toBeNull()
    expect(await screen.findByText('6')).toBeInTheDocument()
    expect(invoke).toHaveBeenCalledWith('vertal-node-heartbeat?action=summary', { method: 'GET' })
  })

  it('rodapé de parceiro escondido por padrão (VITE_VERTAL_NODE_PARTNER vazio)', async () => {
    vi.stubEnv('VITE_VERTAL_NODE_PARTNER', '')
    render(<VertalNodeCard desktopUrl={null} androidUrl={null} />)
    await screen.findByText('6')
    expect(screen.queryByTestId('vertal-node-partner')).toBeNull()
    vi.unstubAllEnvs()
  })

  it('rodapé discreto "Parceiro: …" vem de VITE_VERTAL_NODE_PARTNER', async () => {
    vi.stubEnv('VITE_VERTAL_NODE_PARTNER', '  Cash Raven ')
    render(<VertalNodeCard desktopUrl={null} androidUrl={null} />)
    await screen.findByText('6')
    const footer = screen.getByTestId('vertal-node-partner')
    expect(footer).toHaveTextContent('Partner: Cash Raven')
    expect(footer.className).toMatch(/text-\[10px\]/)
    expect(footer.className).toMatch(/text-muted-foreground\/60/)
    vi.unstubAllEnvs()
  })

  it('mostra dispositivos ativos e crédito do dia', async () => {
    render(<VertalNodeCard desktopUrl={null} androidUrl={null} />)
    expect(await screen.findByText(/1 active device\(s\) · today's credit received/)).toBeInTheDocument()
  })

  it('Android sem VITE_VERTAL_NODE_ANDROID_URL usa o APK da última pré-release', async () => {
    render(<VertalNodeCard desktopUrl={null} />)
    await screen.findByText('6')
    expect(screen.getByTestId('vertal-node-android')).toHaveAttribute('href', DEFAULT_VERTAL_NODE_ANDROID_URL)
    expect(screen.getByTestId('vertal-node-accept')).toHaveTextContent('Accept & activate')
  })

  it('esconde os botões de download quando as URLs não estão configuradas', async () => {
    render(<VertalNodeCard desktopUrl={null} androidUrl={null} />)
    await screen.findByText('6')
    expect(screen.queryByTestId('vertal-node-desktop')).toBeNull()
    expect(screen.queryByTestId('vertal-node-android')).toBeNull()
  })

  it('mostra só os downloads configurados', async () => {
    render(<VertalNodeCard desktopUrl="https://dl.vertal.dev/node.exe" androidUrl={null} />)
    await screen.findByText('6')
    expect(screen.getByTestId('vertal-node-desktop')).toHaveAttribute('href', 'https://dl.vertal.dev/node.exe')
    expect(screen.queryByTestId('vertal-node-android')).toBeNull()
  })

  describe('Accept & activate', () => {
    function mockConsentOk() {
      invoke.mockImplementation((name: string) =>
        Promise.resolve(
          name.includes('action=consent')
            ? { data: { ok: true, consent: { accepted: true, consent_version: VERTAL_NODE_CONSENT_VERSION, at: 'now' } }, error: null }
            : { data: { daily_credits: 2, total_credits: 0, active_days: 0, credited_today: false, devices: [], consent: null }, error: null },
        ),
      )
    }

    it('mostra o consentimento antes de gravar e Not now fecha sem gravar', async () => {
      mockConsentOk()
      const openUrl = vi.fn()
      render(<VertalNodeCard desktopUrl={null} androidUrl={null} platform="android" openUrl={openUrl} />)
      fireEvent.click(await screen.findByTestId('vertal-node-accept'))
      const consent = screen.getByTestId('vertal-node-consent').textContent ?? ''
      expect(consent).toMatch(/exit node/)
      expect(consent).toMatch(/turn it off at any time/)
      expect(consent).toMatch(/LGPD/)
      fireEvent.click(screen.getByTestId('vertal-node-cancel'))
      expect(screen.queryByTestId('vertal-node-consent')).toBeNull()
      expect(invoke).not.toHaveBeenCalledWith('vertal-node-heartbeat?action=consent', expect.anything())
      expect(openUrl).not.toHaveBeenCalled()
    })

    it('Android: grava o aceite e abre vertalnode://open com fallback para o APK', async () => {
      mockConsentOk()
      const openUrl = vi.fn()
      render(<VertalNodeCard desktopUrl={null} androidUrl="https://dl.vertal.dev/node.apk" platform="android" openUrl={openUrl} />)
      fireEvent.click(await screen.findByTestId('vertal-node-accept'))
      fireEvent.click(screen.getByTestId('vertal-node-confirm'))
      await waitFor(() => expect(openUrl).toHaveBeenCalledTimes(1))
      expect(invoke).toHaveBeenCalledWith('vertal-node-heartbeat?action=consent', {
        method: 'POST',
        body: { action: 'consent', accept: true, consent_version: VERTAL_NODE_CONSENT_VERSION, platform: 'android' },
      })
      const url = openUrl.mock.calls[0][0] as string
      expect(url).toMatch(/^intent:\/\/open\?source=recompensas#Intent;scheme=vertalnode;package=dev\.vertal\.node;/)
      expect(url).toContain(`S.browser_fallback_url=${encodeURIComponent('https://dl.vertal.dev/node.apk')};end`)
      expect(await screen.findByTestId('vertal-node-accepted')).toBeInTheDocument()
      expect(screen.getByTestId('vertal-node-accept')).toHaveTextContent('Open Vertal Node')
    })

    it('computador: baixa o agente quando há URL', async () => {
      mockConsentOk()
      const openUrl = vi.fn()
      render(<VertalNodeCard desktopUrl="https://dl.vertal.dev/node.exe" platform="desktop" openUrl={openUrl} />)
      fireEvent.click(await screen.findByTestId('vertal-node-accept'))
      fireEvent.click(screen.getByTestId('vertal-node-confirm'))
      await waitFor(() => expect(openUrl).toHaveBeenCalledWith('https://dl.vertal.dev/node.exe'))
    })

    it('computador sem download publicado: avisa e não navega', async () => {
      mockConsentOk()
      const openUrl = vi.fn()
      render(<VertalNodeCard desktopUrl={null} platform="desktop" openUrl={openUrl} />)
      fireEvent.click(await screen.findByTestId('vertal-node-accept'))
      fireEvent.click(screen.getByTestId('vertal-node-confirm'))
      expect(await screen.findByTestId('vertal-node-notice')).toHaveTextContent(/isn't available for download yet/)
      expect(openUrl).not.toHaveBeenCalled()
    })

    it('iPhone: "not available yet"', async () => {
      mockConsentOk()
      const openUrl = vi.fn()
      render(<VertalNodeCard platform="ios" openUrl={openUrl} />)
      fireEvent.click(await screen.findByTestId('vertal-node-accept'))
      fireEvent.click(screen.getByTestId('vertal-node-confirm'))
      expect(await screen.findByTestId('vertal-node-notice')).toHaveTextContent(/isn't available for iPhone/)
      expect(openUrl).not.toHaveBeenCalled()
    })

    it('sem login (401): pede para entrar e não abre o app', async () => {
      invoke.mockImplementation((name: string) =>
        Promise.resolve(
          name.includes('action=consent')
            ? { data: null, error: { message: 'unauthorized', context: new Response('{}', { status: 401 }) } }
            : { data: null, error: { message: 'unauthorized', context: new Response('{}', { status: 401 }) } },
        ),
      )
      const openUrl = vi.fn()
      render(<VertalNodeCard platform="android" openUrl={openUrl} />)
      fireEvent.click(screen.getByTestId('vertal-node-accept'))
      fireEvent.click(screen.getByTestId('vertal-node-confirm'))
      expect(await screen.findByTestId('vertal-node-notice')).toHaveTextContent('Sign in to activate Vertal Node.')
      expect(openUrl).not.toHaveBeenCalled()
    })

    it('aceite já registrado: o botão vira "Open Vertal Node" e abre direto', async () => {
      invoke.mockResolvedValue({
        data: { daily_credits: 2, total_credits: 0, active_days: 0, credited_today: false, devices: [], consent: { accepted: true, consent_version: 'x', at: 'y' } },
        error: null,
      })
      const openUrl = vi.fn()
      render(<VertalNodeCard platform="android" openUrl={openUrl} />)
      const btn = await screen.findByText('Open Vertal Node')
      fireEvent.click(btn)
      expect(openUrl).toHaveBeenCalledTimes(1)
      expect(screen.queryByTestId('vertal-node-consent')).toBeNull()
    })
  })
})
