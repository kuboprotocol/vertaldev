import { describe, expect, it } from 'vitest';
import { TOOL_COSTS, buildAgentSystemPrompt, parseAgentAction } from './contract';
import { AGENT_PROMPT_BUDGET } from '../../../supabase/functions/_shared/chatAgent';

describe('fase 3 no contrato do chat: github e youtube', () => {
  it('github: valida e mantém padrões seguros', () => {
    expect(parseAgentAction({ tool: 'github', op: 'create_pr', repo: 'a/b', title: 'Nova tela', head: 'feat/x' }))
      .toEqual({ tool: 'github', op: 'create_pr', repo: 'a/b', title: 'Nova tela', head: 'feat/x', draft: true });
    expect(parseAgentAction({ tool: 'github', op: 'delete_repo', repo: 'a/b' })).toBeNull();
    expect(TOOL_COSTS.github).toContain('confirmação');
  });
  it('youtube: link do YouTube vira URL canônica; outros links são recusados', () => {
    expect(parseAgentAction({ tool: 'youtube', op: 'play', url: 'https://youtu.be/dQw4w9WgXcQ' }))
      .toEqual({ tool: 'youtube', op: 'play', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(parseAgentAction({ tool: 'youtube', query: 'lofi para estudar' })).toEqual({ tool: 'youtube', op: 'play', query: 'lofi para estudar' });
    expect(parseAgentAction({ tool: 'youtube', op: 'play', url: 'https://evil.com/x' })).toBeNull();
    expect(parseAgentAction({ tool: 'youtube', op: 'play' })).toBeNull();
  });
  it('as ferramentas só entram no prompt quando ligadas, e tudo ligado cabe no orçamento', () => {
    const base = buildAgentSystemPrompt({ secretNames: [] });
    expect(base).not.toContain('"tool":"github"');
    expect(base).not.toContain('"tool":"youtube"');
    const on = buildAgentSystemPrompt({ secretNames: [], github: true, media: true, navigator: true });
    expect(on).toContain('{"tool":"github","op":"list_repos|create_repo|create_issue|create_branch|create_pr"');
    expect(on).toContain('{"tool":"youtube","op":"play|search"');
    expect(on).toContain('Hostinger');
    const heavy = buildAgentSystemPrompt({
      navigator: true, browserForm: true, github: true, media: true,
      secretNames: Array.from({ length: 60 }, (_, i) => `SEGREDO_${i}`),
      localNow: 'agora', memories: 'x'.repeat(2_500), recall: 'y'.repeat(700), summary: 'z'.repeat(2_400), plan: 'p'.repeat(2_500),
    });
    expect(heavy.length).toBeLessThan(26_000);
    // Conversa normal (memória e resumo médios): as duas cabem.
    const medium = buildAgentSystemPrompt({
      navigator: true, github: true, media: true, secretNames: [], localNow: 'agora',
      memories: 'x'.repeat(1_200), summary: 'z'.repeat(1_200),
    });
    expect(medium).toContain('"tool":"github"');
    expect(medium).toContain('"tool":"youtube"');
    expect(medium.length).toBeLessThanOrEqual(AGENT_PROMPT_BUDGET);
  });
});
