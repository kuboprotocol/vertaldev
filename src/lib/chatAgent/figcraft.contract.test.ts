import { describe, expect, it } from 'vitest';
import { buildAgentSystemPrompt, parseAgentAction, PANELS, TOOL_COSTS } from './contract';

const UUID = '3f2c1a9e-7b44-4c1d-9a8e-112233445566';

describe('ação figcraft do Vertal Chat', () => {
  it('o painel figcraft existe no chat', () => {
    expect(PANELS).toContain('figcraft');
  });

  it('aceita new (com e sem modelo), open, list e run', () => {
    expect(parseAgentAction({ tool: 'figcraft', op: 'new', title: 'App da padaria', template: 'mobile-app' })).toEqual({
      tool: 'figcraft', op: 'new', title: 'App da padaria', template: 'mobile-app',
    });
    expect(parseAgentAction({ tool: 'figcraft', op: 'new', title: 'Vazio', template: 'nao-existe' })).toEqual({
      tool: 'figcraft', op: 'new', title: 'Vazio',
    });
    expect(parseAgentAction({ tool: 'figcraft', op: 'open', design_id: UUID })).toEqual({ tool: 'figcraft', op: 'open', design_id: UUID });
    expect(parseAgentAction({ tool: 'figcraft', op: 'list' })).toEqual({ tool: 'figcraft', op: 'list' });
    expect(
      parseAgentAction({ tool: 'figcraft', op: 'run', design_id: UUID, commands: [{ command: 'node.create', params: { type: 'frame' } }] }),
    ).toEqual({ tool: 'figcraft', op: 'run', design_id: UUID, commands: [{ command: 'node.create', params: { type: 'frame' } }] });
  });

  it('recusa id inválido, operação desconhecida e comandos inválidos', () => {
    expect(parseAgentAction({ tool: 'figcraft', op: 'open', design_id: 'nope' })).toBeNull();
    expect(parseAgentAction({ tool: 'figcraft', op: 'delete', design_id: UUID })).toBeNull();
    expect(parseAgentAction({ tool: 'figcraft', op: 'run', commands: [{ command: 'a b' }] })).toBeNull();
    expect(parseAgentAction({ tool: 'figcraft', op: 'new', title: '   ' })).toBeNull();
  });

  it('custo e prompt mencionam o figCraft', () => {
    expect(TOOL_COSTS.figcraft).toContain('grátis');
    const prompt = buildAgentSystemPrompt({ secretNames: [] });
    expect(prompt).toContain('"tool":"figcraft"');
  });
});
