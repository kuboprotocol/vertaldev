-- Vertal Navigator: cofre da auditoria (registros cifrados em repouso + anti-telemetria).
--
-- navigator_audit passa a guardar em CLARO só o que serve para consultar:
--   user_id, session_id, kind, created_at e detail com no máximo end_reason/minutes/limit.
-- Todo o resto (texto da tarefa, URL, host do login, nome do segredo, loja, total,
-- itens, botão) vai cifrado pelo Worker (AES-256-GCM, AAD = dono + tipo) em
--   detail_ciphertext / detail_iv / detail_tag + key_version
--   (1 = NAVIGATOR_AUDIT_KEY; 0 = fallback NAVIGATOR_ENC_KEY/CONNECTOR_ENC_KEY).
-- Valores de segredo (fill_secret), senhas, códigos 2FA/OTP e cookies NUNCA entram,
-- nem cifrados (só o marcador com o NOME do segredo).
--
-- Ordem de deploy: 1) esta migração; 2) Worker novo (logo em seguida; o Worker
-- antigo grava detail com texto em claro e passa a ser recusado pela constraint
-- abaixo — a rota não quebra, só a linha de auditoria se perde no intervalo);
-- 3) backfill (scripts/navigator-audit-backfill.ts) para cifrar as linhas antigas;
-- 4) depois do backfill: `alter table public.navigator_audit validate constraint navigator_audit_detail_clear_only;`
--
-- Idempotente: pode rodar de novo sem quebrar nada.

alter table public.navigator_audit
  add column if not exists detail_ciphertext text,
  add column if not exists detail_iv         text,
  add column if not exists detail_tag        text,
  add column if not exists key_version       smallint;

-- As três partes do AES-GCM andam juntas, sempre com a versão da chave.
alter table public.navigator_audit drop constraint if exists navigator_audit_enc_parts;
alter table public.navigator_audit add constraint navigator_audit_enc_parts check (
  (detail_ciphertext is null and detail_iv is null and detail_tag is null and key_version is null)
  or (detail_ciphertext is not null and detail_iv is not null and detail_tag is not null and key_version is not null
      and length(detail_iv) between 12 and 24 and length(detail_tag) between 16 and 32
      and length(detail_ciphertext) <= 16384)
);

-- Em claro só end_reason/minutes/limit. NOT VALID: vale para linhas novas já;
-- as antigas (texto da tarefa em claro) são cifradas pelo backfill e só então validadas.
alter table public.navigator_audit drop constraint if exists navigator_audit_detail_clear_only;
alter table public.navigator_audit add constraint navigator_audit_detail_clear_only check (
  (detail - 'end_reason' - 'minutes' - 'limit') = '{}'::jsonb
) not valid;

-- RLS mais fechada: o cliente (authenticated) não lê mais as colunas cifradas nem o
-- detalhe direto da tabela; a aba Atividade usa /api/navigator/activity, que decifra
-- no servidor só para o dono. Continua só-leitura e só das próprias linhas.
alter table public.navigator_audit enable row level security;
alter table public.navigator_audit force row level security;
revoke all on public.navigator_audit from anon, authenticated, public;
grant select (id, user_id, session_id, kind, created_at) on public.navigator_audit to authenticated;
grant all on public.navigator_audit to service_role;

drop policy if exists navigator_audit_select_own on public.navigator_audit;
create policy navigator_audit_select_own on public.navigator_audit
  for select to authenticated using (user_id = (select auth.uid()));

-- Ninguém além do service_role insere/altera/apaga (não há políticas de escrita para authenticated).

comment on column public.navigator_audit.detail is 'Só metadados em claro: end_reason, minutes, limit. O resto vai em detail_ciphertext.';
comment on column public.navigator_audit.detail_ciphertext is 'AES-256-GCM (base64) do detalhe sensível (tarefa, URL, host, segredo por NOME, loja, itens). AAD = navigator_audit:v<key_version>:<user_id>:<kind>. Decifra só no Worker.';
comment on column public.navigator_audit.key_version is '1 = NAVIGATOR_AUDIT_KEY (dedicada); 0 = fallback NAVIGATOR_ENC_KEY/CONNECTOR_ENC_KEY.';
comment on table public.navigator_audit is 'Vertal Navigator: auditoria cifrada em repouso (sessões, tarefas, nomes de segredos usados, 2FA, aprovações/recusas). Nunca valor de segredo, senha, código ou cookie.';
