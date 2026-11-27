-- Atualizar bônus de referência de 100 para 50 créditos
-- Incluir detecção anti-fraude e logging de IP

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
  _bonus_credits constant integer := 50; -- Reduzido de 100 para 50
  _user_ip inet;
  _fraud_check record;
BEGIN
  _ref_code := substr(NEW.id::text, 1, 8);
  _referred_name := COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email);

  -- Extrair IP do novo usuário (se disponível)
  _user_ip := (NEW.raw_user_meta_data->>'ip_address')::inet;

  -- Registrar IP no log (para rastreamento anti-fraude)
  BEGIN
    PERFORM public.log_user_ip(
      NEW.id,
      _user_ip,
      NEW.raw_user_meta_data->>'user_agent',
      'signup'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to log user IP: %', SQLERRM;
  END;

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
      -- VALIDAÇÃO ANTI-FRAUDE: Impedir múltiplas contas do mesmo IP sendo afiliadas
      -- Verificar se referrer já tem afiliações de outro usuário do mesmo IP
      SELECT * INTO _fraud_check
      FROM public.detect_fraud_by_ip(_user_ip)
      LIMIT 1;

      -- Se risco é alto ou crítico, bloquear a indicação
      IF _fraud_check.risk_level IN ('high', 'critical') THEN
        RAISE WARNING 'Referral blocked due to fraud risk: IP has % accounts (risk_level: %)',
          _fraud_check.account_count, _fraud_check.risk_level;
        -- Criar flag de fraude
        INSERT INTO public.fraud_flags (ip_address, reason, severity)
        VALUES (
          _user_ip,
          format('Múltiplas contas tentando se vincular via referral (account_count: %s)',
            _fraud_check.account_count),
          'medium'
        ) ON CONFLICT DO NOTHING;
        -- NÃO criar a referência (bloquear golpe)
        RETURN NEW;
      END IF;

      INSERT INTO public.referrals (referrer_id, referred_id, credits_awarded)
      VALUES (_referrer_id, NEW.id, _bonus_credits); -- Usando 50 créditos

      -- Update user_credits (new consolidated system)
      INSERT INTO public.user_credits (user_id, balance)
      VALUES (_referrer_id, _bonus_credits)
      ON CONFLICT (user_id) DO UPDATE
      SET balance = user_credits.balance + _bonus_credits, updated_at = now();

      BEGIN
        INSERT INTO public.credit_transactions
          (user_id, delta, balance_after, reason, category, metadata, idempotency_key)
        SELECT _referrer_id, _bonus_credits, COALESCE(uc.balance, 0), 'referral_bonus', 'referral',
               jsonb_build_object('referred_id', NEW.id), 'referral:' || NEW.id
        FROM public.user_credits uc WHERE user_id = _referrer_id
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
                  'creditsEarned', _bonus_credits -- 50 créditos
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
      -- Update user_credits (new consolidated system)
      INSERT INTO public.user_credits (user_id, balance)
      VALUES (NEW.id, _pending_total)
      ON CONFLICT (user_id) DO UPDATE
      SET balance = user_credits.balance + _pending_total, updated_at = now();

      UPDATE public.pending_credits
        SET applied_at = now(), applied_user_id = NEW.id
        WHERE applied_at IS NULL AND lower(email) = lower(NEW.email);

      BEGIN
        INSERT INTO public.credit_transactions
          (user_id, delta, balance_after, reason, category, metadata)
        SELECT NEW.id, _pending_total, COALESCE(uc.balance, 0), 'pending_credit_grant', 'admin_grant',
               jsonb_build_object('email', NEW.email, 'source', 'handle_new_user')
        FROM public.user_credits uc WHERE user_id = NEW.id;
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
