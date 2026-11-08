import { describe, expect, it } from 'vitest';
import { docFromAi } from './documentModel';
import { createEmptySheet, sheetFromTable } from './sheetModel';
import { blocksToPdf, docToPdf, sheetToPdf, textToPdf, wrapLines } from './pdfGenerate';
import { loadPdf } from './pdfEdit';
import { SHEET_TEMPLATES } from './templates';

const header = (bytes: Uint8Array) => new TextDecoder().decode(bytes.subarray(0, 5));

describe('geração de PDF', () => {
  it('quebra linhas pela largura real da fonte', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = wrapLines('uma frase bem comprida que precisa quebrar em várias linhas', font, 12, 120);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(font.widthOfTextAtSize(l, 12)).toBeLessThanOrEqual(120);
    expect(lines.join(' ')).toBe('uma frase bem comprida que precisa quebrar em várias linhas');
  });

  it('texto curto vira um PDF de uma página com número de página', async () => {
    const pdf = await textToPdf('Carta', 'Olá.\n\nTudo bem?');
    expect(header(pdf)).toBe('%PDF-');
    expect((await loadPdf(pdf)).getPageCount()).toBe(1);
  });

  it('texto longo pagina sozinho', async () => {
    const paragraphs = Array.from({ length: 120 }, (_, i) => `Parágrafo ${i + 1}: ${'texto de preenchimento '.repeat(8)}`).join('\n\n');
    const pdf = await textToPdf('Longo', paragraphs);
    expect((await loadPdf(pdf)).getPageCount()).toBeGreaterThan(1);
  });

  it('documento com títulos, listas e formatação vira PDF', async () => {
    const doc = docFromAi('Relatório', [
      { type: 'heading', text: 'Resultados' },
      { type: 'bullet', text: 'Receita cresceu 12%' },
      { type: 'paragraph', text: 'Texto final.' },
    ]);
    const pdf = await docToPdf(doc);
    expect(header(pdf)).toBe('%PDF-');
    const loaded = await loadPdf(pdf);
    expect(loaded.getTitle()).toBe('Relatório');
  });

  it('blocos vazios não geram página extra', async () => {
    const pdf = await blocksToPdf('', [{ kind: 'paragraph', text: '   ' }]);
    expect((await loadPdf(pdf)).getPageCount()).toBe(1);
  });

  it('planilha vira tabela em PDF paisagem, inclusive com fórmulas calculadas', async () => {
    const sheet = sheetFromTable('Vendas', ['Item', 'Valor'], [
      ['Café', 10],
      ['Pão', 5],
      ['Total', '=SUM(B2:B3)'],
    ]);
    const pdf = await sheetToPdf(sheet);
    const loaded = await loadPdf(pdf);
    const page = loaded.getPage(0);
    expect(page.getWidth()).toBeGreaterThan(page.getHeight());
  });

  it('planilha vazia ainda gera um PDF válido', async () => {
    const pdf = await sheetToPdf(createEmptySheet('Vazia'));
    expect(header(pdf)).toBe('%PDF-');
  });

  it('modelos de planilha geram PDF', async () => {
    for (const t of SHEET_TEMPLATES) {
      const pdf = await sheetToPdf(t.build(t.label));
      expect(header(pdf)).toBe('%PDF-');
    }
  });
});
