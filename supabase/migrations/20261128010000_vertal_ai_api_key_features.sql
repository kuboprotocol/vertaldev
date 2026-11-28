-- VERTAL AI API: recursos liberados por chave (ex.: {"video": true}). Aditiva e idempotente.
-- Só a edge function (service role) altera; o dono continua só lendo as próprias chaves (policy existente).
-- Liberar o vídeo para uma chave:  update public.vertal_ai_api_keys set features = features || '{"video": true}' where id = '<key id>';
alter table public.vertal_ai_api_keys add column if not exists features jsonb not null default '{}'::jsonb;
comment on column public.vertal_ai_api_keys.features is 'Recursos extras liberados para esta chave (ex.: {"video": true}). Desligado = ausente.';
