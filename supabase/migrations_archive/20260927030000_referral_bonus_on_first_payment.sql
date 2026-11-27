-- Indicação: os +100 créditos de quem indicou saem só no PRIMEIRO pagamento
-- do indicado (antes saíam no cadastro, o que permitia criar contas falsas
-- para ganhar créditos). O cadastro continua criando a linha em `referrals`,
-- agora com credits_awarded = 0.
--
-- record_affiliate_commission (chamada pelo stripe-webhook a cada pagamento)
-- passa a liberar o bônus uma única vez, além da comissão de 5%.

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
  _bonus constant integer := 100;
  _affiliate uuid;
  _referral_id uuid;
  _awarded numeric;
  _commission integer;
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

  _commission := floor(_amount_cents * _rate);

  INSERT INTO public.affiliate_commissions
    (affiliate_id, referred_id, source, source_ref, amount_cents, currency, rate, commission_cents)
  VALUES
    (_affiliate, _referred_id, _source, _source_ref, _amount_cents, lower(coalesce(_currency, 'usd')), _rate, _commission)
  ON CONFLICT (source_ref) DO NOTHING;

  -- Bônus de indicação: uma vez só, no primeiro pagamento.
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

REVOKE ALL ON FUNCTION public.record_affiliate_commission(uuid, text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_affiliate_commission(uuid, text, text, integer, text) TO service_role;

-- Cadastro pelo link: registra a indicação sem dar créditos ainda.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ref_code text;
  _referrer_id uuid;
  _referred_name text;
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
      -- Os +100 créditos saem no primeiro pagamento (record_affiliate_commission).
      INSERT INTO public.referrals (referrer_id, referred_id, credits_awarded)
      VALUES (_referrer_id, NEW.id, 0)
      ON CONFLICT (referred_id) DO NOTHING;
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
