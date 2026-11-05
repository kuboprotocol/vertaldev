// Modelo do documento do Vertal Office: blocos (título, parágrafo, item de lista)
// com formatação opcional, e exportação em HTML, Markdown e texto puro.
import { newId } from './sheetModel';

export type BlockType = 'heading' | 'paragraph' | 'bullet';
export type BlockAlign = 'left' | 'center' | 'right';
export type BlockSize = 'sm' | 'md' | 'lg';

/** Formatação opcional do bloco. Ausente = padrão. Dados antigos continuam válidos. */
export interface BlockFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: BlockAlign;
  size?: BlockSize;
}

export interface DocBlock {
  id: string;
  type: BlockType;
  text: string;
  format?: BlockFormat;
}

export interface DocData {
  id: string;
  title: string;
  blocks: DocBlock[];
  updatedAt: string;
}

export const DOC_MAX_BLOCKS = 300;

export function createEmptyDoc(title = 'Documento sem título'): DocData {
  return {
    id: newId(),
    title,
    blocks: [{ id: newId(), type: 'paragraph', text: '' }],
    updatedAt: new Date().toISOString(),
  };
}

export function makeBlock(type: BlockType = 'paragraph', text = ''): DocBlock {
  return { id: newId(), type, text };
}

/** Documento novo a partir da resposta da IA. Blocos vazios são descartados. */
export function docFromAi(
  title: string,
  blocks: Array<{ type: BlockType; text: string }>,
): DocData {
  const kept = blocks
    .filter((b) => b.text.trim() !== '')
    .slice(0, DOC_MAX_BLOCKS)
    .map((b) => makeBlock(b.type, b.text));
  return {
    id: newId(),
    title,
    blocks: kept.length ? kept : [makeBlock()],
    updatedAt: new Date().toISOString(),
  };
}

/** Aplica uma mudança de formatação a um bloco. Não muda o objeto original. */
export function formatBlock(doc: DocData, id: string, patch: BlockFormat): DocData {
  return {
    ...doc,
    blocks: doc.blocks.map((b) => (b.id === id ? { ...b, format: { ...b.format, ...patch } } : b)),
  };
}

/** Troca o estilo do bloco (título, parágrafo ou item). */
export function setBlockType(doc: DocData, id: string, type: BlockType): DocData {
  return { ...doc, blocks: doc.blocks.map((b) => (b.id === id ? { ...b, type } : b)) };
}

/** Insere um bloco logo depois do bloco indicado (ou no fim, se não houver). */
export function insertBlockAfter(doc: DocData, afterId: string | null, type: BlockType): DocData {
  if (doc.blocks.length >= DOC_MAX_BLOCKS) return doc;
  const created = makeBlock(type);
  const index = afterId ? doc.blocks.findIndex((b) => b.id === afterId) : -1;
  const blocks = index >= 0 ? [...doc.blocks.slice(0, index + 1), created, ...doc.blocks.slice(index + 1)] : [...doc.blocks, created];
  return { ...doc, blocks };
}

/** Remove um bloco. Documento nunca fica sem nenhum bloco. */
export function removeBlockById(doc: DocData, id: string): DocData {
  const blocks = doc.blocks.filter((b) => b.id !== id);
  return { ...doc, blocks: blocks.length ? blocks : [makeBlock()] };
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SIZE_PX: Record<BlockSize, string> = { sm: '13px', md: '16px', lg: '20px' };

/** Estilo CSS equivalente à formatação do bloco (usado no HTML exportado). */
export function blockCss(format: BlockFormat | undefined): string {
  if (!format) return '';
  const css: string[] = [];
  if (format.bold) css.push('font-weight:700');
  if (format.italic) css.push('font-style:italic');
  if (format.underline) css.push('text-decoration:underline');
  if (format.align && format.align !== 'left') css.push(`text-align:${format.align}`);
  if (format.size && format.size !== 'md') css.push(`font-size:${SIZE_PX[format.size]}`);
  return css.join(';');
}

/** HTML autônomo. Abre no navegador e no Word. Listas consecutivas viram um único <ul>. */
export function docToHtml(doc: DocData): string {
  const parts: string[] = [];
  let inList = false;
  for (const b of doc.blocks) {
    const css = blockCss(b.format);
    const style = css ? ` style="${css}"` : '';
    if (b.type === 'bullet') {
      if (!inList) {
        parts.push('<ul>');
        inList = true;
      }
      parts.push(`<li${style}>${escapeHtml(b.text)}</li>`);
      continue;
    }
    if (inList) {
      parts.push('</ul>');
      inList = false;
    }
    if (b.type === 'heading') parts.push(`<h2${style}>${escapeHtml(b.text)}</h2>`);
    else parts.push(`<p${style}>${escapeHtml(b.text)}</p>`);
  }
  if (inList) parts.push('</ul>');
  const title = escapeHtml(doc.title);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${parts.join('')}</body></html>`;
}

export function docToMarkdown(doc: DocData): string {
  const lines: string[] = [`# ${doc.title}`, ''];
  for (const b of doc.blocks) {
    const text = mdEmphasis(b.text, b.format);
    if (b.type === 'heading') lines.push(`## ${text}`, '');
    else if (b.type === 'bullet') lines.push(`- ${text}`);
    else lines.push(text, '');
  }
  return lines.join('\n').trimEnd() + '\n';
}

function mdEmphasis(text: string, format: BlockFormat | undefined): string {
  if (!format || !text) return text;
  let out = text;
  if (format.italic) out = `*${out}*`;
  if (format.bold) out = `**${out}**`;
  return out;
}

export function docToText(doc: DocData): string {
  return [doc.title, '', ...doc.blocks.map((b) => (b.type === 'bullet' ? `• ${b.text}` : b.text))]
    .join('\n')
    .trimEnd() + '\n';
}

export function wordCount(doc: DocData): number {
  return doc.blocks
    .map((b) => b.text.trim())
    .filter(Boolean)
    .reduce((n, t) => n + t.split(/\s+/).length, 0);
}
