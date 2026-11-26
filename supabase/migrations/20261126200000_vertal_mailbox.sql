-- Vertal Mail · caixa de e-mail profissional + contas conectadas → Vertal CRM.
-- ADITIVO: só tabelas novas. NÃO aplicar em produção sem o OK do Laércio.
-- Escrita só pelo servidor (service role: edge function vertal-code-ai action "mailbox" e Worker
-- do vertal.dev no recebimento). O dono só LÊ as próprias linhas (RLS).

-- Endereços profissionais do cliente (ex.: ana@mail.vertal.dev).
create table if not exists public.mailbox_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  address text not null check (address = lower(address) and char_length(address) between 6 and 320),
  local_part text not null check (char_length(local_part) between 3 and 40),
  domain text not null check (char_length(domain) between 3 and 253),
  display_name text check (display_name is null or char_length(display_name) <= 120),
  signature text check (signature is null or char_length(signature) <= 2000),
  crm_feed boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists mailbox_addresses_address_uq on public.mailbox_addresses (address);
create index if not exists mailbox_addresses_user_idx on public.mailbox_addresses (user_id);

-- Mensagens recebidas e enviadas pela caixa profissional.
create table if not exists public.mailbox_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  address_id uuid not null references public.mailbox_addresses (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  folder text not null default 'inbox' check (folder in ('inbox', 'sent', 'trash', 'spam')),
  status text not null default 'received' check (status in ('received', 'queued', 'sent', 'failed')),
  from_address text not null default '',
  from_name text,
  to_addresses jsonb not null default '[]'::jsonb check (jsonb_typeof(to_addresses) = 'array'),
  cc_addresses jsonb not null default '[]'::jsonb check (jsonb_typeof(cc_addresses) = 'array'),
  reply_to text,
  subject text not null default '' check (char_length(subject) <= 998),
  text_body text not null default '' check (char_length(text_body) <= 200000),
  html_body text check (html_body is null or char_length(html_body) <= 200000),
  snippet text not null default '',
  message_id text,
  in_reply_to text,
  references_header text,
  thread_key text,
  has_attachments boolean not null default false,
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  size_bytes integer not null default 0,
  provider_message_id text,
  error text,
  read_at timestamptz,
  crm_synced_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mailbox_messages_list_idx on public.mailbox_messages (user_id, folder, created_at desc);
create index if not exists mailbox_messages_thread_idx on public.mailbox_messages (user_id, thread_key);
create index if not exists mailbox_messages_crm_idx on public.mailbox_messages (user_id, created_at) where crm_synced_at is null;
-- O mesmo e-mail entregue duas vezes (reenvio do servidor de origem) não duplica.
create unique index if not exists mailbox_messages_msgid_uq on public.mailbox_messages (address_id, message_id, direction)
  where message_id is not null;

-- Quais contas alimentam o CRM. Padrão: desligado (só as que o cliente escolher).
--   source mailbox  → account_ref = id do endereço profissional
--   source gmail    → account_ref = gmail_accounts.id
--   source outlook  → account_ref = 'microsoft-outlook' (uma conexão por usuário no Vertal Fluxos)
create table if not exists public.mail_crm_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('mailbox', 'gmail', 'outlook')),
  account_ref text not null check (char_length(account_ref) between 1 and 200),
  account_label text check (account_label is null or char_length(account_label) <= 320),
  enabled boolean not null default false,
  last_synced_at timestamptz,
  last_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists mail_crm_feeds_uq on public.mail_crm_feeds (user_id, source, account_ref);

alter table public.mailbox_addresses enable row level security;
alter table public.mailbox_messages enable row level security;
alter table public.mail_crm_feeds enable row level security;

drop policy if exists "mailbox_addresses_own_select" on public.mailbox_addresses;
create policy "mailbox_addresses_own_select" on public.mailbox_addresses for select to authenticated using (user_id = auth.uid());
drop policy if exists "mailbox_messages_own_select" on public.mailbox_messages;
create policy "mailbox_messages_own_select" on public.mailbox_messages for select to authenticated using (user_id = auth.uid());
drop policy if exists "mail_crm_feeds_own_select" on public.mail_crm_feeds;
create policy "mail_crm_feeds_own_select" on public.mail_crm_feeds for select to authenticated using (user_id = auth.uid());

-- Sem políticas de insert/update/delete para "authenticated": só o service role escreve.
revoke insert, update, delete on public.mailbox_addresses from anon, authenticated;
revoke insert, update, delete on public.mailbox_messages from anon, authenticated;
revoke insert, update, delete on public.mail_crm_feeds from anon, authenticated;
revoke all on public.mailbox_addresses from anon;
revoke all on public.mailbox_messages from anon;
revoke all on public.mail_crm_feeds from anon;
