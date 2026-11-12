// Modelo da galeria do Vertal Office: tipos salvos, resumos para os cartões, filtro e ordenação.
// Sem rede e sem React: tudo aqui é testável isoladamente.
import type { DocData } from './documentModel';
import type { DeckData } from './slidesModel';
import type { SheetData } from './sheetModel';

/** 'file' é um arquivo enviado (qualquer tipo, sem edição): só abre por download. */
export type OfficeKind = 'doc' | 'sheet' | 'slides' | 'pdf' | 'file';

export const OFFICE_KINDS: OfficeKind[] = ['doc', 'sheet', 'slides', 'pdf', 'file'];

/** Tipos que podem ser criados do zero no botão "Criar novo". */
export const CREATABLE_KINDS: OfficeKind[] = ['doc', 'sheet', 'slides', 'pdf'];

export const KIND_META: Record<OfficeKind, { label: string; singular: string; accent: string; glow: string }> = {
  doc: { label: 'Documentos', singular: 'Documento', accent: 'text-sky-300', glow: 'from-sky-500/40 to-indigo-500/20' },
  sheet: { label: 'Planilhas', singular: 'Planilha', accent: 'text-emerald-300', glow: 'from-emerald-500/40 to-teal-500/20' },
  slides: { label: 'Apresentações', singular: 'Apresentação', accent: 'text-amber-300', glow: 'from-amber-500/40 to-orange-500/20' },
  pdf: { label: 'PDFs', singular: 'PDF', accent: 'text-rose-300', glow: 'from-rose-500/40 to-red-500/20' },
  file: { label: 'Arquivos', singular: 'Arquivo', accent: 'text-violet-300', glow: 'from-violet-500/40 to-fuchsia-500/20' },
};

/** Item da lista da galeria (sem o conteúdo completo, para carregar rápido). */
export interface OfficeItem {
  id: string;
  kind: OfficeKind;
  title: string;
  excerpt: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export type GallerySort = 'recent' | 'name' | 'oldest';

export const EXCERPT_MAX = 300;

function clip(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > EXCERPT_MAX ? `${clean.slice(0, EXCERPT_MAX - 1)}…` : clean;
}

/** Trecho do documento para o cartão: primeiros blocos de texto. */
export function docExcerpt(doc: DocData): string {
  return clip(doc.blocks.map((b) => b.text).join(' '));
}

/** Trecho da planilha: valores da primeira linha e das seguintes, em ordem. */
export function sheetExcerpt(sheet: SheetData): string {
  return clip(
    Object.entries(sheet.cells)
      .filter(([, v]) => !v.startsWith('='))
      .slice(0, 40)
      .map(([, v]) => v)
      .join(' · '),
  );
}

/** Trecho da apresentação: títulos dos slides. */
export function deckExcerpt(deck: DeckData): string {
  return clip(deck.slides.map((s) => s.title).join(' · '));
}

/** Nome de arquivo seguro para o download. */
export function safeTitle(title: string): string {
  return (title || 'arquivo').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'arquivo';
}

export function filterAndSortItems(
  items: OfficeItem[],
  opts: { query: string; kind: OfficeKind | 'all'; sort: GallerySort },
): OfficeItem[] {
  const q = opts.query.trim().toLocaleLowerCase('pt-BR');
  const filtered = items.filter(
    (it) =>
      (opts.kind === 'all' || it.kind === opts.kind) &&
      (q === '' || it.title.toLocaleLowerCase('pt-BR').includes(q) || it.excerpt.toLocaleLowerCase('pt-BR').includes(q)),
  );
  const sorted = [...filtered];
  if (opts.sort === 'name') sorted.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  else if (opts.sort === 'oldest') sorted.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  else sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return sorted;
}

export function countByKind(items: OfficeItem[]): Record<OfficeKind, number> {
  const out: Record<OfficeKind, number> = { doc: 0, sheet: 0, slides: 0, pdf: 0, file: 0 };
  for (const it of items) out[it.kind] += 1;
  return out;
}

/** "08 nov 2026, 14:05" em português. */
export function formatItemDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Título e trecho de um rascunho de documento, planilha ou apresentação (para salvar na galeria). */
export function describeDraft(
  kind: Exclude<OfficeKind, 'pdf' | 'file'>,
  data: DocData | SheetData | DeckData,
): { title: string; excerpt: string } {
  if (kind === 'doc') {
    const d = data as DocData;
    return { title: d.title || 'Documento sem título', excerpt: docExcerpt(d) };
  }
  if (kind === 'sheet') {
    const s = data as SheetData;
    return { title: s.title || 'Planilha sem título', excerpt: sheetExcerpt(s) };
  }
  const d = data as DeckData;
  return { title: d.title || 'Apresentação sem título', excerpt: deckExcerpt(d) };
}
