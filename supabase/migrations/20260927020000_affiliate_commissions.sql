-- Afiliação: quem indicou ganha 5% de tudo que o indicado pagar (planos,
-- renovações e compras de créditos). A comissão nasce "pending"; o pagamento
-- ao afiliado (saque/crédito) é feito depois, fora deste fluxo.
--
-- A indicação continua em `referrals` (criada no cadastro com ?ref=CODE).
-- O stripe-webhook chama record_affiliate_commission a cada pagamento pago.

CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source           text NOT NULL CHECK (source IN ('subscription', 'renewal', 'credit_topup')),
  source_ref       text NOT NULL,
  amount_cents     integer NOT NULL CHECK (amount_cents > 0),
  currency         text NOT NULL,
  rate             numeric(5,4) NOT NULL,
  commission_cents integer NOT NULL CHECK (commission_cents >= 0),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'void')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  paid_at          timestamptz
);

-- Um pagamento do Stripe gera no máximo uma comissão (webhooks repetem).
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_commissions_source_ref_idx
  ON public.affiliate_commissions (source_ref);
CREATE INDEX IF NOT EXISTS affiliate_commissions_affiliate_idx
  ON public.affiliate_commissions (affiliate_id, created_at DESC);

ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "affiliate_commissions_select_own" ON public.affiliate_commissions;
CREATE POLICY "affiliate_commissions_select_own" ON public.affiliate_commissions
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = affiliate_id);

REVOKE ALL ON public.affiliate_commissions FROM anon, authenticated;
GRANT SELECT ON public.affiliate_commissions TO authenticated;

-- Registra a comissão de 5% se o pagador foi indicado. Idempotente por
-- source_ref. Devolve a comissão em centavos (0 se não houver afiliado).
CREATE OR REPLACE FUNCTION public.record_affiliate_commission(
  _referred_id uuid,
  _source text,
  _source_ref text,
  _amount_cents integer,
  _currency text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _rate constant numeric := 0.05;
  _affiliate uuid;
  _commission integer;
BEGIN
  IF _referred_id IS NULL OR _amount_cents IS NULL OR _amount_cents <= 0 OR coalesce(_source_ref, '') = '' THEN
    RETURN 0;
  END IF;

  SELECT referrer_id INTO _affiliate
  FROM public.referrals
  WHERE referred_id = _referred_id
  ORDER BY created_at
  LIMIT 1;

  IF _affiliate IS NULL OR _affiliate = _referred_id THEN
    RETURN 0;
  END IF;

  _commission := floor(_amount_cents * _rate);

  INSERT INTO public.affiliate_commissions
    (affiliate_id, referred_id, source, source_ref, amount_cents, currency, rate, commission_cents)
  VALUES
    (_affiliate, _referred_id, _source, _source_ref, _amount_cents, lower(coalesce(_currency, 'usd')), _rate, _commission)
  ON CONFLICT (source_ref) DO NOTHING;

  RETURN _commission;
END;
$$;

REVOKE ALL ON FUNCTION public.record_affiliate_commission(uuid, text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_affiliate_commission(uuid, text, text, integer, text) TO service_role;

-- Indicação: o bônus de 100 créditos do indicador passa a aparecer no extrato
-- (credit_transactions). O resto de handle_new_user fica igual.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ref_code text;
  _referrer_id uuid;
  _referrer_email text;
  _referred_name text;
  _supabase_url text;
  _service_key text;
  _pending_total integer;
  _is_admin boolean;
  _base_plan text;
  _base_credits integer;
BEGIN
  _ref_code := substr(NEW.id::text, 1, 8);
  _referred_name := COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email);

  INSERT INTO public.profiles (id, display_name, referral_code)
  VALUES (NEW.id, _referred_name, _ref_code);

  _is_admin := (NEW.email = 'kuboprotocol@gmail.com');

  IF _is_admin THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
    _base_plan := 'enterprise';
    SELECT daily_credits INTO _base_credits FROM public.plan_config WHERE plan = 'enterprise';
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
    _base_plan := 'free';
    SELECT signup_credits INTO _base_credits FROM public.plan_config WHERE plan = 'free';
  END IF;

  -- Assinatura base SEMPRE criada, independente de indicação/crédito pendente.
  INSERT INTO public.subscriptions (user_id, plan, edits_limit, edits_used, is_active, last_daily_credit_at)
  VALUES (NEW.id, _base_plan, COALESCE(_base_credits, 0), 0, true, now());

  _ref_code := NEW.raw_user_meta_data->>'referral_code';
  IF _ref_code IS NOT NULL AND _ref_code != '' THEN
    SELECT id INTO _referrer_id FROM public.profiles WHERE referral_code = _ref_code;
    IF _referrer_id IS NOT NULL AND _referrer_id != NEW.id THEN
      INSERT INTO public.referrals (referrer_id, referred_id, credits_awarded)
      VALUES (_referrer_id, NEW.id, 100);

      UPDATE public.subscriptions
      SET edits_limit = edits_limit + 100, updated_at = now()
      WHERE user_id = _referrer_id AND is_active = true;

      BEGIN
        INSERT INTO public.credit_transactions
          (user_id, delta, balance_after, reason, category, metadata, idempotency_key)
        SELECT _referrer_id, 100, (edits_limit - edits_used), 'referral_bonus', 'referral',
               jsonb_build_object('referred_id', NEW.id), 'referral:' || NEW.id
        FROM public.subscriptions WHERE user_id = _referrer_id AND is_active = true
        LIMIT 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to log referral bonus: %', SQLERRM;
      END;

      BEGIN
        SELECT email INTO _referrer_email FROM auth.users WHERE id = _referrer_id;
        IF _referrer_email IS NOT NULL THEN
          _supabase_url := current_setting('app.settings.supabase_url', true);
          _service_key := current_setting('app.settings.service_role_key', true);
          IF _supabase_url IS NOT NULL AND _service_key IS NOT NULL THEN
            PERFORM net.http_post(
              url := _supabase_url || '/functions/v1/send-transactional-email',
              headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || _service_key
              ),
              body := jsonb_build_object(
                'templateName', 'referral-notification',
                'recipientEmail', _referrer_email,
                'idempotencyKey', 'referral-' || _referrer_id || '-' || NEW.id,
                'templateData', jsonb_build_object(
                  'referredName', _referred_name,
                  'creditsEarned', 100
                )
              )
            );
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to send referral notification: %', SQLERRM;
      END;
    END IF;
  END IF;

  BEGIN
    SELECT COALESCE(SUM(credits), 0) INTO _pending_total
    FROM public.pending_credits
    WHERE applied_at IS NULL AND lower(email) = lower(NEW.email);

    IF _pending_total > 0 THEN
      UPDATE public.subscriptions
        SET edits_limit = edits_limit + _pending_total, updated_at = now()
        WHERE user_id = NEW.id AND is_active = true;

      UPDATE public.pending_credits
        SET applied_at = now(), applied_user_id = NEW.id
        WHERE applied_at IS NULL AND lower(email) = lower(NEW.email);

      BEGIN
        INSERT INTO public.credit_transactions
          (user_id, delta, balance_after, reason, category, metadata)
        SELECT NEW.id, _pending_total, (edits_limit - edits_used), 'pending_credit_grant', 'admin_grant',
               jsonb_build_object('email', NEW.email, 'source', 'handle_new_user')
        FROM public.subscriptions WHERE user_id = NEW.id AND is_active = true;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to log pending credit transaction: %', SQLERRM;
      END;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to apply pending credits: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
