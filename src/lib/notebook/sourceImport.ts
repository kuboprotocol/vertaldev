// Entrada de fontes no Vertal Notebook: arquivos (PDF, Word, Excel, PowerPoint,
// HTML, Markdown, texto), links (página lida pelo firecrawl-scrape) e texto colado.
import { supabase } from '@/integrations/supabase/client';
import { IMPORT_MAX_BYTES, importBytes } from '@/lib/office/importers';
import { sheetToCsv } from '@/lib/office/sheetModel';

/** Limite de texto guardado por fonte (o contexto da IA ainda é cortado no servidor). */
export const SOURCE_MAX_CHARS = 400_000;

export const FILE_ACCEPT = '.pdf,.docx,.pptx,.xlsx,.xls,.ods,.csv,.tsv,.md,.markdown,.txt,.html,.htm,.json,.xml,.rtf,.log';

export interface ImportedSource {
  title: string;
  content: string;
  note?: string;
}

function clip(text: string): string {
  const t = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return t.length > SOURCE_MAX_CHARS ? `${t.slice(0, SOURCE_MAX_CHARS)}\n\n[… conteúdo cortado em ${SOURCE_MAX_CHARS.toLocaleString('pt-BR')} caracteres]` : t;
}

function titleOf(name: string): string {
  return name.replace(/\.[^.]+$/, '').trim() || 'Arquivo';
}

async function readBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
    r.readAsArrayBuffer(file);
  });
}

/** PDF inteiro, página a página (o importador do Office limita a 300 blocos). */
async function pdfText(bytes: ArrayBuffer): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '')).join('');
    if (text.trim()) pages.push(`[Página ${i}]\n${text.trim()}`);
  }
  return { text: pages.join('\n\n'), pages: pdf.numPages };
}

export async function importSourceFile(file: File): Promise<ImportedSource> {
  if (file.size > IMPORT_MAX_BYTES) throw new Error('Arquivo maior que 10 MB. Divida o conteúdo e tente de novo.');
  const bytes = await readBytes(file);
  const title = titleOf(file.name);
  if (/\.pdf$/i.test(file.name)) {
    const { text, pages } = await pdfText(bytes);
    if (!text.trim()) throw new Error('Este PDF não tem texto selecionável (pode ser só imagem).');
    return { title, content: clip(text), note: `${pages} página(s) lidas.` };
  }
  const result = await importBytes(file.name, bytes);
  if (result.kind === 'doc') {
    const text = result.doc.blocks
      .map((b) => (b.type === 'heading' ? `## ${b.text}` : b.type === 'bullet' ? `- ${b.text}` : b.text))
      .join('\n\n');
    return { title: result.doc.title || title, content: clip(text), note: result.note };
  }
  if (result.kind === 'sheet') return { title: result.sheet.title || title, content: clip(sheetToCsv(result.sheet.cells)), note: result.note };
  const deck = result.deck;
  const text = deck.slides.map((s, i) => `## Slide ${i + 1}: ${s.title}\n${s.bullets.map((b) => `- ${b}`).join('\n')}`).join('\n\n');
  return { title: deck.title || title, content: clip(text), note: result.note };
}

export function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function isYoutubeUrl(url: string): boolean {
  return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(safeHost(url));
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Lê uma página pelo firecrawl-scrape (exige login). */
export async function importSourceUrl(rawUrl: string): Promise<ImportedSource & { url: string }> {
  const url = normalizeUrl(rawUrl);
  if (!url) throw new Error('Link inválido. Cole um endereço completo, como https://site.com/artigo.');
  const { data, error } = await supabase.functions.invoke<{
    success?: boolean;
    error?: string;
    data?: { markdown?: string; metadata?: { title?: string; ogTitle?: string } };
  }>('firecrawl-scrape', { body: { url, options: { formats: ['markdown'], onlyMainContent: true } } });
  if (error || !data || data.success === false) {
    const ctx = (error as { context?: Response } | null)?.context;
    if (ctx?.status === 401) throw new Error('Faça login para importar links.');
    throw new Error('Não consegui ler esse link agora. Tente de novo ou cole o texto da página.');
  }
  const markdown = data.data?.markdown ?? '';
  if (!markdown.trim()) throw new Error('A página não tem texto legível. Tente colar o conteúdo como texto.');
  const title = data.data?.metadata?.title || data.data?.metadata?.ogTitle || safeHost(url) || 'Página';
  return { title: title.slice(0, 200), content: clip(markdown), url };
}

export function importSourceText(title: string, text: string): ImportedSource {
  const content = clip(text);
  const firstLine = content.split('\n').find((l) => l.trim())?.replace(/^#+\s*/, '').slice(0, 80) ?? '';
  return { title: title.trim() || firstLine || 'Texto colado', content };
}
