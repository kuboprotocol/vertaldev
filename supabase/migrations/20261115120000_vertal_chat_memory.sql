-- Vertal Chat: "ultra memória".
--
-- 1) vertal_chat_memories: o que o chat lembra de cada usuário entre conversas
--    (fatos, preferências, pessoas, projetos, objetivos, estilo, notas), com
--    busca em português (FTS) e por semelhança (pg_trgm).
-- 2) vertal_chat_memory_settings: o usuário pode desligar a memória.
-- 3) vertal_chat_summaries: resumo rolante das conversas longas (a parte antiga
--    vira resumo para o contexto não se perder) e recordação entre conversas.
--
-- LGPD: cada usuário só vê e apaga o que é dele (RLS). Gravação só pelo service
-- role (edge function creative-router), que barra dados sensíveis antes. Tudo
-- é apagado em cascata quando a conta é excluída.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ─── Memórias ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vertal_chat_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'note'
    CHECK (kind IN ('fact', 'preference', 'person', 'project', 'goal', 'style', 'note')),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 3 AND 500),
  importance SMALLINT NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  source_conversation_id UUID REFERENCES public.creative_conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('portuguese'::regconfig, content)) STORED
);

CREATE INDEX IF NOT EXISTS idx_vertal_chat_memories_user_updated
  ON public.vertal_chat_memories (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_vertal_chat_memories_tsv
  ON public.vertal_chat_memories USING gin (content_tsv);
CREATE INDEX IF NOT EXISTS idx_vertal_chat_memories_trgm
  ON public.vertal_chat_memories USING gin (content gin_trgm_ops);

ALTER TABLE public.vertal_chat_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vertal_chat_memories_select_own" ON public.vertal_chat_memories;
CREATE POLICY "vertal_chat_memories_select_own" ON public.vertal_chat_memories
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "vertal_chat_memories_delete_own" ON public.vertal_chat_memories;
CREATE POLICY "vertal_chat_memories_delete_own" ON public.vertal_chat_memories
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.vertal_chat_memories FROM anon;
GRANT SELECT, DELETE ON public.vertal_chat_memories TO authenticated;
GRANT ALL ON public.vertal_chat_memories TO service_role;

-- ─── Configuração (memória ligada/desligada) ────────────────────────────

CREATE TABLE IF NOT EXISTS public.vertal_chat_memory_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vertal_chat_memory_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vertal_chat_memory_settings_own" ON public.vertal_chat_memory_settings;
CREATE POLICY "vertal_chat_memory_settings_own" ON public.vertal_chat_memory_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.vertal_chat_memory_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.vertal_chat_memory_settings TO authenticated;
GRANT ALL ON public.vertal_chat_memory_settings TO service_role;

-- ─── Resumos rolantes ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vertal_chat_summaries (
  conversation_id UUID PRIMARY KEY REFERENCES public.creative_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '' CHECK (char_length(summary) <= 4000),
  -- Quantas mensagens do começo da conversa o resumo cobre.
  covered_messages INTEGER NOT NULL DEFAULT 0 CHECK (covered_messages >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('portuguese'::regconfig, summary)) STORED
);

CREATE INDEX IF NOT EXISTS idx_vertal_chat_summaries_user ON public.vertal_chat_summaries (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_vertal_chat_summaries_tsv ON public.vertal_chat_summaries USING gin (summary_tsv);

ALTER TABLE public.vertal_chat_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vertal_chat_summaries_select_own" ON public.vertal_chat_summaries;
CREATE POLICY "vertal_chat_summaries_select_own" ON public.vertal_chat_summaries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "vertal_chat_summaries_delete_own" ON public.vertal_chat_summaries;
CREATE POLICY "vertal_chat_summaries_delete_own" ON public.vertal_chat_summaries
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.vertal_chat_summaries FROM anon;
GRANT SELECT, DELETE ON public.vertal_chat_summaries TO authenticated;
GRANT ALL ON public.vertal_chat_summaries TO service_role;

-- ─── Funções (só service role) ──────────────────────────────────────────

-- Memórias mais relevantes para o pedido: texto (FTS) + semelhança (trigramas)
-- + importância + recência. Sem pedido, ficam importância e recência.
CREATE OR REPLACE FUNCTION public.vertal_chat_recall(p_user_id UUID, p_query TEXT, p_limit INTEGER DEFAULT 30)
RETURNS TABLE (id UUID, kind TEXT, content TEXT, importance SMALLINT, updated_at TIMESTAMPTZ, score REAL)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('portuguese'::regconfig, left(coalesce(p_query, ''), 500)) AS tsq,
           left(coalesce(p_query, ''), 500) AS raw
  )
  SELECT m.id, m.kind, m.content, m.importance, m.updated_at,
         ( coalesce(ts_rank_cd(m.content_tsv, q.tsq), 0) * 2.0
         + coalesce(word_similarity(m.content, q.raw), 0)
         + m.importance * 0.2
         + 0.3 * exp(-extract(epoch FROM (now() - coalesce(m.last_used_at, m.updated_at))) / 2592000.0)
         )::real AS score
    FROM public.vertal_chat_memories m, q
   WHERE m.user_id = p_user_id
   ORDER BY score DESC, m.updated_at DESC
   LIMIT least(greatest(coalesce(p_limit, 30), 1), 80);
$$;

-- Resumos de OUTRAS conversas parecidas com o pedido (recordação entre conversas).
CREATE OR REPLACE FUNCTION public.vertal_chat_recall_conversations(
  p_user_id UUID, p_query TEXT, p_exclude UUID, p_limit INTEGER DEFAULT 2
)
RETURNS TABLE (conversation_id UUID, title TEXT, summary TEXT, updated_at TIMESTAMPTZ, score REAL)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  WITH q AS (SELECT websearch_to_tsquery('portuguese'::regconfig, left(coalesce(p_query, ''), 500)) AS tsq)
  SELECT s.conversation_id, coalesce(c.title, 'Conversa'), s.summary, s.updated_at,
         ts_rank_cd(s.summary_tsv, q.tsq)::real AS score
    FROM public.vertal_chat_summaries s
    JOIN q ON true
    LEFT JOIN public.creative_conversations c ON c.id = s.conversation_id
   WHERE s.user_id = p_user_id
     AND (p_exclude IS NULL OR s.conversation_id <> p_exclude)
     AND s.summary_tsv @@ q.tsq
   ORDER BY score DESC, s.updated_at DESC
   LIMIT least(greatest(coalesce(p_limit, 2), 1), 5);
$$;

-- Salva uma memória sem duplicar: se já existe uma muito parecida, atualiza a
-- existente (texto mais novo, maior importância). Mantém no máximo p_max por usuário.
CREATE OR REPLACE FUNCTION public.vertal_chat_memory_upsert(
  p_user_id UUID, p_kind TEXT, p_content TEXT, p_importance INTEGER,
  p_conversation_id UUID DEFAULT NULL, p_max INTEGER DEFAULT 400
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_id UUID;
  v_conv UUID;
BEGIN
  IF p_content IS NULL OR char_length(btrim(p_content)) < 3 THEN
    RETURN 'skipped';
  END IF;
  -- A conversa de origem precisa ser do próprio usuário.
  SELECT c.id INTO v_conv FROM public.creative_conversations c
   WHERE c.id = p_conversation_id AND c.user_id = p_user_id;

  SELECT m.id INTO v_id
    FROM public.vertal_chat_memories m
   WHERE m.user_id = p_user_id
     AND (lower(m.content) = lower(btrim(p_content)) OR similarity(m.content, p_content) >= 0.55)
   ORDER BY similarity(m.content, p_content) DESC
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.vertal_chat_memories
       SET content = left(btrim(p_content), 500),
           kind = p_kind,
           importance = greatest(importance, least(greatest(p_importance, 1), 5)),
           updated_at = now()
     WHERE id = v_id;
    RETURN 'updated';
  END IF;

  INSERT INTO public.vertal_chat_memories (user_id, kind, content, importance, source_conversation_id)
  VALUES (p_user_id, p_kind, left(btrim(p_content), 500), least(greatest(p_importance, 1), 5), v_conv);

  DELETE FROM public.vertal_chat_memories
   WHERE id IN (
     SELECT m.id FROM public.vertal_chat_memories m
      WHERE m.user_id = p_user_id
      ORDER BY m.importance DESC, coalesce(m.last_used_at, m.updated_at) DESC
      OFFSET greatest(coalesce(p_max, 400), 10)
   );
  RETURN 'inserted';
END;
$$;

-- "Esqueça X": apaga as memórias do usuário que batem com o texto (ou o id).
-- Devolve o que foi apagado, para o chat confirmar.
CREATE OR REPLACE FUNCTION public.vertal_chat_memory_forget(p_user_id UUID, p_query TEXT)
RETURNS TABLE (id UUID, content TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_q TEXT := left(btrim(coalesce(p_query, '')), 200);
BEGIN
  IF char_length(v_q) < 2 THEN
    RETURN;
  END IF;
  RETURN QUERY
  DELETE FROM public.vertal_chat_memories m
   WHERE m.user_id = p_user_id
     AND (
       m.id::text = v_q
       OR m.content ILIKE '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
       OR m.content_tsv @@ websearch_to_tsquery('portuguese'::regconfig, v_q)
       OR word_similarity(v_q, m.content) >= 0.6
     )
  RETURNING m.id, m.content;
END;
$$;

REVOKE ALL ON FUNCTION public.vertal_chat_recall(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vertal_chat_recall_conversations(UUID, TEXT, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vertal_chat_memory_upsert(UUID, TEXT, TEXT, INTEGER, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vertal_chat_memory_forget(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vertal_chat_recall(UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.vertal_chat_recall_conversations(UUID, TEXT, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.vertal_chat_memory_upsert(UUID, TEXT, TEXT, INTEGER, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.vertal_chat_memory_forget(UUID, TEXT) TO service_role;
