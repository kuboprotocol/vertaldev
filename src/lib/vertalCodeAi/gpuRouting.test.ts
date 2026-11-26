import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildChain,
  buildOptionChain,
  estimateTokens,
  expandVcaEnv,
  orderSelfHosted,
  selfHostedModels,
  selfHostedOutputTokens,
  VCA_TEXT_OPTIONS,
  VCA_TOKEN_SAFETY,
  type VcaChatMessage,
  type VcaModel,
  type VcaOption,
} from '../../../supabase/functions/_shared/vertalCodeAi/router';
import { FALLBACK_RESERVE_MS, runChain, SELF_HOSTED_COOLDOWN_MS } from '../../../supabase/functions/_shared/vertalCodeAi/chainRunner';

// Ambiente igual ao de produção (26/11/2026): VM (1º endpoint) + GPU (2º endpoint via VERTAL_GPU_CONFIG),
// chaves dos provedores e pago liberado.
const PROD = expandVcaEnv({
  OPENROUTER_API_KEY: 'or',
  GEMINI_API_KEY: 'g',
  GROQ_API_KEY: 'q',
  DEEPSEEK_API_KEY: 'd',
  VERTAL_CODE_AI_ALLOW_PAID: 'true',
  VERTAL_OLLAMA_URL: 'https://llm.vertalrun.com',
  VERTAL_OLLAMA_TOKEN: 'vm',
  VERTAL_OLLAMA_MODEL: 'vertal-coder',
  VERTAL_OLLAMA_MAX_INPUT_TOKENS: '3000',
  VERTAL_GPU_CONFIG: JSON.stringify({
    VERTAL_OLLAMA_URL_2: 'https://gpu.example.modal.run',
    VERTAL_OLLAMA_TOKEN_2: 'gpu',
    VERTAL_OLLAMA_MODEL_2: 'vertal-coder-gpu',
    VERTAL_OLLAMA_MAX_INPUT_TOKENS_2: 12000,
    VERTAL_OLLAMA_CONTEXT_2: 16384,
    VERTAL_OLLAMA_FIRST_TOKEN_MS_2: 60000,
    VERTAL_OLLAMA_TOTAL_MS_2: 90000,
    VERTAL_OLLAMA_MAX_OUTPUT_TOKENS_2: 4096,
  }),
});
const VM_ID = 'vca-self-hosted';
const GPU_ID = 'vca-self-hosted-2';
const OWN = new Set([VM_ID, GPU_ID]);

const chainFor = (option: VcaOption | 'auto-legacy', promptTokens: number, modelId?: string) =>
  option === 'auto-legacy'
    ? buildChain(PROD, { effort: 'auto', promptTokens })
    : buildOptionChain(PROD, { option, effort: 'auto', promptTokens, modelId });

describe('VERTAL Code AI · pedido grande vai à GPU própria primeiro, em TODAS as opções de texto', () => {
  // "auto-legacy" = caminho da função quando não vem opção nem modelo (buildChain direto).
  const options: Array<VcaOption | 'auto-legacy'> = ['auto-legacy', ...VCA_TEXT_OPTIONS];

  it.each(options)('%s · pequeno (800 tok): VM → GPU → resto da cadeia', (option) => {
    const ids = chainFor(option, 800).map((m) => m.id);
    expect(ids.slice(0, 2)).toEqual([VM_ID, GPU_ID]);
    expect(ids.length).toBeGreaterThan(2); // as reservas continuam lá
  });

  it.each(options)('%s · grande (5 000 tok > 3 000 da VM): GPU primeiro, antes de qualquer modelo de fora', (option) => {
    const chain = chainFor(option, 5_000);
    expect(chain[0].id).toBe(GPU_ID);
    expect(chain.map((m) => m.id)).not.toContain(VM_ID);
    // reservas intactas depois da GPU
    expect(chain.slice(1).length).toBeGreaterThan(0);
    expect(chain.slice(1).every((m) => !OWN.has(m.id))).toBe(true);
  });

  it.each(options)('%s · logo acima do limite (3 001 tok): já é GPU primeiro', (option) => {
    expect(chainFor(option, 3_001)[0].id).toBe(GPU_ID);
    expect(chainFor(option, 3_000)[0].id).toBe(VM_ID);
  });

  it.each(options)('%s · maior que a GPU aguenta (13 000 tok): nenhuma própria, vai direto às reservas', (option) => {
    const ids = chainFor(option, 13_000).map((m) => m.id);
    expect(ids.some((id) => OWN.has(id))).toBe(false);
    expect(ids.length).toBeGreaterThan(0);
  });

  it('Vertal Livre continua só grátis + própria (nunca pago), com a GPU primeiro no pedido grande', () => {
    const chain = chainFor('livre', 5_000);
    expect(chain[0].id).toBe(GPU_ID);
    expect(chain.some((m) => m.cost === 'paid')).toBe(false);
    expect(chain[0].cost).toBe('self_hosted');
  });

  it('modelo fixado (modelId) continua vencendo a ordem', () => {
    expect(chainFor('code', 5_000, 'vca-code-agile').map((m) => m.id)).toEqual(['vca-code-agile']);
    expect(chainFor('auto', 800, GPU_ID).map((m) => m.id)).toEqual([GPU_ID]);
  });

  it('VERTAL_CODE_AI_PREFER_SELF_HOSTED=false mantém a ordem antiga (própria depois dos grátis)', () => {
    const env = { ...PROD, VERTAL_CODE_AI_PREFER_SELF_HOSTED: 'false' };
    expect(buildChain(env, { effort: 'auto', promptTokens: 5_000 })[0].id).not.toBe(GPU_ID);
  });

  it('o limite "grande" segue o limite de entrada da VM; VERTAL_OLLAMA_2_FIRST_ABOVE_TOKENS vence', () => {
    const both = selfHostedModels(PROD);
    expect(orderSelfHosted({ VERTAL_OLLAMA_MAX_INPUT_TOKENS: '4000' }, both, 3_500)[0].id).toBe(VM_ID);
    expect(orderSelfHosted({ VERTAL_OLLAMA_MAX_INPUT_TOKENS: '4000' }, both, 4_001)[0].id).toBe(GPU_ID);
    expect(orderSelfHosted({ VERTAL_OLLAMA_MAX_INPUT_TOKENS: '4000', VERTAL_OLLAMA_2_FIRST_ABOVE_TOKENS: '2000' }, both, 2_500)[0].id).toBe(GPU_ID);
    expect(orderSelfHosted({}, both, 3_001)[0].id).toBe(GPU_ID);
  });

  it('prazo do 1º token: desde o envio na GPU (frio), desde os cabeçalhos na VM (como antes); ajustável', () => {
    const [vm, gpu] = selfHostedModels(PROD);
    expect(vm.budget?.firstTokenFromStart).toBeFalsy();
    expect(gpu.budget?.firstTokenFromStart).toBe(true);
    expect(gpu.budget?.firstTokenMs).toBe(60_000);
    const off = selfHostedModels({ ...PROD, VERTAL_OLLAMA_FIRST_TOKEN_FROM_START_2: 'false' })[1];
    expect(off.budget?.firstTokenFromStart).toBeFalsy();
    // a chave também entra pelo segredo único VERTAL_GPU_CONFIG
    const viaCfg = expandVcaEnv({ VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_OLLAMA_URL_2: 'https://g.example', VERTAL_OLLAMA_FIRST_TOKEN_FROM_START_2: 'no' }) });
    expect(selfHostedModels(viaCfg)[0].budget?.firstTokenFromStart).toBeFalsy();
  });

  it('saída pedida à própria nunca estoura o contexto (folga de tokens medida)', () => {
    const gpu = selfHostedModels(PROD)[1];
    expect(VCA_TOKEN_SAFETY).toBeGreaterThanOrEqual(1.3);
    expect(selfHostedOutputTokens(gpu, 1_000, 8_000)).toBe(4_096);
    const mid = selfHostedOutputTokens(gpu, 9_000, 8_000);
    expect(mid).toBe(16_384 - Math.ceil(9_000 * VCA_TOKEN_SAFETY) - 256);
    expect(Math.ceil(9_000 * VCA_TOKEN_SAFETY) + mid).toBeLessThanOrEqual(16_384);
    expect(selfHostedOutputTokens(gpu, 11_500, 8_000)).toBe(0); // não sobra resposta útil: pula
    expect(selfHostedOutputTokens(gpu, 1_000, 500)).toBe(500); // pedido pequeno de propósito fica igual
    const cloud = buildChain(PROD, { effort: 'auto' }).find((m) => !m.budget)!;
    expect(selfHostedOutputTokens(cloud, 50_000, 8_000)).toBe(8_000);
  });
});

// ───────────────────────── executor da cadeia (fetch falso + relógio falso) ─────────────────────────

type Plan =
  | { kind: 'ok'; content: string; headersAt?: number; firstAt?: number }
  | { kind: 'status'; status: number }
  | { kind: 'hang' } // nunca devolve cabeçalhos (GPU subindo a frio)
  | { kind: 'stall'; headersAt: number }; // cabeçalhos chegam, texto nunca

const GOOD = JSON.stringify({ summary: 'ok', actions: [{ type: 'write_file', path: 'src/App.tsx', content: 'export default 1' }], final: true });

function fakeFetch(plans: Record<string, Plan>) {
  const calls: Array<{ url: string; at: number; body: Record<string, unknown> }> = [];
  const t0 = Date.now();
  const fn = (url: string, init: RequestInit): Promise<Response> => {
    const host = new URL(url).host;
    const plan = plans[host] ?? { kind: 'ok', content: GOOD };
    calls.push({ url, at: Date.now() - t0, body: JSON.parse(String(init.body)) });
    const signal = init.signal!;
    const stream = (init.body && JSON.parse(String(init.body)).stream) === true;
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => reject(signal.reason ?? new DOMException('aborted', 'AbortError'));
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort);
      if (plan.kind === 'hang') return;
      if (plan.kind === 'status') return resolve(new Response('{"error":"x"}', { status: plan.status }));
      const headersAt = plan.headersAt ?? 0;
      setTimeout(() => {
        if (!stream) {
          const content = plan.kind === 'ok' ? plan.content : '';
          return resolve(new Response(JSON.stringify({ choices: [{ message: { content } }], usage: {} }), { status: 200 }));
        }
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            const enc = new TextEncoder();
            signal.addEventListener('abort', () => c.error(signal.reason));
            c.enqueue(enc.encode('data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n'));
            if (plan.kind === 'stall') return;
            setTimeout(() => {
              c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: plan.content } }] })}\n\n`));
              c.enqueue(enc.encode('data: [DONE]\n\n'));
              c.close();
            }, (plan.firstAt ?? headersAt) - headersAt);
          },
        });
        resolve(new Response(body, { status: 200 }));
      }, headersAt);
    });
  };
  return { fn, calls };
}

const msgsOf = (tokens: number): VcaChatMessage[] => [
  { role: 'system', content: 'Você é o VERTAL Code AI.' },
  { role: 'user', content: 'x'.repeat(Math.max(0, Math.round(tokens * 3.5) - 24)) },
];

describe('VERTAL Code AI · executor da cadeia com a GPU própria', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-11-26T06:00:00Z') }));
  afterEach(() => vi.useRealTimers());

  const opts = () => ({ json: true, maxTokens: 8_000, effort: 'auto' as const, deadline: Date.now() + 140_000 });
  const deps = (fetch: ReturnType<typeof fakeFetch>['fn'], cooldown = new Map<string, number>()) => ({ fetch, env: PROD, cooldown });
  const hostOf = (m: VcaModel) => new URL(m.url).host;
  const GPU_HOST = 'gpu.example.modal.run';
  const VM_HOST = 'llm.vertalrun.com';

  it('pedido grande: a VM é pulada sem chamada e a GPU responde (sem "fellBack")', async () => {
    const chain = buildOptionChain(PROD, { option: 'code', effort: 'auto', promptTokens: 800 }); // cadeia montada só com o texto do dev
    const ff = fakeFetch({ [GPU_HOST]: { kind: 'ok', content: GOOD, headersAt: 300, firstAt: 500 } });
    const messages = msgsOf(5_000); // mas o pedido real (sistema + arquivos) é grande
    expect(estimateTokens(messages)).toBeGreaterThan(3_000);
    const p = runChain(chain, messages, opts(), deps(ff.fn));
    await vi.advanceTimersByTimeAsync(1_000);
    const r = await p;
    expect(r.label).toBe('Vertal Própria 2');
    expect(r.cost).toBe('self_hosted');
    expect(r.fellBack).toBe(false);
    expect(ff.calls.map((c) => new URL(c.url).host)).toEqual([GPU_HOST]);
    expect(ff.calls[0].body.max_tokens).toBe(4_096);
    expect(ff.calls[0].body.model).toBe('vertal-coder-gpu');
    // Data Library: a resposta também traz o uso da chamada (tokens/custo), sem mudar o roteamento.
    expect(r.usage?.inputTokens).toBeGreaterThan(3_000);
    expect(r.usage?.outputTokens).toBeGreaterThan(0);
    expect(r.usage?.costUsd).toBe(0);
  });

  it('pedido pequeno: a VM responde primeiro (GPU nem é chamada)', async () => {
    const chain = buildChain(PROD, { effort: 'auto', promptTokens: 300 });
    const ff = fakeFetch({ [VM_HOST]: { kind: 'ok', content: GOOD, headersAt: 2_000, firstAt: 3_000 } });
    const p = runChain(chain, msgsOf(800), opts(), deps(ff.fn));
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await p).label).toBe('Vertal Própria');
    expect(ff.calls.map((c) => new URL(c.url).host)).toEqual([VM_HOST]);
  });

  it.each(VCA_TEXT_OPTIONS)('%s · GPU fora do ar (503): cai na próxima da cadeia e a GPU fica 60 s de castigo', async (option) => {
    const chain = buildOptionChain(PROD, { option, effort: 'auto', promptTokens: 5_000 });
    const ff = fakeFetch({ [GPU_HOST]: { kind: 'status', status: 503 } });
    const cooldown = new Map<string, number>();
    const p = runChain(chain, msgsOf(5_000), opts(), deps(ff.fn, cooldown));
    await vi.advanceTimersByTimeAsync(100);
    const r = await p;
    expect(r.cost).not.toBe('self_hosted');
    expect(r.label).toBe(chain[1].label);
    expect(r.fellBack).toBe(true);
    expect(ff.calls.map((c) => new URL(c.url).host)).toEqual([GPU_HOST, hostOf(chain[1])]);
    expect(cooldown.get(GPU_ID)!).toBeGreaterThan(Date.now() + SELF_HOSTED_COOLDOWN_MS - 1_000);
    // próximo pedido dentro do castigo: nem tenta a GPU
    const ff2 = fakeFetch({});
    const p2 = runChain(chain, msgsOf(5_000), opts(), deps(ff2.fn, cooldown));
    await vi.advanceTimersByTimeAsync(100);
    await p2;
    expect(ff2.calls.map((c) => new URL(c.url).host)).not.toContain(GPU_HOST);
  });

  it('GPU a frio sem responder: no máximo 60 s até a reserva entrar (o relógio conta desde o envio)', async () => {
    const chain = buildOptionChain(PROD, { option: 'auto', effort: 'auto', promptTokens: 5_000 });
    const ff = fakeFetch({ [GPU_HOST]: { kind: 'hang' } });
    const p = runChain(chain, msgsOf(5_000), opts(), deps(ff.fn));
    await vi.advanceTimersByTimeAsync(59_000);
    expect(ff.calls).toHaveLength(1); // ainda esperando a GPU
    await vi.advanceTimersByTimeAsync(1_500);
    const r = await p;
    expect(ff.calls).toHaveLength(2);
    expect(ff.calls[1].at).toBeLessThanOrEqual(60_000);
    expect(r.fellBack).toBe(true);
    expect(r.cost).not.toBe('self_hosted');
  });

  it('GPU devolve cabeçalhos mas não o texto: o corte continua em 60 s desde o envio (não 60 s depois dos cabeçalhos)', async () => {
    const chain = buildChain(PROD, { effort: 'auto', promptTokens: 5_000 });
    const ff = fakeFetch({ [GPU_HOST]: { kind: 'stall', headersAt: 40_000 } });
    const p = runChain(chain, msgsOf(5_000), opts(), deps(ff.fn));
    await vi.advanceTimersByTimeAsync(61_000);
    const r = await p;
    expect(ff.calls[1].at).toBeLessThanOrEqual(60_000);
    expect(r.cost).not.toBe('self_hosted');
  });

  it('GPU a frio que responde aos 55 s: é ela quem atende (não corta cedo)', async () => {
    const chain = buildChain(PROD, { effort: 'auto', promptTokens: 5_000 });
    const ff = fakeFetch({ [GPU_HOST]: { kind: 'ok', content: GOOD, headersAt: 50_000, firstAt: 55_000 } });
    const p = runChain(chain, msgsOf(5_000), opts(), deps(ff.fn));
    await vi.advanceTimersByTimeAsync(56_000);
    expect((await p).label).toBe('Vertal Própria 2');
    expect(ff.calls).toHaveLength(1);
  });

  it('VM mantém o comportamento de antes: prazo do 1º token só depois dos cabeçalhos', async () => {
    const chain = buildChain(PROD, { effort: 'auto', promptTokens: 300 });
    // cabeçalhos aos 25 s, texto aos 30 s; prazo padrão da VM = 20 s a partir dos cabeçalhos
    const ff = fakeFetch({ [VM_HOST]: { kind: 'ok', content: GOOD, headersAt: 25_000, firstAt: 30_000 } });
    const p = runChain(chain, msgsOf(800), opts(), deps(ff.fn));
    await vi.advanceTimersByTimeAsync(31_000);
    expect((await p).label).toBe('Vertal Própria');
  });

  it('400 da GPU (pedido específico) cai na reserva SEM castigar os próximos pedidos', async () => {
    const chain = buildChain(PROD, { effort: 'auto', promptTokens: 5_000 });
    const ff = fakeFetch({ [GPU_HOST]: { kind: 'status', status: 400 } });
    const cooldown = new Map<string, number>();
    const p = runChain(chain, msgsOf(5_000), opts(), deps(ff.fn, cooldown));
    await vi.advanceTimersByTimeAsync(100);
    expect((await p).cost).not.toBe('self_hosted');
    expect(cooldown.has(GPU_ID)).toBe(false);
  });

  it('JSON ruim da GPU: a reserva tenta no mesmo turno', async () => {
    const chain = buildChain(PROD, { effort: 'auto', promptTokens: 5_000 });
    const ff = fakeFetch({ [GPU_HOST]: { kind: 'ok', content: 'não é json' } });
    const p = runChain(chain, msgsOf(5_000), opts(), deps(ff.fn));
    await vi.advanceTimersByTimeAsync(100);
    const r = await p;
    expect(r.cost).not.toBe('self_hosted');
    expect(r.fellBack).toBe(true);
  });

  it('entrada que não deixa espaço de resposta no contexto da GPU: pula sem chamar (evita 400 + castigo)', async () => {
    const chain = buildChain(PROD, { effort: 'auto', promptTokens: 5_000 });
    const ff = fakeFetch({});
    const p = runChain(chain, msgsOf(11_500), opts(), deps(ff.fn));
    await vi.advanceTimersByTimeAsync(100);
    const r = await p;
    expect(ff.calls.map((c) => new URL(c.url).host)).not.toContain(GPU_HOST);
    expect(r.fellBack).toBe(false); // pular não conta como falha
  });

  it('sem tempo para a GPU e a reserva (prazo curto): pula a GPU em vez de arriscar', async () => {
    const chain = buildChain(PROD, { effort: 'auto', promptTokens: 5_000 });
    const ff = fakeFetch({});
    const p = runChain(chain, msgsOf(5_000), { ...opts(), deadline: Date.now() + FALLBACK_RESERVE_MS + 60_000 }, deps(ff.fn));
    await vi.advanceTimersByTimeAsync(100);
    await p;
    expect(ff.calls.map((c) => new URL(c.url).host)).not.toContain(GPU_HOST);
  });

  it('todas falham: erro vca_all_models_failed (como antes)', async () => {
    const chain = buildChain(PROD, { effort: 'auto', promptTokens: 5_000 }).slice(0, 3);
    const plans = Object.fromEntries(chain.map((m) => [hostOf(m), { kind: 'status', status: 503 } as Plan]));
    const p = runChain(chain, msgsOf(5_000), opts(), deps(fakeFetch(plans).fn));
    const done = expect(p).rejects.toThrow('vca_all_models_failed');
    await vi.advanceTimersByTimeAsync(100);
    await done;
  });
});
