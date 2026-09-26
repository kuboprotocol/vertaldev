import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const authState = { isAdmin: false, rolesLoading: false }
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }))

import { useCreativeEconomyEntry, CreativeEconomyGate } from '@/components/creative/CreativeEconomyComingSoon'

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
  beforeEach(() => { authState.isAdmin = false })

  it('cliente vê o aviso toda vez que clica', () => {
    renderAt('/dashboard')
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByText('Creative Economy'))
      expect(screen.getByTestId('creative-economy-coming-soon')).toBeTruthy()
      expect(screen.getAllByText('Economia Criativa em Construção').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Estamos construindo um ecossistema poderoso pra você e por você.').length).toBeGreaterThan(0)
      fireEvent.click(screen.getByText('Entendi'))
      expect(screen.queryByTestId('creative-economy-coming-soon')).toBeNull()
    }
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
