// Galeria do Design Premium: feed de designs publicados por outras pessoas e uso como modelo.
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

import { DesignGalleryFeed } from '../creative/DesignGallery';

// Consulta encadeável: cada método devolve a própria consulta, que resolve para o resultado.
function query(result: unknown) {
  const q = Promise.resolve(result) as Promise<unknown> & Record<string, () => unknown>;
  for (const method of ['select', 'eq', 'neq', 'order', 'limit', 'update']) {
    q[method] = () => q;
  }
  return q;
}

describe('Design gallery feed', () => {
  beforeEach(() => {
    from.mockReset();
    rpc.mockReset();
  });

  it('lists published designs and opens a copy of the one that is used as a model', async () => {
    from.mockReturnValue(
      query({ data: [{ id: 'd1', name: 'Cartaz', preview_data: null, reuse_count: 3 }], error: null }),
    );
    rpc.mockResolvedValue({ data: { success: true, rewarded: true, name: 'Cartaz', snapshot: { s: 1 } }, error: null });
    const onOpenCopy = vi.fn();

    render(<DesignGalleryFeed onOpenCopy={onOpenCopy} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Usar como modelo' }));

    await waitFor(() => expect(onOpenCopy).toHaveBeenCalledWith({ name: 'Cartaz (cópia)', snapshot: { s: 1 } }));
    expect(rpc).toHaveBeenCalledWith('reuse_published_design', { _design_id: 'd1' });
  });

  it('says when nobody has published a design yet', async () => {
    from.mockReturnValue(query({ data: [], error: null }));
    render(<DesignGalleryFeed onOpenCopy={vi.fn()} />);
    expect(await screen.findByText(/Nenhum design publicado ainda/)).toBeInTheDocument();
  });
});
