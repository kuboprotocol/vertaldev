import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const invoke = vi.fn()
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))

import VertalNodeCard from './VertalNodeCard'

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
  it('explica o exit node e o consentimento com a marca Vertal, sem nomear o fornecedor do SDK', async () => {
    render(<VertalNodeCard desktopUrl={null} androidUrl={null} />)
    const text = screen.getByTestId('vertal-node-disclosure').textContent ?? ''
    expect(text).toMatch(/exit node/)
    expect(text).toMatch(/consentimento/)
    const card = screen.getByTestId('vertal-node-card').textContent ?? ''
    expect(card).toMatch(/Vertal Node/)
    expect(card).not.toMatch(/Honeygain|Cash Raven|Pawns|Bright|Infatica|EarnFM/i)
    expect(await screen.findByText('6')).toBeInTheDocument()
    expect(invoke).toHaveBeenCalledWith('vertal-node-heartbeat?action=summary', { method: 'GET' })
  })

  it('mostra dispositivos ativos e crédito do dia', async () => {
    render(<VertalNodeCard desktopUrl={null} androidUrl={null} />)
    expect(await screen.findByText(/1 dispositivo\(s\) ativo\(s\) · crédito de hoje já recebido/)).toBeInTheDocument()
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
})
