-- Access token do Spotify passa a ser guardado criptografado (AES-GCM, como o refresh token).
-- RFC 6749 §10.3: token de acesso deve ser mantido confidencial também em armazenamento.
-- As colunas novas são nulas; linhas antigas em texto puro são ignoradas pelo código e renovadas.
alter table public.spotify_accounts add column if not exists access_token_iv text;
alter table public.spotify_accounts add column if not exists access_token_tag text;
