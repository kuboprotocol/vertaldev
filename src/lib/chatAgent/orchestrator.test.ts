import { describe, expect, it } from 'vitest';
import {
  ORCHESTRATOR_LIMITS,
  budgetToolResults,
  chooseAgentTier,
  closeTruncatedJson,
  groupActionsForExecution,
  isComplexRequest,
  isParallelSafe,
  isRetryableFailure,
  looksLikeJson,
  otherTier,
  repairAgentJson,
  salvageReply,
} from './orchestrator';
import { agentOutputNeedsRetry, parseAgentOutput, parseAgentTurn, type AgentAction } from './contract';
import { PLAN_LIMITS, completePlanTask, initPlanState, readyPlanTasks, startPlanTask } from './brain';

describe('roteamento de modelo', () => {
  it('fica no flash para conversa simples', () => {
    expect(chooseAgentTier({ lastUserText: 'oi, tudo bem?', firstRound: true })).toEqual({ tier: 'flash', reason: 'default' });
    expect(isComplexRequest('qual a previsão do tempo amanhã em São Paulo?')).toBe(false);
  });

  it('escala para o pro na 1ª rodada de pedido complexo', () => {
    const ask = 'Quero que você desenhe a arquitetura de um SaaS multi-tenant com Supabase e filas, e me diga os riscos.';
    expect(isComplexRequest(ask)).toBe(true);
    expect(chooseAgentTier({ lastUserText: ask, firstRound: true })).toEqual({ tier: 'pro', reason: 'complex_request' });
    // Rodadas de ferramenta e tarefas do plano ficam no flash.
    expect(chooseAgentTier({ lastUserText: ask, firstRound: false }).tier).toBe('flash');
    expect(chooseAgentTier({ lastUserText: ask, firstRound: true, planPhase: 'execute' }).tier).toBe('flash');
  });

  it('reconhece pedidos de várias etapas e com código', () => {
    const steps = 'Faça o seguinte:\n1. pesquise os 3 maiores concorrentes\n2. compare preços\n3. monte uma planilha\n4. escreva um e-mail para o time com o resumo de tudo';
    expect(isComplexRequest(steps)).toBe(true);
    const code = 'Por que isso não funciona?\n```ts\nfunction soma(a: number, b: number) { return a - b }\nexport default soma\n```\nme ajuda a corrigir e explicar';
    expect(isComplexRequest(code)).toBe(true);
    expect(isComplexRequest('x'.repeat(1_300))).toBe(true);
  });

  it('usa o pro na síntese final do plano e respeita o interruptor', () => {
    expect(chooseAgentTier({ lastUserText: 'oi', firstRound: false, planPhase: 'final' })).toEqual({ tier: 'pro', reason: 'plan_synthesis' });
    expect(chooseAgentTier({ lastUserText: 'oi', firstRound: false, planPhase: 'final', escalation: false }).tier).toBe('flash');
    expect(otherTier('flash')).toBe('pro');
    expect(otherTier('pro')).toBe('flash');
    expect(ORCHESTRATOR_LIMITS.maxTokens.pro).toBeGreaterThan(ORCHESTRATOR_LIMITS.maxTokens.flash);
  });
});

describe('conserto do JSON do modelo', () => {
  it('lê JSON direto, cercado por ```json``` e com texto em volta', () => {
    expect(repairAgentJson('{"reply":"oi"}')).toEqual({ value: { reply: 'oi' }, repair: 'ok' });
    expect(repairAgentJson('Claro! Aqui está:\n```json\n{"reply":"oi","actions":[]}\n```\nAbraço')?.value).toEqual({ reply: 'oi', actions: [] });
    // Chave "}" dentro de string e texto com chaves depois do objeto.
    const out = repairAgentJson('{"reply":"use {nome} aqui"} e depois {isso}');
    expect(out?.value).toEqual({ reply: 'use {nome} aqui' });
  });

  it('tira vírgula sobrando', () => {
    expect(repairAgentJson('{"reply":"oi","actions":[],}')?.value).toEqual({ reply: 'oi', actions: [] });
  });

  it('fecha JSON cortado no limite de tokens', () => {
    expect(closeTruncatedJson('{"reply":"olá mun')).toBe('{"reply":"olá mun"}');
    expect(closeTruncatedJson('{"a":[1,2,')).toBe('{"a":[1,2]}');
    const out = repairAgentJson('{"reply":"Vou criar","actions":[{"tool":"image","prompt":"um gato');
    expect(out?.repair).toBe('truncated');
    expect(out?.value.reply).toBe('Vou criar');
  });

  it('recupera o reply de JSON sem conserto e reconhece JSON', () => {
    expect(salvageReply('{"reply":"Oi\\nmundo", "actions": [ {"tool": }')).toBe('Oi\nmundo');
    expect(looksLikeJson('```json\n{"reply"')).toBe(true);
    expect(looksLikeJson('Olá! Tudo certo.')).toBe(false);
  });
});

describe('parseAgentOutput', () => {
  it('JSON cortado: mantém o texto e descarta ações (falha fechada para gastos)', () => {
    const { turn, status } = parseAgentOutput('{"reply":"Gerando","actions":[{"tool":"image","prompt":"um gato de óculos"}');
    expect(status).toBe('truncated');
    expect(turn.reply).toBe('Gerando');
    expect(turn.actions).toEqual([]);
    expect(agentOutputNeedsRetry(status)).toBe(true);
  });

  it('nunca mostra JSON cru quando não dá para ler', () => {
    const { turn, status } = parseAgentOutput('{"actions": [ {"tool": "image", ');
    expect(turn.reply).toBe('');
    expect(status).toBe('empty');
    expect(parseAgentTurn('{ "reply": ').reply).toBe('');
  });

  it('texto puro continua virando a resposta, sem nova tentativa', () => {
    const { turn, status } = parseAgentOutput('Claro! Posso ajudar com isso.');
    expect(status).toBe('prose');
    expect(turn.reply).toContain('Posso ajudar');
    expect(agentOutputNeedsRetry(status)).toBe(false);
  });

  it('JSON válido com ações e JSON consertado não pedem nova tentativa', () => {
    const ok = parseAgentOutput('{"reply":"ok","actions":[{"tool":"web_search","query":"dólar hoje"}]}');
    expect(ok.status).toBe('ok');
    expect(ok.turn.actions).toHaveLength(1);
    const fenced = parseAgentOutput('Segue:\n```json\n{"reply":"feito","actions":[]}\n```');
    expect(fenced.status).toBe('repaired');
    expect(agentOutputNeedsRetry(fenced.status)).toBe(false);
    expect(agentOutputNeedsRetry(parseAgentOutput('').status)).toBe(true);
  });
});

describe('execução em paralelo', () => {
  const search = (q: string): AgentAction => ({ tool: 'web_search', query: q });
  const image: AgentAction = { tool: 'image', prompt: 'logo' };
  const api: AgentAction = { tool: 'api_request', method: 'GET', url: 'https://api.x.com', headers: {}, reason: 'teste' };

  it('só leituras sem efeito colateral rodam juntas', () => {
    expect(isParallelSafe(search('a'))).toBe(true);
    expect(isParallelSafe({ tool: 'web_read', url: 'https://x.com' })).toBe(true);
    expect(isParallelSafe({ tool: 'memory', op: 'list' })).toBe(true);
    expect(isParallelSafe({ tool: 'memory', op: 'forget', query: 'x' })).toBe(false);
    expect(isParallelSafe(image)).toBe(false);
    expect(isParallelSafe(api)).toBe(false); // pede aprovação
    expect(isParallelSafe({ tool: 'gmail_send', to: 'a@b.com', subject: 's', body: 'b' })).toBe(false);
  });

  it('agrupa leituras seguidas e mantém o resto na ordem', () => {
    const groups = groupActionsForExecution([search('a'), search('b'), image, search('c'), api, search('d')]);
    expect(groups.map((g) => g.map((a) => a.tool))).toEqual([
      ['web_search', 'web_search'],
      ['image'],
      ['web_search'],
      ['api_request'],
      ['web_search'],
    ]);
    expect(groupActionsForExecution([search('1'), search('2'), search('3')], 2).map((g) => g.length)).toEqual([2, 1]);
  });

  it('autocorreção só para falhas que o agente pode resolver', () => {
    expect(isRetryableFailure({ tool: 'web_read', ok: false, summary: 'Não consegui abrir https://x.com.' })).toBe(true);
    expect(isRetryableFailure({ tool: 'image', ok: false, summary: 'Créditos insuficientes para esta criação.' })).toBe(false);
    expect(isRetryableFailure({ tool: 'api_request', ok: false, summary: 'O usuário não autorizou esta chamada.' })).toBe(false);
    expect(isRetryableFailure({ tool: 'web_search', ok: true, summary: 'ok' })).toBe(false);
  });

  it('orçamento de resultados: 12 mais recentes, cada um cortado', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ tool: `t${i}`, ok: true, summary: 'y'.repeat(10_000) }));
    const kept = budgetToolResults(many);
    expect(kept).toHaveLength(12);
    expect(kept[0].tool).toBe('t3');
    const total = kept.reduce((n, r) => n + r.summary.length, 0);
    expect(total).toBeLessThanOrEqual(ORCHESTRATOR_LIMITS.toolResultsBudgetChars);
    // Poucos resultados pequenos passam inteiros.
    expect(budgetToolResults([{ tool: 'a', ok: true, summary: 'curto' }])[0].summary).toBe('curto');
  });
});

describe('plano com tarefas paralelas', () => {
  const plan = {
    tool: 'plan' as const,
    goal: 'Comparar concorrentes',
    tasks: [
      { id: 1, title: 'Pesquisar A', description: '', dependencies: [] },
      { id: 2, title: 'Pesquisar B', description: '', dependencies: [] },
      { id: 3, title: 'Comparar', description: '', dependencies: [1, 2] },
    ],
  };

  it('tarefas sem dependência entre si saem juntas; a dependente espera', () => {
    let state = initPlanState(plan);
    expect(readyPlanTasks(state).map((t) => t.id)).toEqual([1, 2]);
    expect(readyPlanTasks(state, 1).map((t) => t.id)).toEqual([1]);
    expect(readyPlanTasks(state, 0)).toEqual([]);
    state = completePlanTask(state, 1, true, 'A custa 10');
    expect(readyPlanTasks(state).map((t) => t.id)).toEqual([2]);
    state = completePlanTask(state, 2, true, 'B custa 12');
    expect(readyPlanTasks(state).map((t) => t.id)).toEqual([3]);
    state = completePlanTask(state, 3, true, 'A é mais barato');
    expect(state.phase).toBe('final');
    expect(readyPlanTasks(state)).toEqual([]);
  });

  it('dependência bloqueada não trava o plano', () => {
    let state = initPlanState(plan);
    state = completePlanTask(state, 1, false, 'falhou');
    state = completePlanTask(state, 2, true, 'ok');
    expect(readyPlanTasks(state).map((t) => t.id)).toEqual([3]);
  });

  it('cada tarefa paralela leva o próprio estado com a tarefa atual', () => {
    const state = initPlanState(plan);
    expect(startPlanTask(state, 2)).toMatchObject({ current: 2, phase: 'execute' });
    expect(PLAN_LIMITS.maxParallelTasks).toBeGreaterThan(1);
    expect(PLAN_LIMITS.maxToolRounds).toBe(6);
  });
});
