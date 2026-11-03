// Modelo da planilha do Pacote Office: edição imutável, exportação CSV e XLSX.
import * as XLSX from 'xlsx';
import { CellMap, columnLetters, evaluateAll, parseRef, toRef } from './formulas';

export const SHEET_MAX_ROWS = 200;
export const SHEET_MAX_COLS = 26;

export interface SheetData {
  id: string;
  title: string;
  cells: CellMap;
  updatedAt: string;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptySheet(title = 'Planilha sem título'): SheetData {
  return { id: newId(), title, cells: {}, updatedAt: new Date().toISOString() };
}

/** Grava o conteúdo bruto de uma célula. Texto vazio remove a célula. Não muda o objeto original. */
export function setCell(sheet: SheetData, ref: string, raw: string): SheetData {
  const parsed = parseRef(ref);
  if (!parsed || parsed.row > SHEET_MAX_ROWS || parsed.col >= SHEET_MAX_COLS) return sheet;
  const key = toRef(parsed.col, parsed.row);
  const cells = { ...sheet.cells };
  if (raw === '') delete cells[key];
  else cells[key] = raw;
  return { ...sheet, cells, updatedAt: new Date().toISOString() };
}

/** Área ocupada: maior linha e maior coluna com conteúdo (0 quando vazia). */
export function usedBounds(cells: CellMap): { rows: number; cols: number } {
  let rows = 0;
  let cols = 0;
  for (const key of Object.keys(cells)) {
    const p = parseRef(key);
    if (!p) continue;
    rows = Math.max(rows, p.row);
    cols = Math.max(cols, p.col + 1);
  }
  return { rows, cols };
}

/**
 * Converte a tabela devolvida pela IA em uma planilha nova. Cabeçalhos vão na
 * linha 1; dados começam na linha 2. Respeita os limites da grade.
 */
export function sheetFromTable(
  title: string,
  headers: string[],
  rows: Array<Array<string | number>>,
): SheetData {
  // Uma passada só: montar o mapa de uma vez (setCell copia o mapa a cada chamada).
  const cells: CellMap = {};
  headers.slice(0, SHEET_MAX_COLS).forEach((h, c) => {
    if (h.trim() !== '') cells[`${columnLetters(c)}1`] = h;
  });
  rows.slice(0, SHEET_MAX_ROWS - 1).forEach((row, r) => {
    row.slice(0, SHEET_MAX_COLS).forEach((value, c) => {
      const raw = String(value);
      if (raw.trim() !== '') cells[`${columnLetters(c)}${r + 2}`] = raw;
    });
  });
  return { ...createEmptySheet(title), cells };
}

/** Matriz com os valores exibidos (fórmulas já calculadas), da célula A1 até a última usada. */
export function displayMatrix(cells: CellMap): string[][] {
  const { rows, cols } = usedBounds(cells);
  const values = evaluateAll(cells);
  const matrix: string[][] = [];
  for (let r = 1; r <= rows; r++) {
    const line: string[] = [];
    for (let c = 0; c < cols; c++) line.push(values[toRef(c, r)] ?? '');
    matrix.push(line);
  }
  return matrix;
}

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV com os valores exibidos. Separador de vírgula e quebra de linha CRLF (abre bem no Excel). */
export function sheetToCsv(cells: CellMap): string {
  return displayMatrix(cells)
    .map((line) => line.map(csvEscape).join(','))
    .join('\r\n');
}

/** Bytes de um arquivo .xlsx com os valores exibidos. Números continuam números. */
export function sheetToXlsx(sheet: SheetData): ArrayBuffer {
  const matrix = displayMatrix(sheet.cells).map((line) =>
    line.map((v) => (v !== '' && Number.isFinite(Number(v)) && v.trim() !== '' ? Number(v) : v)),
  );
  const ws = XLSX.utils.aoa_to_sheet(matrix);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (sheet.title || 'Planilha').slice(0, 31));
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}
