import { describe, expect, it } from 'vitest';
import {
  buildChain,
  isVcaEnabled,
  publicModelInfo,
  reconcileFreeModels,
  requestBody,
  selfHostedModel,
  shouldFallback,
  VCA_FREE_CATALOG,
  VCA_PAID_CATALOG,
  DEFAULT_SELF_HOSTED_BUDGET,
  estimateTokens,
  selfHostedModels,
  withinSelfHostedBudget,
} from '../../../supabase/functions/_shared/vertalCodeAi/router';

const OR = { OPENROUTER_API_KEY: 'x' };

describe('VERTAL Code AI · roteador grátis primeiro', () => {
  it('fica desligado por padrão', () => {
    expect(isVcaEnabled({})).toBe(false);
    expect(isVcaEnabled({ VERTAL_CODE_AI_ENABLED: 'false' })).toBe(false);
    expect(isVcaEnabled({ VERTAL_CODE_AI_ENABLED: 'true' })).toBe(true);
  });

  it('sem chave nenhuma, não há modelo', () => {
    expect(buildChain({}, { effort: 'auto' })).toEqual([]);
  });

  it('só usa modelos grátis quando o pago não foi liberado', () => {
    const chain = buildChain(OR, { effort: 'auto' });
    expect(chain.length).toBeGreaterThan(1);
    expect(chain.every((m) => m.cost === 'free')).toBe(true);
    expect(chain[chain.length - 1].model).toBe('openrouter/free');
  });

  it('pago só entra com VERTAL_CODE_AI_ALLOW_PAID=true e sempre por último', () => {
    const chain = buildChain({ ...OR, VERTAL_CODE_AI_ALLOW_PAID: 'true' }, { effort: 'auto' });
    expect(chain[chain.length - 1].cost).toBe('paid');
    expect(chain.filter((m) => m.cost === 'paid')).toHaveLength(1);
  });

  it('LLM própria vem primeiro por padrão, depois grátis, depois pago (e "false" volta à ordem antiga)', () => {
    const env = { ...OR, VERTAL_OLLAMA_URL: 'https://ollama.vertal.dev/', VERTAL_CODE_AI_ALLOW_PAID: '1' };
    const chain = buildChain(env, { effort: 'auto' });
    const costs = chain.map((m) => m.cost);
    expect(costs[0]).toBe('self_hosted');
    expect(costs.indexOf('free')).toBeGreaterThan(0);
    expect(costs.lastIndexOf('free')).toBeLessThan(costs.indexOf('paid'));
    const old = buildChain({ ...env, VERTAL_CODE_AI_PREFER_SELF_HOSTED: 'false' }, { effort: 'auto' });
    const oc = old.map((m) => m.cost);
    expect(oc.indexOf('self_hosted')).toBeGreaterThan(oc.lastIndexOf('free'));
    expect(oc.indexOf('self_hosted')).toBeLessThan(oc.indexOf('paid'));
    expect(buildChain({ ...env, VERTAL_CODE_AI_PREFER_SELF_HOSTED: 'true' }, { effort: 'auto' })[0].cost).toBe('self_hosted');
  });

  it('ordem decidida: própria → OpenRouter grátis → pago direto → pago via OpenRouter', () => {
    const env = { ...OR, DEEPSEEK_API_KEY: 'd', VERTAL_OLLAMA_URL: 'https://llm.vertalrun.com', VERTAL_CODE_AI_ALLOW_PAID: 'true' };
    const ids = buildChain(env, { effort: 'auto' }).map((m) => m.id);
    expect(ids[0]).toBe('vca-self-hosted');
    expect(ids.slice(-2)).toEqual(['vca-turbo-direct', 'vca-turbo-paid']);
    const direct = VCA_PAID_CATALOG.find((m) => m.id === 'vca-turbo-direct')!;
    expect(direct.keyEnv).toBe('DEEPSEEK_API_KEY');
    // sem liberar pago, nada pago entra mesmo com a chave
    expect(buildChain({ ...env, VERTAL_CODE_AI_ALLOW_PAID: '' }, { effort: 'auto' }).some((m) => m.cost === 'paid')).toBe(false);
  });

  it('pedido grande pula a LLM própria (fica para a reserva)', () => {
    const env = { ...OR, VERTAL_OLLAMA_URL: 'https://llm.vertalrun.com' };
    expect(buildChain(env, { effort: 'auto', promptTokens: 200 })[0].id).toBe('vca-self-hosted');
    expect(buildChain(env, { effort: 'auto', promptTokens: 5_000 }).some((m) => m.cost === 'self_hosted')).toBe(false);
    const bigger = buildChain({ ...env, VERTAL_OLLAMA_MAX_INPUT_TOKENS: '6000' }, { effort: 'auto', promptTokens: 5_000 });
    expect(bigger[0].id).toBe('vca-self-hosted');
  });

  it('orçamento da LLM própria: entrada, tempo e teto de saída', () => {
    const m = selfHostedModel({ VERTAL_OLLAMA_URL: 'https://llm.vertalrun.com' })!;
    expect(m.budget).toEqual(DEFAULT_SELF_HOSTED_BUDGET);
    expect(withinSelfHostedBudget(m, 500, 60_000)).toBe(true);
    expect(withinSelfHostedBudget(m, 5_000, 60_000)).toBe(false);
    expect(withinSelfHostedBudget(m, 500, 10_000)).toBe(false);
    const body = requestBody(m, [{ role: 'user', content: 'oi' }], { effort: 'auto', json: true, maxTokens: 8_000 });
    expect(body.max_tokens).toBe(DEFAULT_SELF_HOSTED_BUDGET.maxOutputTokens);
    expect(body.stream).toBe(true);
    expect(estimateTokens([{ role: 'user', content: 'x'.repeat(350) }])).toBe(100);
  });

  it('segundo endpoint próprio (ex.: GPU) só por segredo, com URL/token/modelo próprios', () => {
    const env = {
      ...OR,
      VERTAL_OLLAMA_URL: 'https://llm.vertalrun.com',
      VERTAL_OLLAMA_URL_2: 'https://gpu.example.com/v1',
      VERTAL_OLLAMA_MODEL_2: 'vertal-coder-gpu',
      VERTAL_OLLAMA_MAX_INPUT_TOKENS_2: '30000',
    };
    const own = selfHostedModels(env);
    expect(own.map((m) => m.id)).toEqual(['vca-self-hosted', 'vca-self-hosted-2']);
    expect(own[1].url).toBe('https://gpu.example.com/v1/chat/completions');
    expect(own[1].keyEnv).toBe('VERTAL_OLLAMA_TOKEN_2');
    expect(own[1].model).toBe('vertal-coder-gpu');
    // pedido médio: só o 2º (mais forte) aguenta
    const chain = buildChain(env, { effort: 'auto', promptTokens: 5_000 });
    expect(chain[0].id).toBe('vca-self-hosted-2');
    expect(chain.some((m) => m.id === 'vca-self-hosted')).toBe(false);
    expect(selfHostedModels({ VERTAL_OLLAMA_URL_2: 'https://gpu.example.com' }).map((m) => m.id)).toEqual(['vca-self-hosted-2']);
  });

  it('monta a URL do Ollama compatível com OpenAI e o modelo padrão para CPU', () => {
    const m = selfHostedModel({ VERTAL_OLLAMA_URL: 'https://ollama.vertal.dev/v1/' })!;
    expect(m.url).toBe('https://ollama.vertal.dev/v1/chat/completions');
    expect(m.model).toBe('qwen2.5-coder:7b');
    expect(selfHostedModel({ VERTAL_OLLAMA_URL: 'ftp://x' })).toBeNull();
  });

  it('com imagem, só modelos com visão', () => {
    const chain = buildChain({ ...OR, GROQ_API_KEY: 'g' }, { effort: 'auto', needsVision: true });
    expect(chain.length).toBeGreaterThan(0);
    expect(chain.every((m) => m.vision)).toBe(true);
  });

  it('esforço rápido inclui o modelo relâmpago; pedido grande o descarta (8K tokens/min)', () => {
    const env = { ...OR, GROQ_API_KEY: 'g' };
    expect(buildChain(env, { effort: 'low' }).some((m) => m.id === 'vca-flash-free')).toBe(true);
    expect(buildChain(env, { effort: 'low', promptTokens: 20_000 }).some((m) => m.id === 'vca-flash-free')).toBe(false);
  });

  it('descarta modelo grátis que sumiu do catálogo ao vivo, mas mantém o roteador grátis', () => {
    const kept = reconcileFreeModels(VCA_FREE_CATALOG, ['google/gemma-4-31b-it:free']);
    const or = kept.filter((m) => m.provider === 'openrouter').map((m) => m.model);
    expect(or).toEqual(['google/gemma-4-31b-it:free', 'openrouter/free']);
    expect(reconcileFreeModels(VCA_FREE_CATALOG, null)).toBe(VCA_FREE_CATALOG);
  });

  it('lista grátis pode ser trocada por env sem deploy', () => {
    const chain = buildChain({ ...OR, VERTAL_CODE_AI_FREE_MODELS: 'foo/bar:free' }, { effort: 'high' });
    expect(chain[0].model).toBe('foo/bar:free');
  });

  it('cota esgotada, sem crédito, timeout e 5xx pulam para o próximo modelo', () => {
    for (const s of [null, 429, 402, 408, 500, 503, 404]) expect(shouldFallback(s)).toBe(true);
    expect(shouldFallback(200)).toBe(false);
  });

  it('corpo da requisição: JSON quando suportado, esforço de raciocínio e imagens removidas de modelo sem visão', () => {
    const noVision = VCA_FREE_CATALOG.find((m) => !m.vision)!;
    const body = requestBody(
      noVision,
      [{ role: 'user', content: [{ type: 'text', text: 'oi' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } }] }],
      { effort: 'max', json: true, maxTokens: 100 },
    );
    expect(typeof (body.messages as Array<{ content: unknown }>)[0].content).toBe('string');
    expect(body.reasoning).toEqual({ effort: 'high' });
    const jsonModel = VCA_FREE_CATALOG.find((m) => m.jsonMode)!;
    expect(requestBody(jsonModel, [], { effort: 'auto', json: true, maxTokens: 1 }).response_format).toEqual({ type: 'json_object' });
  });

  it('o usuário só vê nomes Vertal (sem nomes de provedor)', () => {
    const banned = /openrouter|ollama|groq|gemini|google|nvidia|deepseek|qwen|particle|gemma|nemotron/i;
    for (const m of buildChain({ ...OR, GEMINI_API_KEY: 'k', GROQ_API_KEY: 'g', VERTAL_OLLAMA_URL: 'https://x.dev', VERTAL_CODE_AI_ALLOW_PAID: 'true' }, { effort: 'auto' })) {
      const info = publicModelInfo(m);
      expect(info.label).toMatch(/^Vertal/);
      expect(JSON.stringify(info)).not.toMatch(banned);
    }
  });
});

import { isVcaUserAllowed, vcaAllowedUserIds } from '../../../supabase/functions/_shared/vertalCodeAi/router';

describe('VERTAL Code AI · lista de liberação por usuário', () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  it('desligado: ninguém passa, nem quem está na lista', () => {
    expect(isVcaUserAllowed({ VERTAL_CODE_AI_USER_IDS: A }, A)).toBe(false);
  });
  it('ligado sem lista: comportamento antigo (todos)', () => {
    expect(vcaAllowedUserIds({ VERTAL_CODE_AI_ENABLED: 'true' })).toBeNull();
    expect(isVcaUserAllowed({ VERTAL_CODE_AI_ENABLED: 'true' }, B)).toBe(true);
    expect(isVcaUserAllowed({ VERTAL_CODE_AI_ENABLED: 'true', VERTAL_CODE_AI_USER_IDS: ' ' }, B)).toBe(true);
  });
  it('ligado com lista: só quem está nela', () => {
    const env = { VERTAL_CODE_AI_ENABLED: 'true', VERTAL_CODE_AI_USER_IDS: ` ${A.toUpperCase()} ,, ` };
    expect(vcaAllowedUserIds(env)).toEqual([A]);
    expect(isVcaUserAllowed(env, A)).toBe(true);
    expect(isVcaUserAllowed(env, B)).toBe(false);
    expect(isVcaUserAllowed(env, '')).toBe(false);
    expect(isVcaUserAllowed(env, null)).toBe(false);
    expect(isVcaUserAllowed({ ...env, VERTAL_CODE_AI_USER_IDS: `${B},${A}` }, A)).toBe(true);
  });
});
