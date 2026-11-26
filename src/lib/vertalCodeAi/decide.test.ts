import { describe, expect, it } from 'vitest';
import {
  analyzeWithDecide,
  concentration,
  decideThresholds,
  DEFAULT_JEV_MODEL,
  jevConfigured,
  makeDecider,
  normalizeAnswers,
  ownDecideConfigured,
  ownDecideEndpointUrl,
  ownDecideFromEnv,
  tierFor,
  type DecisionQuestions,
} from '../../../supabase/functions/_shared/vertalCodeAi/decide';

const Q: DecisionQuestions = {
  is_bug: { type: 'noul', instructions: 'É um defeito?', criteria: { true: 'quebrado', false: 'pergunta' } },
  team: { type: 'choice', instructions: 'Qual time?', criteria: { payments: 'pagamentos', frontend: 'tela', account: 'conta' } },
  urgency: { type: 'score', instructions: 'Urgência?', criteria: ['baixa', 'média', 'alta'] },
};

// Resposta no formato da Decisions API (exemplo da documentação pública).
const API_ANSWERS = {
  is_bug: { type: 'noul', noul: 0.96 },
  team: { type: 'choice', choice: 'payments', confidence: 0.67, probabilities: { payments: 0.78, frontend: 0.22, account: 0 } },
  urgency: { type: 'score', score: 1.99, confidence: 0.99, probabilities: { '0': 0, '1': 0, '2': 1 } },
};

const T = decideThresholds({});

function fakeFetch(routes: Record<string, (body: Record<string, unknown>) => { status?: number; json?: unknown }>) {
  const calls: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
  const f = async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, body, headers: init.headers as Record<string, string> });
    const route = Object.keys(routes).find((k) => url.startsWith(k));
    if (!route) return new Response('no', { status: 404 });
    const r = routes[route](body);
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  };
  return { f, calls };
}

describe('Vertal Decide · níveis de confiança', () => {
  it('alta age, média sobe, baixa pergunta; limites configuráveis', () => {
    expect(T).toEqual({ high: 0.8, medium: 0.55 });
    expect(tierFor(0.9, T)).toBe('act');
    expect(tierFor(0.6, T)).toBe('escalate');
    expect(tierFor(0.2, T)).toBe('ask');
    expect(decideThresholds({ VERTAL_DECIDE_HIGH: '0.9', VERTAL_DECIDE_MEDIUM: '0.95' })).toEqual({ high: 0.9, medium: 0.9 });
    expect(decideThresholds({ VERTAL_DECIDE_HIGH: '7' }).high).toBe(0.8);
  });
  it('concentração da distribuição', () => {
    expect(concentration([1, 0])).toBe(1);
    expect(concentration([0.5, 0.5])).toBe(0);
    expect(concentration([])).toBe(0);
  });
  it('normaliza noul/choice/score do formato da Decisions API', () => {
    const a = normalizeAnswers(API_ANSWERS, Q, T);
    expect(a.is_bug).toMatchObject({ type: 'noul', value: true, yes: 0.96, tier: 'act' });
    expect(a.is_bug.confidence).toBeCloseTo(0.92);
    expect(a.team).toMatchObject({ type: 'choice', value: 'payments', confidence: 0.67, tier: 'escalate' });
    expect(a.urgency).toMatchObject({ type: 'score', value: 1.99, tier: 'act' });
    // sem "choice"/"score" explícitos: deduz das probabilidades
    const b = normalizeAnswers({ team: { probabilities: { payments: 0.1, frontend: 0.9 } }, urgency: { probabilities: { '0': 0.5, '2': 0.5 } } }, Q, T);
    expect(b.team.value).toBe('frontend');
    expect(b.urgency.value).toBe(1);
    expect(normalizeAnswers({ is_bug: { noul: 'x' } }, Q, T)).toEqual({});
    expect(normalizeAnswers(null, Q, T)).toEqual({});
  });
});

describe('Vertal Decide · provedores (própria → OpenRouter → LLM barata → nenhum)', () => {
  const OWN = { VERTAL_DECIDE_URL: 'https://kuboprotocol--vertal-decide.modal.run/v1/decisions', VERTAL_DECIDE_TOKEN: 'own-tok' };
  const OR = { OPENROUTER_API_KEY: 'or-key', VERTAL_CODE_AI_ALLOW_PAID: 'true' };

  it('configuração: própria exige https + token; OpenRouter exige chave existente + pago liberado', () => {
    expect(ownDecideConfigured(OWN)).toBe(true);
    expect(ownDecideConfigured({ VERTAL_DECIDE_URL: 'http://x', VERTAL_DECIDE_TOKEN: 't' })).toBe(false);
    expect(jevConfigured(OR)).toBe(true);
    expect(jevConfigured({ OPENROUTER_API_KEY: 'k' })).toBe(false); // sem ALLOW_PAID
    expect(jevConfigured({ ...OR, VERTAL_DECIDE_JEV: 'false' })).toBe(false);
  });

  it('usa a própria primeiro, com Bearer próprio e o mesmo corpo {state, questions}', async () => {
    const { f, calls } = fakeFetch({ [OWN.VERTAL_DECIDE_URL]: () => ({ json: { answers: API_ANSWERS } }) });
    const decide = makeDecider({ fetch: f, env: { ...OWN, ...OR } });
    const r = await decide({ ticket: 'tela branca no pagamento' }, Q);
    expect(r.source).toBe('own');
    expect(calls).toHaveLength(1);
    expect(calls[0].headers.Authorization).toBe('Bearer own-tok');
    expect(calls[0].body.state).toEqual({ ticket: 'tela branca no pagamento' });
    expect(Object.keys(calls[0].body.questions as object)).toEqual(['is_bug', 'team', 'urgency']);
  });

  it('própria falha → OpenRouter (Decisions API, modelo padrão, chave existente)', async () => {
    const { f, calls } = fakeFetch({
      [OWN.VERTAL_DECIDE_URL]: () => ({ status: 503 }),
      'https://openrouter.ai/api/alpha/decisions': () => ({ json: { answers: API_ANSWERS, usage: { cost: 0.00002 } } }),
    });
    const logs: string[] = [];
    const r = await makeDecider({ fetch: f, env: { ...OWN, ...OR }, log: (m) => logs.push(m) })({ a: 1 }, Q);
    expect(r.source).toBe('jev');
    expect(r.costUsd).toBe(0.00002);
    expect(calls[1].body.model).toBe(DEFAULT_JEV_MODEL);
    expect(calls[1].headers.Authorization).toBe('Bearer or-key');
    expect(logs.join(' ')).toMatch(/cost_usd/);
  });

  it('resposta incompleta não vale: cai para a LLM barata, com confiança limitada (nunca "age" sozinha)', async () => {
    const { f } = fakeFetch({ 'https://openrouter.ai/api/alpha/decisions': () => ({ json: { answers: { is_bug: { noul: 0.9 } } } }) });
    const r = await makeDecider({
      fetch: f,
      env: OR,
      callLlm: async () => ({ content: JSON.stringify({ answers: { is_bug: { type: 'noul', noul: 0.99 }, team: { type: 'choice', choice: 'frontend', probabilities: { frontend: 1 } }, urgency: { type: 'score', probabilities: { '2': 1 } } } }) }),
    })({ a: 1 }, Q);
    expect(r.source).toBe('llm');
    expect(r.answers.is_bug.value).toBe(true);
    expect(r.answers.is_bug.tier).toBe('escalate');
    expect(r.answers.team.confidence).toBeLessThan(0.8);
  });

  it('nada configurado e LLM fora → "none" (quem chamou usa o padrão seguro); perguntas inválidas são descartadas', async () => {
    const { f, calls } = fakeFetch({});
    const r = await makeDecider({ fetch: f, env: {}, callLlm: async () => { throw new Error('x'); } })({ a: 1 }, Q);
    expect(r).toMatchObject({ source: 'none', answers: {} });
    expect(calls).toHaveLength(0);
    const bad = await makeDecider({ fetch: f, env: OR })({}, { 'chave inválida!': { type: 'noul', instructions: 'x' }, c: { type: 'choice', instructions: 'só uma', criteria: { a: 'a' } } } as DecisionQuestions);
    expect(bad.source).toBe('none');
    expect(calls).toHaveLength(0);
  });

  it('tempo esgotado na própria não trava: segue para o próximo', async () => {
    const slow = (url: string, init: RequestInit) =>
      url.includes('modal')
        ? new Promise<Response>((_, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('t', 'TimeoutError'))))
        : Promise.resolve(new Response(JSON.stringify({ answers: API_ANSWERS })));
    const r = await makeDecider({ fetch: slow, env: { ...OWN, ...OR }, timeoutMs: 20 })({ a: 1 }, Q);
    expect(r.source).toBe('jev');
  });
});

describe('Vertal Decide · ferramenta de análise (causa principal + risco + confiança)', () => {
  it('com causas dadas: escolhe a principal, nível de risco e nível de confiança', async () => {
    const decide = async (state: Record<string, unknown>, q: DecisionQuestions) => {
      expect(String(state.dossie)).toContain('vendas caíram');
      expect(Object.keys((q.main_cause as { criteria: object }).criteria)).toEqual(['c1', 'c2', 'c3']);
      return {
        source: 'own' as const,
        ms: 1,
        answers: {
          main_cause: { type: 'choice' as const, value: 'c2', probabilities: { c1: 0.05, c2: 0.9, c3: 0.05 }, confidence: 0.88, tier: 'act' as const },
          risk: { type: 'score' as const, value: 2.2, probabilities: {}, confidence: 0.85, tier: 'act' as const },
        },
      };
    };
    const r = await analyzeWithDecide({ dossier: { resumo: 'vendas caíram 30% em outubro' }, causes: ['Sazonalidade', 'Checkout quebrado no celular', 'Preço'] }, { decide });
    expect(r).toMatchObject({ source: 'own', mainCause: 'Checkout quebrado no celular', risk: 'alto', tier: 'act', confidence: 0.85 });
    expect(r.causeProbabilities['Checkout quebrado no celular']).toBe(0.9);
  });

  it('sem causas: pede à LLM barata para propor; sem causas nem LLM → não decide', async () => {
    let proposed = false;
    const r = await analyzeWithDecide(
      { dossier: 'churn subiu', question: 'por que o churn subiu?' },
      {
        decide: async () => ({ source: 'llm', ms: 1, answers: { main_cause: { type: 'choice', value: 'c1', confidence: 0.6, tier: 'escalate' } } }),
        proposeCauses: async () => {
          proposed = true;
          return ['Onboarding confuso', 'Preço subiu'];
        },
      },
    );
    expect(proposed).toBe(true);
    expect(r.mainCause).toBe('Onboarding confuso');
    expect(r.tier).toBe('escalate');
    expect(r.risk).toBeNull();
    const none = await analyzeWithDecide({ dossier: 'x' }, { decide: async () => ({ source: 'none', answers: {}, ms: 0 }) });
    expect(none.mainCause).toBeNull();
    expect(none.tier).toBe('ask');
  });
});

describe('Vertal Decide · cliente único (Equipe e Sentidos no mesmo endpoint)', () => {
  const API = { answers: API_ANSWERS };
  it('VERTAL_OWN_DECIDE_* (dos Sentidos) e o apelido VERTAL_DECIDE_* resolvem para o mesmo endpoint', () => {
    const a = ownDecideFromEnv({ VERTAL_OWN_DECIDE_URL: 'https://kuboprotocol--vertal-decide-decide-web.us-east.modal.run/', VERTAL_OWN_DECIDE_TOKEN: 't' });
    const b = ownDecideFromEnv({ VERTAL_DECIDE_URL: 'https://kuboprotocol--vertal-decide-decide-web.us-east.modal.run/v1/systemone', VERTAL_DECIDE_TOKEN: 't' });
    expect(ownDecideEndpointUrl(a!.url)).toBe('https://kuboprotocol--vertal-decide-decide-web.us-east.modal.run/v1/systemone');
    expect(ownDecideEndpointUrl(b!.url)).toBe(ownDecideEndpointUrl(a!.url));
    // O nome canônico vence o apelido.
    expect(ownDecideFromEnv({ VERTAL_OWN_DECIDE_URL: 'https://own.example', VERTAL_OWN_DECIDE_TOKEN: 'o', VERTAL_DECIDE_URL: 'https://old.example', VERTAL_DECIDE_TOKEN: 'x' })?.token).toBe('o');
    expect(ownDecideConfigured({ VERTAL_OWN_DECIDE_URL: 'https://own.example', VERTAL_OWN_DECIDE_TOKEN: 'o' })).toBe(true);
  });

  it('a Equipe usa a config dos Sentidos (VERTAL_OWN_DECIDE_*) e chama /v1/systemone', async () => {
    const { f, calls } = fakeFetch({ 'https://own.example/v1/systemone': () => ({ json: API }) });
    const r = await makeDecider({ fetch: f, env: { VERTAL_OWN_DECIDE_URL: 'https://own.example', VERTAL_OWN_DECIDE_TOKEN: 'o' } })({ a: 1 }, Q);
    expect(r.source).toBe('own');
    expect(calls[0].url).toBe('https://own.example/v1/systemone');
    expect(calls[0].headers.Authorization).toBe('Bearer o');
  });

  it('foto no estado: com reserva paga vai à reserva (padrão), a menos que VERTAL_OWN_DECIDE_IMAGES=true', async () => {
    const img = ['foto', { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }];
    const env = { VERTAL_OWN_DECIDE_URL: 'https://own.example', VERTAL_OWN_DECIDE_TOKEN: 'o', OPENROUTER_API_KEY: 'k', VERTAL_CODE_AI_ALLOW_PAID: 'true' };
    const a = fakeFetch({ 'https://own.example': () => ({ json: API }), 'https://openrouter.ai/api/alpha/decisions': () => ({ json: API }) });
    expect((await makeDecider({ fetch: a.f, env })(img, Q)).source).toBe('jev');
    expect(a.calls.map((c) => c.url)).toEqual(['https://openrouter.ai/api/alpha/decisions']);
    const b = fakeFetch({ 'https://own.example': () => ({ json: API }) });
    expect((await makeDecider({ fetch: b.f, env: { ...env, VERTAL_OWN_DECIDE_IMAGES: 'true' } })(img, Q)).source).toBe('own');
  });
});
