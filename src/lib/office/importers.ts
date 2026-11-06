// Importação de arquivos para o Vertal Office. Cada formato vira o modelo certo:
// documento (texto e Word/PDF), planilha (Excel/CSV) ou apresentação (PowerPoint).
// Formatos de texto que não têm estrutura própria entram como texto simples.
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { BlockType, DOC_MAX_BLOCKS, DocBlock, DocData, makeBlock } from './documentModel';
import { CellMap, columnLetters } from './formulas';
import { SHEET_MAX_COLS, SHEET_MAX_ROWS, SheetData, newId } from './sheetModel';
import { DECK_MAX_SLIDES, DeckData, SLIDE_MAX_BULLETS, makeSlide } from './slidesModel';

/** Chaves do rascunho local de cada aplicativo. */
export const OFFICE_KEYS = {
  doc: 'kubo-office-doc-v1',
  sheet: 'kubo-office-sheet-v1',
  deck: 'kubo-office-deck-v1',
} as const;

/** Mesmo limite de anexo do envio por e-mail. */
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;

const SHEET_EXT = new Set(['xlsx', 'xlsm', 'xls', 'xlsb', 'ods', 'csv', 'tsv']);
const DECK_EXT = new Set(['pptx']);
const WORD_EXT = new Set(['docx']);
const PDF_EXT = new Set(['pdf']);
const HTML_EXT = new Set(['html', 'htm']);
const MARKDOWN_EXT = new Set(['md', 'markdown']);

export type ImportResult =
  | { kind: 'doc'; doc: DocData; note: string }
  | { kind: 'sheet'; sheet: SheetData; note: string }
  | { kind: 'deck'; deck: DeckData; note: string };

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function titleOf(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').trim();
  return base || 'Documento importado';
}

/** Texto puro é aceito quando não tem bytes nulos e decodifica como UTF-8 válido. */
function looksLikeText(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 8192);
  if (head.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function makeDoc(title: string, blocks: DocBlock[]): DocData {
  const kept = blocks.filter((b) => b.text.trim() !== '').slice(0, DOC_MAX_BLOCKS);
  return { id: newId(), title, blocks: kept.length ? kept : [makeBlock()], updatedAt: new Date().toISOString() };
}

/** Texto (Markdown ou simples) em blocos: "#" vira título, "-" ou "*" vira item de lista. */
function textToBlocks(text: string, markdown: boolean): DocBlock[] {
  const blocks: DocBlock[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let type: BlockType = 'paragraph';
    let content = line;
    if (markdown) {
      const h = /^#{1,6}\s+(.*)$/.exec(line);
      const li = /^[-*+]\s+(.*)$/.exec(line);
      if (h) {
        type = 'heading';
        content = h[1];
      } else if (li) {
        type = 'bullet';
        content = li[1];
      }
    }
    blocks.push(makeBlock(type, content));
  }
  return blocks;
}

function htmlToBlocks(html: string): DocBlock[] {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const blocks: DocBlock[] = [];
  dom.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li').forEach((el) => {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const tag = el.tagName.toLowerCase();
    const type: BlockType = tag.startsWith('h') ? 'heading' : tag === 'li' ? 'bullet' : 'paragraph';
    blocks.push(makeBlock(type, text));
  });
  if (blocks.length === 0) {
    const fallback = (dom.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (fallback) blocks.push(makeBlock('paragraph', fallback));
  }
  return blocks;
}

async function docxToDoc(name: string, bytes: ArrayBuffer): Promise<DocData> {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('Este .docx não tem conteúdo de texto legível.');
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  let title = '';
  const blocks: DocBlock[] = [];
  for (const p of Array.from(dom.getElementsByTagName('w:p'))) {
    const text = Array.from(p.getElementsByTagName('w:t'))
      .map((t) => t.textContent ?? '')
      .join('')
      .trim();
    if (!text) continue;
    const style = p.getElementsByTagName('w:pStyle')[0]?.getAttribute('w:val') ?? '';
    if (/^Title$/i.test(style) && !title) {
      title = text;
      continue;
    }
    const numbered = p.getElementsByTagName('w:numPr').length > 0;
    if (/^(Heading|Title)/i.test(style)) blocks.push(makeBlock('heading', text));
    else if (numbered || text.startsWith('• ')) blocks.push(makeBlock('bullet', text.replace(/^•\s*/, '')));
    else blocks.push(makeBlock('paragraph', text));
  }
  return makeDoc(title || titleOf(name), blocks);
}

async function pdfToDoc(name: string, bytes: ArrayBuffer): Promise<DocData> {
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const blocks: DocBlock[] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : ''))
      .join('');
    blocks.push(...textToBlocks(text, false));
  }
  return makeDoc(titleOf(name), blocks);
}

function sheetFromRows(title: string, rows: unknown[][]): SheetData {
  const cells: CellMap = {};
  rows.slice(0, SHEET_MAX_ROWS).forEach((row, r) => {
    row.slice(0, SHEET_MAX_COLS).forEach((value, c) => {
      const raw = value === null || value === undefined ? '' : String(value);
      if (raw.trim() !== '') cells[`${columnLetters(c)}${r + 1}`] = raw;
    });
  });
  return { id: newId(), title, cells, updatedAt: new Date().toISOString() };
}

function workbookToSheet(name: string, data: string | ArrayBuffer, type: 'array' | 'string'): SheetData {
  const wb = XLSX.read(data, { type });
  const first = wb.SheetNames[0];
  if (!first) throw new Error('A planilha não tem nenhuma aba com dados.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[first], { header: 1, defval: '', raw: false });
  return sheetFromRows(titleOf(name), rows);
}

async function pptxToDeck(name: string, bytes: ArrayBuffer): Promise<DeckData> {
  const zip = await JSZip.loadAsync(bytes);
  const slideFiles = Object.keys(zip.files)
    .map((f) => ({ f, n: Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(f)?.[1]) }))
    .filter((x) => Number.isFinite(x.n) && x.n > 0)
    .sort((a, b) => a.n - b.n);
  if (slideFiles.length === 0) throw new Error('Este .pptx não tem slides legíveis.');
  const slides = [];
  for (const { f } of slideFiles.slice(0, DECK_MAX_SLIDES)) {
    const xml = await zip.file(f)?.async('string');
    if (!xml) continue;
    const dom = new DOMParser().parseFromString(xml, 'application/xml');
    const paragraphs = Array.from(dom.getElementsByTagName('a:p'))
      .map((p) =>
        Array.from(p.getElementsByTagName('a:t'))
          .map((t) => t.textContent ?? '')
          .join('')
          .trim(),
      )
      .filter(Boolean);
    const [title = 'Slide sem título', ...bullets] = paragraphs;
    slides.push(makeSlide(title, bullets.slice(0, SLIDE_MAX_BULLETS)));
  }
  return { title: titleOf(name), slides: slides.length ? slides : [makeSlide('Slide importado')], updatedAt: new Date().toISOString() };
}

/** Converte um arquivo já lido em memória. Lança erro com mensagem para o usuário. */
export async function importBytes(name: string, bytes: ArrayBuffer): Promise<ImportResult> {
  if (bytes.byteLength > IMPORT_MAX_BYTES) throw new Error('Arquivo maior que 10 MB. Divida o conteúdo e tente de novo.');
  const ext = extOf(name);
  const u8 = new Uint8Array(bytes);

  if (SHEET_EXT.has(ext)) {
    const isText = ext === 'csv' || ext === 'tsv';
    const data: string | ArrayBuffer = isText ? new TextDecoder().decode(bytes) : bytes;
    const sheet = workbookToSheet(name, data, isText ? 'string' : 'array');
    return { kind: 'sheet', sheet, note: `${Object.keys(sheet.cells).length} células importadas de ${name}.` };
  }
  if (DECK_EXT.has(ext)) {
    const deck = await pptxToDeck(name, bytes);
    return { kind: 'deck', deck, note: `${deck.slides.length} slides importados de ${name}.` };
  }
  if (WORD_EXT.has(ext)) {
    const doc = await docxToDoc(name, bytes);
    return { kind: 'doc', doc, note: `Documento importado de ${name}.` };
  }
  if (PDF_EXT.has(ext)) {
    const doc = await pdfToDoc(name, bytes);
    return { kind: 'doc', doc, note: `Texto extraído de ${name}. Confira a formatação, que o PDF não guarda da mesma forma.` };
  }
  if (HTML_EXT.has(ext)) {
    const doc = makeDoc(titleOf(name), htmlToBlocks(new TextDecoder().decode(bytes)));
    return { kind: 'doc', doc, note: `Documento importado de ${name}.` };
  }
  if (MARKDOWN_EXT.has(ext)) {
    const doc = makeDoc(titleOf(name), textToBlocks(new TextDecoder().decode(bytes), true));
    return { kind: 'doc', doc, note: `Documento importado de ${name}.` };
  }
  // Demais formatos de texto (TXT, JSON, XML, código, logs etc.) entram como texto simples.
  if (looksLikeText(u8)) {
    const doc = makeDoc(titleOf(name), textToBlocks(new TextDecoder().decode(bytes), false));
    return { kind: 'doc', doc, note: `Texto importado de ${name}.` };
  }
  throw new Error(
    `Não consigo abrir "${name}" ainda. Formatos com estrutura: Word (.docx), PDF, Excel (.xlsx, .xls, .ods, .csv), PowerPoint (.pptx), HTML e Markdown. Outros arquivos de texto entram como texto simples.`,
  );
}

/** Lê um File do navegador e converte. */
export async function importFile(file: File): Promise<ImportResult> {
  if (file.size > IMPORT_MAX_BYTES) throw new Error('Arquivo maior que 10 MB. Divida o conteúdo e tente de novo.');
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
    reader.readAsArrayBuffer(file);
  });
  return importBytes(file.name, bytes);
}
