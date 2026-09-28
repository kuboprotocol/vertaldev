-- Memória do Prime (KUBO Prime / futuro Vertal Prime).
--
-- Preferências, restrições e decisões que o agente lembra entre conversas:
--   scope = 'user'    → vale para todos os projetos do usuário
--                        (ex.: "prefiro layout minimalista")
--   scope = 'project' → vale só para um projeto
--                        (ex.: "este projeto usa Supabase para autenticação")
-- Cada usuário só vê e edita as próprias memórias (RLS). O agente grava com
-- service role depois de extrair as frases explícitas do pedido.

CREATE TABLE IF NOT EXISTS public.prime_memories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  scope       text NOT NULL CHECK (scope IN ('user', 'project')),
  kind        text NOT NULL CHECK (kind IN ('preference', 'constraint', 'architecture', 'design', 'integration', 'decision', 'note')),
  content     text NOT NULL CHECK (char_length(content) BETWEEN 3 AND 500),
  source      text NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'agent')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'project') = (project_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS prime_memories_user_idx ON public.prime_memories (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prime_memories_project_idx ON public.prime_memories (project_id) WHERE project_id IS NOT NULL;
-- Evita a mesma memória duplicada no mesmo escopo.
CREATE UNIQUE INDEX IF NOT EXISTS prime_memories_dedupe_idx
  ON public.prime_memories (user_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(content));

ALTER TABLE public.prime_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prime_memories_select_own" ON public.prime_memories;
CREATE POLICY "prime_memories_select_own" ON public.prime_memories
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "prime_memories_insert_own" ON public.prime_memories;
CREATE POLICY "prime_memories_insert_own" ON public.prime_memories
  FOR INSERT TO authenticated WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (project_id IS NULL OR EXISTS (
      SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = (SELECT auth.uid())
    ))
  );

DROP POLICY IF EXISTS "prime_memories_update_own" ON public.prime_memories;
CREATE POLICY "prime_memories_update_own" ON public.prime_memories
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (project_id IS NULL OR EXISTS (
      SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = (SELECT auth.uid())
    ))
  );

DROP POLICY IF EXISTS "prime_memories_delete_own" ON public.prime_memories;
CREATE POLICY "prime_memories_delete_own" ON public.prime_memories
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.prime_memories FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prime_memories TO authenticated;
