// Designs do figCraft salvos pelo usuário: lista, cria, salva, abre, renomeia e apaga.
// Tudo passa pelo Supabase com RLS (cada um só enxerga o que é seu). O arquivo .figcraft fica no
// bucket privado `design-files`, em <user_id>/<design_id>.figcraft.
import { supabase } from '@/integrations/supabase/client';
import { DESIGN_FILE_MAX_BYTES, DESIGN_TITLE_MAX, designStoragePath, stripControlChars } from './contract';

const TABLE = 'design_files';
const BUCKET = 'design-files';
const COLUMNS = 'id,title,engine,file_path,size_bytes,created_at,updated_at';
export const MAX_LIST = 100;

export interface DesignRecord {
  id: string;
  title: string;
  engine: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  title: string;
  engine: string;
  file_path: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

const fromRow = (r: Row): DesignRecord => ({
  id: r.id,
  title: r.title,
  engine: r.engine,
  filePath: r.file_path,
  sizeBytes: r.size_bytes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const cleanTitle = (title: string) => stripControlChars(title).replace(/\s+/g, ' ').trim().slice(0, DESIGN_TITLE_MAX) || 'Design sem nome';

export async function listDesigns(limit = MAX_LIST): Promise<DesignRecord[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .order('updated_at', { ascending: false })
    .limit(Math.min(limit, MAX_LIST));
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(fromRow);
}

export async function getDesign(id: string): Promise<DesignRecord | null> {
  const { data, error } = await supabase.from(TABLE).select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data as Row) : null;
}

/** Cria o design: envia o arquivo primeiro e depois a linha; se a linha falhar, o arquivo é removido. */
export async function createDesign(userId: string, title: string, bytes: Uint8Array): Promise<DesignRecord> {
  if (bytes.byteLength > DESIGN_FILE_MAX_BYTES) throw new Error('Arquivo passa de 50 MB');
  const id = crypto.randomUUID();
  const path = designStoragePath(userId, id);
  const upload = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: 'application/octet-stream',
    upsert: false,
  });
  if (upload.error) throw new Error(upload.error.message);
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ id, user_id: userId, title: cleanTitle(title), engine: 'figcraft', file_path: path, size_bytes: bytes.byteLength })
    .select(COLUMNS)
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
  return fromRow(data as Row);
}

/** Grava a nova versão do arquivo e atualiza tamanho e data. */
export async function saveDesignBytes(design: DesignRecord, bytes: Uint8Array): Promise<DesignRecord> {
  if (bytes.byteLength > DESIGN_FILE_MAX_BYTES) throw new Error('Arquivo passa de 50 MB');
  const upload = await supabase.storage.from(BUCKET).upload(design.filePath, bytes, {
    contentType: 'application/octet-stream',
    upsert: true,
  });
  if (upload.error) throw new Error(upload.error.message);
  const { data, error } = await supabase
    .from(TABLE)
    .update({ size_bytes: bytes.byteLength, updated_at: new Date().toISOString() })
    .eq('id', design.id)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return fromRow(data as Row);
}

export async function downloadDesignBytes(design: DesignRecord): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(BUCKET).download(design.filePath);
  if (error || !data) throw new Error(error?.message ?? 'Arquivo não encontrado');
  return new Uint8Array(await data.arrayBuffer());
}

export async function renameDesign(id: string, title: string): Promise<DesignRecord> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ title: cleanTitle(title), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return fromRow(data as Row);
}

export async function deleteDesign(design: DesignRecord): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', design.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(BUCKET).remove([design.filePath]);
}
