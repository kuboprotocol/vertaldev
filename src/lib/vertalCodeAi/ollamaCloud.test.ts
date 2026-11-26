import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildChain,
  buildOptionChain,
  expandVcaEnv,
  ollamaCloudModels,
  requestBody,
} from '../../../supabase/functions/_shared/vertalCodeAi/router';
import { runChain } from '../../../supabase/functions/_shared/vertalCodeAi/chainRunner';
import { makeDecider, OWN_DECIDE_TIMEOUT_MS, type DecisionQuestions } from '../../../supabase/functions/_shared/vertalCodeAi/decide';

// Produção (26/11/2026): VM + GPU + Ollama Cloud, tudo de GPU/nuvem dentro do VERTAL_GPU_CONFIG.
const CLOUD_CFG = {
  VERTAL_OLLAMA_CLOUD_URL: 'https://ollama.com',
  VERTAL_OLLAMA_CLOUD_KEY: 'ok-cloud',
  VERTAL_OLLAMA_CLOUD_CODE_MODEL: 'kimi-k2.7-code',
  VERTAL_OLLAMA_CLOUD_FAST_MODEL: 'deepseek-v4.1-flash',
};
const BASE = {
  OPENROUTER_API_KEY: 'or',
  GEMINI_API_KEY: 'g',
  GROQ_API_KEY: 'q',
  DEEPSEEK_API_KEY: 'd',
  VERTAL_OLLAMA_URL: 'https://llm.vertalrun.com',
  VERTAL_OLLAMA_TOKEN: 'vm',
  VERTAL_OLLAMA_MAX_INPUT_TOKENS: '3000',
};
const GPU = { VERTAL_OLLAMA_URL_2: 'https://gpu.modal.run', VERTAL_OLLAMA_TOKEN_2: 'gpu', VERTAL_OLLAMA_MAX_INPUT_TOKENS_2: '12000' };
const env = (extra: Record<string, string> = {}, cfg: Record<string, string> = CLOUD_CFG) =>
  expandVcaEnv({ ...BASE, ...extra, VERTAL_GPU_CONFIG: JSON.stringify({ ...GPU, ...cfg }) });
const ids = (l: { id: string }[]) => l.map((m) => m.id);

describe('Ollama Cloud · config e ordem', () => {
  it('vem só do VERTAL_GPU_CONFIG e monta a URL OpenAI-compatível', () => {
    const e = env();
    expect(e.VERTAL_OLLAMA_CLOUD_KEY).toBe('ok-cloud');
    const [code, fast] = ollamaCloudModels(e);
    expect(code).toMatchObject({ id: 'vca-ollama-code', model: 'kimi-k2.7-code', url: 'https://ollama.com/v1/chat/completions', provider: 'ollama_cloud', keyEnv: 'VERTAL_OLLAMA_CLOUD_KEY' });
    expect(fast).toMatchObject({ id: 'vca-ollama-fast', model: 'deepseek-v4.1-flash' });
    expect(ollamaCloudModels(env({}, { ...CLOUD_CFG, VERTAL_OLLAMA_CLOUD_URL: 'https://ollama.com/v1/' }))[0].url).toBe('https://ollama.com/v1/chat/completions');
  });

  it('sem URL ou chave, ou com ENABLED=false: nada muda', () => {
    expect(ollamaCloudModels(env({}, {}))).toEqual([]);
    expect(ollamaCloudModels(env({}, { VERTAL_OLLAMA_CLOUD_URL: 'https://ollama.com' }))).toEqual([]);
    expect(ollamaCloudModels(env({}, { ...CLOUD_CFG, VERTAL_OLLAMA_CLOUD_ENABLED: 'false' }))).toEqual([]);
    const without = buildChain(env({ VERTAL_CODE_AI_ALLOW_PAID: 'true' }, {}), { effort: 'auto' });
    expect(ids(without).some((i) => i.startsWith('vca-ollama'))).toBe(false);
  });

  it('Auto: própria (VM → GPU) → Nuvem (código primeiro) → grátis → pagos', () => {
    const chain = ids(buildChain(env({ VERTAL_CODE_AI_ALLOW_PAID: 'true' }), { effort: 'auto', promptTokens: 1_000 }));
    expect(chain.slice(0, 4)).toEqual(['vca-self-hosted', 'vca-self-hosted-2', 'vca-ollama-code', 'vca-ollama-fast']);
    const firstFree = chain.findIndex((i) => i.endsWith('-free'));
    const firstPaid = chain.indexOf('vca-turbo-direct');
    expect(firstFree).toBeGreaterThan(chain.indexOf('vca-ollama-fast'));
    expect(firstPaid).toBeGreaterThan(firstFree);
  });

  it('pedido rápido (esforço low): modelo rápido antes do de código', () => {
    const chain = ids(buildChain(env(), { effort: 'low', promptTokens: 500 }));
    expect(chain.indexOf('vca-ollama-fast')).toBeLessThan(chain.indexOf('vca-ollama-code'));
    expect(chain.indexOf('vca-ollama-code')).toBeLessThan(chain.findIndex((i) => i.endsWith('-free')));
  });

  it('sem ALLOW_PAID: Nuvem entra (é config própria), pagos de sempre não', () => {
    const chain = ids(buildChain(env(), { effort: 'auto' }));
    expect(chain).toContain('vca-ollama-code');
    expect(chain).not.toContain('vca-turbo-direct');
  });

  it('opções: Code/Pro/Turbo com Nuvem logo após a própria; Livre (coordenação/Decide) sem Nuvem', () => {
    const e = env({ VERTAL_CODE_AI_ALLOW_PAID: 'true' });
    const code = ids(buildOptionChain(e, { option: 'code', effort: 'auto', promptTokens: 1_000 }));
    expect(code.slice(0, 4)).toEqual(['vca-self-hosted', 'vca-self-hosted-2', 'vca-ollama-code', 'vca-ollama-fast']);
    const turbo = ids(buildOptionChain(e, { option: 'turbo', effort: 'auto', promptTokens: 1_000 }));
    expect(turbo.indexOf('vca-ollama-fast')).toBeLessThan(turbo.indexOf('vca-ollama-code'));
    const livre = ids(buildOptionChain(e, { option: 'livre', effort: 'low', promptTokens: 1_000 }));
    expect(livre.some((i) => i.startsWith('vca-ollama'))).toBe(false);
    expect(ids(buildOptionChain(e, { option: 'code', effort: 'auto', modelId: 'vca-ollama-fast' }))).toEqual(['vca-ollama-fast']);
  });

  it('pedido com imagem: Nuvem (sem visão) fica de fora', () => {
    expect(ids(buildChain(env(), { effort: 'auto', needsVision: true })).some((i) => i.startsWith('vca-ollama'))).toBe(false);
  });

  it('pedido grande: GPU primeiro, Nuvem antes dos grátis', () => {
    const chain = ids(buildChain(env(), { effort: 'auto', promptTokens: 6_000 }));
    expect(chain.slice(0, 3)).toEqual(['vca-self-hosted-2', 'vca-ollama-code', 'vca-ollama-fast']);
  });

  it('corpo do pedido: sem streaming, JSON e teto de saída', () => {
    const [code] = ollamaCloudModels(env());
    const b = requestBody(code, [{ role: 'user', content: 'oi' }], { effort: 'auto', json: true, maxTokens: 20_000 });
    expect(b).toMatchObject({ model: 'kimi-k2.7-code', max_tokens: 8_000, response_format: { type: 'json_object' } });
    expect(b.stream).toBeUndefined();
  });

  it('runChain: manda a chave como Bearer à Nuvem e cai para o próximo se ela falhar', async () => {
    const [code, fast] = ollamaCloudModels(env());
    const seen: Array<{ url: string; auth: string; model: string }> = [];
    const f = async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      seen.push({ url, auth: (init.headers as Record<string, string>).Authorization, model: body.model });
      if (body.model === 'kimi-k2.7-code') return new Response('busy', { status: 503 });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 5, completion_tokens: 1 } }));
    };
    const r = await runChain([code, fast], [{ role: 'user', content: 'oi' }], { json: false, maxTokens: 50, effort: 'auto', deadline: Date.now() + 60_000 }, { fetch: f, env: env(), cooldown: new Map() });
    expect(r).toMatchObject({ content: 'ok', label: 'Vertal Nuvem · Rápido', cost: 'paid', fellBack: true });
    expect(seen.map((s) => s.auth)).toEqual(['Bearer ok-cloud', 'Bearer ok-cloud']);
    expect(seen[0].url).toBe('https://ollama.com/v1/chat/completions');
  });
});

describe('Vertal Decide · prazo da própria (Modal) 30 s, Jev inalterado', () => {
  const Q: DecisionQuestions = { is_bug: { type: 'noul', instructions: 'É um defeito?' } };
  const OWN = { VERTAL_OWN_DECIDE_URL: 'https://x--vertal-decide.modal.run', VERTAL_OWN_DECIDE_TOKEN: 't' };
  const OR = { OPENROUTER_API_KEY: 'or', VERTAL_CODE_AI_ALLOW_PAID: 'true' };
  const ANS = { answers: { is_bug: { type: 'noul', noul: 0.9 } } };
  afterEach(() => vi.useRealTimers());

  /** fetch falso: a própria responde depois de `ownMs`; o Jev nunca responde (só aborta). */
  const fakeFetch = (ownMs: number) => {
    const calls: string[] = [];
    const f = (url: string, init: RequestInit) => {
      const which = url.includes('modal') ? 'own' : 'jev';
      calls.push(which);
      return new Promise<Response>((res, rej) => {
        const t = which === 'own' ? setTimeout(() => res(new Response(JSON.stringify(ANS))), ownMs) : undefined;
        init.signal!.addEventListener('abort', () => {
          if (t) clearTimeout(t);
          rej(new DOMException('t', 'TimeoutError'));
        });
      });
    };
    return { f, calls };
  };

  it('padrão é 45 s', () => expect(OWN_DECIDE_TIMEOUT_MS).toBe(45_000));

  it('própria fria que responde em 25 s agora vale (antes caía no Jev aos 15 s)', async () => {
    vi.useFakeTimers();
    const { f, calls } = fakeFetch(25_000);
    const p = makeDecider({ fetch: f, env: { ...OWN, ...OR } })({ a: 1 }, Q);
    await vi.advanceTimersByTimeAsync(26_000);
    const r = await p;
    expect(r.source).toBe('own');
    expect(calls).toEqual(['own']);
  });

  it('própria fria que responde em 40 s agora vale (antes caía no Jev aos 30 s)', async () => {
    vi.useFakeTimers();
    const { f, calls } = fakeFetch(40_000);
    const p = makeDecider({ fetch: f, env: { ...OWN, ...OR } })({ a: 1 }, Q);
    await vi.advanceTimersByTimeAsync(41_000);
    const r = await p;
    expect(r.source).toBe('own');
    expect(calls).toEqual(['own']);
  });

  it('própria acima de 45 s cai no Jev, que segue com 15 s', async () => {
    vi.useFakeTimers();
    const { f, calls } = fakeFetch(90_000);
    const p = makeDecider({ fetch: f, env: { ...OWN, ...OR } })({ a: 1 }, Q);
    await vi.advanceTimersByTimeAsync(44_000);
    expect(calls).toEqual(['own']);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(calls).toEqual(['own', 'jev']);
    await vi.advanceTimersByTimeAsync(14_000);
    let done = false;
    void p.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1_500);
    expect((await p).source).toBe('none');
  });

  it('VERTAL_OWN_DECIDE_TIMEOUT_MS (também via VERTAL_GPU_CONFIG) ajusta só a própria', async () => {
    vi.useFakeTimers();
    const e = expandVcaEnv({ ...OR, VERTAL_GPU_CONFIG: JSON.stringify({ ...OWN, VERTAL_OWN_DECIDE_TIMEOUT_MS: '5000' }) });
    const { f, calls } = fakeFetch(60_000);
    const p = makeDecider({ fetch: f, env: e })({ a: 1 }, Q);
    await vi.advanceTimersByTimeAsync(5_500);
    expect(calls).toEqual(['own', 'jev']);
    await vi.advanceTimersByTimeAsync(16_000);
    expect((await p).source).toBe('none');
  });
});
