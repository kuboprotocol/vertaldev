// Galeria do Vertal Office: salva, lista, abre, renomeia, duplica e apaga documentos do usuário.
// Tudo passa pelo Supabase com RLS (cada um só enxerga o que é seu). PDFs ficam no bucket privado.
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { OfficeItem, OfficeKind } from '@/lib/office/galleryModel';
import { PDF_MAX_BYTES } from '@/lib/office/pdfEdit';
import { FILE_MAX_BYTES, checkUploadableFile, fileExtension, downloadMimeType } from '@/lib/office/fileRules';

const TABLE = 'office_documents';
const BUCKET = 'office-files';
const LIST_COLUMNS = 'id,kind,title,excerpt,size_bytes,created_at,updated_at';
const FULL_COLUMNS = `${LIST_COLUMNS},content,file_path,file_name,mime_type`;
/** Limite do conteúdo estruturado (JSON) por documento. */
export const MAX_CONTENT_BYTES = 1024 * 1024;
export const MAX_LIST = 500;

/** Item completo, com o conteúdo, para abrir no editor. */
export interface OfficeRecord extends OfficeItem {
  content: unknown | null;
  filePath: string | null;
  /** Nome original do arquivo (com extensão) para o download; só PDF e arquivos. */
  fileName: string | null;
  mimeType: string | null;
}

interface Row {
  id: string;
  kind: OfficeKind;
  title: string;
  excerpt: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
  content?: Json | null;
  file_path?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
}

function toItem(r: Row): OfficeItem {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    excerpt: r.excerpt,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toRecord(r: Row): OfficeRecord {
  return {
    ...toItem(r),
    content: r.content ?? null,
    filePath: r.file_path ?? null,
    fileName: r.file_name ?? null,
    mimeType: r.mime_type ?? null,
  };
}

function fail(action: string, message: string): never {
  throw new Error(`Não foi possível ${action}: ${message}`);
}

/** Conteúdo grande demais não é salvo: a mensagem explica o limite. */
export function contentSize(content: unknown): number {
  return new TextEncoder().encode(JSON.stringify(content)).length;
}

export async function listOfficeItems(): Promise<OfficeItem[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(LIST_COLUMNS)
    .order('updated_at', { ascending: false })
    .limit(MAX_LIST);
  if (error) fail('carregar a galeria', error.message);
  return (data as unknown as Row[]).map(toItem);
}

export async function getOfficeRecord(id: string): Promise<OfficeRecord> {
  const { data, error } = await supabase.from(TABLE).select(FULL_COLUMNS).eq('id', id).single();
  if (error || !data) fail('abrir o documento', error?.message ?? 'não encontrado');
  return toRecord(data as unknown as Row);
}

/** Salva documento, planilha ou apresentação (conteúdo JSON). Sem id, cria; com id, atualiza. */
export async function saveStructuredItem(input: {
  id?: string;
  userId: string;
  kind: Exclude<OfficeKind, 'pdf' | 'file'>;
  title: string;
  excerpt: string;
  content: unknown;
}): Promise<OfficeItem> {
  const size = contentSize(input.content);
  if (size > MAX_CONTENT_BYTES) fail('salvar', 'o conteúdo passou de 1 MB. Divida o documento e tente de novo.');
  const payload = {
    kind: input.kind,
    title: input.title.trim() || 'Sem título',
    excerpt: input.excerpt,
    content: input.content as Json,
    file_path: null,
    size_bytes: size,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { data, error } = await supabase.from(TABLE).update(payload).eq('id', input.id).select(LIST_COLUMNS).single();
    if (error || !data) fail('salvar', error?.message ?? 'documento não encontrado');
    return toItem(data as unknown as Row);
  }
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...payload, user_id: input.userId })
    .select(LIST_COLUMNS)
    .single();
  if (error || !data) fail('salvar', error?.message ?? 'erro desconhecido');
  return toItem(data as unknown as Row);
}

/**
 * Grava um arquivo no bucket privado e a linha na galeria. Ao substituir, apaga o arquivo antigo.
 * Usado por PDF e por arquivos enviados (qualquer tipo, exceto executáveis).
 */
async function saveStoredFile(input: {
  id?: string;
  userId: string;
  kind: 'pdf' | 'file';
  title: string;
  excerpt: string;
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}): Promise<OfficeItem> {
  // Extensão só com letras e números: vai para o caminho no bucket.
  const ext = fileExtension(input.fileName).replace(/[^a-z0-9]/g, '').slice(0, 10);
  const path = `${input.userId}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;
  const contentType = downloadMimeType(input.mimeType);
  const upload = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([input.bytes as BlobPart], { type: contentType }), { contentType, upsert: false });
  if (upload.error) fail(input.kind === 'pdf' ? 'enviar o PDF' : 'enviar o arquivo', upload.error.message);

  const payload = {
    kind: input.kind,
    title: input.title.trim() || (input.kind === 'pdf' ? 'PDF sem título' : 'Arquivo sem título'),
    excerpt: input.excerpt,
    content: null,
    file_path: path,
    file_name: input.fileName.slice(0, 255),
    mime_type: contentType,
    size_bytes: input.bytes.byteLength,
    updated_at: new Date().toISOString(),
  };
  let previousPath: string | null = null;
  let result: { data: unknown; error: { message: string } | null };
  if (input.id) {
    previousPath = (await supabase.from(TABLE).select('file_path').eq('id', input.id).single()).data?.file_path ?? null;
    result = await supabase.from(TABLE).update(payload).eq('id', input.id).select(LIST_COLUMNS).single();
  } else {
    result = await supabase.from(TABLE).insert({ ...payload, user_id: input.userId }).select(LIST_COLUMNS).single();
  }
  if (result.error || !result.data) {
    // Sem linha no banco, o arquivo enviado não serve para nada: remove para não sobrar lixo.
    await supabase.storage.from(BUCKET).remove([path]);
    fail(input.kind === 'pdf' ? 'salvar o PDF' : 'salvar o arquivo', result.error?.message ?? 'erro desconhecido');
  }
  if (previousPath && previousPath !== path) await supabase.storage.from(BUCKET).remove([previousPath]);
  return toItem(result.data as Row);
}

/** Salva um PDF (até 100 MB). */
export async function savePdfItem(input: {
  id?: string;
  userId: string;
  title: string;
  excerpt: string;
  bytes: Uint8Array;
}): Promise<OfficeItem> {
  if (input.bytes.byteLength > PDF_MAX_BYTES) fail('salvar o PDF', 'o arquivo passou de 100 MB.');
  return saveStoredFile({
    ...input,
    kind: 'pdf',
    fileName: `${input.title.trim() || 'PDF sem título'}.pdf`,
    mimeType: 'application/pdf',
  });
}

/**
 * Guarda um arquivo enviado pelo usuário, de qualquer tipo que não seja executável.
 * Valida nome, tamanho e extensão antes de enviar qualquer byte.
 */
export async function saveUploadedFile(input: { userId: string; file: File }): Promise<OfficeItem> {
  const problem = checkUploadableFile({ name: input.file.name, size: input.file.size });
  if (problem) fail('enviar o arquivo', problem);
  if (input.file.size > FILE_MAX_BYTES) fail('enviar o arquivo', 'o arquivo passou de 100 MB.');
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const name = input.file.name.trim();
  const dot = name.lastIndexOf('.');
  const title = (dot > 0 ? name.slice(0, dot) : name).slice(0, 120) || 'Arquivo sem título';
  return saveStoredFile({
    userId: input.userId,
    kind: 'file',
    title,
    excerpt: '',
    bytes,
    fileName: name,
    mimeType: input.file.type,
  });
}

/** Baixa os bytes de um PDF ou arquivo guardado no bucket. */
export async function downloadStoredBytes(filePath: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(BUCKET).download(filePath);
  if (error || !data) fail('baixar o arquivo', error?.message ?? 'arquivo não encontrado');
  return new Uint8Array(await data.arrayBuffer());
}

export const downloadPdfBytes = downloadStoredBytes;

/** Renomeia. Em documento, planilha e apresentação o título também muda dentro do conteúdo. */
export async function renameOfficeItem(record: OfficeRecord, title: string): Promise<OfficeItem> {
  const clean = title.trim();
  if (!clean) fail('renomear', 'o nome não pode ficar vazio.');
  const content =
    record.kind !== 'pdf' && record.content && typeof record.content === 'object'
      ? { ...(record.content as Record<string, unknown>), title: clean }
      : record.content;
  const { data, error } = await supabase
    .from(TABLE)
    .update({ title: clean, content: content as Json, updated_at: new Date().toISOString() })
    .eq('id', record.id)
    .select(LIST_COLUMNS)
    .single();
  if (error || !data) fail('renomear', error?.message ?? 'documento não encontrado');
  return toItem(data as unknown as Row);
}

export async function deleteOfficeItem(record: OfficeRecord): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', record.id);
  if (error) fail('excluir', error.message);
  if (record.filePath) await supabase.storage.from(BUCKET).remove([record.filePath]);
}

/** Cria uma cópia com "(cópia)" no nome. PDFs e arquivos têm o arquivo copiado para a pasta do dono. */
export async function duplicateOfficeItem(record: OfficeRecord, userId: string): Promise<OfficeItem> {
  const title = `${record.title} (cópia)`.slice(0, 120);
  if (record.kind === 'pdf' || record.kind === 'file') {
    const bytes = await downloadStoredBytes(record.filePath ?? '');
    return saveStoredFile({
      userId,
      kind: record.kind,
      title,
      excerpt: record.excerpt,
      bytes,
      fileName: record.fileName ?? (record.kind === 'pdf' ? `${title}.pdf` : title),
      mimeType: record.mimeType ?? (record.kind === 'pdf' ? 'application/pdf' : ''),
    });
  }
  const content =
    record.content && typeof record.content === 'object' ? { ...(record.content as Record<string, unknown>), title } : record.content;
  return saveStructuredItem({
    userId,
    kind: record.kind,
    title,
    excerpt: record.excerpt,
    content,
  });
}
