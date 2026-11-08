-- Galeria do Vertal Office: arquivos enviados de qualquer tipo (exceto executáveis, bloqueados no app).
--
-- Novo kind 'file': guarda o arquivo no bucket privado `office-files`, sem edição.
-- Colunas file_name (nome original, com extensão, para o download) e mime_type.
-- Limite do bucket sobe para 100 MB (o mesmo de PDF) e o bucket deixa de restringir o MIME:
-- a checagem de executáveis fica no app (src/lib/office/fileRules.ts).
--
-- ATENÇÃO: esta migração NÃO foi aplicada em produção. Só aplicar com autorização explícita.

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

-- Bucket: 100 MB, sem restrição de tipo (o app bloqueia executáveis antes do envio).
UPDATE storage.buckets
SET file_size_limit = 104857600,
    allowed_mime_types = NULL
WHERE id = 'office-files';
