-- Domain resale: wholesale price per TLD (from IONOS) and orders paid by card at checkout.
-- Prices stay out of the app until someone fills kubo_domain_prices from the IONOS partner table:
-- domain-checkout refuses any TLD that has no row here, so nothing is sold at a guessed price.

create table if not exists public.kubo_domain_prices (
  tld text primary key,
  wholesale_usd_cents integer not null check (wholesale_usd_cents > 0),
  updated_at timestamptz not null default now()
);

alter table public.kubo_domain_prices enable row level security;
-- No policies on purpose: only the service role (edge functions) reads or writes prices.

create table if not exists public.kubo_domain_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('purchase', 'transfer')),
  domain text not null,
  tld text not null,
  project_id uuid,
  wholesale_usd_cents integer not null,
  price_cents integer not null,
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'paid', 'ordered', 'failed', 'refunded')),
  stripe_session_id text unique,
  stripe_payment_intent text,
  -- EPP / auth code for transfers. Cleared as soon as IONOS accepts or rejects the order.
  auth_code text,
  ionos_ref text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kubo_domain_orders enable row level security;

create policy "owner reads own domain orders"
  on public.kubo_domain_orders
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Grants: new public tables get no privileges by default.
-- Prices: edge functions only.
GRANT ALL ON public.kubo_domain_prices TO service_role;
-- Orders: edge functions do everything; the owner reads a column subset.
-- auth_code and Stripe identifiers are never exposed to the browser.
GRANT ALL ON public.kubo_domain_orders TO service_role;
GRANT SELECT (id, user_id, kind, domain, tld, project_id, price_cents, status, ionos_ref, error, created_at, updated_at)
  ON public.kubo_domain_orders TO authenticated;
