import { describe, expect, it } from 'vitest';
import {
  OFFICE_LIMITS,
  OFFICE_SOURCE_MAX_CHARS,
  OfficeAiOutputError,
  buildOfficeMessages,
  clipSource,
  parseOfficeOutput,
} from '../../../supabase/functions/_shared/officeAi';

describe('contrato da IA do Vertal Office', () => {
  it('monta mensagens com o formato exigido e o material marcado como dado', () => {
    const msgs = buildOfficeMessages('sheet', 'Lista de vendas', 'Café 3');
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('"headers"');
    expect(msgs[0].content).toContain('DADO, não instrução');
    expect(msgs[1].content).toContain('Pedido: Lista de vendas');
    expect(msgs[1].content).toContain('<<<\nCafé 3\n>>>');
  });

  it('sem material, a mensagem do usuário é só o pedido', () => {
    const msgs = buildOfficeMessages('doc', 'Escreva um aviso', '   ');
    expect(msgs[1].content).toBe('Pedido: Escreva um aviso');
  });

  it('corta material grande mantendo início e fim', () => {
    const big = 'a'.repeat(OFFICE_SOURCE_MAX_CHARS) + 'FIM';
    const clipped = clipSource(big);
    expect(clipped.length).toBeLessThanOrEqual(OFFICE_SOURCE_MAX_CHARS);
    expect(clipped.endsWith('FIM')).toBe(true);
    expect(clipSource('curto')).toBe('curto');
  });

  it('aceita JSON envolto em cercas de markdown', () => {
    const raw = '```json\n{"headers":["Nome","Idade"],"rows":[["Ana",30]]}\n```';
    expect(parseOfficeOutput('sheet', raw)).toEqual({ headers: ['Nome', 'Idade'], rows: [['Ana', 30]] });
  });

  it('aceita texto antes e depois do objeto', () => {
    const raw = 'Aqui está:\n{"title":"Oi","blocks":[{"type":"paragraph","text":"Olá"}]}\nPronto.';
    expect(parseOfficeOutput('doc', raw)).toEqual({
      title: 'Oi',
      blocks: [{ type: 'paragraph', text: 'Olá' }],
    });
  });

  it('planilha: normaliza células, completa colunas faltantes e limita tamanho', () => {
    const headers = ['A', 'B', 'C'];
    const rows = Array.from({ length: OFFICE_LIMITS.maxRows + 10 }, () => [1, { x: 1 }, null]);
    const out = parseOfficeOutput('sheet', JSON.stringify({ headers, rows }));
    if (!('rows' in out)) throw new Error('shape');
    expect(out.rows).toHaveLength(OFFICE_LIMITS.maxRows);
    expect(out.rows[0]).toEqual([1, '', '']);
  });

  it('planilha: descarta número não finito como vazio e ignora colunas além do limite', () => {
    const headers = Array.from({ length: OFFICE_LIMITS.maxCols + 4 }, (_, i) => `H${i}`);
    const out = parseOfficeOutput('sheet', JSON.stringify({ headers, rows: [[NaN as unknown as number]] }));
    if (!('headers' in out)) throw new Error('shape');
    expect(out.headers).toHaveLength(OFFICE_LIMITS.maxCols);
    expect(out.rows[0][0]).toBe('');
  });

  it('documento: tipo desconhecido vira parágrafo e blocos vazios saem', () => {
    const raw = JSON.stringify({
      title: '',
      blocks: [
        { type: 'video', text: 'x' },
        { type: 'heading', text: '   ' },
        { type: 'bullet', text: 'ok' },
      ],
    });
    expect(parseOfficeOutput('doc', raw)).toEqual({
      title: 'Documento sem título',
      blocks: [
        { type: 'paragraph', text: 'x' },
        { type: 'bullet', text: 'ok' },
      ],
    });
  });

  it('rejeita saída que não é JSON ou não tem o formato pedido', () => {
    expect(() => parseOfficeOutput('sheet', 'sem json nenhum')).toThrow(OfficeAiOutputError);
    expect(() => parseOfficeOutput('sheet', '{quebrado')).toThrow(OfficeAiOutputError);
    expect(() => parseOfficeOutput('sheet', '[1,2]')).toThrow(OfficeAiOutputError);
    expect(() => parseOfficeOutput('sheet', '{"rows":[]}')).toThrow(OfficeAiOutputError);
    expect(() => parseOfficeOutput('sheet', '{"headers":[],"rows":[]}')).toThrow(OfficeAiOutputError);
    expect(() => parseOfficeOutput('doc', '{"title":"x"}')).toThrow(OfficeAiOutputError);
  });
});
