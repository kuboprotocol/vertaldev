import { describe, expect, it } from 'vitest';
import {
  buildChain,
  buildOptionChain,
  expandVcaEnv,
  isVcaUserAllowed,
  extractOwnImage,
  imageModels,
  mediaCostUsd,
  orderSelfHosted,
  ownImageRequestBody,
  ownVideoRequestBody,
  ownVideoStatus,
  requestBody,
  selfHostedModels,
  VCA_IMAGE_MODELS,
  VCA_OWN_JOB_PREFIX,
  VCA_VIDEO_MODELS,
  videoModels,
} from '../../../supabase/functions/_shared/vertalCodeAi/router';

const OR = { OPENROUTER_API_KEY: 'x' };
const VM = { VERTAL_OLLAMA_URL: 'https://llm.vertalrun.com', VERTAL_OLLAMA_MAX_INPUT_TOKENS: '3000' };
const GPU = {
  VERTAL_OLLAMA_URL_2: 'https://gpu.example.modal.run',
  VERTAL_OLLAMA_TOKEN_2: 't',
  VERTAL_OLLAMA_MODEL_2: 'vertal-coder-gpu',
  VERTAL_OLLAMA_MAX_INPUT_TOKENS_2: '12000',
};
const BANNED = /openrouter|ollama|groq|gemini|google|nvidia|deepseek|qwen|flux|wan|modal|veo/i;

describe('VERTAL Code AI · LLM própria em GPU (2º endpoint)', () => {
  it('pedido pequeno: VM primeiro, GPU logo depois, antes dos grátis', () => {
    const ids = buildChain({ ...OR, ...VM, ...GPU }, { effort: 'auto', promptTokens: 800 }).map((m) => m.id);
    expect(ids.slice(0, 2)).toEqual(['vca-self-hosted', 'vca-self-hosted-2']);
  });

  it('pedido grande (> 3 000 tokens): GPU primeiro (a VM nem entra)', () => {
    const ids = buildChain({ ...OR, ...VM, ...GPU }, { effort: 'auto', promptTokens: 5_000 }).map((m) => m.id);
    expect(ids[0]).toBe('vca-self-hosted-2');
    expect(ids).not.toContain('vca-self-hosted');
  });

  it('orderSelfHosted põe a GPU na frente acima do limite, mesmo se a VM aguentasse', () => {
    const both = selfHostedModels({ VERTAL_OLLAMA_URL: 'https://a.example', VERTAL_OLLAMA_URL_2: 'https://b.example' });
    expect(orderSelfHosted({}, both, 1_000).map((m) => m.id)).toEqual(['vca-self-hosted', 'vca-self-hosted-2']);
    expect(orderSelfHosted({}, both, 3_500).map((m) => m.id)).toEqual(['vca-self-hosted-2', 'vca-self-hosted']);
    expect(orderSelfHosted({ VERTAL_OLLAMA_2_FIRST_ABOVE_TOKENS: '5000' }, both, 3_500).map((m) => m.id)).toEqual([
      'vca-self-hosted',
      'vca-self-hosted-2',
    ]);
    expect(orderSelfHosted({}, both).map((m) => m.id)).toEqual(['vca-self-hosted', 'vca-self-hosted-2']);
  });

  it('opções Vertal (Code) também usam a ordem VM → GPU e GPU primeiro em pedido grande', () => {
    const env = { ...OR, ...VM, ...GPU };
    expect(buildOptionChain(env, { option: 'code', effort: 'auto', promptTokens: 500 }).map((m) => m.id).slice(0, 2)).toEqual([
      'vca-self-hosted',
      'vca-self-hosted-2',
    ]);
    expect(buildOptionChain(env, { option: 'code', effort: 'auto', promptTokens: 6_000 })[0].id).toBe('vca-self-hosted-2');
  });

  it('a GPU fala OpenAI-compatível: /v1/chat/completions, modelo vertal-coder-gpu, streaming', () => {
    const gpu = selfHostedModels(GPU)[0];
    expect(gpu.url).toBe('https://gpu.example.modal.run/v1/chat/completions');
    expect(gpu.keyEnv).toBe('VERTAL_OLLAMA_TOKEN_2');
    const body = requestBody(gpu, [{ role: 'user', content: 'oi' }], { effort: 'auto', json: true, maxTokens: 9_000 });
    expect(body.model).toBe('vertal-coder-gpu');
    expect(body.stream).toBe(true);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(BANNED.test(gpu.label)).toBe(false);
  });
});

describe('VERTAL Code AI · imagem e vídeo próprios (GPU)', () => {
  const MEDIA = {
    VERTAL_OWN_IMAGE_URL: 'https://img.example.modal.run/',
    VERTAL_OWN_IMAGE_TOKEN: 'i',
    VERTAL_OWN_VIDEO_URL: 'https://vid.example.modal.run',
    VERTAL_OWN_VIDEO_TOKEN: 'v',
  };

  it('sem segredos: tudo exatamente como antes', () => {
    expect(imageModels({})).toEqual(VCA_IMAGE_MODELS);
    expect(videoModels({})).toEqual(VCA_VIDEO_MODELS);
    // URL sem token (ou http) não liga nada
    expect(imageModels({ VERTAL_OWN_IMAGE_URL: 'https://x.example' })).toEqual(VCA_IMAGE_MODELS);
    expect(videoModels({ VERTAL_OWN_VIDEO_URL: 'http://x.example', VERTAL_OWN_VIDEO_TOKEN: 'v' })).toEqual(VCA_VIDEO_MODELS);
  });

  it('com segredos: própria é a 1ª opção e as de sempre ficam de reserva, na mesma ordem', () => {
    const img = imageModels(MEDIA);
    expect(img[0].provider).toBe('own');
    expect(img[0].url).toBe('https://img.example.modal.run');
    expect(img[0].keyEnv).toBe('VERTAL_OWN_IMAGE_TOKEN');
    expect(img.slice(1)).toEqual(VCA_IMAGE_MODELS);
    const vid = videoModels(MEDIA);
    expect(vid[0].provider).toBe('own');
    expect(vid[0].keyEnv).toBe('VERTAL_OWN_VIDEO_TOKEN');
    expect(vid.slice(1)).toEqual(VCA_VIDEO_MODELS);
    for (const m of [img[0], vid[0]]) expect(BANNED.test(m.label)).toBe(false);
  });

  it('custos estimados configuráveis por segredo', () => {
    expect(mediaCostUsd(imageModels(MEDIA)[0])).toBeCloseTo(0.003);
    expect(mediaCostUsd(videoModels(MEDIA)[0])).toBeCloseTo(0.08);
    const env = { ...MEDIA, VERTAL_OWN_IMAGE_COST: '0.01', VERTAL_OWN_VIDEO_COST: '0.05' };
    expect(mediaCostUsd(imageModels(env)[0])).toBeCloseTo(0.01);
    expect(mediaCostUsd(videoModels(env)[0])).toBeCloseTo(0.2);
  });

  it('corpos dos pedidos próprios', () => {
    expect(ownImageRequestBody('gato')).toEqual({ prompt: 'gato', width: 1024, height: 1024, steps: 4, format: 'jpeg' });
    expect(ownImageRequestBody('x'.repeat(3_000)).prompt).toHaveLength(2_000);
    expect(ownVideoRequestBody(videoModels(MEDIA)[0], 'mar')).toEqual({ prompt: 'mar', seconds: 4 });
  });

  it('lê a imagem e o status do endpoint próprio com segurança', () => {
    expect(extractOwnImage({ image: 'data:image/jpeg;base64,AAAA' })).toBe('data:image/jpeg;base64,AAAA');
    expect(extractOwnImage({ image: 'https://evil.example/a.jpg' })).toBeNull();
    expect(extractOwnImage(null)).toBeNull();
    expect(ownVideoStatus({ status: 'completed' })).toBe('completed');
    expect(ownVideoStatus({ status: 'failed' })).toBe('failed');
    expect(ownVideoStatus({ status: 'weird' })).toBe('pending');
    expect(ownVideoStatus(undefined)).toBe('pending');
    expect(VCA_OWN_JOB_PREFIX).toBe('vcaown_');
    // o job assinado só aceita [A-Za-z0-9_-] (mesma regra do verifyJob da função)
    expect(/^[A-Za-z0-9_-]+$/.test(`${VCA_OWN_JOB_PREFIX}fc-01M8AWMHNRABD9XV64N0R05AV3`)).toBe(true);
  });
});

describe('VERTAL Code AI · VERTAL_GPU_CONFIG (um só segredo)', () => {
  const cfg = JSON.stringify({
    VERTAL_OLLAMA_URL_2: 'https://gpu.example.modal.run',
    VERTAL_OLLAMA_TOKEN_2: 't',
    VERTAL_OLLAMA_MAX_INPUT_TOKENS_2: 12000,
    VERTAL_OWN_IMAGE_URL: 'https://img.example.modal.run',
    VERTAL_OWN_IMAGE_TOKEN: 'i',
    // chaves fora da GPU própria são ignoradas
    VERTAL_CODE_AI_ENABLED: 'true',
    VERTAL_CODE_AI_USER_IDS: '',
    VERTAL_OLLAMA_URL: 'https://hijack.example',
    OPENROUTER_API_KEY: 'k',
  });

  it('expande só as chaves da GPU própria, sem mexer em liga/desliga nem na lista de liberação', () => {
    const base = { VERTAL_CODE_AI_ENABLED: 'false', VERTAL_CODE_AI_USER_IDS: 'u1', VERTAL_OLLAMA_URL: 'https://llm.vertalrun.com', VERTAL_GPU_CONFIG: cfg };
    const env = expandVcaEnv(base);
    expect(env.VERTAL_OLLAMA_URL_2).toBe('https://gpu.example.modal.run');
    expect(env.VERTAL_OLLAMA_MAX_INPUT_TOKENS_2).toBe('12000');
    expect(env.VERTAL_OWN_IMAGE_URL).toBe('https://img.example.modal.run');
    expect(env.VERTAL_CODE_AI_ENABLED).toBe('false');
    expect(env.VERTAL_CODE_AI_USER_IDS).toBe('u1');
    expect(env.VERTAL_OLLAMA_URL).toBe('https://llm.vertalrun.com');
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
    expect(isVcaUserAllowed(env, 'u1')).toBe(false);
    expect(selfHostedModels(env).map((m) => m.id)).toEqual(['vca-self-hosted', 'vca-self-hosted-2']);
    expect(imageModels(env)[0].id).toBe('vca-image-own');
  });

  it('segredo avulso vence; JSON inválido ou ausente não muda nada', () => {
    const env = expandVcaEnv({ VERTAL_OLLAMA_URL_2: 'https://avulso.example', VERTAL_GPU_CONFIG: cfg });
    expect(env.VERTAL_OLLAMA_URL_2).toBe('https://avulso.example');
    const bad = { VERTAL_GPU_CONFIG: '{nope', X: '1' };
    expect(expandVcaEnv(bad)).toBe(bad);
    const none = { X: '1' };
    expect(expandVcaEnv(none)).toBe(none);
    expect(expandVcaEnv({ VERTAL_GPU_CONFIG: '["a"]' }).VERTAL_OLLAMA_URL_2).toBeUndefined();
  });
});
