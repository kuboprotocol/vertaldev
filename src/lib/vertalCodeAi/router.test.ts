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

  it('servidor próprio entra depois dos grátis e antes do pago (ou na frente, se preferido)', () => {
    const env = { ...OR, VERTAL_OLLAMA_URL: 'https://ollama.vertal.dev/', VERTAL_CODE_AI_ALLOW_PAID: '1' };
    const chain = buildChain(env, { effort: 'auto' });
    const costs = chain.map((m) => m.cost);
    expect(costs.indexOf('self_hosted')).toBeGreaterThan(costs.lastIndexOf('free'));
    expect(costs.indexOf('self_hosted')).toBeLessThan(costs.indexOf('paid'));
    const pref = buildChain({ ...env, VERTAL_CODE_AI_PREFER_SELF_HOSTED: 'true' }, { effort: 'auto' });
    expect(pref[0].cost).toBe('self_hosted');
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
