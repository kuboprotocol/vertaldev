-- Painel secreto: cofre de segredos do Vertal Dev (chaves de API, tokens, senhas).
--
-- Separado dos conectores (api_credentials / github_connections): conector é uma
-- integração ligada a um serviço; segredo é um valor avulso que o dev guarda e,
-- se quiser, empresta a outras pessoas. Nada aqui é lido direto pelo cliente:
-- todo acesso passa pela Edge Function `kubo-secrets` (ou pelo orquestrador),
-- com service role, que aplica as regras de dono e de acesso.
--
-- Regras:
--   * Dono: o usuário que criou o segredo. Pode tudo (ver, trocar valor, editar,
--     excluir, conceder e revogar acesso, ler a auditoria).
--   * Convidado: alguém a quem o dono concedeu acesso. Vê o nome e a dica mascarada.
--     Só revela o valor se o dono marcou can_reveal. Pode usar o segredo via
--     orquestrador (injeção no servidor), mas nunca edita nem concede.
--   * Valor cifrado em AES-GCM (CONNECTOR_ENC_KEY, mesmo helper dos conectores).
--   * Auditoria é append-only: nenhuma linha é alterada ou apagada.

-- 1. Segredos ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kubo_secrets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  env_key      text NOT NULL CHECK (env_key ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  group_name   text NOT NULL DEFAULT 'geral' CHECK (char_length(group_name) BETWEEN 1 AND 40),
  description  text CHECK (description IS NULL OR char_length(description) <= 300),
  bound_to     text CHECK (bound_to IS NULL OR bound_to ~ '^[a-z0-9_-]{1,64}$'),
  ciphertext   text NOT NULL,
  iv           text NOT NULL,
  tag          text NOT NULL,
  masked_hint  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  rotated_at   timestamptz NOT NULL DEFAULT now(),   -- último troca de valor
  last_used_at timestamptz,                          -- último uso pelo orquestrador
  UNIQUE (owner_id, env_key)
);

-- 2. Concessões (quem pode usar / revelar cada segredo) ----------------------
CREATE TABLE IF NOT EXISTS public.kubo_secret_grants (
  secret_id   uuid NOT NULL REFERENCES public.kubo_secrets(id) ON DELETE CASCADE,
  grantee_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  can_reveal  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (secret_id, grantee_id)
);

CREATE INDEX IF NOT EXISTS kubo_secret_grants_grantee_idx
  ON public.kubo_secret_grants (grantee_id);

-- 3. Auditoria (append-only) --------------------------------------------------
-- Sem FK para kubo_secrets de propósito: a trilha sobrevive à exclusão do segredo.
CREATE TABLE IF NOT EXISTS public.kubo_secret_audit (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  secret_id   uuid,
  owner_id    uuid,
  actor_id    uuid,
  action      text NOT NULL CHECK (action IN (
                'create', 'rotate', 'update', 'delete',
                'reveal', 'grant', 'revoke', 'inject')),
  env_key     text,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kubo_secret_audit_owner_idx
  ON public.kubo_secret_audit (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS kubo_secret_audit_secret_idx
  ON public.kubo_secret_audit (secret_id, created_at DESC);
CREATE INDEX IF NOT EXISTS kubo_secret_audit_actor_idx
  ON public.kubo_secret_audit (actor_id, action, created_at DESC);

CREATE OR REPLACE FUNCTION public.kubo_secret_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'kubo_secret_audit é somente de inserção';
END;
$$;

DROP TRIGGER IF EXISTS kubo_secret_audit_no_update_delete ON public.kubo_secret_audit;
CREATE TRIGGER kubo_secret_audit_no_update_delete
  BEFORE UPDATE OR DELETE ON public.kubo_secret_audit
  FOR EACH ROW EXECUTE FUNCTION public.kubo_secret_audit_immutable();

-- 4. Busca de conta por e-mail (só o service role usa, ao conceder acesso) ----
CREATE OR REPLACE FUNCTION public.kubo_find_user_id_by_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(trim(_email)) LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.kubo_find_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kubo_find_user_id_by_email(text) TO service_role;

-- 5. RLS: cliente não toca nas tabelas. Só o service role (Edge Functions). -----
ALTER TABLE public.kubo_secrets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kubo_secret_grants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kubo_secret_audit   ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.kubo_secrets       FROM anon, authenticated;
REVOKE ALL ON public.kubo_secret_grants FROM anon, authenticated;
REVOKE ALL ON public.kubo_secret_audit FROM anon, authenticated;
