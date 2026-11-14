-- Arquivos de design do figCraft (Painel Criativo, Vertal Chat e MCP).
--
-- Cada linha é um documento .figcraft de um único usuário. RLS garante que ninguém lê, cria,
-- altera ou apaga o arquivo de outra pessoa, mesmo com a chave pública do app. O conteúdo
-- binário fica no bucket privado `design-files`, em uma pasta com o id do dono.
-- A Edge Function `mcp` usa service role e filtra sempre pelo dono da chave.

CREATE TABLE IF NOT EXISTS public.design_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  engine       text NOT NULL DEFAULT 'figcraft' CHECK (engine IN ('figcraft')),
  file_path    text NOT NULL,                          -- caminho no bucket design-files
  size_bytes   integer NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_files_user_updated_idx
  ON public.design_files (user_id, updated_at DESC);

ALTER TABLE public.design_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "design_files_select_own" ON public.design_files;
CREATE POLICY "design_files_select_own" ON public.design_files
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "design_files_insert_own" ON public.design_files;
CREATE POLICY "design_files_insert_own" ON public.design_files
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "design_files_update_own" ON public.design_files;
CREATE POLICY "design_files_update_own" ON public.design_files
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "design_files_delete_own" ON public.design_files;
CREATE POLICY "design_files_delete_own" ON public.design_files
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.design_files FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.design_files TO authenticated;

-- Bucket privado para os arquivos (até 50 MB). Só o formato do figCraft e JSON.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('design-files', 'design-files', false, 52428800,
        ARRAY['application/octet-stream', 'application/zip', 'application/x-zip-compressed', 'application/json'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['application/octet-stream', 'application/zip', 'application/x-zip-compressed', 'application/json'];

-- Cada arquivo fica em <user_id>/<arquivo>. Só o dono acessa a própria pasta.
DROP POLICY IF EXISTS "design_files_storage_select_own" ON storage.objects;
CREATE POLICY "design_files_storage_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'design-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "design_files_storage_insert_own" ON storage.objects;
CREATE POLICY "design_files_storage_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'design-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "design_files_storage_update_own" ON storage.objects;
CREATE POLICY "design_files_storage_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'design-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'design-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "design_files_storage_delete_own" ON storage.objects;
CREATE POLICY "design_files_storage_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'design-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
