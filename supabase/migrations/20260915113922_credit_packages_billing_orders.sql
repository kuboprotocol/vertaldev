-- Production migration 20260915113922 "credit_packages_billing_orders", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

CREATE TABLE public.credit_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0),
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_packages TO authenticated;
GRANT ALL ON public.credit_packages TO service_role;
ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can read active packages" ON public.credit_packages
  FOR SELECT TO authenticated USING (active = true);
CREATE POLICY "service_role_manages_packages" ON public.credit_packages
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE public.billing_settings (
  id BOOLEAN NOT NULL DEFAULT true PRIMARY KEY CHECK (id),
  price_per_credit_cents INTEGER NOT NULL DEFAULT 10 CHECK (price_per_credit_cents > 0),
  min_credits INTEGER NOT NULL DEFAULT 100 CHECK (min_credits > 0),
  max_credits INTEGER NOT NULL DEFAULT 100000 CHECK (max_credits > 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  custom_amount_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_settings TO authenticated;
GRANT ALL ON public.billing_settings TO service_role;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can read billing settings" ON public.billing_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role_manages_billing_settings" ON public.billing_settings
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
INSERT INTO public.billing_settings (id) VALUES (true);

CREATE TABLE public.credit_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id UUID REFERENCES public.credit_packages(id) ON DELETE SET NULL,
  credits INTEGER NOT NULL CHECK (credits > 0),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_session_id TEXT UNIQUE,
  credited_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_orders TO authenticated;
GRANT ALL ON public.credit_orders TO service_role;
ALTER TABLE public.credit_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_orders" ON public.credit_orders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "service_role_manages_credit_orders" ON public.credit_orders
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE INDEX idx_credit_orders_user ON public.credit_orders (user_id, created_at DESC);
CREATE INDEX idx_credit_orders_status ON public.credit_orders (status, created_at DESC);

INSERT INTO public.credit_packages (name, credits, price_cents, sort_order, active) VALUES
  ('Starter', 50, 499, 1, true),
  ('Pro', 200, 1999, 2, true),
  ('Business', 650, 4999, 3, true);
