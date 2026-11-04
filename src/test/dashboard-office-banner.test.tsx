// Banner do Vertal Office grátis no dashboard: aparece e leva ao Office do painel criativo.
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

describe('banner Vertal Office no dashboard', () => {
  it('mostra o banner grátis e abre o Office ao clicar', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/creative/office" element={<p>office aberto</p>} />
        </Routes>
      </MemoryRouter>,
    )
    const banner = screen.getByRole('link', { name: 'Abrir o Vertal Office grátis' })
    expect(banner.textContent).toContain('GRÁTIS')
    expect(banner.textContent).toContain('sem pagar nada')
    fireEvent.click(banner)
    expect(screen.getByText('office aberto')).toBeTruthy()
  })
})
