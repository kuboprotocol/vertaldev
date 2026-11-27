-- Stripe Payments: rastrear transações e pagamentos
-- Integração com Stripe para recarga de créditos

CREATE TABLE IF NOT EXISTS public.stripe_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Stripe info
  stripe_customer_id text NOT NULL,
  stripe_payment_intent_id text UNIQUE,
  stripe_session_id text UNIQUE,

  -- Transaction details
  amount_cents      integer NOT NULL, -- Em centavos (USD)
  currency          text DEFAULT 'usd',
  credits_purchased integer NOT NULL, -- Créditos comprados

  -- Pricing tiers
  tier              text NOT NULL, -- 'starter' (50), 'pro' (150), 'premium' (350)

  -- Status
  status            text NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded

  -- Metadata
  description       text,
  metadata          jsonb, -- Dados adicionais (app_id, referrer, etc)

  -- Timestamps
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,

  -- Error tracking
  error_message     text
);

CREATE INDEX IF NOT EXISTS stripe_transactions_user_id_idx ON public.stripe_transactions(user_id);
CREATE INDEX IF NOT EXISTS stripe_transactions_status_idx ON public.stripe_transactions(status);
CREATE INDEX IF NOT EXISTS stripe_transactions_stripe_customer_id_idx ON public.stripe_transactions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS stripe_transactions_created_at_idx ON public.stripe_transactions(created_at DESC);

ALTER TABLE public.stripe_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stripe_transactions_select_own" ON public.stripe_transactions;
CREATE POLICY "stripe_transactions_select_own" ON public.stripe_transactions
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.stripe_transactions FROM anon, authenticated;
GRANT SELECT ON public.stripe_transactions TO authenticated;

-- Webhook events log para debugging
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id  text UNIQUE NOT NULL,
  event_type       text NOT NULL, -- payment_intent.succeeded, charge.refunded, etc

  data             jsonb NOT NULL, -- Payload completo do webhook
  processed        boolean DEFAULT false,
  processed_at     timestamptz,
  error_message    text,

  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_event_type_idx ON public.stripe_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS stripe_webhook_events_processed_idx ON public.stripe_webhook_events(processed);
CREATE INDEX IF NOT EXISTS stripe_webhook_events_created_at_idx ON public.stripe_webhook_events(created_at DESC);

-- App analytics: rastrear métricas dos apps
CREATE TABLE IF NOT EXISTS public.app_analytics (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Daily metrics
  date             date NOT NULL,

  views            integer DEFAULT 0,
  deploys          integer DEFAULT 0,
  errors           integer DEFAULT 0,

  credits_used     integer DEFAULT 0,
  uptime_percent   decimal DEFAULT 100,

  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_analytics_app_id_idx ON public.app_analytics(app_id);
CREATE INDEX IF NOT EXISTS app_analytics_user_id_idx ON public.app_analytics(user_id);
CREATE INDEX IF NOT EXISTS app_analytics_date_idx ON public.app_analytics(date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS app_analytics_app_id_date_idx ON public.app_analytics(app_id, date);

ALTER TABLE public.app_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_analytics_select_own" ON public.app_analytics;
CREATE POLICY "app_analytics_select_own" ON public.app_analytics
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.app_analytics FROM anon, authenticated;
GRANT SELECT ON public.app_analytics TO authenticated;

-- Função para atualizar user_credits após pagamento bem-sucedido
CREATE OR REPLACE FUNCTION public.process_stripe_payment(_transaction_id uuid, _credits integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
BEGIN
  SELECT user_id INTO _user_id FROM public.stripe_transactions WHERE id = _transaction_id;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  -- Adicionar créditos ao user
  INSERT INTO public.user_credits (user_id, credit_type, amount, description)
  VALUES (_user_id, 'purchase', _credits, 'Créditos comprados via Stripe')
  ON CONFLICT (user_id) DO UPDATE
  SET balance = user_credits.balance + _credits,
      updated_at = now();

  -- Atualizar transação
  UPDATE public.stripe_transactions
  SET status = 'completed', completed_at = now()
  WHERE id = _transaction_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.process_stripe_payment(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_stripe_payment(uuid, integer) TO service_role;
