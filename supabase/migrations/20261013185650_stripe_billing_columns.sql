-- Production migration 20261013185650 "stripe_billing_columns", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_idx
  ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS profiles_stripe_customer_id_idx
  ON public.profiles(stripe_customer_id);
