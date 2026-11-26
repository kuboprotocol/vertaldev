-- App da Meta "Vertal Dev": pedidos de "Remover app" (deauthorize) e "Exclusão de dados".
-- O código de confirmação alimenta a página pública https://vertal.dev/data-deletion?code=…
-- O ID do usuário da Meta nunca fica em texto: só HMAC-SHA256 com o App Secret.
-- Só o servidor (service role, Edge Function meta-data-deletion) lê e grava.
create table if not exists public.meta_data_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('deauthorize', 'data_deletion')),
  confirmation_code text unique check (confirmation_code is null or confirmation_code ~ '^[A-Z2-7]{16}$'),
  meta_user_hash text not null check (meta_user_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'received' check (status in ('received', 'completed', 'pending_review')),
  removed_connections integer not null default 0 check (removed_connections >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists meta_data_requests_user_idx on public.meta_data_requests (meta_user_hash);

alter table public.meta_data_requests enable row level security;
revoke all on public.meta_data_requests from anon, authenticated;
