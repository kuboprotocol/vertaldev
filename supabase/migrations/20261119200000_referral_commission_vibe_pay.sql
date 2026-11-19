-- Indique e Ganhe → Vertal Vibe Pay.
--
-- A comissão de 5% (affiliate_commissions, desde 20260927020000) passa a cair
-- no Vertal Vibe Pay de quem indicou:
--   * cada comissão ganha uma linha no extrato (bank_transactions, método
--     'referral', provider 'internal' até ser paga);
--   * o valor é o que o Stripe liquidou na plataforma (BRL), não o preço em USD;
--   * o pagamento sai por Stripe Connect (transfer) ou ASAAS (walletId), ou
--     fica "disponível" até o titular abrir a conta (varredura diária).
-- Não muda a taxa (5%) nem o bônus de créditos no primeiro pagamento.

-- ── affiliate_commissions: dados de liquidação e de repasse ──────────────────
ALTER TABLE public.affiliate_commissions
  ADD COLUMN IF NOT EXISTS commission_currency  text,
  ADD COLUMN IF NOT EXISTS settled_amount_minor bigint,
  ADD COLUMN IF NOT EXISTS charge_id            text,
  ADD COLUMN IF NOT EXISTS available_at         timestamptz,
  ADD COLUMN IF NOT EXISTS payout_provider      text,
  ADD COLUMN IF NOT EXISTS payout_ref           text,
  ADD COLUMN IF NOT EXISTS payout_error         text,
  ADD COLUMN IF NOT EXISTS payout_attempts      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at      timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_minor       bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bank_transaction_id  uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at           timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.affiliate_commissions DROP CONSTRAINT IF EXISTS affiliate_commissions_payout_provider_check;
ALTER TABLE public.affiliate_commissions ADD CONSTRAINT affiliate_commissions_payout_provider_check
  CHECK (payout_provider IS NULL OR payout_provider IN ('stripe', 'asaas'));

CREATE INDEX IF NOT EXISTS affiliate_commissions_charge_idx
  ON public.affiliate_commissions (charge_id) WHERE charge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS affiliate_commissions_open_idx
  ON public.affiliate_commissions (status, available_at) WHERE status IN ('pending', 'approved');
-- Um repasse (transfer Stripe / transferência ASAAS) paga uma comissão só.
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_commissions_payout_ref_idx
  ON public.affiliate_commissions (payout_provider, payout_ref) WHERE payout_ref IS NOT NULL AND payout_ref <> 'inflight';

UPDATE public.affiliate_commissions
  SET commission_currency = coalesce(commission_currency, currency),
      available_at = coalesce(available_at, created_at + interval '30 days')
  WHERE commission_currency IS NULL OR available_at IS NULL;

-- RLS: continua só leitura das próprias linhas (policy affiliate_commissions_select_own).
-- As colunas novas não expõem segredo; escrita só pelo service role.
REVOKE INSERT, UPDATE, DELETE ON public.affiliate_commissions FROM anon, authenticated;

-- ── bank_transactions: provider interno, método e status novos ──────────────
ALTER TABLE public.bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_provider_check;
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_provider_check
  CHECK (provider IN ('stripe', 'asaas', 'internal'));

ALTER TABLE public.bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_method_check;
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_method_check
  CHECK (method IN ('pix', 'boleto', 'card', 'link', 'transfer', 'payout', 'referral'));

-- 'available': comissão liberada, aguardando o titular abrir conta para receber.
ALTER TABLE public.bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_status_check;
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_status_check
  CHECK (status IN ('pending', 'available', 'paid', 'failed', 'refunded', 'expired', 'canceled'));

CREATE INDEX IF NOT EXISTS bank_transactions_referral_open_idx
  ON public.bank_transactions (user_id) WHERE method = 'referral' AND status IN ('pending', 'available');

-- ── record_affiliate_commission: valor liquidado + linha no extrato ─────────
-- A assinatura antiga (5 args) sai para não haver ambiguidade; os args novos
-- têm default, então chamadas antigas (5 args nomeados) continuam valendo.
DROP FUNCTION IF EXISTS public.record_affiliate_commission(uuid, text, text, integer, text);

CREATE OR REPLACE FUNCTION public.record_affiliate_commission(
  _referred_id uuid,
  _source text,
  _source_ref text,
  _amount_cents integer,
  _currency text,
  _settled_minor bigint DEFAULT NULL,
  _settled_currency text DEFAULT NULL,
  _charge_id text DEFAULT NULL,
  _available_at timestamptz DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _rate constant numeric := 0.05;
  _bonus constant integer := 100;
  _affiliate uuid;
  _referral_id uuid;
  _awarded numeric;
  _base bigint;
  _cur text;
  _commission integer;
  _commission_id uuid;
  _tx_id uuid;
  _avail timestamptz;
BEGIN
  IF _referred_id IS NULL OR _amount_cents IS NULL OR _amount_cents <= 0 OR coalesce(_source_ref, '') = '' THEN
    RETURN 0;
  END IF;

  SELECT id, referrer_id, credits_awarded INTO _referral_id, _affiliate, _awarded
  FROM public.referrals
  WHERE referred_id = _referred_id
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF _affiliate IS NULL OR _affiliate = _referred_id THEN
    RETURN 0;
  END IF;

  -- Base: o que o Stripe liquidou na plataforma (BRL); sem isso, o valor cobrado.
  IF _settled_minor IS NOT NULL AND _settled_minor > 0 AND coalesce(_settled_currency, '') <> '' THEN
    _base := _settled_minor;
    _cur := lower(_settled_currency);
  ELSE
    _base := _amount_cents;
    _cur := lower(coalesce(_currency, 'usd'));
  END IF;
  _commission := floor(_base * _rate);
  _avail := coalesce(_available_at, now() + interval '30 days');

  INSERT INTO public.affiliate_commissions
    (affiliate_id, referred_id, source, source_ref, amount_cents, currency, rate, commission_cents,
     commission_currency, settled_amount_minor, charge_id, available_at)
  VALUES
    (_affiliate, _referred_id, _source, _source_ref, _amount_cents, lower(coalesce(_currency, 'usd')), _rate, _commission,
     _cur, _base, _charge_id, _avail)
  ON CONFLICT (source_ref) DO NOTHING
  RETURNING id INTO _commission_id;

  -- Linha no extrato do Vibe Pay (só na primeira vez e se houver valor).
  IF _commission_id IS NOT NULL AND _commission > 0 THEN
    INSERT INTO public.bank_transactions
      (user_id, provider, direction, method, status, amount_minor, net_minor, currency,
       description, provider_ref, metadata)
    VALUES
      (_affiliate, 'internal', 'in', 'referral', 'pending', _commission, _commission, _cur,
       'Indique e Ganhe', 'referral:' || _source_ref,
       jsonb_build_object('commission_id', _commission_id, 'source', _source, 'available_at', _avail, 'rate', _rate))
    ON CONFLICT (provider, provider_ref) DO NOTHING
    RETURNING id INTO _tx_id;

    IF _tx_id IS NOT NULL THEN
      UPDATE public.affiliate_commissions SET bank_transaction_id = _tx_id WHERE id = _commission_id;
    END IF;
  END IF;

  -- Bônus de indicação: uma vez só, no primeiro pagamento (inalterado).
  IF coalesce(_awarded, 0) = 0 THEN
    UPDATE public.referrals SET credits_awarded = _bonus WHERE id = _referral_id;

    UPDATE public.subscriptions
      SET edits_limit = edits_limit + _bonus, updated_at = now()
      WHERE user_id = _affiliate AND is_active = true;

    BEGIN
      INSERT INTO public.credit_transactions
        (user_id, delta, balance_after, reason, category, metadata, idempotency_key)
      SELECT _affiliate, _bonus, (edits_limit - edits_used), 'referral_bonus', 'referral',
             jsonb_build_object('referred_id', _referred_id, 'source_ref', _source_ref), 'referral:' || _referred_id
      FROM public.subscriptions WHERE user_id = _affiliate AND is_active = true
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to log referral bonus: %', SQLERRM;
    END;
  END IF;

  RETURN _commission;
END;
$$;

REVOKE ALL ON FUNCTION public.record_affiliate_commission(uuid, text, text, integer, text, bigint, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_affiliate_commission(uuid, text, text, integer, text, bigint, text, text, timestamptz) TO service_role;

-- Comissões antigas (se houver) ganham a linha no extrato.
WITH ins AS (
  INSERT INTO public.bank_transactions
    (user_id, provider, direction, method, status, amount_minor, net_minor, currency, description, provider_ref, metadata, created_at)
  SELECT c.affiliate_id, 'internal', 'in', 'referral',
         CASE c.status WHEN 'paid' THEN 'paid' WHEN 'approved' THEN 'available' WHEN 'void' THEN 'refunded' ELSE 'pending' END,
         c.commission_cents, c.commission_cents, c.commission_currency, 'Indique e Ganhe', 'referral:' || c.source_ref,
         jsonb_build_object('commission_id', c.id, 'source', c.source, 'available_at', c.available_at, 'rate', c.rate),
         c.created_at
  FROM public.affiliate_commissions c
  WHERE c.bank_transaction_id IS NULL AND c.commission_cents > 0
  ON CONFLICT (provider, provider_ref) DO NOTHING
  RETURNING id, (metadata->>'commission_id')::uuid AS commission_id
)
UPDATE public.affiliate_commissions c SET bank_transaction_id = ins.id FROM ins WHERE ins.commission_id = c.id;

-- ── Varredura diária (repasse de comissões liberadas) ────────────────────────
-- Chama stripe-connect-webhook?task=referral-sweep com o segredo do Vault
-- `referral_sweep_secret` (o mesmo valor do secret REFERRAL_SWEEP_SECRET da
-- função). Sem o segredo no Vault, não faz nada.
CREATE OR REPLACE FUNCTION public.kick_referral_sweep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _secret text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO _secret FROM vault.decrypted_secrets WHERE name = 'referral_sweep_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    _secret := NULL;
  END;
  IF coalesce(_secret, '') = '' THEN
    RAISE NOTICE 'kick_referral_sweep: vault secret referral_sweep_secret not set';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := 'https://sccizjlpwezsgaxkclot.supabase.co/functions/v1/stripe-connect-webhook?task=referral-sweep',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-referral-sweep-secret', _secret),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kick_referral_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kick_referral_sweep() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'referral-commission-sweep';
    -- 09:15 UTC = 06:15 em São Paulo.
    PERFORM cron.schedule('referral-commission-sweep', '15 9 * * *', 'SELECT public.kick_referral_sweep()');
  END IF;
END;
$$;
