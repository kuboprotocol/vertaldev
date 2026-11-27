-- Production migration 20261118184212 "spotify_access_token_encrypted", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

-- Access token do Spotify passa a ser guardado criptografado (AES-GCM, como o refresh token).
-- RFC 6749 §10.3: token de acesso deve ser mantido confidencial também em armazenamento.
-- As colunas novas são nulas; linhas antigas em texto puro são ignoradas pelo código e renovadas.
alter table public.spotify_accounts add column if not exists access_token_iv text;
alter table public.spotify_accounts add column if not exists access_token_tag text;
