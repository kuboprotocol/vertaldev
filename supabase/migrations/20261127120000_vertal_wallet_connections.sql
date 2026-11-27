-- Vertal · conector MetaMask (aditivo). NÃO aplicada automaticamente: aplicar só com a aprovação do Laércio.
--
-- Guarda SÓ: endereço público da carteira, chain id e data da conexão. Uma carteira por usuário.
-- Nunca frase-semente, chave privada, assinatura ou saldo.
-- Escrita só pela edge function (service role) depois de conferir a assinatura SIWE (EIP-4361).
-- O usuário lê e apaga a própria linha (RLS).

create table if not exists public.vertal_wallet_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  address text not null check (address ~ '^0x[0-9a-f]{40}$'),
  chain_id bigint not null check (chain_id > 0),
  connected_at timestamptz not null default now()
);

comment on table public.vertal_wallet_connections is
  'Vertal · conector MetaMask: só endereço público, chain id e data (SIWE). Sem chaves, sem frase-semente.';

alter table public.vertal_wallet_connections enable row level security;

drop policy if exists "vertal_wallet_select_own" on public.vertal_wallet_connections;
create policy "vertal_wallet_select_own" on public.vertal_wallet_connections
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "vertal_wallet_delete_own" on public.vertal_wallet_connections;
create policy "vertal_wallet_delete_own" on public.vertal_wallet_connections
  for delete to authenticated using (auth.uid() = user_id);

-- Permissões explícitas: anon não vê nada; o usuário logado só lê/apaga (e o RLS limita à própria linha);
-- só o service role (edge function vertal-code-ai, ação "wallet") grava.
revoke all on public.vertal_wallet_connections from anon, authenticated;
grant select, delete on public.vertal_wallet_connections to authenticated;
grant all on public.vertal_wallet_connections to service_role;
