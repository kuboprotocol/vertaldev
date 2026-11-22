import { describe, expect, it } from 'vitest';
import { TOOL_COSTS, buildAgentSystemPrompt, parseAgentAction, parseAgentTurn } from './contract';
import { AGENT_PROMPT_BUDGET } from '../../../supabase/functions/_shared/chatAgent';

const FLOW = '11111111-1111-4111-8111-111111111111';

describe('Huginn no contrato do chat', () => {
  it('valida a ação e descarta o que é perigoso', () => {
    expect(parseAgentAction({ tool: 'huginn', op: 'list_agents' })).toEqual({ tool: 'huginn', op: 'list_agents' });
    expect(parseAgentAction({ tool: 'huginn', op: 'connect_to_automatisch', source_agent_id: 4, flow_id: FLOW }))
      .toEqual({ tool: 'huginn', op: 'connect_to_automatisch', source_agent_id: 4, flow_id: FLOW });
    expect(parseAgentAction({ tool: 'huginn', op: 'create_agent', type: 'ShellCommandAgent', name: 'x', options: {} })).toBeNull();
    expect(parseAgentAction({ tool: 'huginn', op: 'list_agents', password: 'x' })).toEqual({ tool: 'huginn', op: 'list_agents' });
  });

  it('a ação chega pelo turno do modelo', () => {
    const turn = parseAgentTurn(JSON.stringify({ reply: 'Vou rodar.', actions: [{ tool: 'huginn', op: 'run_agent', agent_id: 5 }] }));
    expect(turn.actions).toEqual([{ tool: 'huginn', op: 'run_agent', agent_id: 5 }]);
  });

  it('só entra no prompt quando ligada; cita segredos, nunca valores', () => {
    expect(TOOL_COSTS.huginn).toContain('aprova cada chamada');
    expect(buildAgentSystemPrompt({ secretNames: [] })).not.toContain('"tool":"huginn"');
    const on = buildAgentSystemPrompt({ secretNames: [], huginn: true });
    expect(on).toContain('"tool":"huginn","op":"status|list_agents');
    expect(on).toContain('HUGINN_URL, HUGINN_USERNAME, HUGINN_PASSWORD');
    expect(on).toContain('connect_to_automatisch (source_agent_id, flow_id');
  });

  it('com tudo ligado cabe no orçamento; ao cortar, huginn fica', () => {
    const medium = buildAgentSystemPrompt({
      navigator: true, github: true, media: true, automatisch: true, huginn: true, secretNames: [], localNow: 'agora',
      memories: 'x'.repeat(1_200), summary: 'z'.repeat(1_200),
    });
    expect(medium.length).toBeLessThanOrEqual(AGENT_PROMPT_BUDGET);
    expect(medium).toContain('"tool":"huginn"');
    expect(medium).toContain('"tool":"automatisch"');

    const heavy = buildAgentSystemPrompt({
      navigator: true, browserForm: true, github: true, media: true, automatisch: true, huginn: true,
      secretNames: Array.from({ length: 60 }, (_, i) => `SEGREDO_${i}`),
      localNow: 'agora', memories: 'x'.repeat(2_500), recall: 'y'.repeat(700), summary: 'z'.repeat(2_400), plan: 'p'.repeat(2_500),
    });
    expect(heavy.length).toBeLessThan(26_500);
    if (heavy.includes('"tool":"automatisch"')) expect(heavy).toContain('"tool":"huginn"');
    if (heavy.includes('"tool":"youtube"')) expect(heavy).toContain('"tool":"huginn"');
  });
});
