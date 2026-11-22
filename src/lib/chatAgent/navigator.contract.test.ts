import { describe, expect, it } from 'vitest';
import { PANELS, TOOL_COSTS, buildAgentSystemPrompt, parseAgentAction, parseAgentTurn } from './contract';
import { NAVIGATOR_VIBE_COMMAND, parseVibeNavigatorCommand } from './vibeBridge';

describe('ferramenta navigator no contrato do chat', () => {
  it('valida run/open/stop e normaliza a URL', () => {
    expect(parseAgentAction({ tool: 'navigator', op: 'run', task: 'entre no GitHub e conte as notificações', url: 'https://github.com' }))
      .toEqual({ tool: 'navigator', op: 'run', task: 'entre no GitHub e conte as notificações', url: 'https://github.com/' });
    expect(parseAgentAction({ tool: 'navigator', task: 'pesquise o preço' })).toEqual({ tool: 'navigator', op: 'run', task: 'pesquise o preço' });
    expect(parseAgentAction({ tool: 'navigator', op: 'open' })).toEqual({ tool: 'navigator', op: 'open' });
    expect(parseAgentAction({ tool: 'navigator', op: 'stop' })).toEqual({ tool: 'navigator', op: 'stop' });
  });

  it('descarta tarefa vazia, URL interna e QUALQUER tentativa do modelo de aprovar pagamento', () => {
    expect(parseAgentAction({ tool: 'navigator', op: 'run', task: '' })).toBeNull();
    expect(parseAgentAction({ tool: 'navigator', op: 'run', task: 'abra', url: 'http://169.254.169.254/' })).toBeNull();
    expect(parseAgentAction({ tool: 'navigator', op: 'approve', requestId: 'abcdef1234567890' })).toBeNull();
    expect(parseAgentAction({ tool: 'navigator', op: 'input', approve: true, confirmed: true })).toBeNull();
    const turn = parseAgentTurn(JSON.stringify({ reply: 'ok', actions: [{ tool: 'navigator', op: 'confirm' }, { tool: 'navigator', op: 'stop' }] }));
    expect(turn.actions).toEqual([{ tool: 'navigator', op: 'stop' }]);
  });

  it('tem painel e custo', () => {
    expect(PANELS).toContain('navigator');
    expect(TOOL_COSTS.navigator).toContain('por minuto');
  });

  it('o prompt só ensina a ferramenta quando a conversa pede, e cabe no orçamento', () => {
    const base = buildAgentSystemPrompt({ secretNames: ['GITHUB_PASSWORD'] });
    expect(base).not.toContain('"tool":"navigator"');
    const on = buildAgentSystemPrompt({ secretNames: ['GITHUB_PASSWORD'], navigator: true });
    expect(on).toContain('{"tool":"navigator","op":"run|open|stop"');
    expect(on).toContain('nunca peça no chat');
    expect(on).toContain('num cartão seguro ali (nunca peça no chat, nunca aprove por ele)');
    // Com o navigator ligado, browser_form sai do prompt (orçamento).
    expect(buildAgentSystemPrompt({ secretNames: [], navigator: true, browserForm: true })).not.toContain('"tool":"browser_form"');
    const heavy = buildAgentSystemPrompt({
      navigator: true, browserForm: true,
      secretNames: Array.from({ length: 60 }, (_, i) => `SEGREDO_${i}`),
      localNow: 'agora', memories: 'x'.repeat(2_500), recall: 'y'.repeat(700), summary: 'z'.repeat(2_400), plan: 'p'.repeat(2_500),
    });
    expect(heavy.length).toBeLessThan(26_000);
  });
});

describe('Vibe Code → Navigator (/navegar)', () => {
  it('lê o comando e a primeira URL pública', () => {
    expect(NAVIGATOR_VIBE_COMMAND).toBe('/navegar');
    expect(parseVibeNavigatorCommand('/navegar veja o preço em https://loja.com/p/1 agora')).toEqual({ task: 'veja o preço em https://loja.com/p/1 agora', url: 'https://loja.com/p/1' });
    expect(parseVibeNavigatorCommand('/navegar pesquise "vertal" no google')).toEqual({ task: 'pesquise "vertal" no google' });
  });
  it('ignora outros textos, comando vazio e URL interna (sem url)', () => {
    expect(parseVibeNavigatorCommand('crie um app')).toBeNull();
    expect(parseVibeNavigatorCommand('/navegar')).toBeNull();
    expect(parseVibeNavigatorCommand('/navegarx algo')).toBeNull();
    expect(parseVibeNavigatorCommand('/navegar abra http://127.0.0.1:3000 agora')).toEqual({ task: 'abra http://127.0.0.1:3000 agora' });
  });
});
