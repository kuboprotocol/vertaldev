// Ação "image" do Vertal Chat: a imagem é gerada de verdade no servidor e o
// pedido do usuário chega inteiro ao modelo. Regressão do bug de 2026-11-18
// ("desenho de um sapo de língua vermelha com uma estrela no meio" virava uma
// mulher / imagem quebrada da Pollinations anônima).
import { describe, expect, it, vi } from 'vitest';
import {
  CHAT_IMAGE_ENDPOINT,
  CHAT_IMAGE_MODEL,
  buildImageInstruction,
  decodeImageDataUrl,
  extractImageUrl,
  generateChatImage,
} from '../../../supabase/functions/_shared/chatImage';
import { buildAgentSystemPrompt, parseAgentTurn } from '../../../supabase/functions/_shared/chatAgent';
import { runChatDelegation, type RouterCall } from '../../../supabase/functions/_shared/chatDelegate';

const SAPO = 'Ilustração de um sapo verde com a língua vermelha comprida e uma estrela dourada bem no meio da língua';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const withImage = (url: string) => ({ choices: [{ message: { content: '', images: [{ type: 'image_url', image_url: { url } }] } }] });
const textOnly = { choices: [{ message: { content: 'Aqui está a descrição do sapo…' } }] };

describe('buildImageInstruction', () => {
  it('leva o pedido inteiro, em português, sem cortar os detalhes', () => {
    const text = buildImageInstruction(SAPO);
    expect(text).toContain(`Pedido: ${SAPO}`);
    expect(text).toMatch(/todos os elementos/i);
    expect(text).toMatch(/posições/);
  });
  it('na 2ª tentativa insiste na imagem', () => {
    expect(buildImageInstruction(SAPO, 2)).toMatch(/veio sem imagem/);
    expect(buildImageInstruction(SAPO, 1)).not.toMatch(/veio sem imagem/);
  });
});

describe('extractImageUrl', () => {
  it('lê a imagem da resposta do OpenRouter', () => {
    expect(extractImageUrl(withImage(PNG))).toBe(PNG);
    expect(extractImageUrl(withImage('https://cdn.example/i.png'))).toBe('https://cdn.example/i.png');
  });
  it('resposta só com texto, vazia ou com URL estranha não conta como imagem', () => {
    expect(extractImageUrl(textOnly)).toBeNull();
    expect(extractImageUrl(null)).toBeNull();
    expect(extractImageUrl(withImage('javascript:alert(1)'))).toBeNull();
  });
});

describe('generateChatImage', () => {
  it('chama o modelo de imagem com o pedido do usuário e devolve a imagem', async () => {
    const fetchImpl = vi.fn(async () => json(200, withImage(PNG))) as unknown as typeof fetch;
    const r = await generateChatImage({ prompt: SAPO, apiKey: 'k', fetchImpl });
    expect(r).toEqual({ ok: true, url: PNG, model: CHAT_IMAGE_MODEL, attempts: 1 });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(CHAT_IMAGE_ENDPOINT);
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(CHAT_IMAGE_MODEL);
    expect(body.modalities).toEqual(['image', 'text']);
    expect(body.messages[0].content).toContain('língua vermelha');
    expect(body.messages[0].content).toContain('estrela dourada bem no meio');
    expect(url).not.toContain('pollinations');
  });

  it('modelo respondeu só texto: tenta de novo e entrega a imagem', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(200, textOnly))
      .mockResolvedValueOnce(json(200, withImage(PNG))) as unknown as typeof fetch;
    const r = await generateChatImage({ prompt: SAPO, apiKey: 'k', fetchImpl });
    expect(r).toMatchObject({ ok: true, attempts: 2 });
  });

  it('sem imagem depois das tentativas: falha (o servidor responde 502 e devolve o crédito)', async () => {
    const fetchImpl = vi.fn(async () => json(200, textOnly)) as unknown as typeof fetch;
    const r = await generateChatImage({ prompt: SAPO, apiKey: 'k', fetchImpl });
    expect(r).toMatchObject({ ok: false, error: 'image_generation_failed', detail: 'no_image_in_response' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('429/5xx repete; 4xx de pedido não repete', async () => {
    const retry = vi.fn()
      .mockResolvedValueOnce(json(503, { error: { message: 'busy' } }))
      .mockResolvedValueOnce(json(200, withImage(PNG))) as unknown as typeof fetch;
    expect(await generateChatImage({ prompt: SAPO, apiKey: 'k', fetchImpl: retry })).toMatchObject({ ok: true, attempts: 2 });

    const denied = vi.fn(async () => json(401, { error: { message: 'bad key' } })) as unknown as typeof fetch;
    expect(await generateChatImage({ prompt: SAPO, apiKey: 'k', fetchImpl: denied })).toMatchObject({ ok: false, detail: 'http_401' });
    expect(denied).toHaveBeenCalledTimes(1);
  });

  it('erro de rede não vira "ok"', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    expect(await generateChatImage({ prompt: SAPO, apiKey: 'k', fetchImpl })).toMatchObject({ ok: false, error: 'image_generation_failed' });
  });

  it('sem chave configurada: provider indisponível, sem chamar ninguém', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await generateChatImage({ prompt: SAPO, apiKey: undefined, fetchImpl })).toMatchObject({ ok: false, error: 'image_provider_unavailable' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('decodeImageDataUrl', () => {
  it('decodifica PNG e recusa o que não é imagem', () => {
    const f = decodeImageDataUrl(PNG);
    expect(f?.type).toBe('image/png');
    expect(f?.ext).toBe('png');
    expect(Array.from(f!.bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(decodeImageDataUrl('data:text/html;base64,PGI+')).toBeNull();
    expect(decodeImageDataUrl('https://x/y.png')).toBeNull();
  });
});

describe('roteamento no contrato do chat', () => {
  const prompt = buildAgentSystemPrompt({ secretNames: [] });
  it('"desenho" vai para a ferramenta image', () => {
    expect(prompt).toMatch(/"desenho de…" é SEMPRE image/);
    expect(prompt).toMatch(/TODOS os detalhes pedidos/);
  });
  it('a ação image mantém o pedido inteiro (sem truncar os detalhes)', () => {
    const turn = parseAgentTurn(JSON.stringify({ reply: 'Vou desenhar.', actions: [{ tool: 'image', prompt: SAPO }] }));
    expect(turn.actions).toEqual([{ tool: 'image', prompt: SAPO }]);
  });
});

describe('Vibe Code pedindo imagem ao chat', () => {
  it('data URL não vai para o contexto do modelo; link https vai', async () => {
    const run = async (imageUrl: string) => {
      let round = 0;
      const router: RouterCall = async (body) => {
        if ((body as { tool: string }).tool === 'image') return { status: 200, data: { ok: true, image_url: imageUrl } };
        round++;
        return round === 1
          ? { status: 200, data: { reply: 'Gerando.', actions: [{ tool: 'image', prompt: SAPO }] } }
          : { status: 200, data: { reply: 'Pronto.', actions: [] } };
      };
      return runChatDelegation('Gere um sapo de língua vermelha', router);
    };
    expect((await run(PNG)).images).toEqual([]);
    expect((await run('https://x.supabase.co/storage/v1/object/public/uploads/u/chat/a.png')).images)
      .toEqual(['https://x.supabase.co/storage/v1/object/public/uploads/u/chat/a.png']);
  });
});
