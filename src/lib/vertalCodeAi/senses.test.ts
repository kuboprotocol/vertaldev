import { describe, expect, it, vi } from 'vitest';
import { expandVcaEnv, retailCredits } from '../../../supabase/functions/_shared/vertalCodeAi/router';
import {
  audioPart,
  decide,
  isSensesFeatureOn,
  multimodalChat,
  normalizeAnswers,
  novelaPublicStatus,
  novelaSubmitBody,
  ownGpuCostUsd,
  parseHearJson,
  parseProductJson,
  PRODUCT_QUESTIONS,
  productRoute,
  sensesConfig,
  sensesStatus,
  validQuestions,
  type FetchLike,
} from '../../../supabase/functions/_shared/vertalCodeAi/senses';
import { handleNovela, handleSenses, VCA_NOVELA_JOB_PREFIX, type SensesHandlerDeps } from '../../../supabase/functions/_shared/vertalCodeAi/sensesHandler';

const OWN = {
  VERTAL_CODE_AI_MEDIA_ENABLED: 'true',
  VERTAL_OWN_DECIDE_URL: 'https://decide.example.run/',
  VERTAL_OWN_DECIDE_TOKEN: 'd',
  VERTAL_OWN_OMNI_URL: 'https://omni.example.run',
  VERTAL_OWN_OMNI_TOKEN: 'o',
  VERTAL_OWN_NOVELA_URL: 'https://novela.example.run',
  VERTAL_OWN_NOVELA_TOKEN: 'n',
};
const PAID = { VERTAL_CODE_AI_ALLOW_PAID: 'true', OPENROUTER_API_KEY: 'k' };
const IMG = 'data:image/jpeg;base64,/9j/AAAA';
const WAV = 'data:audio/wav;base64,UklGRgAAAA==';
// Só nomes Vertal podem sair para a tela.
const BANNED = /openrouter|typesafe|jev|qwen|omni|intern|kokoro|gemini|google|modal|flux|wan/i;

type Call = { url: string; body: Record<string, unknown>; headers: Record<string, string> };
function fakeFetch(handler: (c: Call) => { ok?: boolean; status?: number; json?: unknown }) {
  const calls: Call[] = [];
  const f: FetchLike = async (url, init) => {
    const c = { url, body: JSON.parse(init.body), headers: init.headers };
    calls.push(c);
    const r = handler(c);
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.json };
  };
  return { f, calls };
}

const productAnswers = {
  answers: {
    is_product: { type: 'noul', noul: 0.93 },
    category: { type: 'choice', choice: 'calcados', probabilities: { calcados: 0.97 }, confidence: 0.97 },
    photo_quality: { type: 'score', score: 1.7, confidence: 0.76 },
    unsafe: { type: 'noul', noul: 0.01 },
  },
};

describe('Sentidos · configuração e liga/desliga', () => {
  it('desligado por padrão (sem mídia ou sem URL própria)', () => {
    expect(sensesStatus(sensesConfig({}))).toEqual({ decide: false, vision: false, hear: false, novela: false });
    expect(sensesStatus(sensesConfig({ ...OWN, VERTAL_CODE_AI_MEDIA_ENABLED: 'false' }))).toEqual({ decide: false, vision: false, hear: false, novela: false });
    expect(isSensesFeatureOn(sensesConfig({ VERTAL_CODE_AI_MEDIA_ENABLED: 'true', VERTAL_OWN_DECIDE_URL: 'http://inseguro' , VERTAL_OWN_DECIDE_TOKEN: 'x' }), 'decide')).toBe(false);
  });

  it('liga cada recurso só com URL https + token', () => {
    const cfg = sensesConfig(OWN);
    expect(sensesStatus(cfg)).toEqual({ decide: true, vision: true, hear: true, novela: true });
    expect(cfg.decide?.url).toBe('https://decide.example.run');
  });

  it('VERTAL_GPU_CONFIG aceita as chaves novas dos sentidos (e só elas)', () => {
    const env = expandVcaEnv({
      VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_OWN_DECIDE_URL: 'https://d', VERTAL_OWN_OMNI_TOKEN: 't', VERTAL_OWN_NOVELA_URL: 'https://n', VERTAL_CODE_AI_USER_IDS: 'x', VERTAL_CODE_AI_MEDIA_ENABLED: 'true' }),
    });
    expect(env.VERTAL_OWN_DECIDE_URL).toBe('https://d');
    expect(env.VERTAL_OWN_OMNI_TOKEN).toBe('t');
    expect(env.VERTAL_OWN_NOVELA_URL).toBe('https://n');
    expect(env.VERTAL_CODE_AI_USER_IDS).toBeUndefined();
    expect(env.VERTAL_CODE_AI_MEDIA_ENABLED).toBeUndefined();
  });
});

describe('Vertal Decide', () => {
  it('valida perguntas do formato /v1/systemone', () => {
    expect(validQuestions(PRODUCT_QUESTIONS)).not.toBeNull();
    expect(validQuestions({})).toBeNull();
    expect(validQuestions({ a: { type: 'choice', instructions: 'x', criteria: { only: 'one' } } })).toBeNull();
    expect(validQuestions({ 'bad key': { type: 'noul', instructions: 'x' } })).toBeNull();
    expect(validQuestions({ a: { type: 'score', instructions: 'x', criteria: ['a', 'b', 'c'] } })).not.toBeNull();
  });

  it('normaliza respostas e recusa escolha fora das opções', () => {
    expect(normalizeAnswers(productAnswers, PRODUCT_QUESTIONS)?.category.choice).toBe('calcados');
    const bad = { answers: { ...productAnswers.answers, category: { type: 'choice', choice: 'nave' } } };
    expect(normalizeAnswers(bad, PRODUCT_QUESTIONS)).toBeNull();
  });

  it('própria primeiro; reserva paga só se a própria falhar e ALLOW_PAID estiver ligado', async () => {
    const { f, calls } = fakeFetch((c) => (c.url.includes('decide.example') ? { ok: false, status: 503 } : { json: { ...productAnswers, usage: { cost: 0.00002 } } }));
    const r = await decide(sensesConfig({ ...OWN, ...PAID }), { fetch: f }, 'x', PRODUCT_QUESTIONS);
    expect(calls.map((c) => c.url)).toEqual(['https://decide.example.run/v1/systemone', 'https://openrouter.ai/api/alpha/decisions']);
    expect(calls[1].body.model).toBe('typesafe/jev-1.14');
    expect(r?.source).toBe('fallback');
    expect(r?.costUsd).toBeCloseTo(0.00002);

    const none = fakeFetch(() => ({ ok: false, status: 503 }));
    expect(await decide(sensesConfig(OWN), { fetch: none.f }, 'x', PRODUCT_QUESTIONS)).toBeNull();
    expect(none.calls).toHaveLength(1); // sem ALLOW_PAID, nada pago
  });

  it('imagem: vai direto à reserva (própria lenta com foto), a menos que VERTAL_OWN_DECIDE_IMAGES=true ou sem ALLOW_PAID', async () => {
    const img = ['x', { type: 'image_url' as const, image_url: { url: IMG } }];
    const a = fakeFetch(() => ({ json: productAnswers }));
    expect((await decide(sensesConfig({ ...OWN, ...PAID }), { fetch: a.f }, img, PRODUCT_QUESTIONS))?.source).toBe('fallback');
    expect(a.calls.map((c) => c.url)).toEqual(['https://openrouter.ai/api/alpha/decisions']);
    const b = fakeFetch(() => ({ json: productAnswers }));
    expect((await decide(sensesConfig({ ...OWN, ...PAID, VERTAL_OWN_DECIDE_IMAGES: 'true' }), { fetch: b.f }, img, PRODUCT_QUESTIONS))?.source).toBe('own');
    const c = fakeFetch(() => ({ json: productAnswers }));
    expect((await decide(sensesConfig(OWN), { fetch: c.f }, img, PRODUCT_QUESTIONS))?.source).toBe('own');
  });

  it('própria respondendo: custo zero de API e Bearer próprio', async () => {
    const { f, calls } = fakeFetch(() => ({ json: productAnswers }));
    const r = await decide(sensesConfig({ ...OWN, ...PAID }), { fetch: f }, 'x', PRODUCT_QUESTIONS);
    expect(r?.source).toBe('own');
    expect(calls).toHaveLength(1);
    expect(calls[0].headers.Authorization).toBe('Bearer d');
  });

  it('rota do produto: impróprio/sem produto/foto ruim não chamam o modelo grande', () => {
    const a = normalizeAnswers(productAnswers, PRODUCT_QUESTIONS)!;
    expect(productRoute(a)).toEqual({ describe: true, reason: 'ok' });
    expect(productRoute({ ...a, unsafe: { type: 'noul', noul: 0.9 } }).reason).toBe('unsafe');
    expect(productRoute({ ...a, is_product: { type: 'noul', noul: 0.1 } }).reason).toBe('not_product');
    expect(productRoute({ ...a, photo_quality: { type: 'score', score: 0.2 } }).reason).toBe('photo_unusable');
    expect(productRoute(null)).toEqual({ describe: true, reason: 'no_decision' });
  });
});

describe('Vertal Visão / Ouvir · parsers', () => {
  it('lê o JSON do produto com cercas e preço', () => {
    const p = parseProductJson('```json\n{"nome":"Tênis","tipo":"tênis","caracteristicas":["couro"],"cores":["branco"],"estado":"novo","preco_sugerido_brl":{"min":150,"max":250},"titulo_anuncio":"T","descricao_venda":"D","tags":["a"]}\n```');
    expect(p?.preco_sugerido_brl).toEqual({ min: 150, max: 250 });
    expect(parseProductJson('sem json')).toBeNull();
    expect(parseProductJson('{"nome":"X","preco_sugerido_brl":{"min":9,"max":1}}')?.preco_sugerido_brl).toBeNull();
  });

  it('lê a transcrição (JSON ou texto puro)', () => {
    expect(parseHearJson('{"transcricao":"oi","resposta":"olá"}')?.resposta).toBe('olá');
    expect(parseHearJson('só texto')?.transcricao).toBe('só texto');
    expect(parseHearJson('')).toBeNull();
  });

  it('áudio vira input_audio (wav/mp3)', () => {
    expect(audioPart(WAV)).toEqual({ type: 'input_audio', input_audio: { data: 'UklGRgAAAA==', format: 'wav' } });
    expect((audioPart('data:audio/mpeg;base64,AAAA') as { input_audio: { format: string } }).input_audio.format).toBe('mp3');
    expect(audioPart('data:text/plain;base64,AAAA')).toBeNull();
  });

  it('multimodal: própria → reserva barata', async () => {
    const { f, calls } = fakeFetch((c) => (c.url.includes('omni.example') ? { ok: false, status: 500 } : { json: { choices: [{ message: { content: 'ok' } }], usage: { cost: 0.0001 } } }));
    const r = await multimodalChat(sensesConfig({ ...OWN, ...PAID }), { fetch: f }, [{ role: 'user', content: 'x' }]);
    expect(r).toMatchObject({ text: 'ok', source: 'fallback' });
    expect(calls[0].body.model).toBe('vertal-omni');
    expect(calls[1].body.model).toBe('google/gemini-3.1-flash-lite');
  });
});

function handlerDeps(f: FetchLike, raw?: SensesHandlerDeps['rawFetch']): SensesHandlerDeps {
  return {
    fetch: f,
    rawFetch: raw ?? (async () => new Response('x')),
    signJob: async (id) => `${id}.sig`,
    verifyJob: async (t) => (t.endsWith('.sig') ? t.slice(0, -4) : null),
  };
}

describe('Ações senses / novela', () => {
  it('sem configuração responde 404 (desligado)', async () => {
    const { f } = fakeFetch(() => ({ json: {} }));
    expect(await handleSenses({ op: 'photo', image: IMG }, sensesConfig({}), handlerDeps(f))).toEqual({ status: 404, body: { error: 'vertal_senses_disabled' } });
    expect(await handleNovela({ op: 'submit', premise: 'uma história longa' }, sensesConfig({}), handlerDeps(f))).toEqual({ status: 404, body: { error: 'vertal_novela_disabled' } });
  });

  it('foto: Decide classifica, Omni descreve; só nomes Vertal na resposta', async () => {
    const { f, calls } = fakeFetch((c) =>
      c.url.includes('decide') ? { json: productAnswers } : { json: { choices: [{ message: { content: '{"nome":"Tênis branco","preco_sugerido_brl":{"min":100,"max":200}}' } }] } },
    );
    const r = await handleSenses({ op: 'photo', image: IMG }, sensesConfig(OWN), handlerDeps(f));
    expect('status' in r && r.status).toBe(200);
    const body = (r as { body: Record<string, unknown> }).body;
    expect((body.product as { nome: string }).nome).toBe('Tênis branco');
    expect(calls).toHaveLength(2);
    expect(String((calls[1].body.messages as Array<{ content: Array<{ text?: string }> }>)[0].content[1].text)).toContain('calcados');
    expect(JSON.stringify({ model: body.model, decision: (body.decision as { model: unknown }).model })).not.toMatch(BANNED);
    expect((body.estimate as { charged: boolean }).charged).toBe(false);
  });

  it('foto imprópria: não chama o modelo grande', async () => {
    const { f, calls } = fakeFetch(() => ({ json: { answers: { ...productAnswers.answers, unsafe: { type: 'noul', noul: 0.95 } } } }));
    const r = await handleSenses({ op: 'photo', image: IMG }, sensesConfig(OWN), handlerDeps(f));
    expect((r as { body: { route: { reason: string } } }).body.route.reason).toBe('unsafe');
    expect(calls).toHaveLength(1);
  });

  it('valida imagem, áudio e quadros', async () => {
    const { f } = fakeFetch(() => ({ json: productAnswers }));
    const d = handlerDeps(f);
    const cfg = sensesConfig(OWN);
    expect(((await handleSenses({ op: 'photo', image: 'https://x/y.jpg' }, cfg, d)) as { status: number }).status).toBe(400);
    expect(((await handleSenses({ op: 'hear', audio: 'data:text/plain;base64,AA' }, cfg, d)) as { status: number }).status).toBe(400);
    expect(((await handleSenses({ op: 'frames', frames: [], questions: PRODUCT_QUESTIONS }, cfg, d)) as { status: number }).status).toBe(400);
  });

  it('quadros: decide um por um e ordena pelo campo pedido', async () => {
    let i = 0;
    const scores = [0.1, 0.9, 0.5];
    const { f } = fakeFetch(() => ({ json: { answers: { key: { type: 'noul', noul: scores[i++] } } } }));
    const frames = scores.map((_, k) => ({ t: k, image: IMG }));
    const r = await handleSenses({ op: 'frames', frames, questions: { key: { type: 'noul', instructions: 'Is this a key scene?' } }, rank_by: 'key' }, sensesConfig(OWN), handlerDeps(f));
    expect((r as { body: { top: number[] } }).body.top).toEqual([1, 2, 0]);
  });

  it('ouvir: transcrição e resposta', async () => {
    const { f, calls } = fakeFetch(() => ({ json: { choices: [{ message: { content: '{"transcricao":"tem tamanho 42?","resposta":"Vou verificar."}' } }] } }));
    const r = await handleSenses({ op: 'hear', audio: WAV }, sensesConfig(OWN), handlerDeps(f));
    expect((r as { body: { hear: { transcricao: string } } }).body.hear.transcricao).toBe('tem tamanho 42?');
    expect((calls[0].body.messages as Array<{ content: Array<{ type: string }> }>)[0].content[0].type).toBe('input_audio');
  });

  it('novela: submit assina o job; status só aceita job assinado com o prefixo', async () => {
    const raw = vi.fn(async (url: string) =>
      url.endsWith('/submit')
        ? new Response(JSON.stringify({ id: 'fc-ABC123', status: 'pending' }))
        : new Response(JSON.stringify({ status: 'completed', titulo: 'Bolo', seconds: 121.4, cost: { total_warm_usd: 0.031 }, timings: { secret: 1 } })),
    );
    const { f } = fakeFetch(() => ({ json: {} }));
    const d = handlerDeps(f, raw as unknown as SensesHandlerDeps['rawFetch']);
    const cfg = sensesConfig(OWN);
    const s = (await handleNovela({ op: 'submit', premise: 'Uma confeiteira e o irmão' }, cfg, d)) as { status: number; body: { job: string } };
    expect(s.status).toBe(202);
    expect(s.body.job).toBe(`${VCA_NOVELA_JOB_PREFIX}fc-ABC123.sig`);
    const st = (await handleNovela({ op: 'status', job: s.body.job }, cfg, d)) as { body: Record<string, unknown> };
    expect(st.body).toMatchObject({ status: 'completed', titulo: 'Bolo', seconds: 121.4 });
    expect(st.body.timings).toBeUndefined();
    expect(((await handleNovela({ op: 'status', job: 'fc-ABC123.sig' }, cfg, d)) as { status: number }).status).toBe(404);
    expect(((await handleNovela({ op: 'status', job: 'forjado' }, cfg, d)) as { status: number }).status).toBe(404);
  });
});

describe('Vertal Novela · pedido e preço', () => {
  it('limita cenas/clipes e exige premissa', () => {
    expect(novelaSubmitBody({ premise: 'curta' })).toBeNull();
    expect(novelaSubmitBody({ premise: 'uma premissa boa', scenes: 99, clips: 9, voice: 'x' })).toEqual({ premise: 'uma premissa boa', voice: 'pf_dora', scenes: 14, clips: 3 });
  });

  it('status público não vaza detalhes internos', () => {
    expect(novelaPublicStatus({ status: 'weird' }).status).toBe('unknown');
  });

  it('preço de varejo: (custo + US$0,05) × 1,5 ÷ US$0,03', () => {
    expect(retailCredits(0.03)).toBe(4);
    expect(retailCredits(0)).toBe(2.5);
  });

  it('custo ativo de GPU por segundo', () => {
    expect(ownGpuCostUsd('L40S', 10_000)).toBeCloseTo(0.00542, 5);
    expect(ownGpuCostUsd('L4', -5)).toBe(0);
  });
});
