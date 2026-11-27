-- MCP API Keys: chaves seguras para autenticação em requisições MCP.
-- Hash da chave é armazenado (nunca plain text). Apenas preview é exibido.

CREATE TABLE IF NOT EXISTS public.mcp_api_keys (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash         text NOT NULL UNIQUE,
  key_preview      text NOT NULL, -- ex: "sk_live_abc123***xyz789"
  name             text NOT NULL DEFAULT 'Default',
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_used_at     timestamptz,
  revoked_at       timestamptz,
  permissions      jsonb NOT NULL DEFAULT '{"mcp": true}'::jsonb
);

CREATE INDEX IF NOT EXISTS mcp_api_keys_user_id_idx ON public.mcp_api_keys(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS mcp_api_keys_key_hash_idx ON public.mcp_api_keys(key_hash) WHERE revoked_at IS NULL;

ALTER TABLE public.mcp_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mcp_api_keys_select_own" ON public.mcp_api_keys;
CREATE POLICY "mcp_api_keys_select_own" ON public.mcp_api_keys
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "mcp_api_keys_insert_own" ON public.mcp_api_keys;
CREATE POLICY "mcp_api_keys_insert_own" ON public.mcp_api_keys
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "mcp_api_keys_delete_own" ON public.mcp_api_keys;
CREATE POLICY "mcp_api_keys_delete_own" ON public.mcp_api_keys
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.mcp_api_keys FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.mcp_api_keys TO authenticated;

-- Função para validar API key por hash. Retorna user_id se válida.
CREATE OR REPLACE FUNCTION public.validate_mcp_api_key(_key_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid;
BEGIN
  SELECT user_id INTO _user_id
  FROM public.mcp_api_keys
  WHERE key_hash = _key_hash AND revoked_at IS NULL
  LIMIT 1;

  IF _user_id IS NOT NULL THEN
    UPDATE public.mcp_api_keys
    SET last_used_at = now()
    WHERE key_hash = _key_hash;
  END IF;

  RETURN _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_mcp_api_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_mcp_api_key(text) TO service_role;
