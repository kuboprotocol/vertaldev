// Edição de PDF existente no Vertal Office. Cada ação grava o PDF na hora (pdf-lib),
// então o que aparece na tela é sempre o que será baixado. Desfazer = voltar aos bytes anteriores.
//
// Sistema de coordenadas: a tela mostra a página já girada (/Rotate). Os cliques guardam posições
// normalizadas (0..1, origem no canto superior esquerdo DA TELA). Aqui elas são convertidas para o
// espaço do PDF, para o texto e as caixas ficarem certos em qualquer rotação.
import type { PDFDocument as PdfDocumentType, PDFFont, PDFPage } from 'pdf-lib';

export const PDF_MAX_BYTES = 10 * 1024 * 1024;
/** Limite de páginas para gerar miniaturas. Acima disso a tela mostra só a página atual. */
export const PDF_THUMB_LIMIT = 200;

export type Rotation = 0 | 90 | 180 | 270;

/** Ponto (x, y) em 0..1, origem no canto superior esquerdo da página visível. */
export interface VisualPoint {
  x: number;
  y: number;
}

/** Retângulo em 0..1 na página visível. */
export interface VisualRect extends VisualPoint {
  w: number;
  h: number;
}

/** Normaliza o ângulo de /Rotate para 0, 90, 180 ou 270. */
export function normalizeRotation(angle: number): Rotation {
  const a = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return a as Rotation;
}

/**
 * Converte um ponto da tela (já girada no sentido horário por `rotation`) para o espaço do PDF,
 * em frações (0..1) da caixa da página (origem embaixo à esquerda).
 */
export function visualToUnit(p: VisualPoint, rotation: Rotation): { u: number; v: number } {
  switch (rotation) {
    case 0:
      return { u: p.x, v: 1 - p.y };
    case 90:
      return { u: p.y, v: p.x };
    case 180:
      return { u: 1 - p.x, v: p.y };
    case 270:
      return { u: 1 - p.y, v: 1 - p.x };
  }
}

/** Largura e altura da página como a tela mostra (trocadas em 90° e 270°). */
export function visualSize(width: number, height: number, rotation: Rotation): { width: number; height: number } {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

export interface PdfTextOp {
  kind: 'text';
  page: number;
  /** Ponto da linha de base, onde o texto começa (tela). */
  at: VisualPoint;
  text: string;
  /** Tamanho da fonte em pontos. */
  size: number;
  /** Cor hexadecimal, ex.: #1e293b. */
  color: string;
}

export interface PdfRectOp {
  kind: 'highlight' | 'cover';
  page: number;
  rect: VisualRect;
  color: string;
}

export type PdfOp = PdfTextOp | PdfRectOp;

export function hexToRgbUnit(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Retângulo visual → caixa no espaço do PDF (x, y, largura, altura). */
export function visualRectToBox(
  rect: VisualRect,
  rotation: Rotation,
  crop: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const a = visualToUnit({ x: rect.x, y: rect.y }, rotation);
  const b = visualToUnit({ x: rect.x + rect.w, y: rect.y + rect.h }, rotation);
  const u0 = Math.min(a.u, b.u);
  const u1 = Math.max(a.u, b.u);
  const v0 = Math.min(a.v, b.v);
  const v1 = Math.max(a.v, b.v);
  return {
    x: crop.x + u0 * crop.width,
    y: crop.y + v0 * crop.height,
    width: (u1 - u0) * crop.width,
    height: (v1 - v0) * crop.height,
  };
}

/** Ponto visual → coordenada do PDF. */
export function visualPointToPdf(
  p: VisualPoint,
  rotation: Rotation,
  crop: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  const { u, v } = visualToUnit(p, rotation);
  return { x: crop.x + u * crop.width, y: crop.y + v * crop.height };
}

/** Carrega um PDF. Erros viram mensagens para o usuário. */
export async function loadPdf(bytes: Uint8Array): Promise<PdfDocumentType> {
  const { PDFDocument } = await import('pdf-lib');
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    throw new Error('Não consegui abrir este PDF. Ele pode estar corrompido ou protegido por senha.');
  }
}

/** Confere se os bytes são um PDF de verdade e se têm páginas. */
export async function inspectPdf(bytes: Uint8Array): Promise<{ pages: number }> {
  if (bytes.byteLength > PDF_MAX_BYTES) throw new Error('PDF maior que 10 MB. Divida o arquivo e tente de novo.');
  const head = new TextDecoder().decode(bytes.subarray(0, 8));
  if (!head.startsWith('%PDF')) throw new Error('Este arquivo não é um PDF.');
  const doc = await loadPdf(bytes);
  const pages = doc.getPageCount();
  if (pages === 0) throw new Error('Este PDF não tem páginas.');
  return { pages };
}

async function save(doc: PdfDocumentType): Promise<Uint8Array> {
  return doc.save();
}

function pageAt(doc: PdfDocumentType, index: number): PDFPage {
  const page = doc.getPages()[index];
  if (!page) throw new Error('Página não encontrada.');
  return page;
}

function cropOf(page: PDFPage) {
  const box = page.getCropBox();
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

/** Gira uma página em 90° (sentido horário). Retorna os novos bytes. */
export async function rotatePage(bytes: Uint8Array, index: number, delta: 90 | -90): Promise<Uint8Array> {
  const { degrees } = await import('pdf-lib');
  const doc = await loadPdf(bytes);
  const page = pageAt(doc, index);
  const next = normalizeRotation(page.getRotation().angle + delta);
  page.setRotation(degrees(next));
  return save(doc);
}

export async function deletePage(bytes: Uint8Array, index: number): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  if (doc.getPageCount() <= 1) throw new Error('O PDF precisa ter pelo menos uma página.');
  pageAt(doc, index);
  doc.removePage(index);
  return save(doc);
}

/** Insere página em branco logo depois de `afterIndex`, com o mesmo tamanho da página indicada. */
export async function addBlankPage(bytes: Uint8Array, afterIndex: number): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const ref = pageAt(doc, afterIndex);
  const { width, height } = ref.getCropBox();
  doc.insertPage(afterIndex + 1, [width, height]);
  return save(doc);
}

/** Anexa todas as páginas de outro PDF no fim deste. */
export async function appendPdf(bytes: Uint8Array, other: Uint8Array): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const source = await loadPdf(other);
  const copied = await doc.copyPages(source, source.getPageIndices());
  copied.forEach((p) => doc.addPage(p));
  return save(doc);
}

/** Aplica uma marcação (texto, destaque ou cobertura) na página indicada. */
export async function applyOp(bytes: Uint8Array, op: PdfOp): Promise<Uint8Array> {
  const { rgb, StandardFonts, degrees } = await import('pdf-lib');
  const doc = await loadPdf(bytes);
  const page = pageAt(doc, op.page);
  const rotation = normalizeRotation(page.getRotation().angle);
  const crop = cropOf(page);

  if (op.kind === 'text') {
    const text = op.text.replace(/[\r\n]+/g, ' ').trim();
    if (!text) throw new Error('Digite um texto para inserir.');
    const font: PDFFont = await doc.embedFont(StandardFonts.Helvetica);
    const clean = sanitizeForFont(text, font);
    const size = Math.min(72, Math.max(6, op.size));
    const origin = visualPointToPdf(op.at, rotation, crop);
    const [r, g, b] = hexToRgbUnit(op.color);
    // O texto fica reto na tela: a rotação da página é compensada com o mesmo ângulo.
    page.drawText(clean, { x: origin.x, y: origin.y, size, font, color: rgb(r, g, b), rotate: degrees(rotation) });
  } else {
    const box = visualRectToBox(op.rect, rotation, crop);
    if (box.width < 1 || box.height < 1) throw new Error('Arraste uma área maior.');
    const [r, g, b] = hexToRgbUnit(op.color);
    if (op.kind === 'highlight') {
      page.drawRectangle({ ...box, color: rgb(r, g, b), opacity: 0.35, borderWidth: 0 });
    } else {
      page.drawRectangle({ ...box, color: rgb(1, 1, 1), opacity: 1, borderWidth: 0 });
    }
  }
  return save(doc);
}

/**
 * A fonte padrão (Helvetica) só aceita o alfabeto latino com acentos (WinAnsi).
 * Outros caracteres viram "?" para o texto não quebrar a edição.
 */
export function sanitizeForFont(text: string, font: PDFFont): string {
  let out = '';
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += '?';
    }
  }
  return out;
}

/** Contagem de páginas e tamanho visível de cada uma, para a tela e para o rastreio de cliques. */
export async function pageInfo(bytes: Uint8Array): Promise<Array<{ width: number; height: number; rotation: Rotation }>> {
  const doc = await loadPdf(bytes);
  return doc.getPages().map((page) => {
    const rotation = normalizeRotation(page.getRotation().angle);
    const { width, height } = visualSize(page.getCropBox().width, page.getCropBox().height, rotation);
    return { width, height, rotation };
  });
}
