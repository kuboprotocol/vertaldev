-- Vertal Prospector · tabelas novas (aditivo: não altera nenhuma tabela existente).
-- Escrita só pela edge function vertal-code-ai (service role); o dono lê e apaga os próprios dados.
-- LGPD: só dados de contato empresariais (B2B, legítimo interesse); apagar a pedido = delete_lead/delete_campaign.

create table if not exists public.prospector_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  cnpj text,
  website text,
  profile jsonb not null default '{}'::jsonb,
  icp jsonb not null default '{}'::jsonb,
  status text not null default 'icp_pending' check (status in ('icp_pending', 'icp_confirmed', 'archived')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prospector_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.prospector_campaigns(id) on delete cascade,
  name text not null,
  website text,
  domain text,
  phone text,
  whatsapp text,
  email text,
  email_status text check (email_status in ('verified', 'risky', 'guess', 'invalid', 'unknown')),
  email_candidates jsonb not null default '{}'::jsonb,
  address text,
  city text,
  category text,
  osm_id text,
  source text not null default 'mapa',
  cnpj text,
  signals jsonb not null default '{}'::jsonb,
  fit smallint,
  decision_maker jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'enriched', 'drafted', 'contacted', 'replied', 'meeting', 'won', 'lost', 'opted_out')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, osm_id)
);

create table if not exists public.prospector_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.prospector_campaigns(id) on delete cascade,
  lead_id uuid not null references public.prospector_leads(id) on delete cascade,
  direction text not null default 'out' check (direction in ('out', 'in')),
  channel text not null check (channel in ('email', 'whatsapp')),
  kind text not null check (kind in ('first', 'followup1', 'followup2', 'reply')),
  subject text,
  body text not null default '',
  footer text not null default '',
  status text not null default 'draft' check (status in ('draft', 'approved', 'sending', 'sent', 'rejected', 'cancelled', 'failed', 'received')),
  approved_at timestamptz,
  sent_at timestamptz,
  send_after timestamptz,
  gmail_account_id uuid,
  gmail_message_id text,
  gmail_thread_id text,
  error text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prospector_dnc (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('email', 'domain', 'phone')),
  value text not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (user_id, kind, value)
);

create index if not exists prospector_campaigns_user_idx on public.prospector_campaigns (user_id, created_at desc);
create index if not exists prospector_leads_campaign_idx on public.prospector_leads (campaign_id);
create index if not exists prospector_leads_user_domain_idx on public.prospector_leads (user_id, domain);
create index if not exists prospector_messages_lead_idx on public.prospector_messages (lead_id);
create index if not exists prospector_messages_user_sent_idx on public.prospector_messages (user_id, status, sent_at);
create index if not exists prospector_messages_campaign_idx on public.prospector_messages (campaign_id);

alter table public.prospector_campaigns enable row level security;
alter table public.prospector_leads enable row level security;
alter table public.prospector_messages enable row level security;
alter table public.prospector_dnc enable row level security;

-- Dono lê e apaga o que é dele. Inserir/alterar: só a edge function (service role ignora RLS).
do $$
declare t text;
begin
  foreach t in array array['prospector_campaigns', 'prospector_leads', 'prospector_messages', 'prospector_dnc'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_owner_select') then
      execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', t || '_owner_select', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_owner_delete') then
      execute format('create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())', t || '_owner_delete', t);
    end if;
  end loop;
end $$;

revoke insert, update on public.prospector_campaigns, public.prospector_leads, public.prospector_messages, public.prospector_dnc from anon, authenticated;
revoke all on public.prospector_campaigns, public.prospector_leads, public.prospector_messages, public.prospector_dnc from anon;

-- Permissões explícitas: dono lê/apaga (RLS acima); só o service role (edge function) escreve.
grant select, delete on public.prospector_campaigns, public.prospector_leads, public.prospector_messages, public.prospector_dnc to authenticated;
grant all on public.prospector_campaigns, public.prospector_leads, public.prospector_messages, public.prospector_dnc to service_role;
revoke truncate, references, trigger on public.prospector_campaigns, public.prospector_leads, public.prospector_messages, public.prospector_dnc from authenticated;
