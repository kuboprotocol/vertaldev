import { describe, expect, it } from 'vitest';
import {
  buildChain,
  buildOptionChain,
  estimateCostUsd,
  extractImages,
  extraProviderModels,
  imageRequestBody,
  isVcaMediaEnabled,
  mediaCostUsd,
  parseVcaOption,
  publicModelInfo,
  requestBody,
  retailCredits,
  VCA_FAMILY_CATALOG,
  VCA_IMAGE_MODELS,
  VCA_OPTION_LABEL,
  VCA_OPTION_MODELS,
  VCA_VIDEO_MODELS,
  videoRequestBody,
  allTextModels,
} from '../../../supabase/functions/_shared/vertalCodeAi/router';

const OR = { OPENROUTER_API_KEY: 'x' };
const PAID = { ...OR, DEEPSEEK_API_KEY: 'd', VERTAL_CODE_AI_ALLOW_PAID: 'true' };
const OWN = { VERTAL_OLLAMA_URL: 'https://llm.vertalrun.com' };
const BANNED = /openrouter|ollama|groq|gemini|google|nvidia|deepseek|qwen|particle|gemma|nemotron|kimi|moonshot|llama|meta/i;

describe('VERTAL Code AI · opções Vertal (famílias de modelos)', () => {
  it('"auto" é exatamente a cadeia de antes', () => {
    const env = { ...PAID, ...OWN };
    expect(buildOptionChain(env, { option: 'auto', effort: 'auto' }).map((m) => m.id)).toEqual(
      buildChain(env, { effort: 'auto' }).map((m) => m.id),
    );
    expect(parseVcaOption('qualquer')).toBe('auto');
    expect(parseVcaOption('code')).toBe('code');
  });

  it('todas as opções mantêm a LLM própria primeiro para pedido pequeno e pulam pedido grande', () => {
    const env = { ...PAID, ...OWN };
    for (const option of ['code', 'livre', 'turbo', 'pro'] as const) {
      expect(buildOptionChain(env, { option, effort: 'auto', promptTokens: 200 })[0].id).toBe('vca-self-hosted');
      expect(buildOptionChain(env, { option, effort: 'auto', promptTokens: 5_000 }).some((m) => m.cost === 'self_hosted')).toBe(false);
    }
  });

  it('o segundo endpoint próprio (_2) continua funcionando nas opções', () => {
    const env = { ...PAID, ...OWN, VERTAL_OLLAMA_URL_2: 'https://gpu.example.com', VERTAL_OLLAMA_MAX_INPUT_TOKENS_2: '30000' };
    const ids = buildOptionChain(env, { option: 'code', effort: 'auto', promptTokens: 5_000 }).map((m) => m.id);
    expect(ids[0]).toBe('vca-self-hosted-2');
  });

  it('Vertal Code: própria → grátis → Ágil → Code Pro → Turbo, nessa ordem', () => {
    const ids = buildOptionChain({ ...PAID, ...OWN }, { option: 'code', effort: 'auto' }).map((m) => m.id);
    const costs = buildOptionChain({ ...PAID, ...OWN }, { option: 'code', effort: 'auto' }).map((m) => m.cost);
    expect(ids[0]).toBe('vca-self-hosted');
    expect(costs.slice(0, -1).lastIndexOf('free')).toBeLessThan(costs.indexOf('paid'));
    expect(ids.indexOf('vca-code-agile')).toBeLessThan(ids.indexOf('vca-code-pro'));
    expect(ids.indexOf('vca-code-pro')).toBeLessThan(ids.indexOf('vca-turbo-direct'));
    expect(ids[ids.length - 1]).toBe('vca-any-free'); // reserva grátis por último
  });

  it('sem ALLOW_PAID, nenhuma opção usa modelo pago (cai na reserva grátis)', () => {
    for (const option of ['code', 'livre', 'turbo', 'pro'] as const) {
      const chain = buildOptionChain({ ...OR, DEEPSEEK_API_KEY: 'd' }, { option, effort: 'auto' });
      expect(chain.some((m) => m.cost === 'paid')).toBe(false);
      expect(chain.length).toBeGreaterThan(0);
    }
  });

  it('Vertal Livre nunca usa pago, mesmo liberado', () => {
    const chain = buildOptionChain(PAID, { option: 'livre', effort: 'auto' });
    expect(chain.every((m) => m.cost === 'free')).toBe(true);
    const models = chain.map((m) => m.model);
    expect(models).toContain('google/gemma-4-26b-a4b-it:free');
    expect(models).toContain('nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free');
  });

  it('Turbo e Pro têm as famílias certas', () => {
    const turbo = buildOptionChain(PAID, { option: 'turbo', effort: 'auto' }).map((m) => m.model);
    expect(turbo).toEqual(expect.arrayContaining(['deepseek-chat', 'deepseek/deepseek-v4-flash', 'meta-llama/llama-4-maverick']));
    const pro = buildOptionChain(PAID, { option: 'pro', effort: 'auto' }).map((m) => m.model);
    expect(pro[0]).toBe('moonshotai/kimi-k2.6');
    expect(pro).toContain('moonshotai/kimi-k2.7-code');
  });

  it('modelId fixa um modelo da opção; id desconhecido ou de outra opção é ignorado', () => {
    expect(buildOptionChain(PAID, { option: 'code', effort: 'auto', modelId: 'vca-code-pro' }).map((m) => m.id)).toEqual(['vca-code-pro']);
    expect(buildOptionChain(PAID, { option: 'livre', effort: 'auto', modelId: 'vca-code-pro' }).length).toBeGreaterThan(1);
    // pago fixado sem liberar pago: não entra
    expect(buildOptionChain(OR, { option: 'pro', effort: 'auto', modelId: 'vca-pro' }).some((m) => m.id === 'vca-pro')).toBe(false);
  });

  it('catálogo ao vivo (só ":free") não derruba os pagos da opção nem o modelo pago fixado', () => {
    const live = ['google/gemma-4-31b-it:free', 'nvidia/nemotron-3-ultra-550b-a55b:free'];
    const code = buildOptionChain(PAID, { option: 'code', effort: 'auto', liveFreeIds: live }).map((m) => m.id);
    expect(code).toEqual(expect.arrayContaining(['vca-code-agile', 'vca-code-pro', 'vca-code-classic', 'vca-turbo-paid']));
    expect(code).not.toContain('vca-code-free');
    for (const [option, id] of [['code', 'vca-code-pro'], ['pro', 'vca-pro'], ['turbo', 'vca-turbo-v4'], ['turbo', 'vca-open']] as const) {
      expect(buildOptionChain(PAID, { option, effort: 'auto', liveFreeIds: live, modelId: id }).map((m) => m.id)).toEqual([id]);
    }
  });

  it('com imagem, só modelos com visão; grátis que sumiu do catálogo ao vivo sai', () => {
    expect(buildOptionChain(PAID, { option: 'pro', effort: 'auto', needsVision: true }).every((m) => m.vision)).toBe(true);
    const livre = buildOptionChain(PAID, { option: 'livre', effort: 'auto', liveFreeIds: ['google/gemma-4-31b-it:free'] });
    expect(livre.filter((m) => m.provider === 'openrouter').map((m) => m.model)).toEqual(['google/gemma-4-31b-it:free', 'openrouter/free']);
  });

  it('todo id das opções existe no catálogo e todo novo modelo tem teto de saída e preço', () => {
    const ids = new Set(allTextModels({}).map((m) => m.id));
    for (const list of Object.values(VCA_OPTION_MODELS)) for (const id of list) expect(ids.has(id)).toBe(true);
    for (const m of VCA_FAMILY_CATALOG) {
      expect(m.maxOutputTokens).toBeGreaterThan(0);
      expect(m.price).toBeDefined();
      expect(requestBody(m, [{ role: 'user', content: 'oi' }], { effort: 'auto', json: false, maxTokens: 100_000 }).max_tokens).toBe(m.maxOutputTokens);
    }
  });

  it('o usuário só vê nomes Vertal em todas as opções', () => {
    for (const label of Object.values(VCA_OPTION_LABEL)) expect(label).toMatch(/^Vertal/);
    for (const option of ['code', 'livre', 'turbo', 'pro'] as const) {
      for (const m of buildOptionChain({ ...PAID, ...OWN, GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' }, { option, effort: 'auto' })) {
        const info = publicModelInfo(m);
        expect(info.label).toMatch(/^Vertal/);
        expect(JSON.stringify(info)).not.toMatch(BANNED);
      }
    }
    for (const m of [...VCA_IMAGE_MODELS, ...VCA_VIDEO_MODELS]) expect(m.label).not.toMatch(BANNED);
  });
});

describe('VERTAL Code AI · preço de varejo (cobrança desligada)', () => {
  it('cobrança v2: custo × 1,69 ÷ US$0,03, com piso de custo (nunca zero)', () => {
    // código: piso US$0,002 × 1,69 = US$0,00338 → 0,11 crédito
    expect(retailCredits(0)).toBe(0.11);
    expect(retailCredits(0.01)).toBe(0.56);
    expect(retailCredits(-1)).toBe(0.11);
    expect(retailCredits(0.02, 'image')).toBe(1.13);
  });
  it('estimativa por tokens: grátis = 0, pago pela tabela', () => {
    const agile = VCA_FAMILY_CATALOG.find((m) => m.id === 'vca-code-agile')!;
    expect(estimateCostUsd(agile, 1_000_000, 1_000_000)).toBeCloseTo(0.35, 6);
    const free = VCA_FAMILY_CATALOG.find((m) => m.cost === 'free')!;
    expect(estimateCostUsd(free, 1_000_000, 1_000_000)).toBe(0);
  });
});

describe('VERTAL Code AI · provedor extra por segredo', () => {
  it('desligado sem URL https + chave + modelos', () => {
    expect(extraProviderModels({})).toEqual([]);
    expect(extraProviderModels({ VERTAL_EXTRA_PROVIDER_URL: 'http://x', VERTAL_EXTRA_PROVIDER_KEY: 'k', VERTAL_EXTRA_PROVIDER_MODELS: 'a' })).toEqual([]);
  });
  it('entra depois dos grátis e antes dos pagos; "paid" só com ALLOW_PAID', () => {
    const extra = { VERTAL_EXTRA_PROVIDER_URL: 'https://integrate.example.com/v1/', VERTAL_EXTRA_PROVIDER_KEY: 'k', VERTAL_EXTRA_PROVIDER_MODELS: 'vendor/model-a, vendor/model-b' };
    const ms = extraProviderModels(extra);
    expect(ms.map((m) => m.url)).toEqual(['https://integrate.example.com/v1/chat/completions', 'https://integrate.example.com/v1/chat/completions']);
    const chain = buildChain({ ...PAID, ...extra }, { effort: 'auto' });
    const ids = chain.map((m) => m.id);
    expect(ids.indexOf('vca-extra-1')).toBeGreaterThan(ids.lastIndexOf('vca-any-free'));
    expect(ids.indexOf('vca-extra-1')).toBeLessThan(ids.indexOf('vca-turbo-direct'));
    const paidExtra = { ...extra, VERTAL_EXTRA_PROVIDER_COST: 'paid' };
    expect(buildChain({ ...OR, ...paidExtra }, { effort: 'auto' }).some((m) => m.id.startsWith('vca-extra'))).toBe(false);
    expect(buildOptionChain({ ...OR, ...extra }, { option: 'code', effort: 'auto' }).some((m) => m.id === 'vca-extra-2')).toBe(true);
    for (const m of ms) expect(publicModelInfo(m).label).toMatch(/^Vertal/);
  });
});

describe('VERTAL Code AI · imagem e vídeo (desligado por padrão)', () => {
  it('só liga com flag + pago liberado + chave', () => {
    expect(isVcaMediaEnabled(PAID)).toBe(false);
    expect(isVcaMediaEnabled({ ...OR, VERTAL_CODE_AI_MEDIA_ENABLED: 'true' })).toBe(false);
    expect(isVcaMediaEnabled({ VERTAL_CODE_AI_ALLOW_PAID: 'true', VERTAL_CODE_AI_MEDIA_ENABLED: 'true' })).toBe(false);
    expect(isVcaMediaEnabled({ ...PAID, VERTAL_CODE_AI_MEDIA_ENABLED: 'true' })).toBe(true);
  });
  it('corpo de imagem pede saída de imagem e lê a resposta', () => {
    const body = imageRequestBody(VCA_IMAGE_MODELS[0], 'um gato', ['data:image/png;base64,AA']);
    expect(body.modalities).toEqual(['image', 'text']);
    const out = extractImages({ choices: [{ message: { content: 'ok', images: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,QQ' } }, { image_url: { url: 'javascript:x' } }] } }] });
    expect(out).toEqual({ images: ['data:image/png;base64,QQ'], text: 'ok' });
    expect(extractImages(null)).toEqual({ images: [], text: '' });
  });
  it('vídeo curto e barato por padrão, com custo estimado', () => {
    const v = VCA_VIDEO_MODELS[0];
    const body = videoRequestBody(v, 'x'.repeat(5_000));
    expect(body.duration).toBeLessThanOrEqual(6);
    expect((body.prompt as string).length).toBe(2_000);
    expect(mediaCostUsd(v)).toBeLessThan(0.15);
    expect(mediaCostUsd(VCA_IMAGE_MODELS[0])).toBeLessThan(0.1);
    expect(body.generate_audio).toBe(false);
    expect('generate_audio' in videoRequestBody(VCA_VIDEO_MODELS[1], 'x')).toBe(false);
  });
});
