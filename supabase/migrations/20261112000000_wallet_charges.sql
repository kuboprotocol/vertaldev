-- Cobranças da Carteira via Stripe Connect (direct charges).
-- Cada cobrança é criada na conta Stripe conectada do usuário; a plataforma
-- (conta Stripe do CNPJ 65.822.139/0001-66) recebe application_fee_amount = 1
-- unidade mínima da moeda da cobrança (R$ 0,01, US$ 0,01, ¥ 1...). As tarifas
-- do Stripe ficam com a conta conectada, então a plataforma recebe a taxa cheia.

CREATE TABLE IF NOT EXISTS public.wallet_charges (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id     text NOT NULL,
  checkout_session_id   text NOT NULL UNIQUE,
  payment_intent_id     text,
  checkout_url          text,
  description           text CHECK (description IS NULL OR char_length(description) <= 120),
  amount_minor          bigint NOT NULL CHECK (amount_minor > 1),
  currency              text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  platform_fee_minor    integer NOT NULL DEFAULT 1 CHECK (platform_fee_minor >= 0),
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'expired', 'failed')),
  paid_at               timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_charges_user_idx ON public.wallet_charges (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_charges_open_idx ON public.wallet_charges (status) WHERE status = 'open';

ALTER TABLE public.wallet_charges ENABLE ROW LEVEL SECURITY;
-- Sem policies: só a Edge Function `wallet` (service role) acessa.
REVOKE ALL ON public.wallet_charges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_charges TO service_role;

DROP TRIGGER IF EXISTS wallet_charges_touch ON public.wallet_charges;
CREATE TRIGGER wallet_charges_touch
  BEFORE UPDATE ON public.wallet_charges
  FOR EACH ROW EXECUTE FUNCTION public.wallet_payment_methods_touch();
