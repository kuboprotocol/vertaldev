-- Vertal Dev — coleta web com Scrapling (F5) + consent gate assinado (termo + OpenTimestamps).
--
-- NÃO aplicar automaticamente: revisar e rodar com `supabase db push` (ou no SQL Editor).
-- Idempotente. Só SOMA: nenhuma tabela, coluna ou valor existente é removido. A única
-- alteração em objeto existente é a CHECK de navigator_audit.kind, recriada com TODOS os
-- valores antigos + os novos (superconjunto).
--
-- Quem escreve: só o Worker do vertal.dev e as edge functions (service role).
-- O usuário lê as próprias linhas (RLS) onde faz sentido; dados pessoais do termo
-- ficam CIFRADOS (AES-256-GCM, CONNECTOR_ENC_KEY) e não têm policy de leitura para o cliente.

-- ═══ 1. Coleta web (Scrapling) ═══════════════════════════════════════════

create table if not exists public.scrape_monitors (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  name                  text not null check (char_length(name) between 1 and 80),
  url                   text not null check (char_length(url) <= 2000 and url ~ '^https?://'),
  -- {name, css?|xpath?, attr?}: validado no Worker (scrapeCore.parseMonitorBody)
  selector              jsonb not null check (pg_column_size(selector) <= 2048),
  mode                  text not null default 'fetch' check (mode in ('fetch', 'dynamic', 'stealth')),
  frequency_minutes     integer not null default 1440 check (frequency_minutes in (60, 180, 360, 720, 1440)),
  status                text not null default 'active'
                          check (status in ('active', 'paused', 'error', 'needs_attention', 'paused_no_credits')),
  status_detail         text check (status_detail is null or char_length(status_detail) <= 300),
  last_value            text check (last_value is null or char_length(last_value) <= 2000),
  last_diff             jsonb check (last_diff is null or pg_column_size(last_diff) <= 8192),
  -- "fingerprint" do elemento para a extração adaptativa (relocate do Scrapling)
  fingerprint           jsonb check (fingerprint is null or pg_column_size(fingerprint) <= 8192),
  last_checked_at       timestamptz,
  last_changed_at       timestamptz,
  next_check_at         timestamptz not null default now(),
  consecutive_failures  integer not null default 0 check (consecutive_failures >= 0),
  credits_spent         integer not null default 0 check (credits_spent >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists scrape_monitors_user_idx on public.scrape_monitors (user_id, created_at desc);
create index if not exists scrape_monitors_due_idx on public.scrape_monitors (next_check_at) where status = 'active';

create table if not exists public.scrape_monitor_alerts (
  id           uuid primary key default gen_random_uuid(),
  monitor_id   uuid not null references public.scrape_monitors(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('changed', 'error', 'captcha', 'no_credits')),
  message      text not null check (char_length(message) <= 600),
  old_value    text check (old_value is null or char_length(old_value) <= 2000),
  new_value    text check (new_value is null or char_length(new_value) <= 2000),
  diff         jsonb check (diff is null or pg_column_size(diff) <= 8192),
  url          text check (url is null or char_length(url) <= 2000),
  seen_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists scrape_monitor_alerts_unseen_idx on public.scrape_monitor_alerts (user_id, created_at desc) where seen_at is null;

-- Cada tarefa de coleta (rate limit entre isolates, capacidade e histórico).
create table if not exists public.scrape_runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  tool         text not null check (tool in ('scrape_page', 'crawl_site', 'monitor_check')),
  mode         text not null check (mode in ('fetch', 'dynamic', 'stealth')),
  hosts        text[] not null default '{}',
  url          text check (url is null or char_length(url) <= 2000),
  pages        integer not null default 0 check (pages >= 0),
  blocked      integer not null default 0 check (blocked >= 0),
  credits      integer not null default 0 check (credits >= 0),
  status       text not null default 'running' check (status in ('running', 'done', 'failed', 'blocked', 'insufficient_credits')),
  monitor_id   uuid references public.scrape_monitors(id) on delete set null,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index if not exists scrape_runs_user_idx on public.scrape_runs (user_id, created_at desc);
create index if not exists scrape_runs_running_idx on public.scrape_runs (created_at) where status = 'running';
create index if not exists scrape_runs_hosts_idx on public.scrape_runs using gin (hosts);

alter table public.scrape_monitors enable row level security;
alter table public.scrape_monitor_alerts enable row level security;
alter table public.scrape_runs enable row level security;
revoke all on public.scrape_monitors, public.scrape_monitor_alerts, public.scrape_runs from anon, authenticated;
grant all on public.scrape_monitors, public.scrape_monitor_alerts, public.scrape_runs to service_role;
grant select on public.scrape_monitors, public.scrape_monitor_alerts, public.scrape_runs to authenticated;
drop policy if exists scrape_monitors_select_own on public.scrape_monitors;
create policy scrape_monitors_select_own on public.scrape_monitors for select to authenticated using (user_id = auth.uid());
drop policy if exists scrape_monitor_alerts_select_own on public.scrape_monitor_alerts;
create policy scrape_monitor_alerts_select_own on public.scrape_monitor_alerts for select to authenticated using (user_id = auth.uid());
drop policy if exists scrape_runs_select_own on public.scrape_runs;
create policy scrape_runs_select_own on public.scrape_runs for select to authenticated using (user_id = auth.uid());

-- Auditoria: navigator_audit ganha os tipos da coleta, do captcha e do consent gate.
-- (CHECK recriada como SUPERCONJUNTO: todos os valores da fase 2 continuam valendo.)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.navigator_audit'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.navigator_audit drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.navigator_audit add constraint navigator_audit_kind_check check (kind in (
  'session_start', 'session_end', 'task', 'secret_used', 'totp_used', 'code_entered',
  'approval_granted', 'approval_denied', 'auto_approved', 'takeover', 'release',
  'settings_changed', 'totp_consent',
  -- F5 (Scrapling, captcha, consent gate)
  'scrape', 'crawl', 'scrape_blocked', 'monitor_created', 'monitor_updated', 'monitor_deleted',
  'monitor_check', 'monitor_changed', 'captcha_detected', 'captcha_resumed',
  'consent_accepted', 'consent_required', 'consent_blocked'));

-- ═══ 2. Consent gate: aceites assinados (SÓ INSERÇÃO) ════════════════════

create table if not exists public.consent_acceptances (
  id                  uuid primary key default gen_random_uuid(),
  -- Sem FK com cascade de propósito: o registro do aceite é prova (LGPD art. 7º VI e art. 16)
  -- e a tabela é só-inserção (um cascade seria um DELETE). Ver docs/CONSENT_GATE.md.
  user_id             uuid not null,
  category            text not null check (category in ('web_scraping', 'third_party_automation', 'public_personal_data', 'financial_actions', 'ambiguous')),
  terms_version       text not null check (char_length(terms_version) <= 40),
  terms_sha256        text not null check (terms_sha256 ~ '^[0-9a-f]{64}$'),
  -- SHA-256 do documento + dados assinados (é o que vai para o Bitcoin via OpenTimestamps)
  digest_sha256       text not null unique check (digest_sha256 ~ '^[0-9a-f]{64}$'),
  location_kind       text not null check (location_kind in ('precise', 'approximate')),
  -- Payload assinado inteiro (nome, documento tipo/número/país, endereço, organização,
  -- localização, IP, user agent, data, nonce), CIFRADO com AES-256-GCM (CONNECTOR_ENC_KEY).
  payload_ciphertext  text not null,
  payload_iv          text not null,
  payload_tag         text not null,
  -- Só para exibir ao usuário (ex.: "***.456.***-09"); nunca o número inteiro em claro.
  document_masked     text check (document_masked is null or char_length(document_masked) <= 40),
  accepted_at         timestamptz not null default now()
);
create index if not exists consent_acceptances_user_idx on public.consent_acceptances (user_id, category, terms_version);

create or replace function public.consent_insert_only() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'consent tables are insert-only (% blocked on %)', tg_op, tg_table_name;
end $$;

drop trigger if exists consent_acceptances_insert_only on public.consent_acceptances;
create trigger consent_acceptances_insert_only before update or delete on public.consent_acceptances
  for each row execute function public.consent_insert_only();

alter table public.consent_acceptances enable row level security;
revoke all on public.consent_acceptances from public, anon, authenticated;
grant select, insert on public.consent_acceptances to service_role;
revoke update, delete, truncate on public.consent_acceptances from service_role;
-- Sem policy para o cliente: o usuário vê o próprio status pela rota /api/consent/status
-- (só categoria, versão, data, hash e documento mascarado).

-- Prova OpenTimestamps (.ots): fica à parte porque o upgrade REESCREVE o arquivo;
-- assim o aceite continua só-inserção.
create table if not exists public.consent_timestamps (
  acceptance_id   uuid primary key references public.consent_acceptances(id),
  digest_sha256   text not null check (digest_sha256 ~ '^[0-9a-f]{64}$'),
  ots_proof       text check (ots_proof is null or char_length(ots_proof) <= 200000), -- base64 do arquivo .ots
  status          text not null default 'pending' check (status in ('pending', 'submit_failed', 'confirmed')),
  calendars       text[] not null default '{}',
  bitcoin_height  integer check (bitcoin_height is null or bitcoin_height > 0),
  attempts        integer not null default 0,
  last_error      text check (last_error is null or char_length(last_error) <= 300),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  confirmed_at    timestamptz
);
create index if not exists consent_timestamps_pending_idx on public.consent_timestamps (updated_at) where status <> 'confirmed';
alter table public.consent_timestamps enable row level security;
revoke all on public.consent_timestamps from public, anon, authenticated;
grant select, insert, update on public.consent_timestamps to service_role;
drop trigger if exists consent_timestamps_no_delete on public.consent_timestamps;
create trigger consent_timestamps_no_delete before delete on public.consent_timestamps
  for each row execute function public.consent_insert_only();

-- Auditoria do gate (pedidos classificados, bloqueios, pedidos de termo, aceites). Só-inserção.
create table if not exists public.consent_audit (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  surface     text not null check (surface in ('vertal_chat', 'vibe_code', 'scrape', 'navigator', 'monitor', 'admin')),
  level       text not null check (level in ('normal', 'sensitive', 'ambiguous', 'prohibited')),
  category    text check (category is null or char_length(category) <= 40),
  action      text not null check (action in ('allow', 'block', 'clarify', 'require_terms', 'accepted')),
  reason      text check (reason is null or char_length(reason) <= 300),
  source      text check (source is null or source in ('rules', 'llm', 'fallback')),
  -- SHA-256 do texto do pedido (o texto em si não é guardado aqui)
  text_sha256 text check (text_sha256 is null or text_sha256 ~ '^[0-9a-f]{64}$'),
  excerpt     text check (excerpt is null or char_length(excerpt) <= 200),
  created_at  timestamptz not null default now()
);
create index if not exists consent_audit_user_idx on public.consent_audit (user_id, created_at desc);
create index if not exists consent_audit_blocked_idx on public.consent_audit (created_at desc) where action = 'block';
drop trigger if exists consent_audit_insert_only on public.consent_audit;
create trigger consent_audit_insert_only before update or delete on public.consent_audit
  for each row execute function public.consent_insert_only();
alter table public.consent_audit enable row level security;
revoke all on public.consent_audit from public, anon, authenticated;
grant select, insert on public.consent_audit to service_role;

-- Acesso de admin aos dados pessoais do termo: cada leitura vira uma linha aqui. Só-inserção.
create table if not exists public.consent_admin_access_log (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid not null,
  acceptance_id  uuid references public.consent_acceptances(id),
  action         text not null check (action in ('list', 'view', 'verify')),
  reason         text check (reason is null or char_length(reason) <= 300),
  ip             text check (ip is null or char_length(ip) <= 64),
  created_at     timestamptz not null default now()
);
create index if not exists consent_admin_access_log_idx on public.consent_admin_access_log (created_at desc);
drop trigger if exists consent_admin_access_log_insert_only on public.consent_admin_access_log;
create trigger consent_admin_access_log_insert_only before update or delete on public.consent_admin_access_log
  for each row execute function public.consent_insert_only();
alter table public.consent_admin_access_log enable row level security;
revoke all on public.consent_admin_access_log from public, anon, authenticated;
grant select, insert on public.consent_admin_access_log to service_role;

comment on table public.scrape_monitors is 'Coleta web (Scrapling): monitores de página por usuário (URL, seletor, frequência, último valor, diff).';
comment on table public.scrape_monitor_alerts is 'Coleta web (Scrapling): alertas de mudança mostrados no chat.';
comment on table public.scrape_runs is 'Coleta web (Scrapling): tarefas (rate limit, capacidade, créditos).';
comment on table public.consent_acceptances is 'Consent gate: aceites assinados (só inserção; payload pessoal cifrado).';
comment on table public.consent_timestamps is 'Consent gate: prova OpenTimestamps (.ots) do digest de cada aceite.';
comment on table public.consent_audit is 'Consent gate: auditoria de classificação, bloqueios e aceites (só inserção).';
comment on table public.consent_admin_access_log is 'Consent gate: cada acesso de admin aos dados pessoais (só inserção).';

-- ═══ 3. Jobs agendados (pg_cron + pg_net, mesmo padrão do kubo-domain-transfer-poll) ══
-- Só agenda se existir no Vault o segredo 'vertal_scrape_cron_token' (o mesmo valor do
-- segredo SCRAPE_CRON_TOKEN do Worker). Sem o segredo, nada é agendado.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net')
     and exists (select 1 from vault.decrypted_secrets where name = 'vertal_scrape_cron_token') then
    perform cron.unschedule('vertal-scrape-monitors') where exists (select 1 from cron.job where jobname = 'vertal-scrape-monitors');
    perform cron.schedule('vertal-scrape-monitors', '*/15 * * * *', $job$
      select net.http_post(
        url := 'https://vertal.dev/api/scrape/cron',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'vertal_scrape_cron_token' limit 1)),
        body := jsonb_build_object('job', 'monitors'),
        timeout_milliseconds := 25000
      );
    $job$);
    perform cron.unschedule('vertal-consent-ots-upgrade') where exists (select 1 from cron.job where jobname = 'vertal-consent-ots-upgrade');
    perform cron.schedule('vertal-consent-ots-upgrade', '17 * * * *', $job$
      select net.http_post(
        url := 'https://vertal.dev/api/consent/cron',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'vertal_scrape_cron_token' limit 1)),
        body := jsonb_build_object('job', 'ots_upgrade'),
        timeout_milliseconds := 25000
      );
    $job$);
  end if;
end $$;
