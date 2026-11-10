import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const invoke = vi.fn()
const openTerraSmartlink = vi.fn()

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))
vi.mock('@/lib/terraAds', () => ({ openTerraSmartlink: () => openTerraSmartlink() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }))

import TerraRewardsPanel from './TerraRewardsPanel'

const base = {
  reward_per_click: 0.002,
  min_withdraw: 5,
  pending: 0,
  next_click_at: null,
  can_click: true,
  withdrawable: 0,
  can_withdraw: false,
}

beforeEach(() => {
  invoke.mockReset()
  openTerraSmartlink.mockReset()
})

describe('TerraRewardsPanel', () => {
  it('mostra a regra, o saldo pendente e a retirada bloqueada abaixo do mínimo', async () => {
    invoke.mockResolvedValue({ data: { ...base, pending: 0.004 }, error: null })
    render(<TerraRewardsPanel />)

    expect(await screen.findByTestId('terra-rewards-pending')).toHaveTextContent('0,0040')
    expect(screen.getByText(/ganhe 0,0020 crédito/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir anúncio' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Retirar' })).toBeDisabled()
    expect(invoke).toHaveBeenCalledWith('shortlinks?action=ad-status', expect.anything())
  })

  it('abre o anúncio, registra o clique e passa a mostrar a espera', async () => {
    const next = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    invoke
      .mockResolvedValueOnce({ data: base, error: null })
      .mockResolvedValueOnce({
        data: { ...base, success: true, pending: 0.002, can_click: false, next_click_at: next },
        error: null,
      })
    render(<TerraRewardsPanel />)

    await userEvent.click(await screen.findByRole('button', { name: 'Abrir anúncio' }))

    expect(openTerraSmartlink).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenLastCalledWith('shortlinks?action=ad-click', expect.anything())
    await waitFor(() => expect(screen.getByTestId('terra-rewards-pending')).toHaveTextContent('0,0020'))
    expect(screen.getByRole('button', { name: /Próximo anúncio em/ })).toBeDisabled()
  })

  it('usa o estado devolvido quando o servidor recusa por espera', async () => {
    const next = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const refused = { ...base, error: 'cooldown', pending: 0.002, can_click: false, next_click_at: next }
    invoke
      .mockResolvedValueOnce({ data: base, error: null })
      .mockResolvedValueOnce({ data: null, error: { context: { json: async () => refused } } })
    render(<TerraRewardsPanel />)

    await userEvent.click(await screen.findByRole('button', { name: 'Abrir anúncio' }))

    expect(await screen.findByRole('button', { name: /Próximo anúncio em/ })).toBeDisabled()
  })

  it('retira quando há 5 créditos ou mais e avisa a página', async () => {
    const onWithdrawn = vi.fn()
    invoke
      .mockResolvedValueOnce({
        data: { ...base, pending: 5.2, withdrawable: 5, can_withdraw: true },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ...base, success: true, credits_withdrawn: 5, pending: 0.2 },
        error: null,
      })
    render(<TerraRewardsPanel onWithdrawn={onWithdrawn} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Retirar 5 créditos' }))

    expect(invoke).toHaveBeenLastCalledWith('shortlinks?action=ad-withdraw', expect.anything())
    await waitFor(() => expect(onWithdrawn).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('terra-rewards-pending')).toHaveTextContent('0,2000')
  })

  it('oferece tentar de novo quando o carregamento falha', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error('offline') })
    render(<TerraRewardsPanel />)

    expect(await screen.findByText(/Não foi possível carregar/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })
})
