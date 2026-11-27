-- Production migration 20261116202121 "spotify_accounts", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

create table if not exists public.spotify_oauth_states (
  nonce text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  origin text not null,
  return_url text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz
);

create table if not exists public.spotify_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  spotify_user_id text,
  refresh_token_ciphertext text not null,
  refresh_token_iv text not null,
  refresh_token_tag text not null,
  access_token_cache text,
  access_token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.spotify_oauth_states enable row level security;
alter table public.spotify_accounts enable row level security;

revoke all on public.spotify_oauth_states from anon, authenticated;
revoke all on public.spotify_accounts from anon, authenticated;
grant all on public.spotify_oauth_states to service_role;
grant all on public.spotify_accounts to service_role;

create index if not exists spotify_oauth_states_expires_idx on public.spotify_oauth_states (expires_at);
