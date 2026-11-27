-- VERTAL · cobrança v2 (ledger, avisos de crédito baixo, colunas extras no uso da API) + correção do gatilho de rate_limit_counters.
-- Origem: docs/vertal-code-ai/proposed-migration-billing-v2.sql (aplicada com o OK do Laércio em 2026-11-27).
-- 1) Extrato da cobrança v2 (varejo; a API continua em vertal_ai_usage)
create table if not exists public.vertal_billing_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('retail','wholesale')),
  kind text not null check (kind in ('chat','code','image','video','clone','scrape')),
  request_key text not null,
  cost_usd numeric(14,8) not null default 0,          -- nosso custo real
  billed_cost_usd numeric(14,8) not null default 0,   -- max(custo real, piso)
  floor_applied boolean not null default false,
  markup numeric(6,4) not null,
  credits_micro bigint not null default 0 check (credits_micro >= 0),
  debit_credits integer not null default 0,
  free boolean not null default false,
  free_window text,
  charge_status text not null default 'pending' check (charge_status in ('pending','charged','none','owed','free')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, request_key)
);
create index if not exists vertal_billing_ledger_user_idx on public.vertal_billing_ledger(user_id, created_at desc);
create index if not exists vertal_billing_ledger_free_idx on public.vertal_billing_ledger(user_id, free_window) where free;
alter table public.vertal_billing_ledger enable row level security;
create policy "vertal_billing_ledger: dono lê" on public.vertal_billing_ledger for select to authenticated using (user_id = auth.uid());
-- escrita só pela edge function (service role) via RPC abaixo.

-- 2) Registro atômico: grava (uma vez), decide o grátis sob trava, acumula a fração no mesmo
--    "carry" da API (vertal_ai_carry) e devolve quantos créditos INTEIROS debitar agora.
--    O débito usa execute_atomic_credit_deduction com idempotency_key 'vbill-<usage_id>'.
create or replace function public.vertal_billing_record(
  _user_id uuid, _channel text, _kind text, _request_key text,
  _cost_usd numeric, _billed_cost_usd numeric, _floor_applied boolean, _markup numeric,
  _credits_micro bigint, _free_requested boolean, _free_window text, _free_limit integer, _meta jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _usage_id uuid;
  _free boolean := false;
  _used integer;
  _carry bigint;
  _total bigint;
  _debit integer := 0;
begin
  if _credits_micro < 0 then raise exception 'credits_must_be_non_negative'; end if;
  if _markup < 1 then raise exception 'markup_below_cost'; end if;

  -- replay do mesmo pedido: nada muda, nada é cobrado de novo
  select id into _usage_id from public.vertal_billing_ledger where user_id = _user_id and request_key = _request_key;
  if _usage_id is not null then
    return jsonb_build_object('replayed', true, 'usage_id', _usage_id, 'debit_credits', 0,
      'free', (select free from public.vertal_billing_ledger where id = _usage_id));
  end if;

  if _free_requested and _channel = 'retail' and _free_window is not null and coalesce(_free_limit, 0) > 0 then
    perform pg_advisory_xact_lock(hashtext('vbill-free:' || _user_id::text || ':' || _free_window));
    select count(*) into _used from public.vertal_billing_ledger where user_id = _user_id and free and free_window = _free_window;
    _free := _used < _free_limit;
  end if;

  insert into public.vertal_billing_ledger (user_id, channel, kind, request_key, cost_usd, billed_cost_usd, floor_applied, markup,
                                            credits_micro, free, free_window, charge_status, meta)
  values (_user_id, _channel, _kind, _request_key, _cost_usd, _billed_cost_usd, _floor_applied, _markup,
          case when _free then 0 else _credits_micro end, _free, case when _free then _free_window else null end,
          case when _free then 'free' else 'pending' end, coalesce(_meta, '{}'::jsonb))
  on conflict (user_id, request_key) do nothing
  returning id into _usage_id;
  if _usage_id is null then
    select id into _usage_id from public.vertal_billing_ledger where user_id = _user_id and request_key = _request_key;
    return jsonb_build_object('replayed', true, 'usage_id', _usage_id, 'debit_credits', 0, 'free', false);
  end if;

  if not _free then
    insert into public.vertal_ai_carry (owner_id, carry_micro) values (_user_id, 0) on conflict (owner_id) do nothing;
    select carry_micro into _carry from public.vertal_ai_carry where owner_id = _user_id for update;
    _total := _carry + _credits_micro;
    _debit := floor(_total / 1000000);
    update public.vertal_ai_carry set carry_micro = _total - _debit::bigint * 1000000, updated_at = now() where owner_id = _user_id;
    update public.vertal_billing_ledger set debit_credits = _debit, charge_status = case when _debit = 0 then 'none' else 'pending' end where id = _usage_id;
  end if;
  return jsonb_build_object('replayed', false, 'usage_id', _usage_id, 'debit_credits', _debit, 'free', _free);
end;
$$;
revoke all on function public.vertal_billing_record(uuid, text, text, text, numeric, numeric, boolean, numeric, bigint, boolean, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.vertal_billing_record(uuid, text, text, text, numeric, numeric, boolean, numeric, bigint, boolean, text, integer, jsonb) to service_role;

-- 3) Avisos in-app (e dedupe do aviso de crédito baixo: um por usuário + ciclo de recarga)
create table if not exists public.vertal_billing_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('low_credit')),
  cycle_key text not null,                 -- 'topup:<credit_transactions.id>'
  locale text not null default 'en' check (locale in ('en','pt-BR')),
  title text not null,
  body text not null,
  meta jsonb not null default '{}'::jsonb,
  channels jsonb not null default '{}'::jsonb,  -- {"inApp":"sent","email":"sent|failed|no_email|off","crm":"logged|skipped|off"}
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, kind, cycle_key)
);
create index if not exists vertal_billing_notices_user_idx on public.vertal_billing_notices(user_id, created_at desc);
alter table public.vertal_billing_notices enable row level security;
create policy "vertal_billing_notices: dono lê" on public.vertal_billing_notices for select to authenticated using (user_id = auth.uid());
-- marcar como lido: só pela edge function (service role), filtrando pelo dono.

-- 4) Extrato da API: tipo, markup e custo considerado por linha (opcionais; linhas antigas ficam nulas)
alter table public.vertal_ai_usage add column if not exists kind text check (kind is null or kind in ('chat','code','image','video','clone','scrape'));
alter table public.vertal_ai_usage add column if not exists markup numeric(6,4);
alter table public.vertal_ai_usage add column if not exists cost_usd numeric(14,8);

-- 5) CORREÇÃO do gatilho quebrado em rate_limit_counters.
--    A migração 20260611233127 criou cleanup_old_rate_limits() apagando por "created_at", coluna que
--    a tabela NÃO tem (a coluna é window_start). Resultado: todo INSERT em rate_limit_counters
--    falha, e bump_rate_limit() falha junto (hoje o monitor de cota grava em ai_gateway_cache por isso).
--    Correção sem mudar o esquema: apagar pela janela.
create or replace function public.cleanup_old_rate_limits()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.rate_limit_counters where window_start < now() - interval '24 hours';
  return null;
end;
$$;
-- O gatilho existente (trigger_cleanup_rate_limits, AFTER INSERT FOR EACH STATEMENT) passa a funcionar
-- sem recriar. Verificação depois de aplicar:
--   select public.bump_rate_limit('selftest', '00000000-0000-0000-0000-000000000001', 60);  -- deve devolver 1
--     (antes: erro "column created_at does not exist"; user_id faz parte da PK, não pode ser null)
--   delete from public.rate_limit_counters where bucket_key = 'selftest';
