import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const invoke = vi.fn()
const navigate = vi.fn()
const agents = [{ id: 'a1', name: 'Resumo diário', instructions: 'Leia e poste.', tools: ['web_fetch', 'slack_post'], created_at: '2026-10-11' }]

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    from: () => ({
      select: () => ({ order: async () => ({ data: agents }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  },
}))
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ refetch: vi.fn() }) }))
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }))

import VibeAgentsPage from '@/pages/VibeAgentsPage'

const renderPage = () => render(<MemoryRouter><VibeAgentsPage /></MemoryRouter>)

describe('Vibe Agents page', () => {
  beforeEach(() => {
    invoke.mockReset()
    navigate.mockReset()
  })

  it('designs an agent, shows its tools and sends the user to connect what is missing', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        agent: { name: 'Resumo diário', instructions: 'Leia e poste.', tools: ['web_fetch', 'slack_post'] },
        connectors: [{ connector: 'slack', label: 'Slack', setup_route: '/connectors/slack/setup', connected: false }],
      },
      error: null,
    })
    renderPage()
    fireEvent.change(screen.getByPlaceholderText(/Todo dia/), { target: { value: 'resuma notícias e poste no slack' } })
    fireEvent.click(screen.getByRole('button', { name: /Projetar agente/ }))

    const draft = await screen.findByTestId('agent-draft')
    expect(invoke).toHaveBeenCalledWith('vibe-agents', expect.objectContaining({ body: { action: 'design', description: 'resuma notícias e poste no slack' } }))
    expect(draft).toHaveTextContent('Slack não conectado')
    expect(screen.getByRole('button', { name: /Postar no Slack/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Enviar e-mail/ })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }))
    expect(navigate).toHaveBeenCalledWith('/connectors/slack/setup')
  })

  it('runs a saved agent and shows the step timeline', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        status: 'completed',
        output: 'Postei o resumo.',
        steps: [
          { type: 'tool', agent: 'Resumo diário', tool: 'web_fetch', args: { url: 'https://example.com' }, ok: true, result: 'Olá' },
          { type: 'final', agent: 'Resumo diário', text: 'Postei o resumo.' },
        ],
      },
      error: null,
    })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Executar/ }))
    fireEvent.change(screen.getByPlaceholderText(/O que o agente deve fazer/), { target: { value: 'resuma hoje' } })
    fireEvent.click(screen.getByRole('button', { name: /Executar \(3 créditos\)/ }))

    const timeline = await screen.findByTestId('run-timeline')
    expect(timeline).toHaveTextContent('Ler páginas da web')
    expect(timeline).toHaveTextContent('Postei o resumo.')
    const [, opts] = invoke.mock.calls[0]
    expect(opts.body).toEqual({ action: 'run', agent_id: 'a1', task: 'resuma hoje' })
    expect(opts.headers['X-Idempotency-Key']).toBeTruthy()
  })

  it('shows the steps of a failed run instead of only an error', async () => {
    const steps = [{ type: 'tool', agent: 'Resumo diário', tool: 'slack_post', args: {}, ok: false, result: 'erro: slack_not_connected' }]
    invoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'non-2xx', context: { json: async () => ({ status: 'failed', output: 'step_limit_reached', steps }) } },
    })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Executar/ }))
    fireEvent.change(screen.getByPlaceholderText(/O que o agente deve fazer/), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /Executar \(3 créditos\)/ }))
    await waitFor(() => expect(screen.getByTestId('run-timeline')).toHaveTextContent('slack_not_connected'))
    expect(screen.getByTestId('run-timeline')).toHaveTextContent('Falhou')
  })
})
