-- VERTAL Bank: e-bank sobre Stripe (conta global / Connect) + ASAAS (Pix, boleto, subcontas).
--
-- Segurança:
--   * Nada de número de cartão aqui. Cartões do usuário continuam como
--     PaymentMethods do Stripe (wallet_payment_methods). Tokens de cartão do
--     ASAAS (creditCardToken) ficam cifrados (AES-GCM, CONNECTOR_ENC_KEY).
--   * A apiKey da subconta ASAAS de cada usuário é segredo: cifrada e sem
--     nenhuma policy para o cliente (só a service role, via Edge Function).
--   * bank_transactions é o extrato unificado: o usuário LÊ as próprias linhas
--     (RLS), mas só a service role escreve.
--
-- Idempotente: pode rodar em bancos onde parte disso já existe.

-- ── Conta global Stripe: país e moeda da conta conectada ─────────────────
ALTER TABLE public.connected_accounts
  ADD COLUMN IF NOT EXISTS country text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  ADD COLUMN IF NOT EXISTS default_currency text CHECK (default_currency IS NULL OR default_currency ~ '^[a-z]{3}$');

-- O vínculo usuário ↔ acct_… e o espelho de status (charges_enabled etc.)
-- só podem ser escritos pelas Edge Functions (service role). As policies
-- antigas deixavam o próprio usuário inserir/alterar essas colunas.
DROP POLICY IF EXISTS "Users can insert own connected accounts" ON public.connected_accounts;
DROP POLICY IF EXISTS "Users can update own connected accounts" ON public.connected_accounts;
REVOKE INSERT, UPDATE, DELETE ON public.connected_accounts FROM anon, authenticated;

-- ── Subconta ASAAS (white-label) por usuário ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_asaas_accounts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  env                  text NOT NULL DEFAULT 'sandbox' CHECK (env IN ('sandbox', 'production')),
  asaas_account_id     text NOT NULL,
  wallet_id            text NOT NULL,
  api_key_ciphertext   text NOT NULL,
  api_key_iv           text NOT NULL,
  api_key_tag          text NOT NULL,
  person_type          text CHECK (person_type IN ('FISICA', 'JURIDICA')),
  holder_name          text CHECK (holder_name IS NULL OR char_length(holder_name) <= 120),
  cpf_cnpj_masked      text,
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'awaiting_approval', 'approved', 'rejected')),
  status_detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_synced_at     timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env, asaas_account_id)
);

ALTER TABLE public.bank_asaas_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_asaas_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_asaas_accounts TO service_role;

-- ── Tokens de cartão ASAAS (pagadores recorrentes de uma subconta) ───────
CREATE TABLE IF NOT EXISTS public.bank_asaas_card_tokens (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asaas_customer_id    text NOT NULL,
  token_ciphertext     text NOT NULL,
  token_iv             text NOT NULL,
  token_tag            text NOT NULL,
  card_brand           text,
  card_last4           text CHECK (card_last4 IS NULL OR card_last4 ~ '^\d{4}$'),
  holder_name          text CHECK (holder_name IS NULL OR char_length(holder_name) <= 80),
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_asaas_card_tokens_user_idx
  ON public.bank_asaas_card_tokens (user_id, asaas_customer_id);

ALTER TABLE public.bank_asaas_card_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_asaas_card_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_asaas_card_tokens TO service_role;

-- ── Extrato unificado (entradas e saídas, Stripe + ASAAS) ────────────────
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider             text NOT NULL CHECK (provider IN ('stripe', 'asaas')),
  direction            text NOT NULL CHECK (direction IN ('in', 'out')),
  method               text NOT NULL CHECK (method IN ('pix', 'boleto', 'card', 'link', 'transfer', 'payout')),
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'expired', 'canceled')),
  amount_minor         bigint NOT NULL CHECK (amount_minor > 0),
  net_minor            bigint,
  fee_minor            bigint,
  currency             text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  description          text CHECK (description IS NULL OR char_length(description) <= 200),
  counterparty         text CHECK (counterparty IS NULL OR char_length(counterparty) <= 120),
  provider_ref         text NOT NULL,          -- pay_…, tra_…, po_…, plink_…
  checkout_url         text,                   -- fatura / link / checkout
  pix_payload          text,                   -- copia e cola
  boleto_line          text,                   -- linha digitável
  receipt_url          text,
  failure_reason       text,
  due_date             date,
  settled_at           timestamptz,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_ref)
);
CREATE INDEX IF NOT EXISTS bank_transactions_user_idx ON public.bank_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bank_transactions_pending_idx ON public.bank_transactions (provider, status) WHERE status = 'pending';

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.bank_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO service_role;
DROP POLICY IF EXISTS "bank_transactions_select_own" ON public.bank_transactions;
CREATE POLICY "bank_transactions_select_own" ON public.bank_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ── Idempotência dos webhooks (ASAAS reenvia; Stripe também) ─────────────
CREATE TABLE IF NOT EXISTS public.bank_webhook_events (
  provider     text NOT NULL CHECK (provider IN ('stripe', 'asaas')),
  event_id     text NOT NULL,
  event_type   text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);
ALTER TABLE public.bank_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_webhook_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.bank_webhook_events TO service_role;

-- ── updated_at ───────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS bank_asaas_accounts_touch ON public.bank_asaas_accounts;
CREATE TRIGGER bank_asaas_accounts_touch
  BEFORE UPDATE ON public.bank_asaas_accounts
  FOR EACH ROW EXECUTE FUNCTION public.wallet_payment_methods_touch();

DROP TRIGGER IF EXISTS bank_transactions_touch ON public.bank_transactions;
CREATE TRIGGER bank_transactions_touch
  BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.wallet_payment_methods_touch();
