import { describe, expect, it } from 'vitest';
import { buildChain, buildOptionChain, expandVcaEnv, type VcaModel } from '../../../supabase/functions/_shared/vertalCodeAi/router';
import { runChain } from '../../../supabase/functions/_shared/vertalCodeAi/chainRunner';
import {
  FreeQuotaMonitor,
  freeTierModels,
  quotaKey,
  quotaLimits,
  type QuotaStore,
  zonedDay,
} from '../../../supabase/functions/_shared/vertalCodeAi/freeQuota';

const BASE = {
  OPENROUTER_API_KEY: 'or',
  DEEPSEEK_API_KEY: 'd',
  VERTAL_OLLAMA_URL: 'https://llm.vertalrun.com',
  VERTAL_OLLAMA_TOKEN: 'vm',
  VERTAL_OLLAMA_MAX_INPUT_TOKENS: '3000',
  VERTAL_CEREBRAS_KEY: 'cb',
  VERTAL_GEMINI_KEY: 'gm',
};
const CFG = {
  VERTAL_OLLAMA_URL_2: 'https://gpu.modal.run',
  VERTAL_OLLAMA_TOKEN_2: 'gpu',
  VERTAL_OLLAMA_MAX_INPUT_TOKENS_2: '12000',
  VERTAL_OLLAMA_CLOUD_URL: 'https://ollama.com',
  VERTAL_OLLAMA_CLOUD_KEY: 'oc',
};
const env = (extra: Record<string, string> = {}, cfg: Record<string, string> = {}) =>
  expandVcaEnv({ ...BASE, ...extra, VERTAL_GPU_CONFIG: JSON.stringify({ ...CFG, ...cfg }) });
const ids = (l: { id: string }[]) => l.map((m) => m.id);

describe('grátis extras · ordem da cadeia', () => {
  it('Auto/Code/Turbo/Pro: própria → GPU → Nuvem → Veloz (Cerebras) → Leve+ (Gemini) → outros grátis → pagos', () => {
    const e = env({ VERTAL_CODE_AI_ALLOW_PAID: 'true' });
    for (const chain of [
      buildChain(e, { effort: 'auto', promptTokens: 500 }),
      buildOptionChain(e, { option: 'code', effort: 'auto', promptTokens: 500 }),
      buildOptionChain(e, { option: 'turbo', effort: 'auto', promptTokens: 500 }),
      buildOptionChain(e, { option: 'pro', effort: 'auto', promptTokens: 500 }),
    ]) {
      const l = ids(chain);
      const iGpu = l.indexOf('vca-self-hosted-2');
      const iCloud = Math.max(l.indexOf('vca-ollama-code'), l.indexOf('vca-ollama-fast'));
      const iCb = l.indexOf('vca-veloz-free');
      const iCb2 = l.indexOf('vca-veloz-free-2');
      const iGm = l.indexOf('vca-leve-free');
      expect(l[0]).toBe('vca-self-hosted');
      expect(iGpu).toBe(1);
      expect(iCloud).toBeGreaterThan(iGpu);
      expect(iCb).toBe(iCloud + 1);
      expect(iCb2).toBe(iCb + 1);
      expect(iGm).toBe(iCb2 + 1);
      const rest = l.slice(iGm + 1);
      const firstPaid = chain.findIndex((m, i) => i > iGm && m.cost === 'paid');
      expect(rest.length).toBeGreaterThan(0);
      if (firstPaid !== -1) expect(chain.slice(iGm + 1, firstPaid).every((m) => m.cost === 'free')).toBe(true);
    }
  });

  it('Livre (cadeia de coordenação/Decide) fica igual: sem os grátis extras', () => {
    const l = ids(buildOptionChain(env(), { option: 'livre', effort: 'low' }));
    expect(l.some((i) => i.startsWith('vca-veloz') || i.startsWith('vca-leve-free'))).toBe(false);
  });

  it('sem chave, ou VERTAL_FREE_TIER_ENABLED=false: nada muda', () => {
    const none = expandVcaEnv({ ...BASE, VERTAL_CEREBRAS_KEY: '', VERTAL_GEMINI_KEY: '' });
    expect(freeTierModels(none)).toEqual([]);
    expect(freeTierModels(env({}, { VERTAL_FREE_TIER_ENABLED: 'false' }))).toEqual([]);
    const onlyGemini = freeTierModels(expandVcaEnv({ ...BASE, VERTAL_CEREBRAS_KEY: '' }));
    expect(ids(onlyGemini)).toEqual(['vca-leve-free']);
  });

  it('modelos e contexto vêm do VERTAL_GPU_CONFIG (VERTAL_FREE_*); rótulos só Vertal', () => {
    const m = freeTierModels(env({}, { VERTAL_FREE_CEREBRAS_MODELS: 'a-1', VERTAL_FREE_GEMINI_MODELS: 'models/g-2,g-3', VERTAL_FREE_CEREBRAS_CONTEXT: '64000' }));
    expect(m.map((x) => x.model)).toEqual(['a-1', 'g-2', 'g-3']);
    expect(m[0]).toMatchObject({ provider: 'cerebras', keyEnv: 'VERTAL_CEREBRAS_KEY', context: 64_000, cost: 'free', url: 'https://api.cerebras.ai/v1/chat/completions' });
    expect(m[1]).toMatchObject({ provider: 'gemini', keyEnv: 'VERTAL_GEMINI_KEY', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' });
    for (const x of m) expect(x.label).toMatch(/^Vertal /);
    for (const x of m) expect(`${x.id} ${x.label}`).not.toMatch(/cerebras|gemini|google|qwen/i);
  });

  it('pinar o modelo grátis funciona (teste por provedor)', () => {
    expect(ids(buildOptionChain(env(), { option: 'code', effort: 'auto', modelId: 'vca-leve-free' }))).toEqual(['vca-leve-free']);
    expect(ids(buildOptionChain(env(), { option: 'auto', effort: 'auto', modelId: 'vca-veloz-free' }))).toEqual(['vca-veloz-free']);
  });
});

describe('monitor de cota', () => {
  const cb: Pick<VcaModel, 'provider' | 'model' | 'cost'> = { provider: 'cerebras', model: 'qwen-3.8-27b', cost: 'free' };
  const gm: Pick<VcaModel, 'provider' | 'model' | 'cost'> = { provider: 'gemini', model: 'gemini-3.5-flash-lite', cost: 'free' };

  const memStore = () => {
    const rows = new Map<string, { count: number; until: number }>();
    const store: QuotaStore = {
      load: async () => [...rows.entries()].map(([k, v]) => ({ bucket: k.split('|')[0], count: v.count, until: v.until })),
      add: async (b, until, d) => {
        const k = `${b}|${until}`;
        rows.set(k, { count: (rows.get(k)?.count ?? 0) + d, until });
      },
    };
    return { rows, store };
  };

  it('chaves e limites padrão (Gemini zera à meia-noite do Pacífico)', () => {
    expect(quotaKey(cb)).toBe('cerebras:qwen-3.8-27b');
    expect(quotaKey({ provider: 'openrouter', model: 'x:free', cost: 'free' })).toBe('openrouter:free');
    expect(quotaKey({ provider: 'openrouter', model: 'x', cost: 'paid' })).toBeNull();
    expect(quotaKey({ provider: 'ollama_cloud', model: 'k', cost: 'paid' })).toBe('ollama_cloud:all');
    expect(quotaLimits({}, 'gemini:gemini-3.5-flash-lite')).toMatchObject({ rpm: 15, rpd: 500, resetTz: 'America/Los_Angeles' });
    expect(quotaLimits({}, 'cerebras:qwen-3.8-27b')).toMatchObject({ rpm: 450, tpd: 1_080_000_000 });
    expect(quotaLimits({ VERTAL_FREE_QUOTA_LIMITS: '{"gemini:*":{"rpd":1000}}' }, 'gemini:x').rpd).toBe(1000);
  });

  it('zonedDay: reset às 08:00 UTC (meia-noite PST) em novembro', () => {
    const now = Date.parse('2026-11-26T12:18:00Z');
    const z = zonedDay(now, 'America/Los_Angeles');
    expect(z.day).toBe('2026-11-26');
    expect(new Date(z.resetAt).toISOString()).toBe('2026-11-27T08:00:00.000Z');
    expect(zonedDay(Date.parse('2026-11-26T05:00:00Z'), 'America/Los_Angeles').day).toBe('2026-11-25');
  });

  it('pula ao chegar a 90% do limite diário e volta depois do reset', () => {
    let now = Date.parse('2026-11-26T12:00:00Z');
    const q = new FreeQuotaMonitor({ env: () => ({ VERTAL_FREE_QUOTA_LIMITS: '{"gemini:*":{"rpd":10,"rpm":100}}' }), now: () => now });
    for (let i = 0; i < 8; i++) {
      expect(q.skipReason(gm)).toBeNull();
      q.record(gm, { status: 200, inputTokens: 10, outputTokens: 10 });
      now += 61_000;
    }
    expect(q.skipReason(gm)).toBe('rpd'); // 9/10 = 90%
    now = Date.parse('2026-11-27T08:00:01Z');
    expect(q.skipReason(gm)).toBeNull();
  });

  it('429 de cota diária do Gemini: espera até a meia-noite do Pacífico; 429 por minuto: retryDelay', () => {
    let now = Date.parse('2026-11-26T12:00:00Z');
    const q = new FreeQuotaMonitor({ env: () => ({}), now: () => now });
    q.record(gm, { status: 429, errorText: '{"error":{"details":[{"violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]},{"retryDelay":"20s"}]}}' });
    expect(q.skipReason(gm)).toBe('cooldown:daily_quota');
    now = Date.parse('2026-11-27T07:59:00Z');
    expect(q.skipReason(gm)).toBe('cooldown:daily_quota');
    now = Date.parse('2026-11-27T08:00:01Z');
    expect(q.skipReason(gm)).toBeNull();
    q.record(gm, { status: 429, errorText: '{"error":{"details":[{"@type":"RetryInfo","retryDelay":"37s"}]}}' });
    expect(q.skipReason(gm)).toBe('cooldown:http_429');
    now += 38_000;
    expect(q.skipReason(gm)).toBeNull();
  });

  it('cabeçalhos x-ratelimit-* (Cerebras): pula quando sobra ≤10% no dia', () => {
    const now = Date.parse('2026-11-26T12:00:00Z');
    const q = new FreeQuotaMonitor({ env: () => ({}), now: () => now });
    const headers = new Headers({
      'x-ratelimit-limit-requests-day': '1000',
      'x-ratelimit-remaining-requests-day': '50',
      'x-ratelimit-reset-requests-day': '3600',
    });
    q.record(cb, { status: 200, headers, inputTokens: 5, outputTokens: 5 });
    expect(q.skipReason(cb)).toBe('hdr_rpd');
  });

  it('contadores vão para o banco e são lidos por outro isolate', async () => {
    const now = Date.parse('2026-11-26T12:00:00Z');
    const { store } = memStore();
    const pend: Promise<unknown>[] = [];
    const cfg = { VERTAL_FREE_QUOTA_LIMITS: '{"gemini:*":{"rpd":4}}' };
    const a = new FreeQuotaMonitor({ env: () => cfg, store, now: () => now, defer: (p) => pend.push(p) });
    a.record(gm, { status: 200, inputTokens: 100, outputTokens: 50 });
    a.record(gm, { status: 200, inputTokens: 100, outputTokens: 50 });
    a.record(gm, { status: 200, inputTokens: 100, outputTokens: 50 });
    await Promise.all(pend);
    const b = new FreeQuotaMonitor({ env: () => cfg, store, now: () => now });
    expect(b.skipReason(gm)).toBeNull();
    await b.refresh(true);
    expect(b.skipReason(gm)).toBe('rpd'); // 3 + 1 ≥ 4 × 0,9
    const snap = b.snapshot([{ id: 'vca-leve-free', label: 'Vertal Livre · Leve+', ...gm }]);
    const row = snap.providers.find((r) => r.key === 'gemini:gemini-3.5-flash-lite')!;
    expect(row).toMatchObject({ requestsToday: 3, tokensToday: 450, skipped: true, skipReason: 'rpd' });
    expect(row.limits.rpd).toBe(4);
    expect(snap.anySkipped).toBe(true);
  });

  it('Ollama Cloud: só estima o gasto do mês; pula se houver teto configurado', () => {
    const now = Date.parse('2026-11-26T12:00:00Z');
    const oc = { provider: 'ollama_cloud' as const, model: 'kimi', cost: 'paid' as const };
    const q = new FreeQuotaMonitor({ env: () => ({ VERTAL_FREE_QUOTA_OLLAMA_MONTHLY_USD: '1' }), now: () => now });
    q.record(oc, { status: 200, inputTokens: 1000, outputTokens: 1000, costUsd: 0.95 });
    expect(q.skipReason(oc)).toBe('monthly_usd');
    const q2 = new FreeQuotaMonitor({ env: () => ({}), now: () => now });
    q2.record(oc, { status: 200, costUsd: 5 });
    expect(q2.skipReason(oc)).toBeNull();
    expect(q2.snapshot([]).providers[0].estUsdThisMonth).toBe(5);
  });
});

describe('runChain com o monitor', () => {
  const good = JSON.stringify({ choices: [{ message: { content: '{"reply":"ok"}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  const chainOf = () => buildOptionChain(env(), { option: 'code', effort: 'auto', promptTokens: 500 }).filter((m) => m.cost === 'free').slice(0, 3);

  it('modelo em espera é pulado sem chamar a rede; 429 põe em espera e cai para o próximo', async () => {
    const chain = chainOf();
    expect(ids(chain).slice(0, 3)).toEqual(['vca-veloz-free', 'vca-veloz-free-2', 'vca-leve-free']);
    const calls: string[] = [];
    const q = new FreeQuotaMonitor({ env: () => ({}) });
    const fetchFn = async (url: string, init: RequestInit) => {
      const model = JSON.parse(String(init.body)).model as string;
      calls.push(model);
      if (model === 'qwen-3.8-27b') return new Response('{"message":"Requests per day limit exceeded"}', { status: 429 });
      if (model === 'gpt-oss-120b') return new Response('{"message":"too many requests"}', { status: 429, headers: { 'retry-after': '30' } });
      return new Response(good, { status: 200 });
    };
    const r = await runChain(chain, [{ role: 'user', content: 'oi' }], { json: true, maxTokens: 100, effort: 'auto', deadline: Date.now() + 60_000 }, { fetch: fetchFn, env: env(), cooldown: new Map(), quota: q });
    expect(r.label).toBe('Vertal Livre · Leve+');
    expect(calls).toEqual(['qwen-3.8-27b', 'gpt-oss-120b', 'gemini-3.5-flash-lite']);
    calls.length = 0;
    await runChain(chain, [{ role: 'user', content: 'oi' }], { json: true, maxTokens: 100, effort: 'auto', deadline: Date.now() + 60_000 }, { fetch: fetchFn, env: env(), cooldown: new Map(), quota: q });
    expect(calls).toEqual(['gemini-3.5-flash-lite']);
    const snap = q.snapshot(chain);
    expect(snap.providers.find((p) => p.key === 'cerebras:qwen-3.8-27b')?.cooldownReason).toBe('daily_quota');
    expect(snap.providers.find((p) => p.key === 'gemini:gemini-3.5-flash-lite')?.requestsToday).toBe(2);
  });

  it('sem monitor: comportamento de antes', async () => {
    const chain = chainOf();
    const r = await runChain(chain, [{ role: 'user', content: 'oi' }], { json: true, maxTokens: 100, effort: 'auto', deadline: Date.now() + 60_000 }, {
      fetch: async () => new Response(good, { status: 200 }),
      env: env(),
      cooldown: new Map(),
    });
    expect(r.label).toBe('Vertal Livre · Veloz');
  });
});
