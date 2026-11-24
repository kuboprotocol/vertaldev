import { describe, expect, it, vi } from 'vitest';
import {
  errorText,
  isVertalCodeAiEnabled,
  looksLikeCodingRequest,
  parseSseBuffer,
  readHandoff,
  streamRun,
  vertalCodeAiHref,
} from './client';
import { historyForModel, loadSession, reduceEvent, saveSession, type ChatItem } from './session';

describe('interruptor', () => {
  it('desligado por padrão; só "true"/"1" liga', () => {
    expect(isVertalCodeAiEnabled({})).toBe(false);
    expect(isVertalCodeAiEnabled({ VITE_VERTAL_CODE_AI: 'false' })).toBe(false);
    expect(isVertalCodeAiEnabled({ VITE_VERTAL_CODE_AI: 'true' })).toBe(true);
    expect(isVertalCodeAiEnabled({ VITE_VERTAL_CODE_AI: '1' })).toBe(true);
  });
  it('o ambiente de testes/CI não liga o modo (fica idêntico ao de hoje)', () => {
    expect(isVertalCodeAiEnabled()).toBe(false);
  });
});

describe('ponte Vertal Chat → VERTAL Code AI', () => {
  it('leva o pedido pelo link e lê de volta', () => {
    const href = vertalCodeAiHref({ from: 'chat', prompt: 'corrija o bug do carrinho' });
    expect(href).toBe('/vertal-code-ai?from=chat&prompt=corrija+o+bug+do+carrinho');
    expect(readHandoff(href.split('?')[1])).toEqual({ prompt: 'corrija o bug do carrinho', from: 'chat', projectId: null });
    expect(readHandoff('from=hacker&project=../../x').from).toBe('direct');
  });
  it('reconhece pedido de programação', () => {
    expect(looksLikeCodingRequest('refatora esse componente React')).toBe(true);
    expect(looksLikeCodingRequest('qual a previsão do tempo?')).toBe(false);
  });
});

describe('stream SSE', () => {
  it('junta pedaços e ignora linhas quebradas', () => {
    const { events, rest } = parseSseBuffer('data: {"kind":"status","title":"a"}\n\ndata: lixo\n\ndata: {"kind":"re');
    expect(events).toEqual([{ kind: 'status', title: 'a' }]);
    expect(rest).toBe('data: {"kind":"re');
  });
  it('streamRun entrega todos os eventos e traduz erro do servidor', async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode('data: {"kind":"status","title":"x"}\n\ndata: {"kind":"do'));
        c.enqueue(enc.encode('ne","files":0,"verified":false}\n\n'));
        c.close();
      },
    });
    const ok = vi.fn(async () => new Response(body, { status: 200 }));
    const got: string[] = [];
    await streamRun('t', { mode: 'build', effort: 'auto', prompt: 'p' }, (e) => got.push(e.kind), undefined, ok as unknown as typeof fetch);
    expect(got).toEqual(['status', 'done']);
    const off = vi.fn(async () => new Response(JSON.stringify({ error: 'vertal_code_ai_disabled' }), { status: 404 }));
    await expect(streamRun('t', { mode: 'build', effort: 'auto', prompt: 'p' }, () => {}, undefined, off as unknown as typeof fetch)).rejects.toThrow('vertal_code_ai_disabled');
    expect(errorText('vertal_code_ai_disabled')).toMatch(/ainda não foi ativado/);
  });
});

describe('sessão na tela', () => {
  const agent = (): Extract<ChatItem, { type: 'agent' }> => ({ type: 'agent', id: 'a', steps: [], diffs: [], done: false });
  it('monta o balão a partir dos eventos', () => {
    let a = agent();
    for (const e of [
      { kind: 'model', label: 'Vertal Livre · Código', cost: 'free', fellBack: false },
      { kind: 'model', label: 'Vertal Livre · Código', cost: 'free', fellBack: false },
      { kind: 'verify', ok: true, issues: [] },
      { kind: 'diff', path: 'src/a.ts', diff: '+x', added: 1, removed: 0, after: 'x', isNew: true, isDelete: false },
      { kind: 'base_hashes', hashes: { 'src/a.ts': 'abc' } },
      { kind: 'reply', text: 'pronto' },
      { kind: 'done' },
    ]) a = reduceEvent(a, e);
    expect(a.steps.filter((s) => s.text.startsWith('Modelo:'))).toHaveLength(1);
    expect(a.diffs[0]).toMatchObject({ path: 'src/a.ts', selected: true, baseHash: 'abc', status: 'pending' });
    expect(a.reply).toBe('pronto');
    expect(a.done).toBe(true);
  });
  it('salva/carrega no aparelho e gera histórico curto', () => {
    const mem: Record<string, string> = {};
    const storage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => void (mem[k] = v) };
    const items: ChatItem[] = [
      { type: 'user', id: 'u', text: 'oi', mode: 'build', images: 0, files: [] },
      { ...agent(), reply: 'feito', diffs: [] },
    ];
    saveSession(items, storage);
    expect(loadSession(storage)).toHaveLength(2);
    expect(historyForModel(items)).toEqual([{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'feito' }]);
  });
});
