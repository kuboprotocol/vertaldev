-- Vertal CRM · lista de espera (aditivo: tabela nova, nada existente muda).
-- Quem chega em /crm (pela landing "CRM grátis") sem estar na allowlist VERTAL_CRM_USER_IDS
-- vê "liberação em breve" e pode entrar na lista. Abrir o CRM para essas pessoas continua
-- sendo decisão do Laércio (a lista só registra o interesse; nenhuma mensagem é enviada).
create table if not exists public.crm_waitlist (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text check (email is null or char_length(email) <= 320),
  lang text check (lang is null or char_length(lang) <= 20),
  source text not null default 'crm_page' check (char_length(source) between 1 and 40),
  created_at timestamptz not null default now()
);

alter table public.crm_waitlist enable row level security;

revoke all on table public.crm_waitlist from anon, authenticated;
grant select, insert on table public.crm_waitlist to authenticated;
grant all on table public.crm_waitlist to service_role;

-- Cada pessoa só insere/vê a própria linha; o e-mail, se vier, tem que ser o da própria sessão.
drop policy if exists crm_waitlist_insert_own on public.crm_waitlist;
create policy crm_waitlist_insert_own on public.crm_waitlist
  for insert to authenticated
  with check (user_id = auth.uid() and (email is null or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

drop policy if exists crm_waitlist_select_own on public.crm_waitlist;
create policy crm_waitlist_select_own on public.crm_waitlist
  for select to authenticated
  using (user_id = auth.uid());

comment on table public.crm_waitlist is 'Vertal CRM: quem pediu acesso enquanto o CRM está liberado só para a allowlist (VERTAL_CRM_USER_IDS).';
