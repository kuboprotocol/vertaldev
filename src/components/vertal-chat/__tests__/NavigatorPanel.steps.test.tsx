import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const SID = '11111111-2222-4333-8444-555555555555';
const callNavigator = vi.fn();
vi.mock('@/lib/navigator/client', () => ({ callNavigator: (...args: unknown[]) => callNavigator(...args) }));
vi.mock('../NavigatorActivity', () => ({ NavigatorActivity: () => null }));
vi.mock('../NavigatorSecurity', () => ({ NavigatorSecurity: () => null }));

describe('NavigatorPanel — "Passos do agente" sem passos da tarefa anterior', () => {
  afterEach(async () => {
    (await import('@/lib/navigator/store')).__resetNavigatorStore();
    callNavigator.mockReset();
  });

  it('limpa a lista ao iniciar nova tarefa e mostra só os passos do id da tarefa atual', async () => {
    const store = await import('@/lib/navigator/store');
    const { NavigatorPanel } = await import('../NavigatorPanel');
    let resolveTask: (v: unknown) => void = () => undefined;
    callNavigator.mockImplementation((route: string) => {
      if (route === 'task') return new Promise((r) => { resolveTask = r; });
      if (route === 'status') return Promise.resolve({ ok: true, status: 'ok', agentStatus: 'running', lastSeq: 2, events: [] });
      return Promise.resolve({ ok: true, status: 'ok' });
    });
    store.__patchNavigatorStoreForTest({
      sessionId: SID, agentStatus: 'done', lastSeq: 2,
      events: [
        { seq: 1, ts: 0, type: 'step', n: 1, runId: 'old', goal: 'passo da tarefa anterior' },
        { seq: 2, ts: 0, type: 'done', runId: 'old', success: true, result: 'resposta anterior' },
      ],
      currentTask: { id: 't-old', task: 'antiga', runId: 'old', baseSeq: 0, startedAt: 1 },
    });
    render(<NavigatorPanel />);
    expect(screen.getByText(/passo da tarefa anterior/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tarefa para o navegador'), { target: { value: 'tarefa nova' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Executar/ }));
    });
    // Tarefa saindo: nenhum passo antigo na lista.
    expect(screen.queryByText(/passo da tarefa anterior/)).not.toBeInTheDocument();

    await act(async () => {
      resolveTask({ ok: true, status: 'ok', runId: 'new' });
    });
    await act(async () => {
      store.__patchNavigatorStoreForTest({
        events: [
          ...store.getNavigatorState().events,
          { seq: 3, ts: 0, type: 'step', n: 1, runId: 'new', goal: 'passo da tarefa nova' },
        ],
      });
    });
    expect(screen.getByText(/passo da tarefa nova/)).toBeInTheDocument();
    expect(screen.queryByText(/passo da tarefa anterior/)).not.toBeInTheDocument();
  });
});
