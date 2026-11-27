-- Production migration 20260920220144 "mcp_api_keys", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

-- Chaves de API pro KUBO MCP Server. O Claude/outras IAs nunca recebem
-- a service_role key do Supabase nem credenciais do Railway/GitHub — só
-- essa chave, escopada a um usuário, que o mcp-server troca por permissão
-- real por trás. Guardamos só o hash (SHA-256); o valor em texto puro só
-- aparece uma vez, na criação.
CREATE TABLE public.mcp_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

GRANT SELECT ON public.mcp_api_keys TO authenticated;
GRANT ALL ON public.mcp_api_keys TO service_role;
ALTER TABLE public.mcp_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_mcp_keys" ON public.mcp_api_keys
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "service_role_manages_mcp_keys" ON public.mcp_api_keys
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_mcp_api_keys_user ON public.mcp_api_keys (user_id) WHERE revoked_at IS NULL;

-- Auditoria de toda chamada de ferramenta MCP: qual chave, qual ferramenta,
-- sucesso ou erro. É o que permite responder "esse usuário pode gastar
-- crédito / fazer deploy / acessar esse repo" com histórico de verdade.
CREATE TABLE public.mcp_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES public.mcp_api_keys(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  arguments jsonb NOT NULL DEFAULT '{}'::jsonb,
  ok boolean NOT NULL,
  error_message text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.mcp_tool_calls TO authenticated;
GRANT ALL ON public.mcp_tool_calls TO service_role;
ALTER TABLE public.mcp_tool_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_mcp_calls" ON public.mcp_tool_calls
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "service_role_manages_mcp_calls" ON public.mcp_tool_calls
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_mcp_tool_calls_user_created ON public.mcp_tool_calls (user_id, created_at DESC);
