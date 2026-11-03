// Modelo do documento do Pacote Office: blocos simples (título, cabeçalho,
// parágrafo, item de lista) e exportação em HTML, Markdown e texto puro.
import { newId } from './sheetModel';

export type BlockType = 'heading' | 'paragraph' | 'bullet';

export interface DocBlock {
  id: string;
  type: BlockType;
  text: string;
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

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** HTML autônomo. Abre no navegador e no Word. Listas consecutivas viram um único <ul>. */
export function docToHtml(doc: DocData): string {
  const parts: string[] = [];
  let inList = false;
  for (const b of doc.blocks) {
    if (b.type === 'bullet') {
      if (!inList) {
        parts.push('<ul>');
        inList = true;
      }
      parts.push(`<li>${escapeHtml(b.text)}</li>`);
      continue;
    }
    if (inList) {
      parts.push('</ul>');
      inList = false;
    }
    if (b.type === 'heading') parts.push(`<h2>${escapeHtml(b.text)}</h2>`);
    else parts.push(`<p>${escapeHtml(b.text)}</p>`);
  }
  if (inList) parts.push('</ul>');
  const title = escapeHtml(doc.title);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${parts.join('')}</body></html>`;
}

export function docToMarkdown(doc: DocData): string {
  const lines: string[] = [`# ${doc.title}`, ''];
  for (const b of doc.blocks) {
    if (b.type === 'heading') lines.push(`## ${b.text}`, '');
    else if (b.type === 'bullet') lines.push(`- ${b.text}`);
    else lines.push(b.text, '');
  }
  return lines.join('\n').trimEnd() + '\n';
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
