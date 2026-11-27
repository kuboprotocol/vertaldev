-- Production migration 20261108225059 "office_generic_files", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

ALTER TABLE public.office_documents
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS mime_type text;

ALTER TABLE public.office_documents
  DROP CONSTRAINT IF EXISTS office_documents_kind_check;
ALTER TABLE public.office_documents
  ADD CONSTRAINT office_documents_kind_check CHECK (kind IN ('doc', 'sheet', 'slides', 'pdf', 'file'));

ALTER TABLE public.office_documents
  DROP CONSTRAINT IF EXISTS office_documents_kind_payload;
ALTER TABLE public.office_documents
  ADD CONSTRAINT office_documents_kind_payload CHECK (
    (kind IN ('pdf', 'file') AND file_path IS NOT NULL AND content IS NULL)
    OR (kind IN ('doc', 'sheet', 'slides') AND content IS NOT NULL AND file_path IS NULL)
  );

ALTER TABLE public.office_documents
  DROP CONSTRAINT IF EXISTS office_documents_file_name_len;
ALTER TABLE public.office_documents
  ADD CONSTRAINT office_documents_file_name_len CHECK (file_name IS NULL OR char_length(file_name) BETWEEN 1 AND 255);

UPDATE storage.buckets
SET file_size_limit = 104857600,
    allowed_mime_types = NULL
WHERE id = 'office-files';
