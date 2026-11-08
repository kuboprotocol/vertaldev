-- Galeria do Vertal Office: documentos, planilhas, apresentações e PDFs salvos por cada usuário.
--
-- Cada linha pertence a um único usuário. RLS garante que ninguém lê, cria, altera ou apaga
-- documento de outra pessoa, mesmo com a chave pública do app.
-- Documentos, planilhas e apresentações ficam em `content` (JSON, até ~1 MB).
-- PDFs ficam no bucket privado `office-files`, em uma pasta com o id do dono.

CREATE TABLE IF NOT EXISTS public.office_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('doc', 'sheet', 'slides', 'pdf')),
  title        text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  excerpt      text NOT NULL DEFAULT '' CHECK (char_length(excerpt) <= 300),
  content      jsonb,                                  -- doc/sheet/slides; NULL para pdf
  file_path    text,                                   -- caminho no bucket office-files; só pdf
  size_bytes   integer NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT office_documents_kind_payload CHECK (
    (kind = 'pdf' AND file_path IS NOT NULL AND content IS NULL)
    OR (kind <> 'pdf' AND content IS NOT NULL AND file_path IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS office_documents_user_updated_idx
  ON public.office_documents (user_id, updated_at DESC);

ALTER TABLE public.office_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office_documents_select_own" ON public.office_documents;
CREATE POLICY "office_documents_select_own" ON public.office_documents
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "office_documents_insert_own" ON public.office_documents;
CREATE POLICY "office_documents_insert_own" ON public.office_documents
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "office_documents_update_own" ON public.office_documents;
CREATE POLICY "office_documents_update_own" ON public.office_documents
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "office_documents_delete_own" ON public.office_documents;
CREATE POLICY "office_documents_delete_own" ON public.office_documents
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.office_documents FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_documents TO authenticated;

-- Bucket privado para os PDFs (até 10 MB, só PDF).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('office-files', 'office-files', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf'];

-- Cada arquivo fica em <user_id>/<arquivo>. Só o dono acessa a própria pasta.
DROP POLICY IF EXISTS "office_files_select_own" ON storage.objects;
CREATE POLICY "office_files_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'office-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "office_files_insert_own" ON storage.objects;
CREATE POLICY "office_files_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'office-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "office_files_delete_own" ON storage.objects;
CREATE POLICY "office_files_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'office-files' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
