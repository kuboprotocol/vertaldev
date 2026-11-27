-- Create consolidated user_credits table
-- This consolidates all credit balance tracking into a single source of truth

-- Create the table
create table user_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  balance integer not null default 0,
  debt integer not null default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create indexes for performance
create index idx_user_credits_user_id on user_credits(user_id);
create index idx_user_credits_balance on user_credits(balance);

-- Enable RLS
alter table user_credits enable row level security;

-- RLS Policies
create policy "Users can view their own credits"
  on user_credits
  for select
  using (auth.uid() = user_id);

create policy "Users can update their own credits"
  on user_credits
  for update
  using (auth.uid() = user_id);

-- Admin/service role policy for updates
create policy "Service role can update user credits"
  on user_credits
  for update
  using (auth.role() = 'service_role' or auth.role() = 'postgres');

-- Migrate existing subscription credit balances to user_credits
-- This uses INSERT ... ON CONFLICT to handle edge cases where user_credits might already exist
insert into user_credits (user_id, balance, created_at, updated_at)
select user_id, edits_limit, created_at, updated_at from subscriptions
on conflict (user_id) do update
set balance = excluded.balance;

-- Create function to apply debt deduction from daily earnings
create or replace function apply_credit_debt(
  _user_id uuid,
  _reward_amount integer
) returns table(
  reward_applied integer,
  debt_paid integer,
  new_balance integer,
  new_debt integer
) as $$
declare
  _current_balance integer;
  _current_debt integer;
  _debt_payment integer;
  _final_balance integer;
begin
  -- Get current balance and debt
  select balance, debt into _current_balance, _current_debt
  from user_credits
  where user_id = _user_id
  for update;

  -- Calculate debt payment from reward (debt takes priority)
  _debt_payment := least(_reward_amount, _current_debt);

  -- Calculate remaining reward after debt payment
  _reward_applied := _reward_amount - _debt_payment;

  -- Calculate new balance and debt
  _final_balance := _current_balance + _reward_applied;
  _new_debt := _current_debt - _debt_payment;

  -- Update user_credits
  update user_credits
  set
    balance = _final_balance,
    debt = _new_debt,
    updated_at = now()
  where user_id = _user_id;

  return query select
    _reward_applied as reward_applied,
    _debt_payment as debt_paid,
    _final_balance as new_balance,
    _new_debt as new_debt;
end;
$$ language plpgsql security definer set search_path = public;

-- Grant execute permissions
grant execute on function apply_credit_debt(uuid, integer) to service_role;

-- Create function to get user credits with safety
create or replace function get_user_credits(_user_id uuid) returns table(
  balance integer,
  debt integer,
  available_balance integer
) as $$
begin
  return query
  select
    uc.balance,
    uc.debt,
    (uc.balance - uc.debt) as available_balance
  from user_credits uc
  where uc.user_id = _user_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Grant execute permissions
grant execute on function get_user_credits(uuid) to service_role;

-- Create audit trigger to track changes
create table user_credits_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  balance_before integer,
  balance_after integer,
  debt_before integer,
  debt_after integer,
  reason text,
  changed_by text,
  created_at timestamp with time zone default now()
);

-- Create trigger to log changes
create or replace function audit_user_credits_changes()
returns trigger as $$
begin
  insert into user_credits_audit (
    user_id,
    balance_before,
    balance_after,
    debt_before,
    debt_after,
    reason,
    changed_by
  ) values (
    new.user_id,
    old.balance,
    new.balance,
    old.debt,
    new.debt,
    'system_update',
    auth.role()::text
  );

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger user_credits_audit_trigger
  after update on user_credits
  for each row
  execute function audit_user_credits_changes();

-- Create index on audit table for quick lookups
create index idx_user_credits_audit_user_id on user_credits_audit(user_id);
create index idx_user_credits_audit_created_at on user_credits_audit(created_at);
