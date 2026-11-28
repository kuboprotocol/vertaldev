-- PROPOSTA (NÃO APLICADA) — conector Vertal AI. Opcional: o código funciona sem isto.
-- Pré-requisito já no main: supabase/migrations/20261128010000_vertal_ai_api_key_features.sql (coluna features).
-- Para aplicar, precisa do OK do Laércio: copiar para supabase/migrations/<timestamp>_vertal_ai_connector.sql
-- (a integração do Supabase aplica ao fazer merge no main).

-- 1) Um projeto, UMA chave ativa do conector (fecha no banco a corrida de dois cliques simultâneos).
create unique index if not exists vertal_ai_api_keys_connector_project_uniq
  on public.vertal_ai_api_keys (owner_id, ((features -> 'connector' ->> 'project')))
  where revoked_at is null and features ? 'connector';

-- 2) Busca do proxy pelo ref público (cada pedido do app).
create unique index if not exists vertal_ai_api_keys_connector_ref_idx
  on public.vertal_ai_api_keys (((features -> 'connector' ->> 'ref')))
  where features ? 'connector';
