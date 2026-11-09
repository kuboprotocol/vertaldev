// Banner do Vertal Notebook no dashboard: aparece e leva ao Notebook do painel criativo.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, signOut: vi.fn(), isAdmin: false, rolesLoading: false }) }))
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ subscription: null, loading: false, editsRemaining: 0 }) }))
vi.mock('@/components/dashboard/PromoCards', () => ({ PromoCards: () => null }))
vi.mock('@/components/CreditLedger', () => ({ default: () => null }))
vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {}
  const result = Promise.resolve({ data: [], error: null })
  for (const k of ['select', 'order', 'eq', 'delete', 'update']) chain[k] = () => chain
  chain.then = result.then.bind(result)
  return { supabase: { from: () => chain } }
})

import DashboardPage from '@/pages/DashboardPage'

function renderDashboard() {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/creative/notebook" element={<p>notebook aberto</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('banner Vertal Notebook no dashboard', () => {
  it('mostra o lançamento e abre o Notebook ao clicar', () => {
    renderDashboard()
    const banner = screen.getByRole('link', { name: 'Abrir o Vertal Notebook' })
    expect(banner.textContent).toContain('LANÇAMENTO')
    expect(banner.textContent).toContain('conversam com você')
    fireEvent.click(banner)
    expect(screen.getByText('notebook aberto')).toBeTruthy()
  })

  it('abre pelo teclado', () => {
    renderDashboard()
    fireEvent.keyDown(screen.getByRole('link', { name: 'Abrir o Vertal Notebook' }), { key: 'Enter' })
    expect(screen.getByText('notebook aberto')).toBeTruthy()
  })
})
