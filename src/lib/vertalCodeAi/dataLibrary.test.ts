import { describe, expect, it, vi } from 'vitest';
import {
  classifyPrompt,
  dataLibraryConfig,
  decideConsent,
  parseCookieClaim,
  promptSizeBucket,
  redactText,
  rewardsConsentFromRows,
  sha256Hex,
  subjectHash,
  trackMedia,
  VCA_DL_MAX_QUEUE,
  VCA_RAW_CONTENT_PURPOSE,
  VcaDataLibrarySender,
  type VcaConsentDecision,
  type VcaDlConfig,
  VcaRunTracker,
} from '../../../supabase/functions/_shared/vertalCodeAi/dataLibrary';
import { readVertalCodeAiDataConsent } from './client';

const CFG_JSON = JSON.stringify({ enabled: true, endpoint: 'https://kb.vertal.dev/', key: 'vdl_vertal_code_ai_abcdefgh12345' });
const cfg = (extra: Partial<VcaDlConfig> = {}): VcaDlConfig => ({ ...dataLibraryConfig({ VERTAL_DATA_LIBRARY: CFG_JSON })!, ...extra });
const USER = '7f1c2a52-6a7e-4a52-9a0e-1d2b3c4d5e6f';
const GRANTED: VcaConsentDecision = { send: true, source: 'rewards_panel', rawContent: false, reason: 'granted' };

function fakeFetch(status = 202) {
  const calls: Array<{ url: string; init: RequestInit; body: any }> = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)) });
    return new Response('{}', { status });
  });
  return { fn, calls };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (deferred: Promise<unknown>[]) => {
  await Promise.all(deferred);
  await tick();
};

describe('VERTAL Code AI · Data Library · config (desligado por padrão)', () => {
  it('sem config, config inválida ou enabled=false: null', () => {
    expect(dataLibraryConfig({})).toBeNull();
    expect(dataLibraryConfig({ VERTAL_DATA_LIBRARY: '{oops' })).toBeNull();
    expect(dataLibraryConfig({ VERTAL_DATA_LIBRARY: JSON.stringify({ enabled: false, endpoint: 'https://x.dev', key: 'vdl_abcdefgh123' }) })).toBeNull();
    expect(dataLibraryConfig({ VERTAL_DATA_LIBRARY: JSON.stringify({ enabled: true, endpoint: 'http://x.dev', key: 'vdl_abcdefgh123' }) })).toBeNull();
    expect(dataLibraryConfig({ VERTAL_DATA_LIBRARY: JSON.stringify({ enabled: true, endpoint: 'https://x.dev', key: 'sk-123' }) })).toBeNull();
  });

  it('aceita a chave dentro do VERTAL_GPU_CONFIG (sem segredo novo); o segredo avulso vence', () => {
    const viaGpu = dataLibraryConfig({ VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_OLLAMA_URL_2: 'https://gpu', VERTAL_DATA_LIBRARY: JSON.parse(CFG_JSON) }) });
    expect(viaGpu).toMatchObject({ enabled: true, endpoint: 'https://kb.vertal.dev', policy: 'v1', rawContent: false, sources: ['rewards_panel', 'cookie_banner'] });
    const own = dataLibraryConfig({
      VERTAL_DATA_LIBRARY: JSON.stringify({ enabled: true, endpoint: 'https://own.dev', key: 'vdl_x_abcdefgh123' }),
      VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_DATA_LIBRARY: JSON.parse(CFG_JSON) }),
    });
    expect(own?.endpoint).toBe('https://own.dev');
  });
});

describe('consentimento: só o que já está gravado (painel de recompensas / banner de cookies)', () => {
  it('sem nada gravado não envia', () => {
    expect(decideConsent(cfg(), 'none', null)).toMatchObject({ send: false, reason: 'no_consent_recorded' });
    expect(decideConsent(null, 'granted', { cookie: 'granted' })).toMatchObject({ send: false, reason: 'disabled' });
  });

  it('aceite do Vertal Node (vertal_nodes.opted_in) libera uso anonimizado, nunca texto cru', () => {
    expect(rewardsConsentFromRows([{ opted_in: false }, { opted_in: true }])).toBe('granted');
    expect(rewardsConsentFromRows([{ opted_in: false }])).toBe('revoked');
    expect(rewardsConsentFromRows([])).toBe('none');
    expect(decideConsent(cfg({ rawContent: true }), 'granted', null)).toEqual({ send: true, source: 'rewards_panel', rawContent: false, reason: 'granted' });
    expect(decideConsent(cfg(), 'revoked', null)).toMatchObject({ send: false, reason: 'revoked' });
  });

  it('banner de cookies: granted libera; denied e GPC sempre vencem', () => {
    expect(decideConsent(cfg(), 'none', { cookie: 'granted', purposes: ['ads_measurement'] })).toMatchObject({ send: true, source: 'cookie_banner', rawContent: false });
    expect(decideConsent(cfg(), 'granted', { cookie: 'denied' })).toMatchObject({ send: false, reason: 'denied' });
    expect(decideConsent(cfg(), 'granted', { cookie: 'granted', gpc: true })).toMatchObject({ send: false, reason: 'gpc' });
  });

  it('texto cru só com a finalidade explícita gravada E a config permitindo', () => {
    const claim = { cookie: 'granted' as const, purposes: [VCA_RAW_CONTENT_PURPOSE] };
    expect(decideConsent(cfg(), 'none', claim).rawContent).toBe(false);
    expect(decideConsent(cfg({ rawContent: true }), 'none', claim).rawContent).toBe(true);
    expect(decideConsent(cfg({ rawContent: true }), 'none', { cookie: 'granted', purposes: ['ads_measurement'] }).rawContent).toBe(false);
  });

  it('fontes restringíveis pela config', () => {
    expect(decideConsent(cfg({ sources: ['cookie_banner'] }), 'granted', null).send).toBe(false);
    expect(decideConsent(cfg({ sources: ['rewards_panel'] }), 'none', { cookie: 'granted' }).send).toBe(false);
  });

  it('parseCookieClaim saneia o que vem do navegador', () => {
    expect(parseCookieClaim(undefined)).toBeNull();
    expect(parseCookieClaim({ cookie: 'yes', purposes: [1, 'a'], gpc: 'true' })).toEqual({ cookie: null, purposes: ['a'], noticeVersion: null, gpc: false });
  });

  it('o navegador só repassa a escolha já gravada (mesmas chaves do banner)', () => {
    const store = (m: Record<string, string>) => ({ getItem: (k: string) => m[k] ?? null });
    expect(readVertalCodeAiDataConsent(store({}), {})).toBeUndefined();
    expect(
      readVertalCodeAiDataConsent(
        store({ cookie_consent: 'granted', cookie_consent_evidence: JSON.stringify({ purposes: ['ads_measurement'], noticeVersion: '2026-11-09.ads-v1' }) }),
        {},
      ),
    ).toEqual({ cookie: 'granted', purposes: ['ads_measurement'], noticeVersion: '2026-11-09.ads-v1', gpc: false });
    expect(readVertalCodeAiDataConsent(store({}), { globalPrivacyControl: true })).toMatchObject({ cookie: null, gpc: true });
  });
});

describe('classificador e redação', () => {
  it('só a categoria sai do servidor', () => {
    expect(classifyPrompt('o botão de login está com erro quando clico')).toBe('bugfix');
    expect(classifyPrompt('crie uma landing page com um card de preços')).toBe('ui');
    expect(classifyPrompt('adicione uma tabela no supabase com RLS')).toBe('database');
    expect(classifyPrompt('xyz')).toBe('other');
    expect(classifyPrompt('um gato astronauta', 'image')).toBe('image');
    expect(promptSizeBucket(50)).toBe('xs');
    expect(promptSizeBucket(25_000)).toBe('xl');
  });

  it('redige contato, documentos e chaves', () => {
    const out = redactText('fale com ana@x.com cpf 123.456.789-09 chave sk-or-v1-abcdefghijklmnopqrstuvwxyz e Bearer abcdefghijklmnop1234');
    expect(out).not.toMatch(/ana@x\.com|123\.456\.789-09|sk-or-v1|abcdefghijklmnop1234/);
  });

  it('hash do titular = o mesmo do vertal-collect.js (vertal-code-ai:user:<id>)', async () => {
    expect(await subjectHash(USER)).toBe(await sha256Hex(`vertal-code-ai:user:${USER}`));
    expect(await subjectHash(USER)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('envio em lote, dispara e esquece', () => {
  const info = { mode: 'build' as const, option: 'auto', effort: 'auto', modelPinned: false, prompt: 'corrija o erro no login do joao@x.com', images: 0, attachments: 1, historyTurns: 2, surface: 'vertal_code_ai' };

  function tracker(consent: VcaConsentDecision, f = fakeFetch(), c = cfg()) {
    const deferred: Promise<unknown>[] = [];
    const sender = new VcaDataLibrarySender(c, { fetch: f.fn });
    let now = 1_000;
    const t = new VcaRunTracker(info, { sender, consent: Promise.resolve(consent), userId: USER, runId: 'run-1', now: () => now, defer: (p) => deferred.push(p) });
    return { t, f, deferred, advance: (ms: number) => (now += ms), sender };
  }

  it('consentido: um lote com run.started + run.finished, sem texto cru, chave e hash certos', async () => {
    const { t, f, deferred, advance } = tracker(GRANTED);
    t.started();
    t.modelCall({ label: 'Vertal Code · Ágil', cost: 'self_hosted', fellBack: false, usage: { inputTokens: 1000, outputTokens: 200, costUsd: 0 } });
    t.modelCall({ label: 'Vertal Livre · Código', cost: 'free', fellBack: true, usage: { inputTokens: 500, outputTokens: 100 } });
    advance(4200);
    t.finished({ ok: true, filesChanged: 2, verified: true, codeExcerpt: 'const a = 1' });
    await settle(deferred);

    expect(f.calls).toHaveLength(1);
    const { url, init, body } = f.calls[0];
    expect(url).toBe('https://kb.vertal.dev/api/collect/vertal-code-ai/events');
    expect((init.headers as Record<string, string>)['X-Vertal-Ingest-Key']).toBe('vdl_vertal_code_ai_abcdefgh12345');
    expect(body.consent).toEqual({ state: 'granted', policy_version: 'v1', kinds: ['event'] });
    expect(body.subject_hash).toBe(await subjectHash(USER));
    expect(body.records.map((r: any) => r.metadata.event)).toEqual(['run.started', 'run.finished']);
    const fin = body.records[1].metadata;
    expect(fin).toMatchObject({
      schema: 'vca.usage.v1', consent_source: 'rewards_panel', outcome: 'success', latency_ms: 4200, model_calls: 2,
      model_tier: 'free', model_label: 'Vertal Livre · Código', own_model: true, fell_back: true, tokens_in: 1500, tokens_out: 300,
      files_changed: 2, prompt_category: 'bugfix',
    });
    const wire = JSON.stringify(body);
    expect(wire).not.toContain('joao@x.com');
    expect(wire).not.toContain('corrija');
    expect(wire).not.toContain(USER);
    expect(wire).not.toContain('run-1');
  });

  it('sem consentimento: nada sai', async () => {
    const { t, f, deferred } = tracker({ send: false, source: null, rawContent: false, reason: 'no_consent_recorded' });
    t.started();
    t.finished({ ok: true });
    await settle(deferred);
    expect(f.fn).not.toHaveBeenCalled();
  });

  it('texto cru só quando a decisão permite: kind other, redigido', async () => {
    const { t, f, deferred } = tracker({ send: true, source: 'cookie_banner', rawContent: true, reason: 'granted' }, fakeFetch(), cfg({ rawContent: true }));
    t.started();
    t.finished({ ok: true, codeExcerpt: 'const key = "sk-or-v1-abcdefghijklmnopqrstuvwxyz";' });
    await settle(deferred);
    const body = f.calls[0].body;
    expect(body.consent.kinds).toEqual(['event', 'other']);
    const c = body.records.find((r: any) => r.kind === 'other').metadata;
    expect(c).toMatchObject({ event: 'run.content', opt_in: true, consent_source: 'cookie_banner' });
    expect(c.prompt_excerpt).toContain('[email]');
    expect(c.code_excerpt).not.toContain('sk-or-v1');
  });

  it('erro do pedido vira run.finished com outcome=error', async () => {
    const { t, f, deferred } = tracker(GRANTED);
    t.started();
    t.finished({ ok: false, errorCode: 'all_models_failed' });
    t.finished({ ok: true }); // segunda chamada ignorada
    await settle(deferred);
    const fin = f.calls[0].body.records[1].metadata;
    expect(fin).toMatchObject({ outcome: 'error', error_code: 'all_models_failed', model_tier: 'none', model_label: null, verified: null });
  });

  it('a Data Library fora do ar ou lenta nunca derruba nem lança', async () => {
    const boom = { fn: vi.fn(async () => { throw new Error('ECONNREFUSED'); }), calls: [] as any[] };
    const warn = vi.fn();
    const sender = new VcaDataLibrarySender(cfg(), { fetch: boom.fn as any, warn });
    const deferred: Promise<unknown>[] = [];
    const t = new VcaRunTracker(info, { sender, consent: Promise.resolve(GRANTED), userId: USER, runId: 'r', defer: (p) => deferred.push(p) });
    expect(() => t.started()).not.toThrow();
    expect(() => t.finished({ ok: true })).not.toThrow();
    await expect(settle(deferred)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.not.stringContaining('joao'));
    // consentimento que rejeita também não derruba
    const t2 = new VcaRunTracker(info, { sender, consent: Promise.reject(new Error('db')), userId: USER, runId: 'r2', defer: (p) => deferred.push(p) });
    t2.started();
    await settle(deferred);
  });

  it('fila limitada: descarta acima do teto em vez de crescer', () => {
    const sender = new VcaDataLibrarySender(cfg(), { fetch: fakeFetch().fn });
    for (let i = 0; i < VCA_DL_MAX_QUEUE + 5; i++) sender.enqueue('a'.repeat(64), false, { kind: 'event', event_id: `e${i}`, collected_at: new Date().toISOString(), metadata: {} });
    expect(sender.pending).toBe(VCA_DL_MAX_QUEUE);
    expect(sender.dropped).toBe(5);
    sender.enqueue('a'.repeat(64), false, { kind: 'other', event_id: 'x', collected_at: '', metadata: {} });
    expect(sender.dropped).toBe(5); // "other" sem permissão nem entra
  });

  it('lotes respeitam batchSize', async () => {
    const f = fakeFetch();
    const sender = new VcaDataLibrarySender(cfg({ batchSize: 2 }), { fetch: f.fn });
    for (let i = 0; i < 5; i++) sender.enqueue('b'.repeat(64), false, { kind: 'event', event_id: `e${i}`, collected_at: '', metadata: {} });
    expect(await sender.flush()).toEqual({ sent: 5, failed: 0 });
    expect(f.calls.map((c) => c.body.records.length)).toEqual([2, 2, 1]);
  });

  it('mídia: um media.finished com o tipo e o nível do modelo', async () => {
    const f = fakeFetch();
    const deferred: Promise<unknown>[] = [];
    trackMedia(
      { sender: new VcaDataLibrarySender(cfg(), { fetch: f.fn }), consent: Promise.resolve(GRANTED), userId: USER, runId: 'm1', defer: (p) => deferred.push(p) },
      { mediaType: 'video', ok: true, latencyMs: 1234, cost: 'self_hosted', label: 'Vertal Vídeo · Própria', fellBack: false, costUsd: 0.01, referenceImages: 0, outputs: 1, videoSeconds: 4 },
    );
    await settle(deferred);
    expect(f.calls[0].body.records[0].metadata).toMatchObject({ event: 'media.finished', media_type: 'video', own_model: true, model_tier: 'self_hosted', video_seconds: 4, prompt_category: 'video' });
  });

  it('rótulo de provedor nunca sai (só nomes Vertal)', async () => {
    const { t, f, deferred } = tracker(GRANTED);
    t.modelCall({ label: 'deepseek/deepseek-chat', cost: 'paid', fellBack: false });
    t.finished({ ok: true });
    await settle(deferred);
    expect(f.calls[0].body.records[0].metadata.model_label).toBeNull();
  });
});
