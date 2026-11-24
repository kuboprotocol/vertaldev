import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const invoke = vi.fn()
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))

import HoneygainNodeCard from './HoneygainNodeCard'

beforeEach(() => {
  invoke.mockReset()
  invoke.mockResolvedValue({
    data: {
      daily_credits: 2,
      total_credits: 6,
      active_days: 3,
      credited_today: true,
      devices: [{ device_id: 'desk-1', platform: 'desktop', opted_in: true, running: true, last_seen_at: '2026-11-24T20:00:00Z' }],
    },
    error: null,
  })
})

describe('HoneygainNodeCard', () => {
  it('explica que usa o Honeygain SDK e o exit node', async () => {
    render(<HoneygainNodeCard desktopUrl={null} androidUrl={null} />)
    const text = screen.getByTestId('honeygain-disclosure').textContent ?? ''
    expect(text).toMatch(/Honeygain SDK/)
    expect(text).toMatch(/exit node/)
    expect(await screen.findByText('6')).toBeInTheDocument()
    expect(invoke).toHaveBeenCalledWith('honeygain-node-heartbeat?action=summary', { method: 'GET' })
  })

  it('esconde os botões de download quando as URLs não estão configuradas', async () => {
    render(<HoneygainNodeCard desktopUrl={null} androidUrl={null} />)
    await screen.findByText('6')
    expect(screen.queryByTestId('vertal-node-desktop')).toBeNull()
    expect(screen.queryByTestId('vertal-node-android')).toBeNull()
  })

  it('mostra só os downloads configurados', async () => {
    render(<HoneygainNodeCard desktopUrl="https://dl.vertal.dev/node.exe" androidUrl={null} />)
    await screen.findByText('6')
    expect(screen.getByTestId('vertal-node-desktop')).toHaveAttribute('href', 'https://dl.vertal.dev/node.exe')
    expect(screen.queryByTestId('vertal-node-android')).toBeNull()
  })
})
