import { describe, expect, it } from 'vitest';
import {
  EXCERPT_MAX,
  countByKind,
  deckExcerpt,
  describeDraft,
  docExcerpt,
  filterAndSortItems,
  formatSize,
  safeTitle,
  sheetExcerpt,
  type OfficeItem,
} from './galleryModel';
import { createEmptyDoc, makeBlock } from './documentModel';
import { createEmptyDeck, makeSlide } from './slidesModel';
import { createEmptySheet, sheetFromTable } from './sheetModel';

const item = (over: Partial<OfficeItem>): OfficeItem => ({
  id: over.id ?? 'x',
  kind: 'doc',
  title: 'Sem título',
  excerpt: '',
  sizeBytes: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('resumos para os cartões', () => {
  it('documento: junta o texto dos blocos e corta no limite', () => {
    const doc = createEmptyDoc('Carta');
    doc.blocks = [makeBlock('heading', 'Olá'), makeBlock('paragraph', 'x'.repeat(500))];
    const excerpt = docExcerpt(doc);
    expect(excerpt.startsWith('Olá x')).toBe(true);
    expect(excerpt.length).toBe(EXCERPT_MAX);
    expect(excerpt.endsWith('…')).toBe(true);
  });

  it('planilha: ignora fórmulas no trecho', () => {
    const sheet = sheetFromTable('Orçamento', ['Item', 'Total'], [['Café', '=B2*2']]);
    expect(sheetExcerpt(sheet)).toBe('Item · Total · Café');
  });

  it('apresentação: lista os títulos dos slides', () => {
    const deck = createEmptyDeck('Plano');
    deck.slides = [makeSlide('Problema'), makeSlide('Solução')];
    expect(deckExcerpt(deck)).toBe('Problema · Solução');
  });

  it('describeDraft devolve título e trecho e cai em um padrão sem título', () => {
    const doc = createEmptyDoc('');
    doc.title = '';
    expect(describeDraft('doc', doc).title).toBe('Documento sem título');
    const sheet = createEmptySheet('Controle');
    expect(describeDraft('sheet', sheet)).toEqual({ title: 'Controle', excerpt: '' });
    expect(describeDraft('slides', createEmptyDeck()).title).toBe('Apresentação sem título');
  });
});

describe('filtro e ordenação', () => {
  const items = [
    item({ id: '1', kind: 'doc', title: 'Carta ao cliente', excerpt: 'Prezado', updatedAt: '2026-03-01T00:00:00Z' }),
    item({ id: '2', kind: 'sheet', title: 'Orçamento', excerpt: 'Café · Pão', updatedAt: '2026-05-01T00:00:00Z' }),
    item({ id: '3', kind: 'pdf', title: 'Contrato', updatedAt: '2026-01-01T00:00:00Z' }),
  ];

  it('filtra por tipo', () => {
    expect(filterAndSortItems(items, { query: '', kind: 'sheet', sort: 'recent' }).map((i) => i.id)).toEqual(['2']);
  });

  it('busca no título e no trecho, sem diferenciar maiúsculas e acentos ao minúsculo', () => {
    expect(filterAndSortItems(items, { query: 'CAFÉ', kind: 'all', sort: 'recent' }).map((i) => i.id)).toEqual(['2']);
    expect(filterAndSortItems(items, { query: 'contrato', kind: 'all', sort: 'recent' }).map((i) => i.id)).toEqual(['3']);
  });

  it('ordena por mais recentes, mais antigos e nome', () => {
    expect(filterAndSortItems(items, { query: '', kind: 'all', sort: 'recent' }).map((i) => i.id)).toEqual(['2', '1', '3']);
    expect(filterAndSortItems(items, { query: '', kind: 'all', sort: 'oldest' }).map((i) => i.id)).toEqual(['3', '1', '2']);
    expect(filterAndSortItems(items, { query: '', kind: 'all', sort: 'name' }).map((i) => i.id)).toEqual(['1', '3', '2']);
  });

  it('conta por tipo', () => {
    expect(countByKind(items)).toEqual({ doc: 1, sheet: 1, slides: 0, pdf: 1, file: 0 });
  });
});

describe('utilitários', () => {
  it('nome seguro para download', () => {
    expect(safeTitle('Proposta: ação / final!')).toBe('Proposta-ação-final');
    expect(safeTitle('   ')).toBe('arquivo');
  });

  it('formata tamanho', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
