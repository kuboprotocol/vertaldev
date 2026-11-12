import { supabase } from "@/integrations/supabase/client";

const EXPORTS_BUCKET = "exports";

/**
 * file_url guarda o caminho no bucket privado (`exports/<user>/<id>.<ext>`).
 * Gera um signed URL na hora; URLs http antigas são devolvidas como estão.
 */
export async function resolveExportUrl(fileUrl: string | null | undefined): Promise<string | null> {
  if (!fileUrl) return null;
  if (/^https?:\/\//.test(fileUrl)) return fileUrl;
  const path = fileUrl.startsWith(`${EXPORTS_BUCKET}/`) ? fileUrl.slice(EXPORTS_BUCKET.length + 1) : fileUrl;
  const { data, error } = await supabase.storage.from(EXPORTS_BUCKET).createSignedUrl(path, 60 * 10, { download: true });
  if (error) throw error;
  return data.signedUrl;
}

export async function cancelCreativeExport(exportId: string) {
  const { data, error } = await supabase.rpc("cancel_creative_export", { p_export_id: exportId });
  if (error) throw error;
  return data;
}

export async function retryCreativeExport(exportId: string) {
  const { data, error } = await supabase.rpc("retry_creative_export", { p_export_id: exportId });
  if (error) throw error;
  return data;
}

export const EXPORT_STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  processing: "Gerando",
  completed: "Concluída",
  failed: "Falhou",
  cancelled: "Cancelada",
};
