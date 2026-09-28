-- Create shortlinks table
create table if not exists shortlinks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  video_url text not null,
  video_duration_seconds int not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  view_count int not null default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id, video_url)
);

-- Create index for faster queries
create index shortlinks_user_id_idx on shortlinks(user_id);
create index shortlinks_status_idx on shortlinks(status);
create index shortlinks_created_at_idx on shortlinks(created_at);

-- Create daily shortlink rewards table
create table if not exists daily_shortlink_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_date date not null,
  base_reward int not null default 5,
  bonus_reward int not null default 0,
  total_reward int not null generated always as (base_reward + bonus_reward) stored,
  applied_at timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  unique(user_id, reward_date)
);

-- Create index for reward queries
create index daily_rewards_user_id_idx on daily_shortlink_rewards(user_id);
create index daily_rewards_date_idx on daily_shortlink_rewards(reward_date);

-- Create shortlink views tracking table
create table if not exists shortlink_views (
  id uuid primary key default gen_random_uuid(),
  shortlink_id uuid not null references shortlinks(id) on delete cascade,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone default now()
);

-- Create index for view tracking
create index shortlink_views_shortlink_id_idx on shortlink_views(shortlink_id);
create index shortlink_views_created_at_idx on shortlink_views(created_at);

-- Enable RLS
alter table shortlinks enable row level security;
alter table daily_shortlink_rewards enable row level security;
alter table shortlink_views enable row level security;

-- RLS Policies for shortlinks
create policy "Users can view their own shortlinks"
  on shortlinks
  for select
  using (auth.uid() = user_id or status = 'active');

create policy "Users can create shortlinks"
  on shortlinks
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own shortlinks"
  on shortlinks
  for update
  using (auth.uid() = user_id);

create policy "Users can delete their own shortlinks"
  on shortlinks
  for delete
  using (auth.uid() = user_id);

-- RLS Policies for daily rewards
create policy "Users can view their own rewards"
  on daily_shortlink_rewards
  for select
  using (auth.uid() = user_id);

-- RLS Policies for shortlink views (append-only)
create policy "Anyone can record views"
  on shortlink_views
  for insert
  with check (true);

create policy "Users can view analytics for their shortlinks"
  on shortlink_views
  for select
  using (
    shortlink_id in (
      select id from shortlinks where user_id = auth.uid()
    )
  );

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
  v_total := 5 + v_bonus; -- Base 5 + bonus

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

-- Function to record shortlink view
create or replace function record_shortlink_view(
  _shortlink_id uuid,
  _ip_address inet default null,
  _user_agent text default null
)
returns void as $$
begin
  -- Insert view record
  insert into shortlink_views (shortlink_id, ip_address, user_agent)
  values (_shortlink_id, _ip_address, _user_agent);

  -- Increment view count
  update shortlinks
  set view_count = view_count + 1
  where id = _shortlink_id;
end;
$$ language plpgsql security definer;

-- Function to get user shortlinks with stats
create or replace function get_user_shortlinks_with_stats(_user_id uuid)
returns table(
  id uuid,
  title text,
  description text,
  video_url text,
  video_duration_seconds int,
  status text,
  view_count int,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
) as $$
begin
  return query
  select
    s.id,
    s.title,
    s.description,
    s.video_url,
    s.video_duration_seconds,
    s.status,
    s.view_count,
    s.created_at,
    s.updated_at
  from shortlinks s
  where s.user_id = _user_id
  order by s.created_at desc;
end;
$$ language plpgsql security definer;

-- Function to check shortlink limits
create or replace function check_shortlink_limits(_user_id uuid)
returns table(
  active_count int,
  max_allowed int,
  can_create_more boolean,
  daily_base_reward int,
  daily_bonus_reward int,
  total_daily_reward int
) as $$
declare
  v_active_count int;
  v_bonus int;
begin
  select count(*) into v_active_count
  from shortlinks
  where user_id = _user_id and status = 'active';

  v_bonus := (v_active_count / 10) * 5;

  return query
  select
    v_active_count as active_count,
    10 as max_allowed,
    v_active_count < 10 as can_create_more,
    5 as daily_base_reward,
    v_bonus as daily_bonus_reward,
    5 + v_bonus as total_daily_reward;
end;
$$ language plpgsql security definer;

-- Trigger to update updated_at
create or replace function update_shortlinks_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger shortlinks_updated_at_trigger
before update on shortlinks
for each row
execute function update_shortlinks_updated_at();

-- Grant permissions
grant select, insert, update, delete on shortlinks to authenticated;
grant select, insert on daily_shortlink_rewards to authenticated;
grant insert on shortlink_views to anon, authenticated;
grant select on daily_shortlink_rewards to authenticated;
grant execute on function calculate_shortlink_rewards to authenticated;
grant execute on function record_shortlink_view to authenticated, anon;
grant execute on function get_user_shortlinks_with_stats to authenticated;
grant execute on function check_shortlink_limits to authenticated;
