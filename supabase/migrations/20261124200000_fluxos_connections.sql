-- Vertal Fluxos: qual conexão do motor de fluxos é de qual usuário do Vertal Dev.
-- As credenciais ficam criptografadas no motor; aqui só o vínculo e o estado.
create table if not exists public.fluxos_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app_key text not null check (app_key ~ '^[a-z0-9-]{1,64}$'),
  fluxos_connection_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'connected', 'error')),
  screen_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, app_key)
);

alter table public.fluxos_connections enable row level security;

-- O usuário só lê as próprias conexões; gravação só pelo servidor (service role).
drop policy if exists "fluxos_connections_select_own" on public.fluxos_connections;
create policy "fluxos_connections_select_own" on public.fluxos_connections
  for select to authenticated using (auth.uid() = user_id);

revoke insert, update, delete on public.fluxos_connections from anon, authenticated;
grant select on public.fluxos_connections to authenticated;
