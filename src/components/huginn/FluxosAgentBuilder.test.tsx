import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { huginn, fluxos } = vi.hoisted(() => ({ huginn: vi.fn(), fluxos: vi.fn() }));
vi.mock('@/lib/huginn/client', () => ({ callHuginnOp: huginn }));
vi.mock('@/lib/fluxos/apps', () => ({ callFluxosApps: fluxos }));

import { FluxosAgentBuilder } from './FluxosAgentBuilder';

const renderIt = (onCreated = vi.fn()) =>
  render(<MemoryRouter><FluxosAgentBuilder agents={[{ id: 7, name: 'Vigia de preço' }]} onCreated={onCreated} /></MemoryRouter>);

describe('FluxosAgentBuilder', () => {
  beforeEach(() => { huginn.mockReset(); fluxos.mockReset(); });

  it('não chama nada sozinho', () => {
    renderIt();
    expect(fluxos).not.toHaveBeenCalled();
    expect(huginn).not.toHaveBeenCalled();
  });

  it('lista só apps conectados, escolhe ação e cria o agente disparado por outro agente', async () => {
    fluxos.mockResolvedValueOnce({ ok: true, message: 'ok', data: { connections: [
      { app_key: 'todoist', status: 'connected' }, { app_key: 'notion', status: 'pending' },
    ] } });
    fluxos.mockResolvedValueOnce({ ok: true, message: 'ok', data: {
      ok: true, app: { key: 'todoist', name: 'Todoist', oauth: true, supportsConnections: true }, platformClient: true, fields: [],
      actions: [{ key: 'createTask', name: 'Create task' }], searches: [{ key: 'getActiveTasks', name: 'Get active tasks' }],
      agentText: '', connection: { status: 'connected', screen_name: null, updated_at: '' },
    } });
    huginn.mockResolvedValueOnce({ ok: true, message: 'Agente criado no Vertal Agentes: "x" (id 9).' });
    const onCreated = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderIt(onCreated);
    fireEvent.click(screen.getByTestId('fluxos-agent-open'));
    await waitFor(() => expect(screen.getByLabelText('Connected app')).toBeTruthy());
    expect(screen.queryByText('Notion')).toBeNull();
    expect(screen.getByText('Formatter (no connection needed)')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Connected app'), { target: { value: 'todoist' } });
    await waitFor(() => expect(screen.getByLabelText('Action or search')).toBeTruthy());
    expect(fluxos).toHaveBeenNthCalledWith(2, { op: 'describe', app: 'todoist' });
    fireEvent.change(screen.getByLabelText('Action or search'), { target: { value: 'action:createTask' } });
    fireEvent.change(screen.getByLabelText('Parameters'), { target: { value: '{"content":"{{ title }}"}' } });
    fireEvent.click(screen.getByLabelText(/When another agent/));
    fireEvent.change(screen.getByLabelText('Agent that starts it'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /Create agent \(2 credits/ }));
    await waitFor(() => expect(huginn).toHaveBeenCalled());
    expect(huginn).toHaveBeenCalledWith({
      op: 'create_fluxos_agent', app: 'todoist', kind: 'action', key: 'createTask', parameters: { content: '{{ title }}' }, source_ids: [7],
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(document.body.textContent).not.toMatch(/railway|Huginn|Automatisch/i);
  });

  it('oferece o Formatter (sem login) mesmo sem nenhum app conectado', async () => {
    fluxos.mockResolvedValueOnce({ ok: true, message: 'ok', data: { connections: [] } });
    renderIt();
    fireEvent.click(screen.getByTestId('fluxos-agent-open'));
    await waitFor(() => expect(screen.getByLabelText('Connected app')).toBeTruthy());
    const options = Array.from((screen.getByLabelText('Connected app') as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toEqual(['', 'formatter']);
    expect(screen.getByText(/No app with a sign-in is connected/)).toBeTruthy();
  });
});
