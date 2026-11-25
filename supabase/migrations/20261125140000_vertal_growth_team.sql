-- Vertal Growth Team · tabelas novas (aditivo: não altera nenhuma tabela existente).
-- Escrita só pela edge function vertal-code-ai (service role); o dono lê e apaga os próprios dados.
-- LGPD: contatos de captação são empresariais (Prospector); clientes/doadores vêm da conta Stripe do
-- próprio dev ou são adicionados por ele com declaração de relação prévia. Apagar a pedido = delete_contact.

create table if not exists public.growth_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  project_name text not null,
  project_url text,
  description text,
  model text not null check (model in ('b2b', 'b2c', 'nonprofit')),
  subscription boolean not null default false,
  lang text not null default 'pt',
  profile jsonb not null default '{}'::jsonb,
  prospector_campaign_id uuid references public.prospector_campaigns(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  settings jsonb not null default '{}'::jsonb,
  team jsonb not null default '{}'::jsonb,
  charge_key text,
  charge jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, charge_key)
);

create table if not exists public.growth_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  growth_id uuid not null references public.growth_campaigns(id) on delete cascade,
  lead_id uuid references public.prospector_leads(id) on delete set null,
  email text,
  email_status text,
  name text,
  company text,
  phone text,
  stage text not null default 'captacao' check (stage in ('captacao', 'conversao', 'retencao')),
  status text not null default 'lead' check (status in ('lead', 'engaged', 'converted', 'active', 'at_risk', 'churned', 'won_back', 'opted_out')),
  source text not null default 'manual' check (source in ('prospector', 'stripe', 'manual')),
  external_id text,
  last_activity_at timestamptz,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.growth_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  growth_id uuid not null references public.growth_campaigns(id) on delete cascade,
  contact_id uuid not null references public.growth_contacts(id) on delete cascade,
  stage text not null check (stage in ('captacao', 'conversao', 'retencao')),
  kind text not null check (kind in ('conversion1', 'conversion2', 'onboarding', 'checkin', 'winback', 'thanks')),
  channel text not null default 'email' check (channel in ('email', 'whatsapp')),
  subject text,
  body text not null default '',
  footer text not null default '',
  status text not null default 'draft' check (status in ('draft', 'approved', 'sending', 'sent', 'rejected', 'cancelled', 'failed')),
  send_after timestamptz,
  approved_at timestamptz,
  sent_at timestamptz,
  gmail_account_id uuid,
  gmail_message_id text,
  gmail_thread_id text,
  error text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.growth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  growth_id uuid references public.growth_campaigns(id) on delete cascade,
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists growth_campaigns_user_idx on public.growth_campaigns (user_id, created_at desc);
create index if not exists growth_contacts_growth_idx on public.growth_contacts (growth_id);
create index if not exists growth_contacts_email_idx on public.growth_contacts (growth_id, email);
create index if not exists growth_messages_growth_idx on public.growth_messages (growth_id);
create index if not exists growth_messages_contact_idx on public.growth_messages (contact_id);
create index if not exists growth_messages_user_sent_idx on public.growth_messages (user_id, status, sent_at);
create index if not exists growth_events_growth_idx on public.growth_events (growth_id, created_at desc);

alter table public.growth_campaigns enable row level security;
alter table public.growth_contacts enable row level security;
alter table public.growth_messages enable row level security;
alter table public.growth_events enable row level security;

-- Dono lê e apaga o que é dele. Inserir/alterar: só a edge function (service role ignora RLS).
do $$
declare t text;
begin
  foreach t in array array['growth_campaigns', 'growth_contacts', 'growth_messages', 'growth_events'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_owner_select') then
      execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', t || '_owner_select', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_owner_delete') then
      execute format('create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())', t || '_owner_delete', t);
    end if;
  end loop;
end $$;

revoke insert, update on public.growth_campaigns, public.growth_contacts, public.growth_messages, public.growth_events from anon, authenticated;
revoke all on public.growth_campaigns, public.growth_contacts, public.growth_messages, public.growth_events from anon;

-- Permissões explícitas: dono lê/apaga (RLS acima); só o service role (edge function) escreve.
grant select, delete on public.growth_campaigns, public.growth_contacts, public.growth_messages, public.growth_events to authenticated;
grant all on public.growth_campaigns, public.growth_contacts, public.growth_messages, public.growth_events to service_role;
revoke truncate, references, trigger on public.growth_campaigns, public.growth_contacts, public.growth_messages, public.growth_events from authenticated;
