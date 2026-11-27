-- Vibe Code Agent: conversas ("caixinhas"), código guardado e requisitos
-- (conectores / APIs) detectados para cada aplicação.
--
--   vibe_conversations  → uma caixinha de conversa por assunto, com resumo
--                         contínuo que o agente usa como memória de longo prazo
--   vibe_messages       → mensagens + linha do tempo (steps) de cada resposta
--   vibe_project_files  → cofre de código: toda versão de arquivo que o agente
--                         propõe/aplica, para ler, comparar e restaurar
--   vibe_requirements   → conectores e APIs que a aplicação precisa, com status
--
-- O agente escreve com service role; o usuário só enxerga o que é dele (RLS).

CREATE TABLE IF NOT EXISTS public.vibe_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title           text NOT NULL DEFAULT 'Nova conversa' CHECK (char_length(title) BETWEEN 1 AND 120),
  summary         text CHECK (summary IS NULL OR char_length(summary) <= 4000),
  message_count   integer NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  archived        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vibe_conversations_user_idx
  ON public.vibe_conversations (user_id, archived, last_message_at DESC);
CREATE INDEX IF NOT EXISTS vibe_conversations_project_idx
  ON public.vibe_conversations (project_id) WHERE project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.vibe_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.vibe_conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL DEFAULT '' CHECK (char_length(content) <= 20000),
  steps           jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vibe_messages_conversation_idx
  ON public.vibe_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.vibe_project_files (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.vibe_conversations(id) ON DELETE SET NULL,
  path            text NOT NULL CHECK (char_length(path) BETWEEN 1 AND 500),
  content         text NOT NULL CHECK (char_length(content) <= 500000),
  version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  commit_sha      text,
  source          text NOT NULL DEFAULT 'agent' CHECK (source IN ('agent', 'user')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vibe_project_files_version_idx
  ON public.vibe_project_files (user_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), path, version);
CREATE INDEX IF NOT EXISTS vibe_project_files_lookup_idx
  ON public.vibe_project_files (user_id, project_id, path, version DESC);

CREATE TABLE IF NOT EXISTS public.vibe_requirements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.vibe_conversations(id) ON DELETE CASCADE,
  slug            text NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 80),
  kind            text NOT NULL CHECK (kind IN ('connector', 'api')),
  name            text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  reason          text CHECK (reason IS NULL OR char_length(reason) <= 500),
  secrets         text[] NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'needed' CHECK (status IN ('needed', 'connected', 'dismissed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vibe_requirements_dedupe_idx
  ON public.vibe_requirements (
    user_id,
    coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    slug
  );
CREATE INDEX IF NOT EXISTS vibe_requirements_user_idx
  ON public.vibe_requirements (user_id, status, updated_at DESC);

ALTER TABLE public.vibe_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vibe_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vibe_project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vibe_requirements  ENABLE ROW LEVEL SECURITY;

-- vibe_conversations: o usuário lê, renomeia/arquiva e apaga as próprias.
DROP POLICY IF EXISTS "vibe_conversations_select_own" ON public.vibe_conversations;
CREATE POLICY "vibe_conversations_select_own" ON public.vibe_conversations
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "vibe_conversations_update_own" ON public.vibe_conversations;
CREATE POLICY "vibe_conversations_update_own" ON public.vibe_conversations
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "vibe_conversations_delete_own" ON public.vibe_conversations;
CREATE POLICY "vibe_conversations_delete_own" ON public.vibe_conversations
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- vibe_messages / vibe_project_files: leitura e remoção próprias; escrita só pelo agente.
DROP POLICY IF EXISTS "vibe_messages_select_own" ON public.vibe_messages;
CREATE POLICY "vibe_messages_select_own" ON public.vibe_messages
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "vibe_messages_delete_own" ON public.vibe_messages;
CREATE POLICY "vibe_messages_delete_own" ON public.vibe_messages
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "vibe_project_files_select_own" ON public.vibe_project_files;
CREATE POLICY "vibe_project_files_select_own" ON public.vibe_project_files
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "vibe_project_files_delete_own" ON public.vibe_project_files;
CREATE POLICY "vibe_project_files_delete_own" ON public.vibe_project_files
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- vibe_requirements: o usuário lê e dispensa ("dismissed") os próprios.
DROP POLICY IF EXISTS "vibe_requirements_select_own" ON public.vibe_requirements;
CREATE POLICY "vibe_requirements_select_own" ON public.vibe_requirements
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "vibe_requirements_update_own" ON public.vibe_requirements;
CREATE POLICY "vibe_requirements_update_own" ON public.vibe_requirements
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "vibe_requirements_delete_own" ON public.vibe_requirements;
CREATE POLICY "vibe_requirements_delete_own" ON public.vibe_requirements
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.vibe_conversations FROM anon;
REVOKE ALL ON public.vibe_messages      FROM anon;
REVOKE ALL ON public.vibe_project_files FROM anon;
REVOKE ALL ON public.vibe_requirements  FROM anon;

-- O usuário só altera o que faz sentido para ele (título/arquivar, dispensar
-- requisito); resumo, contadores e conteúdo são do agente.
GRANT SELECT, DELETE ON public.vibe_conversations TO authenticated;
GRANT UPDATE (title, archived, updated_at) ON public.vibe_conversations TO authenticated;
GRANT SELECT, DELETE ON public.vibe_messages      TO authenticated;
GRANT SELECT, DELETE ON public.vibe_project_files TO authenticated;
GRANT SELECT, DELETE ON public.vibe_requirements  TO authenticated;
GRANT UPDATE (status, updated_at) ON public.vibe_requirements TO authenticated;
