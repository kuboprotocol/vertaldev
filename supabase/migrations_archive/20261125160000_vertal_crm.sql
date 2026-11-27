-- Vertal CRM · tabelas novas crm_* (aditivo: não altera nenhuma tabela, função ou policy existente).
-- Modelo de dados adaptado do Atomic CRM (Marmelab, licença MIT; ver src/components/vertal-crm/LICENSE.atomic-crm.md),
-- com uma mudança central: o Atomic é de um time só; aqui TUDO é escopado por workspace_id (multi-tenant) via RLS.
--
-- Quem cria o workspace é só a edge function vertal-code-ai (service role) — é ali que valem as flags
-- VERTAL_CRM_ENABLED / VERTAL_CRM_USER_IDS. Sem workspace não há membro, e sem membro o RLS não deixa ler nem escrever nada.
-- O CRUD normal (contatos, empresas, negócios, notas, tarefas) vai direto do navegador pelo PostgREST com RLS (grátis).
-- Linha do tempo, eventos (gatilhos do Vertal Fluxos) e webhooks são gerados por gatilhos do banco.

-- ---------------------------------------------------------------- workspaces e membros
create table if not exists public.crm_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Meu CRM' check (char_length(name) between 1 and 120),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  lang text not null default 'pt',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_members (
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists crm_members_user_idx on public.crm_members (user_id);

-- Papel do usuário logado no workspace (null = não é membro). SECURITY DEFINER evita recursão de RLS.
create or replace function public.crm_role(_ws uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.crm_members m where m.workspace_id = _ws and m.user_id = auth.uid()
$$;

create or replace function public.crm_can_read(_ws uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.crm_role(_ws) is not null $$;

create or replace function public.crm_can_write(_ws uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.crm_role(_ws) in ('owner', 'admin', 'member'), false) $$;

create or replace function public.crm_is_admin(_ws uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.crm_role(_ws) in ('owner', 'admin'), false) $$;

-- Versões que aceitam texto (pasta do Storage): caminho inválido = false, nunca erro.
create or replace function public.crm_can_read_path(_ws text)
returns boolean language sql stable security definer set search_path = public
as $$ select case when _ws ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then public.crm_can_read(_ws::uuid) else false end $$;

create or replace function public.crm_can_write_path(_ws text)
returns boolean language sql stable security definer set search_path = public
as $$ select case when _ws ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then public.crm_can_write(_ws::uuid) else false end $$;

create or replace function public.crm_is_admin_path(_ws text)
returns boolean language sql stable security definer set search_path = public
as $$ select case when _ws ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then public.crm_is_admin(_ws::uuid) else false end $$;

-- ---------------------------------------------------------------- funis (vários por workspace, etapas personalizadas)
create table if not exists public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- [{ "id": "proposta", "label": "Proposta enviada", "probability": 50, "kind": "open"|"won"|"lost" }]
  stages jsonb not null default '[]'::jsonb check (jsonb_typeof(stages) = 'array'),
  position int not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

-- ---------------------------------------------------------------- empresas, contatos, negócios
create table if not exists public.crm_companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  sector text,
  size int,
  website text,
  phone text,
  address text,
  zipcode text,
  city text,
  state text,
  country text,
  linkedin_url text,
  description text,
  revenue text,
  tax_id text,
  logo_url text,
  tags uuid[] not null default '{}',
  custom jsonb not null default '{}'::jsonb,
  source text not null default 'manual',
  external_ids jsonb not null default '{}'::jsonb,
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index if not exists crm_companies_ws_idx on public.crm_companies (workspace_id, created_at desc);
create index if not exists crm_companies_name_trgm on public.crm_companies using gin (name extensions.gin_trgm_ops);

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  company_id uuid,
  first_name text not null default '',
  last_name text not null default '',
  title text,
  emails jsonb not null default '[]'::jsonb check (jsonb_typeof(emails) = 'array'),
  phones jsonb not null default '[]'::jsonb check (jsonb_typeof(phones) = 'array'),
  email_primary text generated always as (lower(nullif(emails -> 0 ->> 'email', ''))) stored,
  linkedin_url text,
  background text,
  status text not null default 'cold',
  gender text,
  has_newsletter boolean not null default false,
  tags uuid[] not null default '{}',
  custom jsonb not null default '{}'::jsonb,
  source text not null default 'manual',
  external_ids jsonb not null default '{}'::jsonb,
  score smallint check (score between 0 and 100),
  score_reason text,
  owner_id uuid references auth.users(id) on delete set null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, company_id) references public.crm_companies (workspace_id, id) on delete set null (company_id)
);
create index if not exists crm_contacts_ws_idx on public.crm_contacts (workspace_id, created_at desc);
create index if not exists crm_contacts_company_idx on public.crm_contacts (company_id);
create index if not exists crm_contacts_email_idx on public.crm_contacts (workspace_id, email_primary);
create index if not exists crm_contacts_name_trgm on public.crm_contacts using gin ((first_name || ' ' || last_name) extensions.gin_trgm_ops);

create table if not exists public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  pipeline_id uuid not null,
  stage text not null,
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  name text not null check (char_length(name) between 1 and 200),
  company_id uuid,
  contact_ids uuid[] not null default '{}',
  category text,
  description text,
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  currency text,
  expected_closing_date date check (expected_closing_date between '1900-01-01' and '2900-12-31'),
  index int not null default 0,
  closed_at timestamptz,
  archived_at timestamptz,
  tags uuid[] not null default '{}',
  custom jsonb not null default '{}'::jsonb,
  source text not null default 'manual',
  external_ids jsonb not null default '{}'::jsonb,
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, pipeline_id) references public.crm_pipelines (workspace_id, id) on delete cascade,
  foreign key (workspace_id, company_id) references public.crm_companies (workspace_id, id) on delete set null (company_id)
);
create index if not exists crm_deals_ws_idx on public.crm_deals (workspace_id, pipeline_id, stage, index);

-- ---------------------------------------------------------------- notas, tarefas, anexos
create table if not exists public.crm_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  contact_id uuid,
  deal_id uuid,
  company_id uuid,
  text text not null check (char_length(text) <= 50000),
  status text,
  source text not null default 'manual' check (source in ('manual', 'email', 'ai', 'sync', 'api', 'import')),
  external_ref text,
  meta jsonb not null default '{}'::jsonb,
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, contact_id) references public.crm_contacts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, deal_id) references public.crm_deals (workspace_id, id) on delete cascade,
  foreign key (workspace_id, company_id) references public.crm_companies (workspace_id, id) on delete cascade
);
create index if not exists crm_notes_contact_idx on public.crm_notes (contact_id, created_at desc);
create index if not exists crm_notes_deal_idx on public.crm_notes (deal_id, created_at desc);
create unique index if not exists crm_notes_external_ref_uq on public.crm_notes (workspace_id, external_ref) where external_ref is not null;

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  contact_id uuid,
  deal_id uuid,
  company_id uuid,
  type text not null default 'none',
  text text not null check (char_length(text) between 1 and 2000),
  due_date timestamptz,
  reminder_at timestamptz,
  done_at timestamptz,
  assignee_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, contact_id) references public.crm_contacts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, deal_id) references public.crm_deals (workspace_id, id) on delete cascade,
  foreign key (workspace_id, company_id) references public.crm_companies (workspace_id, id) on delete cascade
);
create index if not exists crm_tasks_ws_idx on public.crm_tasks (workspace_id, done_at, due_date);

create table if not exists public.crm_attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  contact_id uuid,
  deal_id uuid,
  company_id uuid,
  note_id uuid references public.crm_notes(id) on delete set null,
  -- Caminho no bucket crm-attachments: <workspace_id>/<user_id>/<arquivo>
  path text not null,
  name text not null,
  size bigint not null default 0,
  mime text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (split_part(path, '/', 1) = workspace_id::text),
  foreign key (workspace_id, contact_id) references public.crm_contacts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, deal_id) references public.crm_deals (workspace_id, id) on delete cascade,
  foreign key (workspace_id, company_id) references public.crm_companies (workspace_id, id) on delete cascade
);

-- ---------------------------------------------------------------- etiquetas e campos personalizados
create table if not exists public.crm_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text not null default '#8B5CF6',
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.crm_custom_fields (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  entity text not null check (entity in ('contact', 'company', 'deal')),
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (char_length(label) between 1 and 80),
  type text not null default 'text' check (type in ('text', 'number', 'date', 'select', 'boolean', 'url')),
  options jsonb not null default '[]'::jsonb,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (workspace_id, entity, key)
);

-- ---------------------------------------------------------------- linha do tempo e eventos (gerados por gatilho)
create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('contact', 'company', 'deal', 'task', 'note')),
  entity_id uuid not null,
  contact_id uuid,
  deal_id uuid,
  company_id uuid,
  kind text not null,
  summary text,
  data jsonb not null default '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists crm_activities_ws_idx on public.crm_activities (workspace_id, created_at desc);
create index if not exists crm_activities_contact_idx on public.crm_activities (contact_id, created_at desc);
create index if not exists crm_activities_deal_idx on public.crm_activities (deal_id, created_at desc);

create table if not exists public.crm_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists crm_events_ws_idx on public.crm_events (workspace_id, id desc);

-- ---------------------------------------------------------------- API, webhooks, sincronização e IA (escrita só pela edge function)
create table if not exists public.crm_api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{read,write}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.crm_webhooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  url text not null check (url ~ '^https://'),
  events text[] not null default '{*}',
  secret text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_delivery_at timestamptz
);

create table if not exists public.crm_sync_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  provider text not null check (provider in ('pipedrive', 'hubspot', 'salesforce', 'zoho', 'rdstation')),
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  activated_at timestamptz not null default now(),
  charge_key text,
  charged_credits int not null default 0,
  mapping jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_result jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, provider)
);

create table if not exists public.crm_sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  connection_id uuid not null references public.crm_sync_connections(id) on delete cascade,
  mode text not null check (mode in ('ai', 'plain')),
  direction text not null check (direction in ('push', 'pull', 'both')),
  status text not null default 'running' check (status in ('running', 'ok', 'failed')),
  credits int not null default 0,
  charge_key text,
  stats jsonb not null default '{}'::jsonb,
  error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.crm_ai_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  entity_type text,
  entity_id uuid,
  idempotency_key text not null,
  status text not null default 'running' check (status in ('running', 'ok', 'failed', 'refunded')),
  credits int not null default 0,
  result jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, idempotency_key)
);

-- ---------------------------------------------------------------- gatilhos
create or replace function public.crm_touch_updated_at()
returns trigger language plpgsql set search_path = public
as $$ begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['crm_workspaces', 'crm_pipelines', 'crm_companies', 'crm_contacts', 'crm_deals', 'crm_notes', 'crm_tasks'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.crm_touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- Negócio: etapa precisa existir no funil; status (aberto/ganho/perdido) vem do tipo da etapa;
-- contact_ids só com contatos do mesmo workspace.
create or replace function public.crm_deal_normalize()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  _stages jsonb;
  _kind text;
begin
  select p.stages into _stages from public.crm_pipelines p where p.id = new.pipeline_id and p.workspace_id = new.workspace_id;
  if _stages is null then raise exception 'crm_pipeline_not_found'; end if;
  select s ->> 'kind' into _kind from jsonb_array_elements(_stages) s where s ->> 'id' = new.stage limit 1;
  if _kind is null then
    if not exists (select 1 from jsonb_array_elements(_stages) s where s ->> 'id' = new.stage) then
      new.stage := coalesce(_stages -> 0 ->> 'id', new.stage);
      select s ->> 'kind' into _kind from jsonb_array_elements(_stages) s where s ->> 'id' = new.stage limit 1;
    end if;
  end if;
  new.status := case when _kind in ('won', 'lost') then _kind else 'open' end;
  if new.status <> 'open' and (tg_op = 'INSERT' or old.status is distinct from new.status) then new.closed_at := now(); end if;
  if new.status = 'open' then new.closed_at := null; end if;
  if new.contact_ids is not null and cardinality(new.contact_ids) > 0 then
    new.contact_ids := coalesce((
      select array_agg(c.id) from public.crm_contacts c where c.workspace_id = new.workspace_id and c.id = any(new.contact_ids)
    ), '{}');
  end if;
  return new;
end $$;
drop trigger if exists crm_deals_normalize on public.crm_deals;
create trigger crm_deals_normalize before insert or update of pipeline_id, stage, contact_ids on public.crm_deals
  for each row execute function public.crm_deal_normalize();

-- Eventos + linha do tempo. Tipos: contact.created/updated/deleted, company.created/updated/deleted,
-- deal.created/updated/stage_changed/won/lost/deleted, task.created/completed, note.created.
create or replace function public.crm_emit(_ws uuid, _type text, _entity uuid, _payload jsonb)
returns void language plpgsql security definer set search_path = public
as $$
begin
  insert into public.crm_events (workspace_id, type, entity_id, payload) values (_ws, _type, _entity, coalesce(_payload, '{}'::jsonb));
end $$;

create or replace function public.crm_track()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  _ent text := case tg_table_name
    when 'crm_contacts' then 'contact' when 'crm_companies' then 'company' when 'crm_deals' then 'deal'
    when 'crm_tasks' then 'task' else 'note' end;
  -- Tudo em jsonb: as 5 tabelas têm colunas diferentes e o plpgsql não aceita old.<coluna> inexistente.
  _row jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  _old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  _ws uuid := (_row ->> 'workspace_id')::uuid;
  _id uuid := (_row ->> 'id')::uuid;
  _contact uuid;
  _deal uuid;
  _company uuid;
  _summary text;
  _kind text;
  _extra jsonb := '{}'::jsonb;
begin
  _contact := case _ent when 'contact' then _id else nullif(_row ->> 'contact_id', '')::uuid end;
  _deal := case _ent when 'deal' then _id else nullif(_row ->> 'deal_id', '')::uuid end;
  _company := case _ent when 'company' then _id else nullif(_row ->> 'company_id', '')::uuid end;
  _summary := left(coalesce(
    case _ent
      when 'contact' then trim(coalesce(_row ->> 'first_name', '') || ' ' || coalesce(_row ->> 'last_name', ''))
      when 'company' then _row ->> 'name'
      when 'deal' then _row ->> 'name'
      else _row ->> 'text' end, ''), 280);

  if tg_op = 'INSERT' then
    _kind := _ent || '.created';
  elsif tg_op = 'DELETE' then
    _kind := _ent || '.deleted';
  else
    _kind := _ent || '.updated';
    if _ent = 'deal' then
      if (_old ->> 'stage') is distinct from (_row ->> 'stage') or (_old ->> 'pipeline_id') is distinct from (_row ->> 'pipeline_id') then
        _extra := jsonb_build_object('from', _old ->> 'stage', 'to', _row ->> 'stage', 'status', _row ->> 'status');
        _kind := case when _row ->> 'status' = 'won' and _old ->> 'status' <> 'won' then 'deal.won'
                      when _row ->> 'status' = 'lost' and _old ->> 'status' <> 'lost' then 'deal.lost'
                      else 'deal.stage_changed' end;
        -- Fluxos/Webhooks sempre recebem também deal.stage_changed (ganho e perdido são mudanças de etapa).
        if _kind <> 'deal.stage_changed' then
          perform public.crm_emit(_ws, 'deal.stage_changed', _id, jsonb_build_object('record', _row) || _extra);
        end if;
      elsif (_old - 'index' - 'updated_at') = (_row - 'index' - 'updated_at') then
        return null; -- só reordenou o Kanban: não polui a linha do tempo
      end if;
    elsif _ent = 'task' and (_old ->> 'done_at') is null and (_row ->> 'done_at') is not null then
      _kind := 'task.completed';
    end if;
  end if;

  if tg_op <> 'DELETE' then
    insert into public.crm_activities (workspace_id, entity_type, entity_id, contact_id, deal_id, company_id, kind, summary, data, actor_id)
    values (_ws, _ent, _id, _contact, _deal, _company, _kind, _summary, _extra, auth.uid());
  end if;
  perform public.crm_emit(_ws, _kind, _id, jsonb_build_object('record', _row) || _extra);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['crm_contacts', 'crm_companies', 'crm_deals', 'crm_tasks', 'crm_notes'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_track', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.crm_track()', t || '_track', t);
  end loop;
end $$;

-- Atividades de entidade apagada somem com ela (cascata manual: entity_id não tem FK por ser polimórfico).
create or replace function public.crm_cleanup_activities()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  delete from public.crm_activities a where a.workspace_id = old.workspace_id and (a.entity_id = old.id or a.contact_id = old.id or a.deal_id = old.id or a.company_id = old.id);
  if tg_table_name = 'crm_contacts' then
    update public.crm_deals d set contact_ids = array_remove(d.contact_ids, old.id)
      where d.workspace_id = old.workspace_id and old.id = any(d.contact_ids);
  end if;
  return null;
end $$;
do $$
declare t text;
begin
  foreach t in array array['crm_contacts', 'crm_companies', 'crm_deals'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_cleanup', t);
    execute format('create trigger %I after delete on public.%I for each row execute function public.crm_cleanup_activities()', t || '_cleanup', t);
  end loop;
end $$;

-- Webhooks: cada evento novo vai (pg_net, assíncrono) para os webhooks ativos do workspace que pediram aquele tipo.
-- Assinatura: X-Vertal-Signature = HMAC-SHA256(segredo do webhook, corpo JSON). Falha de entrega nunca quebra a gravação.
create or replace function public.crm_dispatch_webhooks()
returns trigger language plpgsql security definer set search_path = public, extensions
as $$
declare
  w record;
  _body jsonb;
begin
  for w in select * from public.crm_webhooks h
    where h.workspace_id = new.workspace_id and h.active and ('*' = any(h.events) or new.type = any(h.events))
  loop
    begin
      _body := jsonb_build_object('id', new.id, 'type', new.type, 'workspace_id', new.workspace_id, 'entity_id', new.entity_id,
        'created_at', new.created_at, 'data', new.payload);
      perform net.http_post(
        url := w.url,
        body := _body,
        params := '{}'::jsonb,
        headers := jsonb_build_object('Content-Type', 'application/json', 'User-Agent', 'Vertal-CRM-Webhooks/1',
          'X-Vertal-Event', new.type,
          'X-Vertal-Signature', 'sha256=' || encode(extensions.hmac(_body::text, w.secret, 'sha256'), 'hex')),
        timeout_milliseconds := 5000);
      update public.crm_webhooks set last_delivery_at = now() where id = w.id;
    exception when others then
      raise warning 'crm webhook % falhou: %', w.id, sqlerrm;
    end;
  end loop;
  return null;
end $$;
drop trigger if exists crm_events_dispatch on public.crm_events;
create trigger crm_events_dispatch after insert on public.crm_events for each row execute function public.crm_dispatch_webhooks();

-- ---------------------------------------------------------------- RLS
alter table public.crm_workspaces enable row level security;
alter table public.crm_members enable row level security;
alter table public.crm_pipelines enable row level security;
alter table public.crm_companies enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_deals enable row level security;
alter table public.crm_notes enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_attachments enable row level security;
alter table public.crm_tags enable row level security;
alter table public.crm_custom_fields enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_events enable row level security;
alter table public.crm_api_keys enable row level security;
alter table public.crm_webhooks enable row level security;
alter table public.crm_sync_connections enable row level security;
alter table public.crm_sync_runs enable row level security;
alter table public.crm_ai_runs enable row level security;

-- Workspaces: membros leem; donos/admins mudam nome/moeda/ajustes. Criar/apagar só pela edge function.
create policy crm_workspaces_select on public.crm_workspaces for select to authenticated using (public.crm_can_read(id));
create policy crm_workspaces_update on public.crm_workspaces for update to authenticated using (public.crm_is_admin(id)) with check (public.crm_is_admin(id));
create policy crm_members_select on public.crm_members for select to authenticated using (public.crm_can_read(workspace_id));

-- Dados do CRM: membro lê; owner/admin/member escrevem; viewer só lê.
do $$
declare t text;
begin
  foreach t in array array['crm_companies', 'crm_contacts', 'crm_deals', 'crm_notes', 'crm_tasks', 'crm_attachments', 'crm_tags'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.crm_can_read(workspace_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.crm_can_write(workspace_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.crm_can_write(workspace_id)) with check (public.crm_can_write(workspace_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.crm_can_write(workspace_id))', t || '_delete', t);
  end loop;
  -- Funis e campos personalizados: membros leem, só owner/admin configuram.
  foreach t in array array['crm_pipelines', 'crm_custom_fields'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.crm_can_read(workspace_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.crm_is_admin(workspace_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.crm_is_admin(workspace_id)) with check (public.crm_is_admin(workspace_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.crm_is_admin(workspace_id))', t || '_delete', t);
  end loop;
end $$;

create policy crm_activities_select on public.crm_activities for select to authenticated using (public.crm_can_read(workspace_id));
create policy crm_events_select on public.crm_events for select to authenticated using (public.crm_is_admin(workspace_id));
create policy crm_api_keys_select on public.crm_api_keys for select to authenticated using (public.crm_is_admin(workspace_id));
create policy crm_webhooks_select on public.crm_webhooks for select to authenticated using (public.crm_is_admin(workspace_id));
create policy crm_sync_connections_select on public.crm_sync_connections for select to authenticated using (public.crm_can_read(workspace_id));
create policy crm_sync_runs_select on public.crm_sync_runs for select to authenticated using (public.crm_can_read(workspace_id));
create policy crm_ai_runs_select on public.crm_ai_runs for select to authenticated using (user_id = auth.uid() and public.crm_can_read(workspace_id));

-- ---------------------------------------------------------------- GRANTs (explícitos, como pede o lint de segurança)
revoke all on public.crm_workspaces, public.crm_members, public.crm_pipelines, public.crm_companies, public.crm_contacts,
  public.crm_deals, public.crm_notes, public.crm_tasks, public.crm_attachments, public.crm_tags, public.crm_custom_fields,
  public.crm_activities, public.crm_events, public.crm_api_keys, public.crm_webhooks, public.crm_sync_connections,
  public.crm_sync_runs, public.crm_ai_runs from anon, authenticated;

grant select, insert, update, delete on table public.crm_companies, public.crm_contacts, public.crm_deals, public.crm_notes,
  public.crm_tasks, public.crm_attachments, public.crm_tags, public.crm_pipelines, public.crm_custom_fields to authenticated;
grant select on table public.crm_workspaces to authenticated;
-- Dono e id nunca mudam pelo navegador.
grant update (name, currency, lang, settings) on public.crm_workspaces to authenticated;
grant select on table public.crm_members, public.crm_activities, public.crm_events, public.crm_sync_connections,
  public.crm_sync_runs, public.crm_ai_runs to authenticated;
-- Sem hash/segredo para o navegador: só colunas seguras.
grant select (id, workspace_id, name, prefix, scopes, created_by, created_at, last_used_at, revoked_at) on public.crm_api_keys to authenticated;
grant select (id, workspace_id, url, events, active, created_by, created_at, last_delivery_at) on public.crm_webhooks to authenticated;

grant all on table public.crm_workspaces, public.crm_members, public.crm_pipelines, public.crm_companies, public.crm_contacts,
  public.crm_deals, public.crm_notes, public.crm_tasks, public.crm_attachments, public.crm_tags, public.crm_custom_fields,
  public.crm_activities, public.crm_events, public.crm_api_keys, public.crm_webhooks, public.crm_sync_connections,
  public.crm_sync_runs, public.crm_ai_runs to service_role;

revoke execute on function public.crm_emit(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.crm_dispatch_webhooks() from public, anon, authenticated;
revoke execute on function public.crm_track() from public, anon, authenticated;
revoke execute on function public.crm_cleanup_activities() from public, anon, authenticated;
revoke execute on function public.crm_deal_normalize() from public, anon, authenticated;

-- ---------------------------------------------------------------- Storage: anexos (bucket privado, pasta por workspace e por usuário)
insert into storage.buckets (id, name, public, file_size_limit)
values ('crm-attachments', 'crm-attachments', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

-- Caminho: <workspace_id>/<user_id>/<arquivo>. Membros leem; quem escreve só grava na própria pasta;
-- apaga o próprio arquivo ou, se for admin, qualquer um do workspace.
drop policy if exists "crm_attachments_storage_select" on storage.objects;
create policy "crm_attachments_storage_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'crm-attachments' and public.crm_can_read_path((storage.foldername(name))[1]));

drop policy if exists "crm_attachments_storage_insert" on storage.objects;
create policy "crm_attachments_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'crm-attachments' and public.crm_can_write_path((storage.foldername(name))[1])
    and (storage.foldername(name))[2] = (select auth.uid())::text);

drop policy if exists "crm_attachments_storage_delete" on storage.objects;
create policy "crm_attachments_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'crm-attachments' and (
    ((storage.foldername(name))[2] = (select auth.uid())::text and public.crm_can_write_path((storage.foldername(name))[1]))
    or public.crm_is_admin_path((storage.foldername(name))[1])));
