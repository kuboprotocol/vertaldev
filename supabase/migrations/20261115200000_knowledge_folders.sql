-- Pastas de conhecimento do Vertal Chat.
--
-- Duas raízes por usuário, criadas pelo app:
--   'personal' -> "Minhas ideias e outras empresas"  (só o dono lê)
--   'business' -> "Meu negócio e nicho"              (o agente pode usar para responder clientes/seguidores)
--
-- Toda subpasta e nota herda o escopo da raiz. Quem escreve é só o dono (RLS).
-- Regras de leitura pelo agente (clientes externos) ficam no servidor; esta migration
-- só garante isolamento entre usuários e a hierarquia consistente.
-- Limite de profundidade e de escopo: ver src/lib/knowledge/folders.ts (mantenha em sincronia).

CREATE TABLE IF NOT EXISTS public.knowledge_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.knowledge_folders(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('personal', 'business')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_folders_user_parent_idx ON public.knowledge_folders (user_id, parent_id);

-- Uma raiz por escopo e por usuário.
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_folders_one_root_per_scope
  ON public.knowledge_folders (user_id, scope) WHERE parent_id IS NULL;

CREATE TABLE IF NOT EXISTS public.knowledge_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id uuid NOT NULL REFERENCES public.knowledge_folders(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 20000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_notes_folder_idx ON public.knowledge_notes (folder_id, updated_at DESC);

-- Consistência: a pasta-pai pertence ao mesmo usuário, herda o escopo e não passa de 10 níveis.
CREATE OR REPLACE FUNCTION public.knowledge_folders_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_row public.knowledge_folders%ROWTYPE;
  depth integer := 1;
  cursor_id uuid;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO parent_row FROM public.knowledge_folders WHERE id = NEW.parent_id;
  IF NOT FOUND OR parent_row.user_id <> NEW.user_id THEN
    RAISE EXCEPTION 'pasta-pai inválida' USING ERRCODE = '42501';
  END IF;

  NEW.scope := parent_row.scope;

  cursor_id := NEW.parent_id;
  WHILE cursor_id IS NOT NULL LOOP
    depth := depth + 1;
    IF depth > 10 THEN
      RAISE EXCEPTION 'profundidade máxima de pastas é 10' USING ERRCODE = '22023';
    END IF;
    SELECT parent_id INTO cursor_id FROM public.knowledge_folders WHERE id = cursor_id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS knowledge_folders_guard_trg ON public.knowledge_folders;
CREATE TRIGGER knowledge_folders_guard_trg
  BEFORE INSERT OR UPDATE OF parent_id, user_id ON public.knowledge_folders
  FOR EACH ROW EXECUTE FUNCTION public.knowledge_folders_guard();

-- Nota só pode ir para pasta do próprio usuário.
CREATE OR REPLACE FUNCTION public.knowledge_notes_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.knowledge_folders f WHERE f.id = NEW.folder_id AND f.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'pasta inválida para esta nota' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS knowledge_notes_guard_trg ON public.knowledge_notes;
CREATE TRIGGER knowledge_notes_guard_trg
  BEFORE INSERT OR UPDATE OF folder_id, user_id ON public.knowledge_notes
  FOR EACH ROW EXECUTE FUNCTION public.knowledge_notes_guard();

ALTER TABLE public.knowledge_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_notes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.knowledge_folders, public.knowledge_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_folders, public.knowledge_notes TO authenticated;
GRANT ALL ON public.knowledge_folders, public.knowledge_notes TO service_role;

DROP POLICY IF EXISTS "knowledge_folders_owner" ON public.knowledge_folders;
CREATE POLICY "knowledge_folders_owner" ON public.knowledge_folders
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "knowledge_notes_owner" ON public.knowledge_notes;
CREATE POLICY "knowledge_notes_owner" ON public.knowledge_notes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
