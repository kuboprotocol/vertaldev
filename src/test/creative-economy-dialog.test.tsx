import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const authState = { isAdmin: false, rolesLoading: false, user: { id: 'u1' } }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }))

// Supabase falso: guarda o número de Fundador em memória.
const db: { founder: number | null; inserts: number } = { founder: null, inserts: 0 }
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.founder ? { founder_number: db.founder } : null }) }) }),
      insert: async () => { db.inserts++; db.founder = 27; return { error: null } },
    }),
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { useCreativeEconomyEntry, CreativeEconomyGate } from '@/components/creative/CreativeEconomyComingSoon'

const MESSAGE = 'O Painel de Economia Criativa está em construção, estamos criando algo poderoso pra você e por você.'

function Harness() {
  const { open, dialog } = useCreativeEconomyEntry()
  return (
    <>
      {dialog}
      <button onClick={open}>Creative Economy</button>
    </>
  )
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard" element={<Harness />} />
        <Route path="/creative" element={<CreativeEconomyGate><p>painel criativo</p></CreativeEconomyGate>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('botão Economia Criativa', () => {
  beforeEach(() => { authState.isAdmin = false; db.founder = null; db.inserts = 0 })

  it('cliente vê o aviso toda vez que clica', () => {
    renderAt('/dashboard')
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByText('Creative Economy'))
      expect(screen.getByTestId('creative-economy-coming-soon')).toBeTruthy()
      expect(screen.getAllByText('Painel de Economia Criativa em construção').length).toBeGreaterThan(0)
      expect(screen.getAllByText(MESSAGE).length).toBeGreaterThan(0)
      fireEvent.click(screen.getByText('Entendi'))
      expect(screen.queryByTestId('creative-economy-coming-soon')).toBeNull()
    }
  })

  it('cliente entra para os Fundadores e vê o número', async () => {
    renderAt('/dashboard')
    fireEvent.click(screen.getByText('Creative Economy'))
    fireEvent.click(await screen.findByText('Quero ser Fundador(a)'))
    await waitFor(() => expect(screen.getByText('Fundador(a) nº 27 da Economia Criativa')).toBeTruthy())
    expect(db.inserts).toBe(1)
  })

  it('acesso direto a /creative mostra a tela em construção', () => {
    renderAt('/creative')
    expect(screen.getByTestId('creative-economy-coming-soon-page')).toBeTruthy()
    expect(screen.queryByText('painel criativo')).toBeNull()
  })

  it('admin continua acessando o painel', () => {
    authState.isAdmin = true
    renderAt('/creative')
    expect(screen.getByText('painel criativo')).toBeTruthy()
  })
})
