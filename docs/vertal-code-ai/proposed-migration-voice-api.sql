-- VERTAL AI API · voz clonada (marca branca) — migração PROPOSTA (NÃO APLICADA; mesmo esquema das outras de
-- docs/vertal-code-ai). Depende de proposed-migration.sql (vertal_ai_api_keys / vertal_ai_usage) e, para o extrato
-- por tipo, de proposed-migration-billing-v2.sql. Puramente aditiva: duas tabelas novas + 2 tipos no ledger.

create table if not exists public.vertal_api_voices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,   -- cliente da API (dono da chave)
  key_id uuid references public.vertal_ai_api_keys(id) on delete set null,
  end_user text not null check (char_length(end_user) between 1 and 128), -- usuário final no app do cliente
  name text not null check (char_length(name) between 1 and 60),
  language text,
  sample_path text not null,                                            -- bucket privado "uploads": <owner>/voices/api/…
  sample_mime text not null,
  sample_seconds numeric(6,1) not null,
  consent_version text not null,
  consent_text text not null,
  consent_attestation jsonb not null,                                   -- atestado do usuário final (quem, quando, IP…)
  consent_ip text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists vertal_api_voices_owner_user_idx on public.vertal_api_voices (owner_id, end_user, created_at desc) where deleted_at is null;

create table if not exists public.vertal_api_voice_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  key_id uuid references public.vertal_ai_api_keys(id) on delete set null,
  end_user text not null,
  voice_id uuid references public.vertal_api_voices(id) on delete set null,
  kind text not null check (kind in ('speak', 'sing')),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  provider_job_id text not null,
  input jsonb not null default '{}'::jsonb,
  output_path text,
  output_url text,
  gpu_seconds numeric(8,1),
  gpu text,
  cost_usd numeric(12,6),
  price_micro bigint,
  usage_id uuid,
  charged boolean not null default false,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists vertal_api_voice_jobs_owner_idx on public.vertal_api_voice_jobs (owner_id, created_at desc);

alter table public.vertal_api_voices enable row level security;
alter table public.vertal_api_voice_jobs enable row level security;
-- Escrita só pela edge function vertal-ai-api (service role). O cliente da API lê as próprias linhas.
drop policy if exists "vertal_api_voices: dono lê" on public.vertal_api_voices;
create policy "vertal_api_voices: dono lê" on public.vertal_api_voices for select to authenticated using (owner_id = auth.uid() and deleted_at is null);
drop policy if exists "vertal_api_voice_jobs: dono lê" on public.vertal_api_voice_jobs;
create policy "vertal_api_voice_jobs: dono lê" on public.vertal_api_voice_jobs for select to authenticated using (owner_id = auth.uid());
revoke insert, update, delete on public.vertal_api_voices from anon, authenticated;
revoke insert, update, delete on public.vertal_api_voice_jobs from anon, authenticated;

-- Ledger da cobrança v2: aceitar os tipos de voz (só se a tabela já existir).
do $$
begin
  if to_regclass('public.vertal_billing_ledger') is not null then
    alter table public.vertal_billing_ledger drop constraint if exists vertal_billing_ledger_kind_check;
    alter table public.vertal_billing_ledger add constraint vertal_billing_ledger_kind_check
      check (kind in ('chat','code','image','video','clone','scrape','voice','singing'));
  end if;
end $$;

-- APLICADA em 2026-11-27 como supabase/migrations/20261127220200_vertal_api_voices.sql (que também libera
-- 'voice'/'singing' em vertal_ai_usage.kind). Este arquivo fica só como referência.
