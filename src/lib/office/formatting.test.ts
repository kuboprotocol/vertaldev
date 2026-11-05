import { describe, expect, it } from 'vitest';
import {
  createEmptyDoc,
  docToHtml,
  docToMarkdown,
  formatBlock,
  insertBlockAfter,
  removeBlockById,
  setBlockType,
} from './documentModel';
import { createEmptySheet, setCell, styleCells, suggestFormula } from './sheetModel';
import { DECK_THEMES, createEmptyDeck, setDeckTheme, themeById } from './slidesModel';

describe('formatação do documento', () => {
  it('aplica negrito e alinhamento só no bloco indicado', () => {
    let doc = createEmptyDoc();
    doc = insertBlockAfter(doc, null, 'paragraph');
    const [first, second] = doc.blocks;
    doc = formatBlock(doc, first.id, { bold: true, align: 'center' });
    expect(doc.blocks[0].format).toEqual({ bold: true, align: 'center' });
    expect(doc.blocks[1].format).toBeUndefined();
    expect(second.id).not.toBe(first.id);
  });

  it('exporta HTML com o estilo do bloco e Markdown com ênfase', () => {
    let doc = createEmptyDoc('Teste');
    doc = { ...doc, blocks: [{ id: 'a', type: 'paragraph', text: 'Oi', format: { bold: true, italic: true, size: 'lg' } }] };
    expect(docToHtml(doc)).toContain('style="font-weight:700;font-style:italic;font-size:20px"');
    expect(docToMarkdown(doc)).toContain('***Oi***');
  });

  it('troca o estilo e remove sem deixar o documento vazio', () => {
    let doc = createEmptyDoc();
    const id = doc.blocks[0].id;
    doc = setBlockType(doc, id, 'heading');
    expect(doc.blocks[0].type).toBe('heading');
    doc = removeBlockById(doc, id);
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0].id).not.toBe(id);
  });
});

describe('formatação da planilha', () => {
  it('estiliza células selecionadas e limpa estilo que ficou neutro', () => {
    let sheet = setCell(createEmptySheet(), 'B2', '10');
    sheet = styleCells(sheet, ['B2', 'C2'], { bold: true, fill: '#fef3c7' });
    expect(sheet.styles).toEqual({ B2: { bold: true, fill: '#fef3c7' }, C2: { bold: true, fill: '#fef3c7' } });
    sheet = styleCells(sheet, ['B2', 'C2'], { bold: false, fill: null });
    expect(sheet.styles).toEqual({});
  });

  it('sugere soma da coluna acima da célula', () => {
    expect(suggestFormula('SUM', 'C5')).toBe('=SUM(C1:C4)');
    expect(suggestFormula('AVERAGE', 'A1')).toBe('=AVERAGE()');
  });
});

describe('temas da apresentação', () => {
  it('troca o tema e cai no claro quando o tema é desconhecido', () => {
    const deck = setDeckTheme(createEmptyDeck(), 'escuro');
    expect(deck.theme).toBe('escuro');
    expect(themeById(deck.theme).bg).toBe('#0f172a');
    expect(themeById(undefined).id).toBe(DECK_THEMES[0].id);
  });
});
