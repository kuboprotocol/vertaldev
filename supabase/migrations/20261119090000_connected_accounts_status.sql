-- Espelho do status da conta Stripe conectada, atualizado pelo webhook
-- stripe-connect-webhook (account.updated) e pela ação connect-status da Carteira.
ALTER TABLE public.connected_accounts
  ADD COLUMN IF NOT EXISTS charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requirements_disabled_reason text,
  ADD COLUMN IF NOT EXISTS requirements_due text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS connected_accounts_user_idx ON public.connected_accounts (user_id, created_at DESC);
