import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  SHEET_MAX_COLS,
  SHEET_MAX_ROWS,
  createEmptySheet,
  displayMatrix,
  setCell,
  sheetFromTable,
  sheetToCsv,
  sheetToXlsx,
  usedBounds,
} from './sheetModel';
import {
  DOC_MAX_BLOCKS,
  createEmptyDoc,
  docFromAi,
  docToHtml,
  docToMarkdown,
  docToText,
  escapeHtml,
  wordCount,
} from './documentModel';

describe('planilha', () => {
  it('setCell é imutável e remove célula vazia', () => {
    const a = createEmptySheet();
    const b = setCell(a, 'A1', '5');
    expect(a.cells).toEqual({});
    expect(b.cells).toEqual({ A1: '5' });
    expect(setCell(b, 'A1', '').cells).toEqual({});
  });

  it('ignora referências fora da grade', () => {
    const a = createEmptySheet();
    expect(setCell(a, 'A1000', 'x')).toBe(a);
    expect(setCell(a, '???', 'x')).toBe(a);
  });

  it('calcula a área usada', () => {
    expect(usedBounds({})).toEqual({ rows: 0, cols: 0 });
    expect(usedBounds({ A1: 'x', C7: 'y' })).toEqual({ rows: 7, cols: 3 });
  });

  it('monta a planilha a partir da tabela da IA, com cabeçalho na linha 1', () => {
    const s = sheetFromTable('Vendas', ['Produto', 'Qtd'], [
      ['Café', 3],
      ['Pão', 10],
    ]);
    expect(s.cells).toEqual({ A1: 'Produto', B1: 'Qtd', A2: 'Café', B2: '3', A3: 'Pão', B3: '10' });
    expect(s.title).toBe('Vendas');
  });

  it('respeita os limites de linhas e colunas ao montar a tabela', () => {
    const headers = Array.from({ length: SHEET_MAX_COLS + 5 }, (_, i) => `H${i}`);
    const rows = Array.from({ length: SHEET_MAX_ROWS + 50 }, () => headers.map(() => 'x'));
    const s = sheetFromTable('Grande', headers, rows);
    const { rows: r, cols: c } = usedBounds(s.cells);
    expect(c).toBe(SHEET_MAX_COLS);
    expect(r).toBe(SHEET_MAX_ROWS);
  });

  it('exporta CSV com valores calculados e escapa aspas, vírgulas e quebras', () => {
    const csv = sheetToCsv({ A1: 'Nome', B1: 'Obs', A2: 'Ana, Lima', B2: 'disse "oi"', A3: '2', B3: '=A3*3' });
    expect(csv).toBe('Nome,Obs\r\n"Ana, Lima","disse ""oi"""\r\n2,6');
  });

  it('displayMatrix devolve a área retangular inteira', () => {
    expect(displayMatrix({ A1: 'a', B2: 'b' })).toEqual([
      ['a', ''],
      ['', 'b'],
    ]);
  });

  it('exporta XLSX que pode ser lido de volta com os números preservados', () => {
    const sheet = sheetFromTable('Totais', ['Item', 'Valor'], [['A', 2], ['B', 5]]);
    const withTotal = setCell(sheet, 'B4', '=SUM(B2:B3)');
    const bytes = sheetToXlsx(withTotal);
    const wb = XLSX.read(bytes, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(wb.SheetNames[0]).toBe('Totais');
    expect(ws['B2'].v).toBe(2);
    expect(ws['B4'].v).toBe(7);
  });
});

describe('documento', () => {
  it('escapa HTML para não executar texto da IA', () => {
    expect(escapeHtml('<script>"x" & \'y\'</script>')).toBe(
      '&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;',
    );
  });

  it('agrupa itens de lista consecutivos em um único <ul>', () => {
    const doc = docFromAi('Plano', [
      { type: 'heading', text: 'Metas' },
      { type: 'bullet', text: 'Um' },
      { type: 'bullet', text: 'Dois' },
      { type: 'paragraph', text: 'Fim' },
    ]);
    const html = docToHtml(doc);
    expect(html).toContain('<h2>Metas</h2><ul><li>Um</li><li>Dois</li></ul><p>Fim</p>');
    expect(html.match(/<ul>/g)).toHaveLength(1);
    expect(html).toContain('<title>Plano</title>');
  });

  it('exporta Markdown e texto puro', () => {
    const doc = docFromAi('Título', [
      { type: 'heading', text: 'Seção' },
      { type: 'paragraph', text: 'Corpo' },
      { type: 'bullet', text: 'Item' },
    ]);
    expect(docToMarkdown(doc)).toBe('# Título\n\n## Seção\n\nCorpo\n\n- Item\n');
    expect(docToText(doc)).toBe('Título\n\nSeção\nCorpo\n• Item\n');
  });

  it('docFromAi descarta blocos vazios e limita a quantidade', () => {
    const many = Array.from({ length: DOC_MAX_BLOCKS + 20 }, (_, i) => ({ type: 'paragraph' as const, text: `p${i}` }));
    const doc = docFromAi('X', [{ type: 'paragraph', text: '   ' }, ...many]);
    expect(doc.blocks).toHaveLength(DOC_MAX_BLOCKS);
    expect(doc.blocks[0].text).toBe('p0');
  });

  it('documento vazio ainda tem um bloco editável', () => {
    expect(createEmptyDoc().blocks).toHaveLength(1);
    expect(docFromAi('X', []).blocks).toHaveLength(1);
  });

  it('conta palavras ignorando espaços extras', () => {
    const doc = docFromAi('T', [
      { type: 'paragraph', text: '  um   dois três ' },
      { type: 'bullet', text: 'quatro' },
    ]);
    expect(wordCount(doc)).toBe(4);
  });
});
