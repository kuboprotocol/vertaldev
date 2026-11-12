-- Stripe: colunas que create-checkout e stripe-webhook gravam mas que não
-- existiam no banco. Sem elas o update/insert em subscriptions falhava em
-- silêncio e o plano pago nunca era ativado.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_idx
  ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS profiles_stripe_customer_id_idx
  ON public.profiles(stripe_customer_id);
