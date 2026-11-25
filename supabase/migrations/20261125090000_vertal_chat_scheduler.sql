-- Vertal Chat · Agendador (tarefas agendadas, lembretes, consultas e gatilhos de e-mail).
-- Só ADITIVO: tabelas novas, RLS por usuário (só leitura do que é dele; escrita pela edge
-- function vertal-chat-scheduler com service role) e uma função de "claim" para o pg_cron.
-- O job do pg_cron fica em docs/VERTAL-CHAT-AGENDADOR.md (a chave vem do Vault, aplicado à mão).

create table if not exists public.chat_scheduler_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'America/Sao_Paulo',
  quiet_start text,
  quiet_end text,
  notify_email boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_scheduled_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid,
  kind text not null check (kind in ('task', 'reminder', 'appointment', 'email_trigger')),
  title text not null,
  prompt text not null default '',
  spec jsonb not null default '{}'::jsonb,
  schedule jsonb not null,
  timezone text not null default 'America/Sao_Paulo',
  trigger jsonb,
  branches jsonb,
  send_to text[] not null default '{}',
  notify_email boolean not null default false,
  allow_app_actions boolean not null default false,
  ignore_quiet boolean not null default false,
  appointment_id uuid,
  status text not null default 'active' check (status in ('active', 'paused', 'done', 'failed')),
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  attempts integer not null default 0,
  run_count integer not null default 0,
  locked_until timestamptz,
  email_checked_at timestamptz,
  source text not null default 'vertal_chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_scheduled_tasks_due_idx on public.chat_scheduled_tasks (next_run_at) where status = 'active';
create index if not exists chat_scheduled_tasks_user_idx on public.chat_scheduled_tasks (user_id, status);

create table if not exists public.chat_task_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.chat_scheduled_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger text not null default 'schedule' check (trigger in ('schedule', 'retry', 'manual', 'email')),
  status text not null default 'running' check (status in ('running', 'ok', 'error', 'skipped')),
  attempt integer not null default 1,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  output text,
  error text,
  email_message_id text,
  sentiment text check (sentiment is null or sentiment in ('positive', 'negative', 'neutral')),
  tools text[],
  message_id uuid,
  est_cost_usd numeric(12, 6) not null default 0,
  est_credits numeric(10, 2) not null default 0,
  seen_at timestamptz
);
create index if not exists chat_task_runs_task_idx on public.chat_task_runs (task_id, started_at desc);
create index if not exists chat_task_runs_unseen_idx on public.chat_task_runs (user_id) where seen_at is null;

-- Dedupe: cada e-mail dispara um gatilho uma única vez.
create table if not exists public.chat_email_trigger_seen (
  task_id uuid not null references public.chat_scheduled_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id text not null,
  seen_at timestamptz not null default now(),
  primary key (task_id, message_id)
);

-- Agenda interna do Vertal (consultas/compromissos), espelhada no Google Agenda quando houver permissão.
create table if not exists public.chat_agenda_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.chat_scheduled_tasks(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  notes text,
  timezone text not null default 'America/Sao_Paulo',
  provider text not null default 'vertal' check (provider in ('vertal', 'google')),
  google_event_id text,
  add_to_google_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_agenda_events_user_idx on public.chat_agenda_events (user_id, starts_at);

alter table public.chat_scheduler_settings enable row level security;
alter table public.chat_scheduled_tasks enable row level security;
alter table public.chat_task_runs enable row level security;
alter table public.chat_email_trigger_seen enable row level security;
alter table public.chat_agenda_events enable row level security;

drop policy if exists "own scheduler settings" on public.chat_scheduler_settings;
create policy "own scheduler settings" on public.chat_scheduler_settings for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own scheduled tasks" on public.chat_scheduled_tasks;
create policy "own scheduled tasks" on public.chat_scheduled_tasks for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own task runs" on public.chat_task_runs;
create policy "own task runs" on public.chat_task_runs for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own email trigger seen" on public.chat_email_trigger_seen;
create policy "own email trigger seen" on public.chat_email_trigger_seen for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own agenda events" on public.chat_agenda_events;
create policy "own agenda events" on public.chat_agenda_events for select to authenticated using (auth.uid() = user_id);

grant select on table public.chat_scheduler_settings, public.chat_scheduled_tasks, public.chat_task_runs,
  public.chat_email_trigger_seen, public.chat_agenda_events to authenticated;
grant all on table public.chat_scheduler_settings, public.chat_scheduled_tasks, public.chat_task_runs,
  public.chat_email_trigger_seen, public.chat_agenda_events to service_role;
revoke insert, update, delete on public.chat_scheduler_settings, public.chat_scheduled_tasks, public.chat_task_runs,
  public.chat_email_trigger_seen, public.chat_agenda_events from anon, authenticated;

-- Pega as tarefas vencidas sem disputa entre execuções (FOR UPDATE SKIP LOCKED) e trava por 4 min.
create or replace function public.chat_scheduler_claim(p_limit integer default 10, p_users uuid[] default null)
returns setof public.chat_scheduled_tasks
language sql
security definer
set search_path = public
as $$
  update public.chat_scheduled_tasks t
     set locked_until = now() + interval '4 minutes'
   where t.id in (
     select id from public.chat_scheduled_tasks
      where status = 'active'
        and next_run_at <= now()
        and (locked_until is null or locked_until < now())
        and (p_users is null or user_id = any (p_users))
      order by next_run_at
      limit greatest(1, least(p_limit, 50))
      for update skip locked
   )
  returning t.*;
$$;
revoke all on function public.chat_scheduler_claim(integer, uuid[]) from public, anon, authenticated;
grant execute on function public.chat_scheduler_claim(integer, uuid[]) to service_role;
