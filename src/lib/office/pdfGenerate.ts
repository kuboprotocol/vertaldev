// Geração de PDF no Vertal Office: documento de texto, planilha e texto livre.
// Usa pdf-lib (a mesma biblioteca da edição), com fontes padrão e paginação automática.
import type { PDFDocument, PDFFont, PDFPage, RGB } from 'pdf-lib';
import type { BlockAlign, BlockSize, DocData } from './documentModel';
import { displayMatrix } from './sheetModel';
import type { CellAlign, SheetData } from './sheetModel';
import { columnLetters } from './formulas';
import { sanitizeForFont } from './pdfEdit';

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 64;
const FOOTER_SIZE = 8;
const INK: [number, number, number] = [0.12, 0.16, 0.23];

export interface PdfTextBlock {
  kind: 'title' | 'heading' | 'paragraph' | 'bullet';
  text: string;
  align?: BlockAlign;
  bold?: boolean;
  italic?: boolean;
  size?: BlockSize;
}

interface FontSet {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

type Rgb = (r: number, g: number, b: number) => RGB;

async function loadFonts(doc: PDFDocument): Promise<FontSet> {
  const { StandardFonts } = await import('pdf-lib');
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  };
}

function pickFont(fonts: FontSet, bold: boolean, italic: boolean): PDFFont {
  if (bold && italic) return fonts.boldItalic;
  if (bold) return fonts.bold;
  if (italic) return fonts.italic;
  return fonts.regular;
}

/** Quebra o texto em linhas que cabem na largura. Palavras muito longas são cortadas. */
export function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Palavra maior que a linha: corta por caractere.
      let chunk = '';
      for (const ch of word) {
        if (chunk && font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Escritor de páginas: controla o cursor vertical e abre página nova quando falta espaço. */
class PageWriter {
  readonly pages: PDFPage[] = [];
  page!: PDFPage;
  /** Posição vertical atual (a partir do pé da página). */
  y = 0;

  constructor(
    private readonly doc: PDFDocument,
    readonly fonts: FontSet,
    readonly rgb: Rgb,
    readonly width = A4[0],
    readonly height = A4[1],
    readonly margin = MARGIN,
  ) {
    this.newPage();
  }

  get contentWidth(): number {
    return this.width - this.margin * 2;
  }

  newPage(): void {
    this.page = this.doc.addPage([this.width, this.height]);
    this.pages.push(this.page);
    this.y = this.height - this.margin;
  }

  ensure(height: number): void {
    if (this.y - height < this.margin) this.newPage();
  }

  gap(height: number): void {
    this.y -= height;
  }

  /** Uma linha já quebrada, no alinhamento pedido, dentro da coluna [x0, x0 + maxWidth]. */
  line(
    text: string,
    font: PDFFont,
    size: number,
    align: BlockAlign = 'left',
    x0 = this.margin,
    maxWidth = this.contentWidth,
  ): void {
    const lineHeight = size * 1.4;
    this.ensure(lineHeight);
    const safe = sanitizeForFont(text, font);
    const w = font.widthOfTextAtSize(safe, size);
    const x = align === 'center' ? x0 + (maxWidth - w) / 2 : align === 'right' ? x0 + maxWidth - w : x0;
    this.y -= size;
    this.page.drawText(safe, { x, y: this.y, size, font, color: this.rgb(...INK) });
    this.y -= lineHeight - size;
  }

  /** Parágrafo com quebra automática de linha. */
  paragraph(text: string, font: PDFFont, size: number, align: BlockAlign = 'left', x0 = this.margin, maxWidth = this.contentWidth): void {
    for (const l of wrapLines(text, font, size, maxWidth)) this.line(l, font, size, align, x0, maxWidth);
  }

  /** Rodapé "Página X de Y" em todas as páginas, depois do layout pronto. */
  footers(): void {
    const total = this.pages.length;
    this.pages.forEach((p, i) => {
      const label = `Página ${i + 1} de ${total}`;
      const w = this.fonts.regular.widthOfTextAtSize(label, FOOTER_SIZE);
      p.drawText(label, {
        x: (this.width - w) / 2,
        y: this.margin / 2,
        size: FOOTER_SIZE,
        font: this.fonts.regular,
        color: this.rgb(0.45, 0.5, 0.56),
      });
    });
  }
}

async function newDocument(title: string) {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(title || 'Documento');
  doc.setCreator('Vertal Office');
  doc.setProducer('Vertal Office');
  return { doc, rgb };
}

/** Monta um PDF a partir de blocos de texto: título, títulos, parágrafos e itens de lista. */
export async function blocksToPdf(title: string, blocks: PdfTextBlock[]): Promise<Uint8Array> {
  const { doc, rgb } = await newDocument(title);
  const fonts = await loadFonts(doc);
  const writer = new PageWriter(doc, fonts, rgb);
  const sizeOf = (base: number, s: BlockSize | undefined) => (s === 'sm' ? base * 0.85 : s === 'lg' ? base * 1.25 : base);

  if (title.trim()) {
    writer.paragraph(title.trim(), fonts.bold, 22);
    writer.gap(10);
  }
  for (const b of blocks) {
    const text = b.text.trim();
    if (!text) continue;
    if (b.kind === 'title') {
      writer.paragraph(text, fonts.bold, 22, b.align ?? 'left');
      writer.gap(10);
    } else if (b.kind === 'heading') {
      writer.gap(8);
      writer.paragraph(text, fonts.bold, sizeOf(15, b.size), b.align ?? 'left');
      writer.gap(4);
    } else if (b.kind === 'bullet') {
      const size = sizeOf(11, b.size);
      const font = pickFont(fonts, !!b.bold, !!b.italic);
      const indent = 16;
      const lines = wrapLines(text, font, size, writer.contentWidth - indent);
      lines.forEach((l, i) => {
        if (i === 0) {
          writer.ensure(size * 1.4);
          writer.page.drawText('•', { x: writer.margin + 2, y: writer.y - size, size, font: fonts.regular, color: rgb(...INK) });
        }
        writer.line(l, font, size, 'left', writer.margin + indent, writer.contentWidth - indent);
      });
      writer.gap(3);
    } else {
      const size = sizeOf(11, b.size);
      writer.paragraph(text, pickFont(fonts, !!b.bold, !!b.italic), size, b.align ?? 'left');
      writer.gap(6);
    }
  }
  writer.footers();
  return doc.save();
}

/** Documento do Vertal Office em PDF (A4, margens de 2,25 cm, paginação e número de página). */
export function docToPdf(doc: DocData): Promise<Uint8Array> {
  const blocks: PdfTextBlock[] = doc.blocks.map((b) => ({
    kind: b.type,
    text: b.text,
    align: b.format?.align,
    bold: b.format?.bold,
    italic: b.format?.italic,
    size: b.format?.size,
  }));
  return blocksToPdf(doc.title || 'Documento sem título', blocks);
}

/** Texto livre (ex.: colado pelo usuário) em PDF. Linhas em branco separam parágrafos. */
export function textToPdf(title: string, text: string): Promise<Uint8Array> {
  const paragraphs: PdfTextBlock[] = text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => ({ kind: 'paragraph' as const, text: p.replace(/\n/g, ' ') }))
    .filter((p) => p.text.trim() !== '');
  return blocksToPdf(title, paragraphs);
}

/**
 * Planilha em PDF, em paisagem: tabela com grade, primeira linha em negrito e a formatação
 * das células (negrito, alinhamento e cor de fundo) quando existir.
 */
export async function sheetToPdf(sheet: SheetData): Promise<Uint8Array> {
  const { doc, rgb } = await newDocument(sheet.title || 'Planilha');
  const fonts = await loadFonts(doc);
  const { regular, bold } = fonts;
  const writer = new PageWriter(doc, fonts, rgb, 841.89, 595.28);
  const size = 9;
  const rowH = 18;
  const matrix = displayMatrix(sheet.cells);
  const cols = matrix.reduce((n, r) => Math.max(n, r.length), 0);

  if (cols === 0) {
    writer.paragraph('Planilha vazia.', regular, 11);
    writer.footers();
    return doc.save();
  }

  // Largura natural de cada coluna (maior conteúdo, limitado) e reescala para caber na página.
  const natural = Array.from({ length: cols }, (_, c) => {
    let max = 40;
    for (const row of matrix) {
      max = Math.max(max, bold.widthOfTextAtSize(sanitizeForFont(row[c] ?? '', bold), size) + 14);
    }
    return Math.min(max, 220);
  });
  const total = natural.reduce((a, b) => a + b, 0);
  const scale = total > writer.contentWidth ? writer.contentWidth / total : 1;
  const widths = natural.map((w) => w * scale);
  const alignOf = (a: CellAlign | undefined): BlockAlign => a ?? 'left';

  matrix.forEach((row, r) => {
    writer.ensure(rowH);
    const bottom = writer.y - rowH;
    let x = writer.margin;
    for (let c = 0; c < cols; c += 1) {
      const w = widths[c];
      const ref = `${columnLetters(c)}${r + 1}`;
      const style = sheet.styles?.[ref];
      if (style?.fill) {
        const n = parseInt(style.fill.replace('#', ''), 16);
        writer.page.drawRectangle({
          x,
          y: bottom,
          width: w,
          height: rowH,
          color: rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255),
        });
      }
      writer.page.drawRectangle({ x, y: bottom, width: w, height: rowH, borderColor: rgb(0.75, 0.78, 0.82), borderWidth: 0.5 });

      const font = style?.bold || r === 0 ? bold : regular;
      let shown = sanitizeForFont(row[c] ?? '', font);
      while (shown && font.widthOfTextAtSize(shown, size) > w - 10) shown = shown.slice(0, -1);
      const tw = font.widthOfTextAtSize(shown, size);
      const align = alignOf(style?.align);
      const tx = align === 'center' ? x + (w - tw) / 2 : align === 'right' ? x + w - tw - 5 : x + 5;
      if (shown) writer.page.drawText(shown, { x: tx, y: bottom + 6, size, font, color: rgb(...INK) });
      x += w;
    }
    writer.y = bottom;
  });
  writer.footers();
  return doc.save();
}

/** Página A4 em branco, para começar um PDF do zero. */
export async function blankPdf(): Promise<Uint8Array> {
  const { doc } = await newDocument('PDF em branco');
  doc.addPage(A4);
  return doc.save();
}
