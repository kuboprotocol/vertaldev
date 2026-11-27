-- Vertal · Clonador de voz (Vertal Chat + Studio de Música). Puramente aditivo: duas tabelas novas.
-- Nada usa estas tabelas enquanto VERTAL_OWN_VOICE_ENABLED não estiver ligado (padrão: desligado).
-- Escrita só pela edge function creative-music (service role); o usuário só LÊ as próprias linhas.

create table if not exists public.vertal_voice_clones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  -- Amostra no bucket privado "uploads", sempre em <user_id>/voices/...
  sample_path text not null,
  sample_mime text not null,
  sample_seconds numeric(6,1) not null,
  language text not null default 'pt',
  -- Consentimento: versão e texto exatos que o servidor mostrou, gravados antes de qualquer uso.
  consent_version text not null,
  consent_text text not null,
  consent_accepted_at timestamptz not null default now(),
  consent_ip text,
  consent_user_agent text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists vertal_voice_clones_user_idx
  on public.vertal_voice_clones (user_id, created_at desc) where deleted_at is null;

create table if not exists public.vertal_voice_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  voice_id uuid references public.vertal_voice_clones(id) on delete set null,
  kind text not null check (kind in ('speak', 'sing')),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  provider_job_id text not null,
  input jsonb not null default '{}'::jsonb,
  output_path text,
  output_url text,
  credits integer not null default 0,
  charged boolean not null default false,
  charge_key text,
  refunded boolean not null default false,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists vertal_voice_jobs_user_idx on public.vertal_voice_jobs (user_id, created_at desc);

alter table public.vertal_voice_clones enable row level security;
alter table public.vertal_voice_jobs enable row level security;

drop policy if exists "vertal_voice_clones_select_own" on public.vertal_voice_clones;
create policy "vertal_voice_clones_select_own" on public.vertal_voice_clones
  for select to authenticated using (auth.uid() = user_id and deleted_at is null);

drop policy if exists "vertal_voice_jobs_select_own" on public.vertal_voice_jobs;
create policy "vertal_voice_jobs_select_own" on public.vertal_voice_jobs
  for select to authenticated using (auth.uid() = user_id);

revoke insert, update, delete on public.vertal_voice_clones from anon, authenticated;
revoke insert, update, delete on public.vertal_voice_jobs from anon, authenticated;
grant select on public.vertal_voice_clones to authenticated;
grant select on public.vertal_voice_jobs to authenticated;
