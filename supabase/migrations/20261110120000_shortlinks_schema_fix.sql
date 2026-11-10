-- Corrige o schema de shortlinks em produção.
--
-- Em produção, public.shortlinks (e shortlink_views) ainda tinham o formato antigo
-- (slug, destination_url, is_active). A migração 20260927060000 usa CREATE TABLE IF NOT EXISTS,
-- então pulou a criação do formato novo, e as funções get_user_shortlinks_with_stats e
-- check_shortlink_limits (já criadas) quebram com "column user_id does not exist".
--
-- Esta migração preserva as tabelas antigas com sufixo _legacy (a tabela antiga tinha 10
-- linhas; shortlink_views tinha 0) e cria o formato novo. As funções não são recriadas.

alter table public.shortlinks rename to shortlinks_legacy;
alter index public.shortlinks_pkey rename to shortlinks_legacy_pkey;
alter index public.shortlinks_slug_key rename to shortlinks_legacy_slug_key;

alter table public.shortlink_views rename to shortlink_views_legacy;
alter index public.shortlink_views_pkey rename to shortlink_views_legacy_pkey;

create table public.shortlinks (
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

create index shortlinks_user_id_idx on public.shortlinks(user_id);
create index shortlinks_status_idx on public.shortlinks(status);
create index shortlinks_created_at_idx on public.shortlinks(created_at);

create table public.shortlink_views (
  id uuid primary key default gen_random_uuid(),
  shortlink_id uuid not null references public.shortlinks(id) on delete cascade,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone default now()
);

create index shortlink_views_shortlink_id_idx on public.shortlink_views(shortlink_id);
create index shortlink_views_created_at_idx on public.shortlink_views(created_at);

grant select, insert, update, delete on public.shortlinks to authenticated;
grant all on public.shortlinks to service_role;
grant select, insert on public.shortlink_views to authenticated;
grant all on public.shortlink_views to service_role;

alter table public.shortlinks enable row level security;
alter table public.shortlink_views enable row level security;

create policy "Users can view their own shortlinks"
  on public.shortlinks for select
  using (auth.uid() = user_id or status = 'active');

create policy "Users can create shortlinks"
  on public.shortlinks for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own shortlinks"
  on public.shortlinks for update
  using (auth.uid() = user_id);

create policy "Users can delete their own shortlinks"
  on public.shortlinks for delete
  using (auth.uid() = user_id);

create policy "Anyone can record views"
  on public.shortlink_views for insert
  with check (true);

create policy "Users can view analytics for their shortlinks"
  on public.shortlink_views for select
  using (
    shortlink_id in (
      select id from public.shortlinks where user_id = auth.uid()
    )
  );
