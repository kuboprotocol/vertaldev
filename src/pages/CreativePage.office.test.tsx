import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreativePage from './CreativePage';

const { STABLE_USER } = vi.hoisted(() => ({ STABLE_USER: { id: 'u1', email: 'u@vertal.dev' } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: STABLE_USER }) }));
vi.mock('@/components/ChatWidget', () => ({ default: () => null }));
vi.mock('heic2any', () => ({ default: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => {
  const result = { data: [], error: null, count: 0 };
  const chain: any = new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? (res: any) => res(result) : chain),
    apply: () => chain,
  });
  return { supabase: { from: () => chain, rpc: () => Promise.resolve({ data: null, error: null }), functions: { invoke: () => Promise.resolve({ data: null, error: null }) }, auth: { getSession: () => Promise.resolve({ data: { session: null } }), getUser: () => Promise.resolve({ data: { user: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) }, channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: () => {} } };
});
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ subscription: null, editsRemaining: 5, refetch: () => {} }) }));


describe('CreativePage · rota /creative/office', () => {
  it('abre o Vertal Office sem erro', () => {
    render(
      <MemoryRouter initialEntries={['/creative/office']}>
        <Routes><Route path="/creative/:tool" element={<CreativePage />} /></Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Vertal Office', { selector: 'h2' })).toBeTruthy();
  });
});
