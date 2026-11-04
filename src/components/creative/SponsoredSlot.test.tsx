// Anúncio patrocinado do Painel Criativo: só Free e Starter veem (docs/PLANOS_E_ANUNCIOS.md).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const state = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  isAdmin: false,
  plan: 'free' as string | null,
  error: null as unknown,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: state.user, isAdmin: state.isAdmin }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: state.plan ? { plan: state.plan } : null,
            error: state.error,
          }),
        }),
      }),
    }),
  },
}));

import { SponsoredSlot } from './SponsoredSlot';

async function renderSlot() {
  render(<SponsoredSlot />);
  await act(async () => {});
}

describe('SponsoredSlot', () => {
  beforeEach(() => {
    state.user = { id: 'u1' };
    state.isAdmin = false;
    state.plan = 'free';
    state.error = null;
  });

  it('mostra o anúncio com o rótulo Patrocinado no plano Free', async () => {
    await renderSlot();
    expect(screen.getByText('Patrocinado')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Anúncio patrocinado' })).toBeInTheDocument();
  });

  it('mostra no Starter, que também exibe anúncio', async () => {
    state.plan = 'starter';
    await renderSlot();
    expect(screen.getByText('Patrocinado')).toBeInTheDocument();
  });

  it('não mostra em planos pagos sem anúncio', async () => {
    state.plan = 'pro';
    await renderSlot();
    expect(screen.queryByText('Patrocinado')).toBeNull();
  });

  it('não mostra para admin', async () => {
    state.isAdmin = true;
    await renderSlot();
    expect(screen.queryByText('Patrocinado')).toBeNull();
  });

  it('não mostra sem login', async () => {
    state.user = null;
    await renderSlot();
    expect(screen.queryByText('Patrocinado')).toBeNull();
  });

  it('não mostra quando a leitura do plano falha', async () => {
    state.error = new Error('network down');
    await renderSlot();
    expect(screen.queryByText('Patrocinado')).toBeNull();
  });
});
