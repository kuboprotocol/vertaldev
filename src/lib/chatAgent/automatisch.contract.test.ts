import { describe, expect, it } from 'vitest';
import { TOOL_COSTS, buildAgentSystemPrompt, parseAgentAction, parseAgentTurn } from './contract';
import { AGENT_PROMPT_BUDGET } from '../../../supabase/functions/_shared/chatAgent';

const FLOW = '11111111-1111-4111-8111-111111111111';

describe('Automatisch no contrato do chat', () => {
  it('valida a ação e descarta operações perigosas ou mal formadas', () => {
    expect(parseAgentAction({ tool: 'automatisch', op: 'set_flow_status', flow_id: FLOW, active: true }))
      .toEqual({ tool: 'automatisch', op: 'set_flow_status', flow_id: FLOW, active: true });
    expect(parseAgentAction({ tool: 'automatisch', op: 'list_flows' })).toEqual({ tool: 'automatisch', op: 'list_flows' });
    expect(parseAgentAction({ tool: 'automatisch', op: 'delete_flow', flow_id: FLOW })).toBeNull();
    expect(parseAgentAction({ tool: 'automatisch', op: 'get_flow', flow_id: 'abc' })).toBeNull();
    // Nada de senha/token no pedido: campos desconhecidos são descartados.
    expect(parseAgentAction({ tool: 'automatisch', op: 'list_flows', password: 'x', token: 'y' })).toEqual({ tool: 'automatisch', op: 'list_flows' });
  });

  it('a ação chega pelo turno do modelo', () => {
    const turn = parseAgentTurn(JSON.stringify({ reply: 'Vou listar.', actions: [{ tool: 'automatisch', op: 'list_executions', status: 'failure' }] }));
    expect(turn.actions).toEqual([{ tool: 'automatisch', op: 'list_executions', status: 'failure' }]);
  });

  it('custo informado e aprovação a cada chamada', () => {
    expect(TOOL_COSTS.automatisch).toContain('aprova cada chamada');
  });

  it('só entra no prompt quando ligada; cita os segredos do Cofre, nunca valores', () => {
    const base = buildAgentSystemPrompt({ secretNames: [] });
    expect(base).not.toContain('"tool":"automatisch"');
    const on = buildAgentSystemPrompt({ secretNames: [], automatisch: true });
    expect(on).toContain('{"tool":"automatisch","op":"list_flows|get_flow|create_flow');
    expect(on).toContain('AUTOMATISCH_URL, AUTOMATISCH_EMAIL, AUTOMATISCH_PASSWORD');
    expect(on).toContain('nunca peça e-mail, senha ou token no chat');
    expect(on).toContain('create_flow (vem com gatilho e ação vazios)');
  });

  it('com tudo ligado cabe no orçamento; ao cortar, automatisch fica e youtube sai primeiro', () => {
    const medium = buildAgentSystemPrompt({
      navigator: true, github: true, media: true, automatisch: true, secretNames: [], localNow: 'agora',
      memories: 'x'.repeat(1_200), summary: 'z'.repeat(1_200),
    });
    expect(medium.length).toBeLessThanOrEqual(AGENT_PROMPT_BUDGET);
    expect(medium).toContain('"tool":"automatisch"');

    const heavy = buildAgentSystemPrompt({
      navigator: true, browserForm: true, github: true, media: true, automatisch: true,
      secretNames: Array.from({ length: 60 }, (_, i) => `SEGREDO_${i}`),
      localNow: 'agora', memories: 'x'.repeat(2_500), recall: 'y'.repeat(700), summary: 'z'.repeat(2_400), plan: 'p'.repeat(2_500),
    });
    expect(heavy.length).toBeLessThan(26_000);
    if (heavy.includes('"tool":"youtube"')) expect(heavy).toContain('"tool":"automatisch"');
  });
});
