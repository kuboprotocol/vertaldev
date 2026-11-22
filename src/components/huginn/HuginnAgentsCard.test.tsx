import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/huginn/client', () => ({ callHuginnOp: call }));

import { HuginnAgentsCard } from './HuginnAgentsCard';

const renderCard = () => render(<MemoryRouter><HuginnAgentsCard /></MemoryRouter>);

describe('HuginnAgentsCard', () => {
  beforeEach(() => call.mockReset());

  it('não chama o Huginn sozinho', () => {
    renderCard();
    expect(call).not.toHaveBeenCalled();
    expect(screen.getByText(/só fala com o seu Vertal Agentes quando você clica/)).toBeTruthy();
  });

  it('ao clicar mostra status, agentes e o link da instância', async () => {
    call.mockResolvedValueOnce({ ok: true, message: 'ok', data: { instance_url: 'https://h.up.railway.app', pending: 2, recent_failures: 0 } });
    call.mockResolvedValueOnce({ ok: true, message: 'ok', data: { instance_url: 'https://h.up.railway.app', agents: [{ id: 3, name: 'XKCD Source', type: 'WebsiteAgent', enabled: true, events: 4 }] } });
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Ver meus agentes/ }));
    await waitFor(() => expect(screen.getByText('XKCD Source')).toBeTruthy());
    expect(call).toHaveBeenNthCalledWith(1, { op: 'status' });
    expect(call).toHaveBeenNthCalledWith(2, { op: 'list_agents' });
    expect(screen.getByText('conectado')).toBeTruthy();
    expect(screen.getByText('XKCD Source').closest('a')?.getAttribute('href')).toBe('https://h.up.railway.app/agents/3');
    expect(screen.getByText(/2 pendente/)).toBeTruthy();
    // Marca branca: botão com rótulo genérico, sem o endereço da instância nem nomes de fornecedores.
    expect(screen.getByRole('button', { name: /Abrir Vertal Agentes/ })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/railway|Huginn|Automatisch/i);
  });

  it('sem segredos leva ao Cofre', async () => {
    call.mockResolvedValueOnce({ ok: false, code: 'missing_secrets', message: 'Falta salvar no Cofre de segredos: HUGINN_URL.' });
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Ver meus agentes/ }));
    await waitFor(() => expect(screen.getByText(/Configurar no Cofre/)).toBeTruthy());
    expect(screen.getByText('não configurado')).toBeTruthy();
  });
});
