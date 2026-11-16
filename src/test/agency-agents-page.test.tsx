import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const invoke = vi.fn()
const navigate = vi.fn()
const toastError = vi.fn()

vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }))

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    from: () => ({
      select: () => ({ order: async () => ({ data: [] }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  },
}))
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }))

import AgencyAgentsPage from '@/pages/AgencyAgentsPage'
import { HIRE_PREAMBLE } from '@/lib/agencyAgents'

const renderPage = () => render(<MemoryRouter><AgencyAgentsPage /></MemoryRouter>)

/** Answers each `vibe-agents` action the way the edge function does. */
function serve(overrides: Partial<Record<string, unknown>> = {}) {
  invoke.mockImplementation(async (_fn: string, opts: { body: { action: string } }) => {
    const action = opts.body.action
    if (action === 'readiness') return { data: { connectors: [] }, error: null }
    if (action === 'save') return { data: overrides.save ?? { agent: { id: 'new-id' } }, error: null }
    if (action === 'run') {
      return {
        data: overrides.run ?? {
          status: 'completed',
          output: 'Plano pronto',
          steps: [{ type: 'final', agent: 'Frontend Developer', text: 'Plano pronto' }],
          credits_charged: 3,
        },
        error: null,
      }
    }
    return { data: null, error: null }
  })
}

describe('Agency Agents page', () => {
  beforeEach(() => {
    invoke.mockReset()
    navigate.mockReset()
    serve()
  })

  it('shows the whole roster and the team counter', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /Contrate um time inteiro/ })).toBeInTheDocument()
    expect(screen.getByText('283 especialistas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /0\/50/ })).toBeInTheDocument()
  })

  it('filters by search text, ignoring accents', () => {
    renderPage()
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar especialistas' }), { target: { value: 'frontend' } })
    expect(screen.getByRole('button', { name: 'Ver perfil de Frontend Developer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ver perfil de Anthropologist/ })).not.toBeInTheDocument()
  })

  it('filters by division and lets the user clear the filters', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Academic/ }))
    expect(screen.getByText('6 especialistas em Academic')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(screen.getByText('283 especialistas')).toBeInTheDocument()
  })

  it('shows an empty state when nothing matches', () => {
    renderPage()
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar especialistas' }), { target: { value: 'zzz-nao-existe' } })
    expect(screen.getByText('Nenhum especialista com essa busca')).toBeInTheDocument()
  })

  it('opens a profile with the full persona', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Ver perfil de Frontend Developer' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('Frontend Developer Agent Personality')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Contratar e executar' })).toBeDisabled()
  })

  it('hires the specialist with the Portuguese preamble and runs the first task', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Ver perfil de Frontend Developer' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('Frontend Developer Agent Personality')

    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Primeira tarefa para o especialista' }), { target: { value: 'Revise a página de preços' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Contratar e executar' }))

    expect(await within(dialog).findByText('Plano pronto', { selector: 'article p' })).toBeInTheDocument()

    const save = invoke.mock.calls.find(([, o]) => o.body.action === 'save')!
    expect(save[1].body).toEqual(expect.objectContaining({ name: 'Frontend Developer', tools: ['web_fetch'] }))
    expect(save[1].body.instructions.startsWith(HIRE_PREAMBLE)).toBe(true)

    const run = invoke.mock.calls.find(([, o]) => o.body.action === 'run')!
    expect(run[1].body).toEqual({ action: 'run', agent_id: 'new-id', task: 'Revise a página de preços' })
    expect(run[1].headers['X-Idempotency-Key']).toBeTruthy()

    expect(within(dialog).getByText('Custo desta execução: 3 créditos')).toBeInTheDocument()
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Executar tarefa' })).toBeInTheDocument())
  })

  it('explains in Portuguese when the team is full', async () => {
    invoke.mockImplementation(async (_fn: string, opts: { body: { action: string } }) =>
      opts.body.action === 'readiness' ? { data: { connectors: [] }, error: null } : { data: null, error: { message: 'agent_limit_reached' } })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Ver perfil de Frontend Developer' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Primeira tarefa para o especialista' }), { target: { value: 'Teste' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Contratar e executar' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Você chegou ao limite de agentes. Apague algum para criar outro.'))
  })
})
