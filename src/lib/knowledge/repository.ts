/**
 * Acesso às pastas e notas de conhecimento. RLS garante que cada usuário só vê as próprias linhas;
 * os triggers da migration 20261115200000 garantem hierarquia e escopo.
 */
import { supabase } from "@/integrations/supabase/client";
import type { KnowledgeFolder, KnowledgeScope } from "./folders";

// As tabelas novas ainda não estão no tipo gerado do Supabase; o acesso fica concentrado aqui.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface KnowledgeNote {
  id: string;
  folderId: string;
  title: string;
  body: string;
  updatedAt: number;
}

interface FolderRow {
  id: string;
  parent_id: string | null;
  scope: KnowledgeScope;
  name: string;
  created_at: string;
}

interface NoteRow {
  id: string;
  folder_id: string;
  title: string;
  body: string;
  updated_at: string;
}

const toFolder = (r: FolderRow): KnowledgeFolder => ({
  id: r.id,
  parentId: r.parent_id,
  scope: r.scope,
  name: r.name,
  createdAt: Date.parse(r.created_at),
});

const toNote = (r: NoteRow): KnowledgeNote => ({
  id: r.id,
  folderId: r.folder_id,
  title: r.title,
  body: r.body,
  updatedAt: Date.parse(r.updated_at),
});

export async function listFolders(userId: string): Promise<KnowledgeFolder[]> {
  const { data, error } = await db
    .from("knowledge_folders")
    .select("id, parent_id, scope, name, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as FolderRow[]).map(toFolder);
}

/** Cria as duas raízes se ainda não existirem. Idempotente: o índice único impede duplicata. */
export async function ensureRootFolders(
  userId: string,
  names: { personal: string; business: string },
): Promise<void> {
  const existing = await listFolders(userId);
  const have = new Set(existing.filter((f) => f.parentId === null).map((f) => f.scope));
  const missing = (["personal", "business"] as const).filter((s) => !have.has(s));
  if (missing.length === 0) return;
  const { error } = await db.from("knowledge_folders").insert(
    missing.map((scope) => ({ user_id: userId, parent_id: null, scope, name: names[scope] })),
  );
  // Corrida com outra aba: o índice único rejeita a segunda raiz. Não é erro para o usuário.
  if (error && error.code !== "23505") throw error;
}

export async function createFolder(input: {
  userId: string;
  parentId: string;
  name: string;
}): Promise<KnowledgeFolder> {
  const { data, error } = await db
    .from("knowledge_folders")
    .insert({ user_id: input.userId, parent_id: input.parentId, name: input.name, scope: "personal" })
    .select("id, parent_id, scope, name, created_at")
    .single();
  if (error) throw error;
  return toFolder(data as FolderRow);
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await db.from("knowledge_folders").update({ name, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

/** Apaga a pasta e tudo dentro dela (ON DELETE CASCADE no banco). */
export async function deleteFolder(id: string): Promise<void> {
  const { error } = await db.from("knowledge_folders").delete().eq("id", id);
  if (error) throw error;
}

export async function listNotes(folderId: string): Promise<KnowledgeNote[]> {
  const { data, error } = await db
    .from("knowledge_notes")
    .select("id, folder_id, title, body, updated_at")
    .eq("folder_id", folderId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as NoteRow[]).map(toNote);
}

export async function saveNote(input: {
  userId: string;
  folderId: string;
  id?: string;
  title: string;
  body: string;
}): Promise<KnowledgeNote> {
  const payload = {
    user_id: input.userId,
    folder_id: input.folderId,
    title: input.title,
    body: input.body,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? db.from("knowledge_notes").update(payload).eq("id", input.id)
    : db.from("knowledge_notes").insert(payload);
  const { data, error } = await query.select("id, folder_id, title, body, updated_at").single();
  if (error) throw error;
  return toNote(data as NoteRow);
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await db.from("knowledge_notes").delete().eq("id", id);
  if (error) throw error;
}
