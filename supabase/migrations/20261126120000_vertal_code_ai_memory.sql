-- VERTAL Code AI · memória expansiva da Equipe Vertal (ADITIVA e idempotente).
--
-- 1) vertal_code_ai_memories: memória de longo prazo por usuário (scope = 'user') e por projeto
--    (scope = 'project'; project_id nulo = cofre pessoal): decisões, preferências, fatos do código,
--    resumos de execuções e o resumo rolante de cada projeto.
-- 2) Busca por semelhança com pgvector (embedding de 384 dimensões, índice HNSW por cosseno) +
--    busca em português (FTS) — a edge function usa match_vertal_code_ai_memories e, se ela não
--    existir, ordena as últimas linhas no próprio código.
--
-- Segurança/LGPD: RLS só do dono. O usuário VÊ e APAGA o que é dele (tela "Memória" do VERTAL Code AI).
-- Gravação só pelo service role (edge function vertal-code-ai), que barra segredos antes de gravar.
-- Tudo some em cascata quando a conta ou o projeto é excluído.
--
-- Nada aqui altera tabelas existentes. Pode rodar mais de uma vez (IF NOT EXISTS / DROP ... IF EXISTS).
-- Sem esta migração aplicada, o VERTAL Code AI segue funcionando: a memória só fica desligada.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.vertal_code_ai_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'project' CHECK (scope IN ('user', 'project')),
  kind TEXT NOT NULL DEFAULT 'note'
    CHECK (kind IN ('decision', 'preference', 'code_fact', 'run_summary', 'project_summary', 'note')),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 3 AND 2000),
  importance SMALLINT NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  embedding extensions.vector(384),
  source TEXT NOT NULL DEFAULT 'team_run' CHECK (char_length(source) <= 40),
  source_run_id TEXT CHECK (source_run_id IS NULL OR char_length(source_run_id) <= 64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('portuguese'::regconfig, content)) STORED,
  -- Memória do usuário não pertence a projeto.
  CONSTRAINT vertal_code_ai_memories_user_scope_no_project CHECK (scope = 'project' OR project_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_vertal_code_ai_memories_user_updated
  ON public.vertal_code_ai_memories (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_vertal_code_ai_memories_user_project
  ON public.vertal_code_ai_memories (user_id, project_id, kind);
CREATE INDEX IF NOT EXISTS idx_vertal_code_ai_memories_tsv
  ON public.vertal_code_ai_memories USING gin (content_tsv);
CREATE INDEX IF NOT EXISTS idx_vertal_code_ai_memories_embedding
  ON public.vertal_code_ai_memories USING hnsw (embedding extensions.vector_cosine_ops);
-- Um único resumo rolante por usuário + projeto (cofre pessoal incluso).
CREATE UNIQUE INDEX IF NOT EXISTS uq_vertal_code_ai_memories_project_summary
  ON public.vertal_code_ai_memories (user_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE kind = 'project_summary';

ALTER TABLE public.vertal_code_ai_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vertal_code_ai_memories_select_own" ON public.vertal_code_ai_memories;
CREATE POLICY "vertal_code_ai_memories_select_own" ON public.vertal_code_ai_memories
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "vertal_code_ai_memories_delete_own" ON public.vertal_code_ai_memories;
CREATE POLICY "vertal_code_ai_memories_delete_own" ON public.vertal_code_ai_memories
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.vertal_code_ai_memories FROM anon;
REVOKE ALL ON public.vertal_code_ai_memories FROM authenticated;
GRANT SELECT, DELETE ON public.vertal_code_ai_memories TO authenticated;
GRANT ALL ON public.vertal_code_ai_memories TO service_role;

CREATE OR REPLACE FUNCTION public.vertal_code_ai_memories_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vertal_code_ai_memories_touch ON public.vertal_code_ai_memories;
CREATE TRIGGER trg_vertal_code_ai_memories_touch
  BEFORE UPDATE OF content, importance, embedding ON public.vertal_code_ai_memories
  FOR EACH ROW EXECUTE FUNCTION public.vertal_code_ai_memories_touch();

-- Busca por semelhança (cosseno) nas memórias do usuário + do projeto atual. Só o service role executa
-- (a edge function filtra pelo usuário autenticado; o parâmetro p_user_id nunca vem do cliente).
CREATE OR REPLACE FUNCTION public.match_vertal_code_ai_memories(
  p_user_id UUID,
  p_project_id UUID,
  p_query_embedding extensions.vector(384),
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  scope TEXT,
  kind TEXT,
  content TEXT,
  importance SMALLINT,
  project_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  embedding extensions.vector(384),
  similarity DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT m.id, m.scope, m.kind, m.content, m.importance, m.project_id, m.created_at, m.updated_at, m.embedding,
         1 - (m.embedding OPERATOR(extensions.<=>) p_query_embedding) AS similarity
  FROM public.vertal_code_ai_memories m
  WHERE m.user_id = p_user_id
    AND m.embedding IS NOT NULL
    AND m.kind <> 'project_summary'
    AND (
      m.scope = 'user'
      OR (m.scope = 'project' AND m.project_id IS NOT DISTINCT FROM p_project_id)
    )
  ORDER BY m.embedding OPERATOR(extensions.<=>) p_query_embedding
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.match_vertal_code_ai_memories(UUID, UUID, extensions.vector, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.match_vertal_code_ai_memories(UUID, UUID, extensions.vector, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_vertal_code_ai_memories(UUID, UUID, extensions.vector, INTEGER) TO service_role;

COMMENT ON TABLE public.vertal_code_ai_memories IS
  'VERTAL Code AI: memória de longo prazo (usuário/projeto) da Equipe Vertal. RLS: só o dono lê e apaga; grava só o service role.';
