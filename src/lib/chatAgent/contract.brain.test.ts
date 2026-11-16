import { describe, expect, it } from 'vitest';
import { buildAgentSystemPrompt, formatToolResults, parseAgentAction, parseAgentTurn } from './contract';

describe('ferramentas que eram descartadas por falta de validação', () => {
  it('web_search agora passa (antes sumia em silêncio)', () => {
    expect(parseAgentAction({ tool: 'web_search', query: 'selic hoje' })).toEqual({ tool: 'web_search', query: 'selic hoje' });
    expect(parseAgentAction({ tool: 'web_search', query: 'x', max: 50 })).toBeNull();
    expect(parseAgentAction({ tool: 'web_search', query: 'dólar', max: 50 })).toEqual({ tool: 'web_search', query: 'dólar', max: 8 });
  });

  it('web_read normaliza a URL e recusa o que não é web', () => {
    expect(parseAgentAction({ tool: 'web_read', url: 'vertal.dev' })).toEqual({ tool: 'web_read', url: 'https://vertal.dev/' });
    expect(parseAgentAction({ tool: 'web_read', url: 'file:///etc/passwd' })).toBeNull();
  });

  it('memory: list e forget', () => {
    expect(parseAgentAction({ tool: 'memory', op: 'list' })).toEqual({ tool: 'memory', op: 'list' });
    expect(parseAgentAction({ tool: 'memory', op: 'forget', query: 'endereço' })).toEqual({ tool: 'memory', op: 'forget', query: 'endereço' });
    expect(parseAgentAction({ tool: 'memory', op: 'forget' })).toBeNull();
    expect(parseAgentAction({ tool: 'memory', op: 'apagar_tudo' })).toBeNull();
  });

  it('ferramentas de painel do prompt agora são validadas', () => {
    expect(parseAgentAction({ tool: 'podcast_studio', topic: 'IA no varejo', duration: 300 })).toEqual({ tool: 'podcast_studio', topic: 'IA no varejo', duration: 60 });
    expect(parseAgentAction({ tool: 'news_feed', category: 'economia', timeRange: 'ontem' })).toEqual({
      tool: 'news_feed', category: 'economia', timeRange: 'hoje', location: 'nacional',
    });
    expect(parseAgentAction({ tool: 'news_weather', location: 'Santos' })).toEqual({ tool: 'news_weather', location: 'Santos' });
    expect(parseAgentAction({ tool: 'notebook', name: 'Biologia', description: 'Estudos' })).toEqual({ tool: 'notebook', name: 'Biologia', description: 'Estudos' });
    expect(parseAgentAction({ tool: 'notebook_feed', notebook_id: '../../x' })).toEqual({ tool: 'notebook_feed' });
    expect(parseAgentAction({ tool: 'notebook_to_podcast', focus: 'resumo' })).toEqual({ tool: 'notebook_to_podcast', focus: 'resumo' });
    expect(parseAgentAction({ tool: 'video_studio', tier: 'ultra', aspect: '4:3' })).toEqual({ tool: 'video_studio', tier: 'express', style: 'cinematográfico', aspect: '9:16' });
    expect(parseAgentAction({ tool: 'clips' })).toEqual({ tool: 'clips', theme: 'viral', mood: 'energético' });
    expect(parseAgentAction({ tool: 'emo' })).toEqual({ tool: 'emo' });
    expect(parseAgentAction({ tool: 'voice_input', language: 'de-DE' })).toEqual({ tool: 'voice_input', language: 'pt-BR', provider: 'web_speech' });
    expect(parseAgentAction({ tool: 'world_time', places: ['Tóquio', '', 'Lisboa'] })).toEqual({ tool: 'world_time', places: ['Tóquio', 'Lisboa'] });
    expect(parseAgentAction({ tool: 'schedule_alarm', time: '7h30', repeatDays: [1, 1, 9], ringTimes: 7 })).toEqual({
      tool: 'schedule_alarm', time: '7:30', repeatDays: [1],
    });
    expect(parseAgentAction({ tool: 'schedule_alarm', time: 'amanhã' })).toBeNull();
  });
});

describe('parseAgentTurn com memória e plano', () => {
  it('lê o campo "memory" e descarta dados sensíveis', () => {
    const turn = parseAgentTurn(JSON.stringify({
      reply: 'Anotado!',
      actions: [],
      memory: { save: [{ kind: 'fact', content: 'Trabalha na Vertal Company', importance: 4 }, { kind: 'fact', content: 'Senha do banco: 123456' }] },
    }));
    expect(turn.memory).toEqual({ save: [{ kind: 'fact', content: 'Trabalha na Vertal Company', importance: 4 }], forget: [] });
  });

  it('sem nada útil em "memory", o campo some', () => {
    expect(parseAgentTurn('{"reply":"oi","actions":[],"memory":{"save":[]}}')).toEqual({ reply: 'oi', actions: [] });
  });

  it('um plano é sempre a única ação', () => {
    const turn = parseAgentTurn(JSON.stringify({
      reply: 'Vou em etapas.',
      actions: [
        { tool: 'image', prompt: 'um gato' },
        { tool: 'plan', goal: 'Pesquisa', tasks: [{ title: 'Buscar' }, { title: 'Comparar', dependencies: [1] }] },
      ],
    }));
    expect(turn.actions).toHaveLength(1);
    expect(turn.actions[0]).toMatchObject({ tool: 'plan', goal: 'Pesquisa' });
  });
});

describe('prompt do agente', () => {
  const full = buildAgentSystemPrompt({
    secretNames: ['OPENAI_API_KEY'],
    localNow: 'domingo, 15 de novembro de 2026 10:15',
    timezone: 'America/Sao_Paulo',
    memories: 'Fato:\n- Nome: Laércio',
    recall: '- "Site da padaria" (2026-11-10): decidiu usar tons de marrom',
    summary: '- Quer lançar um app de delivery',
    plan: 'MODO PLANO — você está executando um plano',
  });

  it('tem personalidade e regras de conversa sem se passar por outro produto', () => {
    expect(full).toContain('Você é o Vertal Chat');
    expect(full).toContain('Responda primeiro');
    expect(full).toContain('Ótima pergunta!'); // citado como o que NÃO fazer
    expect(full).toMatch(/não diga que é o Claude, o ChatGPT/);
    expect(full).toContain('CVV (188)');
  });

  it('manda buscar na web e citar fontes', () => {
    expect(full).toContain('Use web_search SEMPRE');
    expect(full).toContain('links markdown [título](url)');
    expect(full).toContain('{"tool":"web_read"');
  });

  it('injeta memória, recordação, resumo e plano como DADOS', () => {
    expect(full).toContain('MEMÓRIA SOBRE O USUÁRIO (DADOS');
    expect(full).toContain('- Nome: Laércio');
    expect(full).toContain('CONVERSAS ANTERIORES PARECIDAS');
    expect(full).toContain('RESUMO DA PARTE ANTIGA DESTA CONVERSA');
    expect(full).toContain('MODO PLANO');
  });

  it('memória desligada ou indisponível: não injeta nada nem pede para salvar', () => {
    const off = buildAgentSystemPrompt({ secretNames: [], memoryEnabled: false, memories: 'Fato:\n- Nome: X' });
    expect(off).toContain('DESLIGOU a memória');
    expect(off).not.toContain('- Nome: X');
    const unavailable = buildAgentSystemPrompt({ secretNames: [], memoryEnabled: null, memories: 'Fato:\n- Nome: X' });
    expect(unavailable).toContain('indisponível');
    expect(unavailable).not.toContain('- Nome: X');
  });

  it('cabe no orçamento de sistema do gateway (1/3 de 78 mil caracteres) mesmo com tudo cheio', () => {
    const heavy = buildAgentSystemPrompt({
      secretNames: Array.from({ length: 60 }, (_, i) => `SEGREDO_${i}`),
      localNow: 'agora',
      memories: 'x'.repeat(2_500),
      recall: 'y'.repeat(700),
      summary: 'z'.repeat(2_400),
      plan: 'p'.repeat(2_500),
    });
    expect(heavy.length).toBeLessThan(26_000);
  });
});

describe('formatToolResults', () => {
  it('na última rodada manda responder sem novas ações', () => {
    const r = [{ tool: 'web_search', ok: true, summary: 'resultados' }];
    expect(formatToolResults(r, { final: true })).toContain('última rodada');
    expect(formatToolResults(r)).toContain('ler uma página encontrada na busca');
  });

  it('mantém os 12 resultados mais recentes', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ tool: `t${i}`, ok: true, summary: `r${i}` }));
    const text = formatToolResults(many);
    expect(text).toContain('t13');
    expect(text).toContain('t2 —');
    expect(text).not.toContain('t1 —');
  });

  it('mantém o contexto limitado mesmo com 12 resultados grandes', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ tool: `t${i}`, ok: true, summary: 'x'.repeat(6_000) }));
    expect(formatToolResults(many).length).toBeLessThan(40_000);
  });

  it('com falha, convida o agente a corrigir uma vez (fora da última rodada)', () => {
    const r = [{ tool: 'web_read', ok: false, summary: 'Não consegui abrir https://x.com.' }];
    expect(formatToolResults(r)).toContain('Alguma ferramenta falhou');
    expect(formatToolResults(r, { final: true })).not.toContain('Alguma ferramenta falhou');
    expect(formatToolResults([{ tool: 'web_search', ok: true, summary: 'ok' }])).not.toContain('Alguma ferramenta falhou');
  });
});
