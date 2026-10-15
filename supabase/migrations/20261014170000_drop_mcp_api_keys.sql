-- Remove as "MCP API keys" (sk_live_…) do programa de afiliados.
--
-- O servidor MCP (supabase/functions/mcp) nunca aceitou essas chaves: ele só
-- valida o access token do Supabase Auth via OAuth, e cada ferramenta roda
-- como o usuário logado, com RLS. A aba que gerava as chaves foi removida da
-- interface, assim como a Edge Function mcp-api-keys.
--
-- Em 2026-10-14 a tabela estava vazia em produção (0 chaves), então nada se
-- perde. validate_mcp_api_key era SECURITY DEFINER sem nenhum chamador: sai
-- junto, para não deixar superfície de ataque sem uso.
--
-- Já aplicada em produção (kubovibe) em 2026-10-14 pelo SQL Editor; todos os
-- comandos são idempotentes, então rodar de novo não muda nada.

-- Em produção existe public.mcp_tool_calls (criada fora destas migrações,
-- vazia) com uma FK api_key_id → mcp_api_keys. Ela é removida antes do DROP,
-- sem CASCADE; a coluna api_key_id fica, só sem a restrição.
DO $$
DECLARE
  fk record;
BEGIN
  IF to_regclass('public.mcp_api_keys') IS NULL THEN
    RETURN;
  END IF;
  FOR fk IN
    SELECT conrelid::regclass AS tbl, conname
    FROM pg_constraint
    WHERE contype = 'f' AND confrelid = 'public.mcp_api_keys'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.tbl, fk.conname);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.validate_mcp_api_key(text);
DROP TABLE IF EXISTS public.mcp_api_keys;
