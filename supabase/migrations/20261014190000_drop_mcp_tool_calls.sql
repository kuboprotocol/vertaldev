-- Remove public.mcp_tool_calls.
--
-- A tabela foi criada direto em produção, fora das migrações, para registrar chamadas de
-- ferramentas MCP autenticadas por chave de API. Essas chaves saíram em 20261014170000, e nenhum
-- código do repositório lê ou grava esta tabela (nem o servidor MCP em supabase/functions/mcp).
-- 20261014180000 apenas registrou o estado de produção; esta migração conclui a limpeza.
--
-- Conferido em produção (kubovibe) em 2026-10-14: 0 linhas e nenhuma dependência (FK, view,
-- função, trigger ou publicação do Realtime). Sem CASCADE, para falhar se isso mudar.
DROP TABLE IF EXISTS public.mcp_tool_calls;
