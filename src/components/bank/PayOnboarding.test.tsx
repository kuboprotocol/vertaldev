// Cadastro único do Vertal Vibe Pay: validação no cliente, falha parcial e retry.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const payOpen = vi.fn()
const payStatus = vi.fn()

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: { email: 'titular@exemplo.com' } } }) } },
}))
vi.mock('@/lib/bank/api', () => ({
  bankApi: { payOpen: (...a: unknown[]) => payOpen(...a), payStatus: (...a: unknown[]) => payStatus(...a) },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { PayOnboarding } from './PayOnboarding'

const NOT_STARTED = { overall: 'not_started', asaas: 'none', stripe: 'none', nextStep: 'open', message: 'Abra sua conta' }

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('PayOnboarding', () => {
  beforeEach(() => {
    payOpen.mockReset()
    payStatus.mockReset().mockResolvedValue({ status: NOT_STARTED, asaas: null, stripe: null })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' }))))
  })

  it('mostra os erros dos campos e não envia dados inválidos', async () => {
    render(<PayOnboarding overview={null} onChange={() => {}} />)
    await screen.findByTestId('pay-open-form')
    fireEvent.click(screen.getByRole('button', { name: /Abrir minha conta/ }))
    expect(await screen.findByText('CPF ou CNPJ inválido')).toBeTruthy()
    expect(screen.getByText('Informe a renda ou o faturamento mensal')).toBeTruthy()
    expect(payOpen).not.toHaveBeenCalled()
  })

  it('preenche o endereço pelo CEP, envia uma vez e oferece retry na falha parcial', async () => {
    payOpen.mockResolvedValue({
      asaas: { ok: false, error: 'asaas_unavailable', message: 'O ASAAS não respondeu. Tente de novo em alguns minutos.', retryable: true },
      stripe: { ok: true, created: true, accountId: 'acct_1', onboardingUrl: 'https://connect.stripe.com/x', snapshot: {} },
      status: { overall: 'partial', asaas: 'none', stripe: 'action_required', nextStep: 'retry', message: 'Falta abrir a conta Brasil' },
      nextUrl: 'https://connect.stripe.com/x',
    })
    const onChange = vi.fn()
    render(<PayOnboarding overview={null} onChange={onChange} />)
    await screen.findByTestId('pay-open-form')
    await waitFor(() => expect((screen.getByLabelText('E-mail') as HTMLInputElement).value).toBe('titular@exemplo.com'))

    fill('CPF ou CNPJ', '52998224725')
    fill('Nome completo', 'Maria da Silva')
    fill('Data de nascimento', '1990-05-17')
    fill('Renda mensal (R$)', '5.000,00')
    fill('Celular', '11987654321')
    fill('CEP', '01310100')
    await waitFor(() => expect((screen.getByLabelText('Endereço') as HTMLInputElement).value).toBe('Avenida Paulista'))
    expect((screen.getByLabelText('Bairro') as HTMLInputElement).value).toBe('Bela Vista')
    fill('Número', '1000')

    fireEvent.click(screen.getByRole('button', { name: /Abrir minha conta/ }))
    await screen.findByTestId('pay-open-result')
    expect(payOpen).toHaveBeenCalledTimes(1)
    expect(payOpen.mock.calls[0][0]).toMatchObject({ cpfCnpj: '529.982.247-25', city: 'São Paulo', state: 'SP', mobilePhone: '(11) 98765-4321' })
    expect(screen.getByText('O ASAAS não respondeu. Tente de novo em alguns minutos.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Continuar no Stripe/ })).toBeTruthy()
    expect(onChange).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }))
    await waitFor(() => expect(payOpen).toHaveBeenCalledTimes(2))
    expect(payOpen.mock.calls[1][0]).toEqual(payOpen.mock.calls[0][0])
  })
})
