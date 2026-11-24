-- VERTAL Code AI — migração PROPOSTA (NÃO APLICADA, fora de supabase/migrations de propósito).
-- Para aplicar: revisar, copiar para supabase/migrations/<timestamp>_vertal_code_ai.sql e
-- aplicar deliberadamente (o deploy não roda db push; ver .github/workflows/deploy.yml).
-- Nada aqui altera tabelas existentes.

-- 1) Chaves da API VERTAL (só o hash SHA-256 fica guardado)
create table if not exists public.vertal_ai_api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  key_hash text not null unique,
  key_prefix text not null,
  monthly_cap_credits numeric check (monthly_cap_credits is null or monthly_cap_credits >= 0),
  rpm integer not null default 20 check (rpm between 1 and 600),
  spent_micro bigint not null default 0,
  spent_period text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);
create index if not exists vertal_ai_api_keys_owner_idx on public.vertal_ai_api_keys(owner_id);
alter table public.vertal_ai_api_keys enable row level security;
-- O dono vê as próprias chaves (sem o hash pela view abaixo); criar/revogar só pela edge function (service role).
create policy "vertal_ai_api_keys: dono lê" on public.vertal_ai_api_keys for select to authenticated using (owner_id = auth.uid());

-- 2) Uso medido por pedido (idempotente por chave + request_id)
create table if not exists public.vertal_ai_usage (
  id uuid primary key default gen_random_uuid(),
  key_id uuid not null references public.vertal_ai_api_keys(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  model text not null,
  cost_class text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  cost_micro bigint not null default 0,
  debit_credits integer not null default 0,
  charge_status text not null default 'pending' check (charge_status in ('pending','charged','none','owed')),
  response jsonb,
  created_at timestamptz not null default now(),
  unique (key_id, request_id)
);
create index if not exists vertal_ai_usage_owner_idx on public.vertal_ai_usage(owner_id, created_at desc);
alter table public.vertal_ai_usage enable row level security;
create policy "vertal_ai_usage: dono lê" on public.vertal_ai_usage for select to authenticated using (owner_id = auth.uid());

-- 3) Fração de crédito acumulada por dono (microcréditos < 1.000.000)
create table if not exists public.vertal_ai_carry (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  carry_micro bigint not null default 0 check (carry_micro >= 0 and carry_micro < 1000000),
  updated_at timestamptz not null default now()
);
alter table public.vertal_ai_carry enable row level security;
create policy "vertal_ai_carry: dono lê" on public.vertal_ai_carry for select to authenticated using (owner_id = auth.uid());

-- 4) Registro atômico do uso: grava a linha (uma vez), acumula a fração e soma no gasto da chave.
--    Devolve quantos créditos INTEIROS debitar agora (o débito em si usa execute_atomic_credit_deduction
--    com idempotency_key 'vai-<usage_id>').
create or replace function public.vertal_ai_record_usage(
  _key_id uuid, _owner_id uuid, _request_id text, _model text, _cost_class text,
  _prompt_tokens integer, _completion_tokens integer, _cost_micro bigint, _response jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _usage_id uuid;
  _carry bigint;
  _total bigint;
  _debit integer;
  _period text := to_char(now() at time zone 'utc', 'YYYY-MM');
begin
  if _cost_micro < 0 then raise exception 'cost_must_be_non_negative'; end if;
  insert into public.vertal_ai_usage (key_id, owner_id, request_id, model, cost_class, prompt_tokens, completion_tokens, cost_micro, response)
  values (_key_id, _owner_id, _request_id, _model, _cost_class, _prompt_tokens, _completion_tokens, _cost_micro, _response)
  on conflict (key_id, request_id) do nothing
  returning id into _usage_id;
  if _usage_id is null then
    select id into _usage_id from public.vertal_ai_usage where key_id = _key_id and request_id = _request_id;
    return jsonb_build_object('replayed', true, 'usage_id', _usage_id, 'debit_credits', 0);
  end if;

  insert into public.vertal_ai_carry (owner_id, carry_micro) values (_owner_id, 0) on conflict (owner_id) do nothing;
  select carry_micro into _carry from public.vertal_ai_carry where owner_id = _owner_id for update;
  _total := _carry + _cost_micro;
  _debit := floor(_total / 1000000);
  update public.vertal_ai_carry set carry_micro = _total - _debit::bigint * 1000000, updated_at = now() where owner_id = _owner_id;

  update public.vertal_ai_api_keys
     set spent_micro = case when spent_period = _period then spent_micro + _cost_micro else _cost_micro end,
         spent_period = _period,
         last_used_at = now()
   where id = _key_id;

  update public.vertal_ai_usage set debit_credits = _debit, charge_status = case when _debit = 0 then 'none' else 'pending' end where id = _usage_id;
  return jsonb_build_object('replayed', false, 'usage_id', _usage_id, 'debit_credits', _debit);
end;
$$;
revoke all on function public.vertal_ai_record_usage(uuid, uuid, text, text, text, integer, integer, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.vertal_ai_record_usage(uuid, uuid, text, text, text, integer, integer, bigint, jsonb) to service_role;

-- 5) Agente de operação: aprovações (uso único) e auditoria cifrada (mesmo formato do navigator_audit)
create table if not exists public.vertal_ai_approvals (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  tool text not null,
  args jsonb not null,
  args_hash text not null,
  status text not null default 'pending' check (status in ('pending','executing','done','failed','rejected','expired')),
  result jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz
);
alter table public.vertal_ai_approvals enable row level security;
-- sem policy para authenticated: só a edge function (service role) lê e escreve.

create table if not exists public.vertal_ai_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  detail_ciphertext text,
  detail_iv text,
  detail_tag text,
  key_version smallint,
  created_at timestamptz not null default now()
);
create index if not exists vertal_ai_audit_user_idx on public.vertal_ai_audit(user_id, created_at desc);
alter table public.vertal_ai_audit enable row level security;
-- sem policy: leitura e escrita só pela edge function; o conteúdo sensível vai cifrado (AES-256-GCM, AAD amarrado ao dono e ao tipo).
