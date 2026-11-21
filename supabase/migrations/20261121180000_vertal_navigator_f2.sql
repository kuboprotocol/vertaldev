-- Vertal Navigator (fase 2): preferências por usuário (aprovação automática de
-- pagamento, desligada por padrão) e auditoria das ações (sessões, tarefas,
-- segredos usados — só NOMES —, códigos 2FA, aprovações e recusas).
-- Só o Worker do vertal.dev (service role) escreve. O usuário lê a própria
-- auditoria pela rota /api/navigator/activity (o Worker filtra por user_id);
-- a política de SELECT abaixo é defesa extra caso alguém leia direto.
-- Idempotente: pode rodar de novo sem quebrar nada.

create table if not exists public.navigator_settings (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  -- Por padrão SEMPRE pedir aprovação. Ligar exige clique explícito na tela.
  auto_approve_enabled    boolean not null default false,
  -- Em centavos de real; teto duro de R$ 1.000,00 (também validado no Worker).
  auto_approve_max_cents  integer not null default 0 check (auto_approve_max_cents >= 0 and auto_approve_max_cents <= 100000),
  updated_at              timestamptz not null default now(),
  constraint navigator_settings_enabled_needs_limit check (not auto_approve_enabled or auto_approve_max_cents > 0)
);

create table if not exists public.navigator_audit (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  session_id  uuid references public.navigator_sessions(id) on delete set null,
  kind        text not null check (kind in (
                'session_start', 'session_end', 'task', 'secret_used', 'totp_used', 'code_entered',
                'approval_granted', 'approval_denied', 'auto_approved', 'takeover', 'release',
                'settings_changed', 'totp_consent')),
  -- Só metadados (nome do segredo, host, loja, total, botão). Nunca valor de segredo, código ou cookie.
  detail      jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 8192),
  created_at  timestamptz not null default now()
);

create index if not exists navigator_audit_user_idx on public.navigator_audit (user_id, created_at desc);
create index if not exists navigator_audit_session_idx on public.navigator_audit (session_id) where session_id is not null;

alter table public.navigator_settings enable row level security;
alter table public.navigator_audit enable row level security;

revoke all on public.navigator_settings from anon, authenticated;
revoke all on public.navigator_audit from anon, authenticated;
grant all on public.navigator_settings to service_role;
grant all on public.navigator_audit to service_role;

-- Leitura da própria auditoria (sem escrita pelo cliente).
grant select on public.navigator_audit to authenticated;
drop policy if exists navigator_audit_select_own on public.navigator_audit;
create policy navigator_audit_select_own on public.navigator_audit
  for select to authenticated using (user_id = auth.uid());

comment on table public.navigator_settings is 'Vertal Navigator: preferências por usuário (aprovação automática de pagamento até R$X; desligada por padrão).';
comment on table public.navigator_audit is 'Vertal Navigator: auditoria (sessões, tarefas, nomes de segredos usados, 2FA, aprovações/recusas de pagamento).';
