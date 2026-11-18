// Ponte Vibe Code → Vertal Chat no navegador: transporte, corpo com origin
// 'vibe_code', cartões do stream e o "Usar no pedido".
import { describe, expect, it, vi } from 'vitest';
import {
  askVertalChatFromVibe,
  creativeRouterCall,
  delegateCardFromStep,
  insertDelegateAnswer,
} from './vibeBridge';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('creativeRouterCall', () => {
  it('manda o token do usuário e devolve status + JSON', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true })) as unknown as typeof fetch;
    const call = creativeRouterCall({ url: 'https://x/functions/v1/creative-router', token: 'tok', apikey: 'anon', fetchImpl });
    const res = await call({ tool: 'agent_chat' });
    expect(res).toEqual({ status: 200, data: { ok: true } });
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect((init.headers as Record<string, string>).apikey).toBe('anon');
  });

  it('corpo que não é JSON vira erro legível', async () => {
    const fetchImpl = vi.fn(async () => new Response('oops', { status: 502 })) as unknown as typeof fetch;
    const res = await creativeRouterCall({ url: 'u', token: 't', fetchImpl })({});
    expect(res).toEqual({ status: 502, data: { error: 'invalid_json' } });
  });
});

describe('askVertalChatFromVibe', () => {
  it('pergunta com origin vibe_code e nunca executa vibe_code', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      bodies.push(body);
      if (body.tool === 'agent_op') return jsonResponse(200, { ok: true, summary: 'Next 16' });
      const agent = body.agent as { final?: boolean; origin?: string };
      if (!agent.final) return jsonResponse(200, { reply: '', actions: [{ tool: 'web_search', query: 'next' }, { tool: 'vibe_code', op: 'start', prompt: 'x' }] });
      return jsonResponse(200, { reply: 'A versão atual é a 16.', actions: [] });
    }) as unknown as typeof fetch;

    const r = await askVertalChatFromVibe('Qual a versão do Next?', { url: 'u', token: 't', fetchImpl, context: 'landing' });
    expect(r.ok).toBe(true);
    expect(r.answer).toBe('A versão atual é a 16.');
    expect(r.refused).toContain('vibe_code');
    const chatBodies = bodies.filter((b) => b.tool === 'agent_chat');
    expect(chatBodies).toHaveLength(2);
    expect(chatBodies.every((b) => (b.agent as { origin: string }).origin === 'vibe_code')).toBe(true);
    expect(bodies.some((b) => b.tool === 'vibe_code')).toBe(false);
    expect(String((chatBodies[0].messages as Array<{ content: string }>)[0].content)).toContain('landing');
  });

  it('erro do servidor vira mensagem em português', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(429, { error: 'rate_limit_exceeded' })) as unknown as typeof fetch;
    const r = await askVertalChatFromVibe('pergunta', { url: 'u', token: 't', fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Aguarde um minuto/);
  });
});

describe('delegateCardFromStep', () => {
  it('lê o passo "delegate" do stream do vibe-code-agent', () => {
    const card = delegateCardFromStep({
      kind: 'delegate',
      status: 'success',
      delegate: { question: 'q', answer: 'resposta', tools: [{ tool: 'web_search', ok: true }], images: ['https://img', 3] },
    });
    expect(card).toMatchObject({ ok: true, question: 'q', answer: 'resposta', images: ['https://img'] });
  });

  it('ignora passos em andamento, falhos ou sem resposta', () => {
    expect(delegateCardFromStep({ kind: 'delegate', status: 'running', delegate: { answer: 'x' } })).toBeNull();
    expect(delegateCardFromStep({ kind: 'delegate', status: 'success', delegate: { answer: ' ' } })).toBeNull();
    expect(delegateCardFromStep({ kind: 'reply', status: 'success' })).toBeNull();
  });
});

describe('insertDelegateAnswer ("Usar no pedido")', () => {
  it('acrescenta a resposta ao pedido sem apagar o que já foi escrito', () => {
    expect(insertDelegateAnswer('crie o login', 'use Supabase Auth')).toBe('crie o login\n\nResposta do Vertal Chat:\nuse Supabase Auth');
    expect(insertDelegateAnswer('', 'x')).toBe('Resposta do Vertal Chat:\nx');
  });
});
