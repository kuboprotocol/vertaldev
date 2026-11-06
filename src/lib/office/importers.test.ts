import { describe, expect, it } from 'vitest';
import { createEmptyDoc } from './documentModel';
import { docToDocx } from './officeFiles';
import { importBytes } from './importers';
import { createEmptySheet, setCell, sheetToXlsx } from './sheetModel';
import { createEmptyDeck, makeSlide } from './slidesModel';
import { deckToPptx } from './officeFiles';

import { sheetToCsv } from './sheetModel';

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe('importação de arquivos', () => {
  it('lê texto simples em parágrafos', async () => {
    const r = await importBytes('ideias.txt', enc('primeira linha\n\nsegunda linha'));
    expect(r.kind).toBe('doc');
    if (r.kind !== 'doc') return;
    expect(r.doc.title).toBe('ideias');
    expect(r.doc.blocks.map((b) => b.text)).toEqual(['primeira linha', 'segunda linha']);
  });

  it('reconhece títulos e itens em Markdown', async () => {
    const r = await importBytes('notas.md', enc('# Plano\n- item um\n- item dois\ntexto livre'));
    if (r.kind !== 'doc') throw new Error('esperava documento');
    expect(r.doc.blocks.map((b) => [b.type, b.text])).toEqual([
      ['heading', 'Plano'],
      ['bullet', 'item um'],
      ['bullet', 'item dois'],
      ['paragraph', 'texto livre'],
    ]);
  });

  it('extrai título e parágrafos de HTML', async () => {
    const r = await importBytes('pagina.html', enc('<html><body><h1>Título</h1><p>Corpo do texto.</p><ul><li>Ponto</li></ul></body></html>'));
    if (r.kind !== 'doc') throw new Error('esperava documento');
    expect(r.doc.blocks.map((b) => [b.type, b.text])).toEqual([
      ['heading', 'Título'],
      ['paragraph', 'Corpo do texto.'],
      ['bullet', 'Ponto'],
    ]);
  });

  it('volta um Word exportado pelo próprio Office com o mesmo conteúdo', async () => {
    const doc = { ...createEmptyDoc('Proposta'), blocks: [
      { id: 'a', type: 'heading' as const, text: 'Seção' },
      { id: 'b', type: 'paragraph' as const, text: 'Um parágrafo.' },
      { id: 'c', type: 'bullet' as const, text: 'Um item' },
    ] };
    const blob = await docToDocx(doc);
    const bytes = await new Promise<ArrayBuffer>((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as ArrayBuffer);
      fr.readAsArrayBuffer(blob);
    });
    const r = await importBytes('proposta.docx', bytes);
    if (r.kind !== 'doc') throw new Error('esperava documento');
    expect(r.doc.title).toBe('Proposta');
    expect(r.doc.blocks.map((b) => [b.type, b.text])).toEqual([
      ['heading', 'Seção'],
      ['paragraph', 'Um parágrafo.'],
      ['bullet', 'Um item'],
    ]);
  });

  it('abre planilha .xlsx e CSV com as células na posição certa', async () => {
    let sheet = setCell(createEmptySheet('Vendas'), 'A1', 'Produto');
    sheet = setCell(sheet, 'B2', '120');
    const xlsx = await importBytes('vendas.xlsx', sheetToXlsx(sheet));
    if (xlsx.kind !== 'sheet') throw new Error('esperava planilha');
    expect(xlsx.sheet.cells.A1).toBe('Produto');
    expect(xlsx.sheet.cells.B2).toBe('120');

    const csv = await importBytes('vendas.csv', enc('nome,valor\nespresso,9'));
    if (csv.kind !== 'sheet') throw new Error('esperava planilha');
    expect(csv.sheet.cells.B2).toBe('9');
    expect(sheetToCsv(csv.sheet.cells)).toContain('espresso');
  });

  it('abre PowerPoint e mantém título e tópicos de cada slide', async () => {
    const deck = { ...createEmptyDeck('Lançamento'), slides: [makeSlide('Abertura', ['Ponto A', 'Ponto B']), makeSlide('Fim', ['Obrigado'])] };
    const r = await importBytes('lancamento.pptx', await deckToPptx(deck));
    if (r.kind !== 'deck') throw new Error('esperava apresentação');
    expect(r.deck.slides.map((s) => s.title)).toEqual(['Abertura', 'Fim']);
    expect(r.deck.slides[0].bullets).toEqual(['Ponto A', 'Ponto B']);
  });

  it('aceita outros arquivos de texto (ex.: JSON) como texto simples', async () => {
    const r = await importBytes('dados.json', enc('{"a": 1}'));
    if (r.kind !== 'doc') throw new Error('esperava documento');
    expect(r.doc.blocks[0].text).toBe('{"a": 1}');
  });

  it('recusa binário desconhecido com mensagem clara', async () => {
    const bin = new Uint8Array([0x89, 0x00, 0x01, 0x02]).buffer;
    await expect(importBytes('foto.png', bin)).rejects.toThrow(/Não consigo abrir "foto.png"/);
  });

  it('recusa arquivo acima de 10 MB', async () => {
    const big = new ArrayBuffer(10 * 1024 * 1024 + 1);
    await expect(importBytes('grande.txt', big)).rejects.toThrow(/10 MB/);
  });
});
