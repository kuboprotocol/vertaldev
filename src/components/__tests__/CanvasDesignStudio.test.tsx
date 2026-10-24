// Canvas do Design Premium: biblioteca, custo de armazenamento e reuso de design publicado.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'me' } } })) },
    from,
    rpc,
  },
}));
// O tldraw é pesado para o jsdom; o editor é coberto pelo navegador, aqui só interessa o painel ao redor.
vi.mock('tldraw', () => ({ getSnapshot: vi.fn(() => ({})) }));
vi.mock('@/components/canvas/TLDrawEditor', () => ({ default: () => null }));

import { CanvasDesignStudio } from '../creative/CanvasDesignStudio';

// Consulta encadeável do Supabase. O resultado depende do filtro, como no banco:
// eq('user_id') devolve a biblioteca do usuário; eq('is_published', true) devolve a galeria.
function libraryQuery() {
  const builder: Record<string, unknown> = {};
  let result: unknown = { data: [], error: null };
  for (const method of ['select', 'eq', 'neq', 'order', 'limit', 'update', 'insert', 'delete', 'single']) {
    builder[method] = vi.fn((...args: unknown[]) => {
      if (method === 'eq' && args[0] === 'user_id') result = { data: mine, error: null };
      if (method === 'eq' && args[0] === 'is_published') result = { data: gallery, error: null };
      return builder;
    });
  }
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

const mine = [
  { id: 'd1', name: 'Capa do lançamento', is_published: true, reuse_count: 3, updated_at: '2026-10-24T10:00:00Z' },
];
const gallery = [{ id: 'g1', name: 'Banner de evento', reuse_count: 7 }];

describe('CanvasDesignStudio', () => {
  beforeEach(() => {
    from.mockReset();
    rpc.mockReset();
    from.mockImplementation(() => libraryQuery());
  });

  it('lista os designs guardados com o custo de armazenamento do dia', async () => {
    render(<CanvasDesignStudio />);

    expect(await screen.findByText('Capa do lançamento')).toBeInTheDocument();
    expect(screen.getByText('Publicado · 3 reuso(s)')).toBeInTheDocument();
    expect(screen.getByText(/1 crédito\(s\) por dia/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar na biblioteca/ })).toBeInTheDocument();
  });

  it('abre a galeria e usa um design publicado pelo reuso, com o id certo', async () => {
    rpc.mockResolvedValue({
      data: { success: true, rewarded: true, name: 'Banner de evento', snapshot: {} },
      error: null,
    });
    render(<CanvasDesignStudio />);

    fireEvent.click(await screen.findByRole('button', { name: 'Usar como modelo' }));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('reuse_published_design', { _design_id: 'g1' }));
  });
});
