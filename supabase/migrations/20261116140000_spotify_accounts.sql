-- Conector Spotify: contas (refresh token criptografado) e estados OAuth (anti-CSRF).
-- Só as edge functions (service role) leem e escrevem. Sem políticas para o
-- cliente: o token nunca chega ao navegador.

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

-- Limpeza de estados expirados (ficam só alguns minutos).
create index if not exists spotify_oauth_states_expires_idx on public.spotify_oauth_states (expires_at);
