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

DROP FUNCTION IF EXISTS public.validate_mcp_api_key(text);
DROP TABLE IF EXISTS public.mcp_api_keys;
