import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const invoke = vi.fn()

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))
vi.mock('@/lib/terraAds', () => ({
  TERRA_ADS_NATIVE_BANNER_ID: 'container-test',
  TERRA_ADS_NATIVE_BANNER_SRC: 'https://ads.example.test/invoke.js',
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }))

import TerraRewardsPanel, { TERRA_FILL_TIMEOUT_SECONDS } from './TerraRewardsPanel'

const base = {
  reward_per_click: 0.002,
  min_withdraw: 5,
  pending: 0,
  next_click_at: null,
  can_click: true,
  withdrawable: 0,
  can_withdraw: false,
}

let openSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  invoke.mockReset()
  openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
})

afterEach(() => {
  openSpy.mockRestore()
})

describe('TerraRewardsPanel', () => {
  it('mostra o anúncio embutido e a recompensa bloqueada até assistir', async () => {
    invoke.mockResolvedValue({ data: { ...base, pending: 0.004 }, error: null })
    render(<TerraRewardsPanel />)

    expect(await screen.findByTestId('terra-rewards-pending')).toHaveTextContent('0,0040')
    expect(screen.getByTestId('terra-watch-ad')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Assista ao anúncio para receber' })).toBeDisabled()
    expect(screen.getByText(/Assista ao anúncio por 10 segundos/)).toBeInTheDocument()
    expect(invoke).toHaveBeenCalledWith('shortlinks?action=ad-status', expect.anything())
  })

  it('carrega o script do anúncio dentro do painel e nunca abre aba nova', async () => {
    invoke.mockResolvedValue({ data: base, error: null })
    const { container } = render(<TerraRewardsPanel />)

    await screen.findByTestId('terra-watch-ad')
    // O script entra num efeito depois da pintura: espera ele aparecer em vez de checar na hora.
    const script = await waitFor(() => {
      const found = container.querySelector('script[src="https://ads.example.test/invoke.js"]')
      expect(found).not.toBeNull()
      return found as HTMLScriptElement
    })
    expect(script?.closest('[data-testid="terra-watch-ad"]')).not.toBeNull()
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('não registra clique enquanto o anúncio não foi assistido', async () => {
    invoke.mockResolvedValue({ data: base, error: null })
    render(<TerraRewardsPanel />)

    const button = await screen.findByRole('button', { name: 'Assista ao anúncio para receber' })
    await userEvent.click(button)

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).not.toHaveBeenCalledWith('shortlinks?action=ad-click', expect.anything())
  })

  it('mostra a espera de 1 hora quando já recebeu há pouco', async () => {
    const next = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    invoke.mockResolvedValue({ data: { ...base, pending: 0.002, can_click: false, next_click_at: next }, error: null })
    render(<TerraRewardsPanel />)

    expect(await screen.findByRole('button', { name: /Próximo anúncio em/ })).toBeDisabled()
    expect(screen.queryByTestId('terra-watch-ad')).not.toBeInTheDocument()
  })

  it('retira quando há 5 créditos ou mais e avisa a página', async () => {
    const onWithdrawn = vi.fn()
    invoke
      .mockResolvedValueOnce({ data: { ...base, pending: 5.2, withdrawable: 5, can_withdraw: true }, error: null })
      .mockResolvedValueOnce({ data: { ...base, success: true, credits_withdrawn: 5, pending: 0.2 }, error: null })
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

  it('anúncio recusado (erro no script): mostra a alternativa do vídeo extra e registra no servidor', async () => {
    const onUnavailable = vi.fn()
    const checklist = { terra_done: false, terra_unavailable: true, completed: false }
    invoke.mockImplementation((name: string) =>
      Promise.resolve(
        name.startsWith('daily-rewards')
          ? { data: { ok: true, first_report_today: true, checklist }, error: null }
          : { data: base, error: null },
      ),
    )
    const { container } = render(<TerraRewardsPanel onUnavailable={onUnavailable} />)

    const script = await waitFor(() => {
      const found = container.querySelector('script[src="https://ads.example.test/invoke.js"]')
      expect(found).not.toBeNull()
      return found as HTMLScriptElement
    })
    script.dispatchEvent(new Event('error'))

    expect(await screen.findByTestId('terra-unavailable')).toHaveTextContent(
      'Anúncio TERRA indisponível — assista mais 1 vídeo para completar',
    )
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'daily-rewards?action=terra-unavailable',
        expect.objectContaining({ body: expect.objectContaining({ reason: 'script_error' }) }),
      ),
    )
    await waitFor(() => expect(onUnavailable).toHaveBeenCalledWith(checklist))
    expect(screen.queryByRole('button', { name: 'Assista ao anúncio para receber' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar carregar o anúncio de novo' })).toBeInTheDocument()
  })

  it(`sem anúncio em ${TERRA_FILL_TIMEOUT_SECONDS} s: trata como indisponível (no fill)`, async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      invoke.mockImplementation((name: string) =>
        Promise.resolve(
          name.startsWith('daily-rewards')
            ? { data: { ok: true, first_report_today: true }, error: null }
            : { data: base, error: null },
        ),
      )
      render(<TerraRewardsPanel />)
      await screen.findByTestId('terra-watch-ad')
      expect(screen.queryByTestId('terra-unavailable')).not.toBeInTheDocument()

      await vi.advanceTimersByTimeAsync(TERRA_FILL_TIMEOUT_SECONDS * 1000 + 100)

      expect(await screen.findByTestId('terra-unavailable')).toBeInTheDocument()
      expect(invoke).toHaveBeenCalledWith(
        'daily-rewards?action=terra-unavailable',
        expect.objectContaining({ body: expect.objectContaining({ reason: 'no_fill_timeout' }) }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('anúncio preenchido a tempo não dispara a alternativa', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      invoke.mockResolvedValue({ data: base, error: null })
      const { container } = render(<TerraRewardsPanel />)
      await screen.findByTestId('terra-watch-ad')
      const slot = container.querySelector('#container-test') as HTMLElement
      slot.appendChild(document.createElement('div'))

      await vi.advanceTimersByTimeAsync(TERRA_FILL_TIMEOUT_SECONDS * 1000 + 100)

      expect(screen.queryByTestId('terra-unavailable')).not.toBeInTheDocument()
      expect(invoke).not.toHaveBeenCalledWith('daily-rewards?action=terra-unavailable', expect.anything())
    } finally {
      vi.useRealTimers()
    }
  })
})
