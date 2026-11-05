-- Chaves de acesso ao servidor MCP do Vertal Dev.
--
-- O dev gera uma chave em /mcp, escolhe o nível de acesso (somente leitura ou
-- leitura e escrita) e cola a configuração no cliente de IA (Claude, Cursor,
-- Codex…). A chave tem o formato vtl_mcp_<...>. Só o SHA-256 dela é gravado:
-- o texto completo aparece uma única vez, na criação.
--
-- Esta tabela é nova: a mcp_api_keys antiga foi removida em 20261014170000 e
-- aquelas chaves nunca eram aceitas pelo servidor.

CREATE TABLE IF NOT EXISTS public.mcp_access_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  key_prefix   text NOT NULL,                       -- primeiros 12 caracteres, só para identificar
  key_hash     text NOT NULL UNIQUE,                -- SHA-256 hex da chave completa
  scopes       text[] NOT NULL CHECK (
                 cardinality(scopes) >= 1
                 AND scopes <@ ARRAY['read', 'write']::text[]
               ),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at   timestamptz,                         -- NULL = sem prazo
  revoked_at   timestamptz
);

CREATE INDEX IF NOT EXISTS mcp_access_keys_user_idx
  ON public.mcp_access_keys (user_id, created_at DESC);

ALTER TABLE public.mcp_access_keys ENABLE ROW LEVEL SECURITY;

-- O dono enxerga as próprias chaves (sem o hash, que não é exposto pelo app).
-- Criar, revogar e marcar uso passam sempre pela Edge Function, com service role.
DROP POLICY IF EXISTS "mcp_access_keys_select_own" ON public.mcp_access_keys;
CREATE POLICY "mcp_access_keys_select_own" ON public.mcp_access_keys
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- O dono lê as próprias linhas via RLS. O key_hash fica visível só para ele, e isso
-- é inofensivo: é um SHA-256 de uma chave de 256 bits, que não permite recuperar a chave.
-- (Grant por coluna não serve aqui: a checagem de GRANT do banco usa has_table_privilege.)
REVOKE ALL ON public.mcp_access_keys FROM anon, authenticated;
GRANT SELECT ON public.mcp_access_keys TO authenticated;
