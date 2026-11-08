import { describe, expect, it } from 'vitest';
import { DOC_TEMPLATES, SHEET_TEMPLATES, docTemplateBlocks } from './templates';
import { evaluateAll } from './formulas';

describe('modelos de documento', () => {
  it('tem tipos distintos, com identificador único', () => {
    const ids = DOC_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['carta', 'relatorio', 'ata', 'proposta', 'contrato', 'curriculo']));
  });

  it('gera blocos novos a cada chamada, com tipos válidos', () => {
    const a = docTemplateBlocks('ata');
    const b = docTemplateBlocks('ata');
    expect(a.length).toBeGreaterThan(5);
    expect(a.map((x) => x.id)).not.toEqual(b.map((x) => x.id));
    expect(new Set(a.map((x) => x.type))).toEqual(new Set(['paragraph', 'heading', 'bullet']));
  });

  it('modelo desconhecido não gera nada', () => {
    expect(docTemplateBlocks('nao-existe')).toEqual([]);
  });

  it('contrato traz aviso de revisão jurídica', () => {
    const text = docTemplateBlocks('contrato').map((b) => b.text).join(' ');
    expect(text).toContain('Revise com um advogado');
  });
});

describe('modelos de planilha', () => {
  const orcamento = SHEET_TEMPLATES.find((t) => t.id === 'orcamento')!;
  const controle = SHEET_TEMPLATES.find((t) => t.id === 'controle')!;

  it('orçamento calcula o total de cada linha e o total geral', () => {
    const values = evaluateAll(orcamento.build('Orçamento').cells);
    expect(values.D2).toBe('1500');
    expect(values.D3).toBe('960');
    expect(values.D4).toBe('60');
    expect(values.D5).toBe('2520');
  });

  it('controle financeiro calcula total e saldo', () => {
    const values = evaluateAll(controle.build('Controle').cells);
    expect(values.D4).toBe('1200');
    expect(values.E4).toBe('350');
    expect(values.E5).toBe('850');
  });
});
