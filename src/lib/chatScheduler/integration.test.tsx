import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { buildAgentSystemPrompt, parseAgentAction, parseAgentTurn, TOOL_COSTS } from '@/lib/chatAgent/contract';

const calls: Array<{ action: string; payload: Record<string, unknown> }> = [];
vi.mock('./client', async (orig) => {
  const real = await orig<typeof import('./client')>();
  return {
    ...real,
    callScheduler: vi.fn(async (action: string, payload: Record<string, unknown> = {}) => {
      calls.push({ action, payload });
      if (action === 'preview') return { ok: true, data: { summary: ['Lembrete: Pagar boleto', 'Quando: uma vez, qui. 26/11 às 09:00'], warnings: [] } };
      if (action === 'create') return { ok: true, data: { task: { id: '11111111-1111-1111-1111-111111111111' }, summary: ['Lembrete: Pagar boleto'] } };
      if (action === 'list') return { ok: true, data: { tasks: [] } };
      return { ok: true, data: {} };
    }),
  };
});

import { runScheduler } from './runScheduler';
import { SchedulerEntryButton } from '@/components/vertal-chat/scheduler/SchedulerEntryButton';

describe('contrato no chat (flag ligada)', () => {
  it('a ferramenta e as regras só entram com ctx.scheduler', () => {
    const on = buildAgentSystemPrompt({ secretNames: [], scheduler: true });
    expect(on).toContain('"tool":"agendador"');
    expect(on).toContain('Tarefas agendadas:');
    expect(buildAgentSystemPrompt({ secretNames: [] })).not.toContain('agendador');
    expect(TOOL_COSTS.agendador).toContain('grátis');
  });
  it('parseAgentAction/parseAgentTurn aceitam agendador', () => {
    expect(parseAgentAction({ tool: 'agendador', op: 'create', kind: 'reminder', title: 'Pagar boleto', when: 'amanhã às 9h' }))
      .toMatchObject({ tool: 'agendador', op: 'create', kind: 'reminder' });
    const turn = parseAgentTurn(JSON.stringify({ reply: 'ok', actions: [{ tool: 'agendador', op: 'list' }] }));
    expect(turn.actions).toEqual([{ tool: 'agendador', op: 'list' }]);
  });
});

describe('runScheduler', () => {
  beforeEach(() => { calls.length = 0; });
  const action = { tool: 'agendador' as const, op: 'create' as const, kind: 'reminder' as const, title: 'Pagar boleto', when: 'amanhã às 9h' };

  it('cria só depois do cartão de confirmação', async () => {
    const approveApi = vi.fn(async () => true);
    const r = await runScheduler(action, { approveApi, chatConversationId: 'c1' });
    expect(approveApi).toHaveBeenCalledOnce();
    expect(approveApi.mock.calls[0][0]).toMatchObject({ method: 'TAREFA AGENDADA' });
    expect(calls.map((c) => c.action)).toEqual(['preview', 'create']);
    expect(calls[1].payload).toMatchObject({ conversation_id: 'c1' });
    expect(r.result.ok).toBe(true);
  });

  it('sem confirmação, nada é criado', async () => {
    const r = await runScheduler(action, { approveApi: async () => false });
    expect(calls.map((c) => c.action)).toEqual(['preview']);
    expect(r.result.ok).toBe(false);
  });

  it('mudança de permissão no update pede confirmação', async () => {
    const approveApi = vi.fn(async () => false);
    await runScheduler({ tool: 'agendador', op: 'update', name: 'x', changes: { send_to: ['a@b.com'] } }, { approveApi });
    expect(approveApi).toHaveBeenCalledOnce();
    expect(calls).toHaveLength(0);
  });
});

describe('botão no chat', () => {
  it('não renderiza nada com a flag desligada', () => {
    const { container } = render(<SchedulerEntryButton enabledOverride={false} />);
    expect(container.innerHTML).toBe('');
  });
});
