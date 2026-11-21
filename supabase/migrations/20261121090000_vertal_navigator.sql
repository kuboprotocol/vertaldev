-- Vertal Navigator (fase 1): sessões do navegador na nuvem (sandbox E2B) e
-- perfil persistente (cookies) por usuário. Só o Worker do vertal.dev (chave
-- secreta / service role) lê e escreve. Sem políticas para o cliente: tokens,
-- senhas da tela ao vivo e cookies nunca chegam ao banco em claro.
-- Cifra: AES-256-GCM com a CONNECTOR_ENC_KEY (mesmo formato do cofre kubo-secrets).
-- Idempotente: pode rodar de novo sem quebrar nada.

create table if not exists public.navigator_sessions (
  id                uuid primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  sandbox_id        text check (sandbox_id is null or sandbox_id ~ '^[A-Za-z0-9]{8,40}$'),
  status            text not null default 'starting' check (status in ('starting', 'active', 'ended')),
  -- {token do navd, senha de ver, senha de controlar}, cifrados juntos.
  secret_ciphertext text,
  secret_iv         text,
  secret_tag        text,
  started_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  billed_minutes    integer not null default 0 check (billed_minutes >= 0),
  last_activity_at  timestamptz,
  ended_at          timestamptz,
  end_reason        text check (end_reason is null or char_length(end_reason) <= 40),
  created_at        timestamptz not null default now()
);

-- Uma sessão viva por usuário: o "start" reaproveita; dois starts simultâneos não criam duas.
create unique index if not exists navigator_sessions_one_live_per_user
  on public.navigator_sessions (user_id) where status in ('starting', 'active');
create index if not exists navigator_sessions_live_idx
  on public.navigator_sessions (status, expires_at) where status in ('starting', 'active');
create index if not exists navigator_sessions_user_idx
  on public.navigator_sessions (user_id, started_at desc);

create table if not exists public.navigator_profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  ciphertext   text not null,
  iv           text not null,
  tag          text not null,
  cookie_count integer not null default 0 check (cookie_count >= 0),
  bytes        integer not null default 0 check (bytes >= 0 and bytes <= 1500000),
  updated_at   timestamptz not null default now()
);

alter table public.navigator_sessions enable row level security;
alter table public.navigator_profiles enable row level security;

revoke all on public.navigator_sessions from anon, authenticated;
revoke all on public.navigator_profiles from anon, authenticated;
grant all on public.navigator_sessions to service_role;
grant all on public.navigator_profiles to service_role;

comment on table public.navigator_sessions is 'Vertal Navigator: sessões do navegador E2B (Worker /api/navigator). Segredos cifrados com CONNECTOR_ENC_KEY.';
comment on table public.navigator_profiles is 'Vertal Navigator: cookies do navegador por usuário, cifrados (AES-GCM, CONNECTOR_ENC_KEY). Apagar = esquecer logins.';
