-- Production migration 20260927230940 "shortlinks_rewards_functions", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

-- Function to calculate daily rewards for a user
create or replace function calculate_shortlink_rewards(_user_id uuid, _reward_date date default current_date)
returns table(reward_date date, base_reward int, bonus_reward int, total_reward int, user_balance_after decimal) as $$
declare
  v_active_count int;
  v_bonus int;
  v_total int;
  v_current_balance decimal;
  v_new_balance decimal;
begin
  -- Count active shortlinks for this user
  select count(*) into v_active_count
  from shortlinks
  where user_id = _user_id and status = 'active';

  -- If no active shortlinks, no reward
  if v_active_count = 0 then
    return;
  end if;

  -- Calculate bonus: 5 credits per 10 shortlinks
  v_bonus := (v_active_count / 10) * 5;
  v_total := 5 + v_bonus;

  -- Check if reward already applied for this date
  if exists(select 1 from daily_shortlink_rewards where user_id = _user_id and reward_date = _reward_date) then
    -- Return existing reward
    return query
    select
      _reward_date,
      base_reward,
      bonus_reward,
      total_reward,
      (select balance from user_credits where user_id = _user_id limit 1) as user_balance_after
    from daily_shortlink_rewards
    where user_id = _user_id and reward_date = _reward_date;
    return;
  end if;

  -- Get current balance
  select balance into v_current_balance from user_credits where user_id = _user_id;
  v_current_balance := coalesce(v_current_balance, 0);

  -- Insert reward record
  insert into daily_shortlink_rewards (user_id, reward_date, base_reward, bonus_reward)
  values (_user_id, _reward_date, 5, v_bonus)
  on conflict (user_id, reward_date) do nothing;

  -- Update user credits
  update user_credits
  set balance = balance + v_total, updated_at = now()
  where user_id = _user_id;

  v_new_balance := v_current_balance + v_total;

  -- Return calculated reward
  return query
  select
    _reward_date,
    5 as base_reward,
    v_bonus as bonus_reward,
    v_total as total_reward,
    v_new_balance as user_balance_after;
end;
$$ language plpgsql security definer;

-- Grant permissions
grant execute on function calculate_shortlink_rewards(uuid, date) to authenticated, service_role;
