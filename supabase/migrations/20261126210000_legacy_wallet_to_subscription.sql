-- Carteira legada (public.user_credits.balance) → saldo real (assinatura ativa).
--
-- Desde o PR #288 o app inteiro mostra um só saldo: subscriptions.edits_limit - edits_used
-- da assinatura ativa. A carteira antiga user_credits.balance não é gastável por nada, então:
--   1) o saldo positivo de cada usuário é somado à assinatura ativa pelo mesmo caminho das
--      outras recompensas (public.execute_atomic_credit_topup → linha no extrato
--      credit_transactions com chave de idempotência 'legacy_migration:user_credits'),
--      o valor original fica guardado em public.legacy_credit_migrations e a carteira vai a 0;
--   2) tudo que ainda creditava a carteira legada passa a creditar a assinatura (com extrato):
--      calculate_shortlink_rewards, process_stripe_payment, handle_new_user (bônus de indicação
--      e créditos pendentes) e apply_credit_debt;
--   3) apply_daily_credits (cron diário) passa a gravar a linha do extrato.
--
-- Aditiva e idempotente: pode rodar de novo sem creditar duas vezes. Usuário sem assinatura
-- ativa não é migrado (nenhuma assinatura é criada): fica registrado como
-- 'skipped_no_subscription' e o saldo legado continua intacto.

-- ---------------------------------------------------------------------------
-- 1) Registro de auditoria da migração (valor original nunca se perde)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.legacy_credit_migrations (
  user_id uuid PRIMARY KEY,
  original_balance integer NOT NULL,
  original_debt integer NOT NULL DEFAULT 0,
  migrated_amount integer NOT NULL DEFAULT 0,
  subscription_id uuid,
  credit_transaction_id uuid,
  status text NOT NULL CHECK (status IN ('migrated', 'skipped_no_subscription')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.legacy_credit_migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own legacy credit migration" ON public.legacy_credit_migrations;
CREATE POLICY "Users view own legacy credit migration"
  ON public.legacy_credit_migrations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages legacy credit migrations" ON public.legacy_credit_migrations;
CREATE POLICY "Service role manages legacy credit migrations"
  ON public.legacy_credit_migrations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.legacy_credit_migrations FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.legacy_credit_migrations TO authenticated;
GRANT ALL ON TABLE public.legacy_credit_migrations TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Migração do saldo legado → assinatura ativa
-- ---------------------------------------------------------------------------
DO $migrate$
DECLARE
  r record;
  _sub_id uuid;
  _res jsonb;
BEGIN
  FOR r IN
    SELECT uc.user_id, uc.balance, uc.debt
    FROM public.user_credits uc
    WHERE uc.balance > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.legacy_credit_migrations m
        WHERE m.user_id = uc.user_id AND m.status = 'migrated'
      )
    FOR UPDATE OF uc
  LOOP
    SELECT s.id INTO _sub_id
    FROM public.subscriptions s
    WHERE s.user_id = r.user_id AND s.is_active = true
    ORDER BY s.updated_at DESC NULLS LAST
    LIMIT 1;

    IF _sub_id IS NULL THEN
      INSERT INTO public.legacy_credit_migrations
        (user_id, original_balance, original_debt, status, note)
      VALUES
        (r.user_id, r.balance, r.debt, 'skipped_no_subscription',
         'sem assinatura ativa: saldo legado mantido em user_credits')
      ON CONFLICT (user_id) DO UPDATE
        SET original_balance = EXCLUDED.original_balance,
            original_debt = EXCLUDED.original_debt,
            note = EXCLUDED.note,
            updated_at = now();
      RAISE NOTICE 'legacy wallet: % sem assinatura ativa, ignorado (saldo %)', r.user_id, r.balance;
      CONTINUE;
    END IF;

    _res := public.execute_atomic_credit_topup(
      r.user_id,
      r.balance,
      'Migração do saldo legado (carteira antiga)',
      'legacy_migration',
      jsonb_build_object(
        'type', 'legacy_migration',
        'source', 'user_credits.balance',
        'original_balance', r.balance,
        'original_debt', r.debt,
        'subscription_id', _sub_id
      ),
      'legacy_migration:user_credits'
    );

    INSERT INTO public.legacy_credit_migrations
      (user_id, original_balance, original_debt, migrated_amount, subscription_id,
       credit_transaction_id, status, note)
    VALUES
      (r.user_id, r.balance, r.debt, r.balance, _sub_id,
       (_res ->> 'transaction_id')::uuid, 'migrated',
       CASE WHEN COALESCE((_res ->> 'replayed')::boolean, false)
            THEN 'crédito já existia no extrato (replay)' END)
    ON CONFLICT (user_id) DO UPDATE
      SET original_balance = EXCLUDED.original_balance,
          original_debt = EXCLUDED.original_debt,
          migrated_amount = EXCLUDED.migrated_amount,
          subscription_id = EXCLUDED.subscription_id,
          credit_transaction_id = EXCLUDED.credit_transaction_id,
          status = 'migrated',
          note = EXCLUDED.note,
          updated_at = now();

    -- Zera a carteira legada (o trigger audit_user_credits_changes também registra o antes/depois).
    UPDATE public.user_credits
    SET balance = 0, updated_at = now()
    WHERE user_id = r.user_id;
  END LOOP;
END
$migrate$;

-- ---------------------------------------------------------------------------
-- 3) Recompensa diária de shortlinks → assinatura + extrato
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_shortlink_rewards(_user_id uuid, _reward_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(reward_date date, base_reward integer, bonus_reward integer, total_reward integer, user_balance_after numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_active_count int;
  v_bonus int;
  v_total int;
  v_res jsonb;
begin
  select count(*) into v_active_count
  from public.shortlinks sl
  where sl.user_id = _user_id and sl.status = 'active';

  if v_active_count = 0 then
    return;
  end if;

  -- 5 de base + 5 a cada 10 shortlinks ativos
  v_bonus := (v_active_count / 10) * 5;
  v_total := 5 + v_bonus;

  -- Já pago nesse dia: devolve o registro existente e o saldo real atual.
  if exists (
    select 1 from public.daily_shortlink_rewards d
    where d.user_id = _user_id and d.reward_date = _reward_date
  ) then
    return query
    select d.reward_date, d.base_reward, d.bonus_reward, d.total_reward,
           (select (s.edits_limit - s.edits_used)::numeric
              from public.subscriptions s
             where s.user_id = _user_id and s.is_active = true
             limit 1)
    from public.daily_shortlink_rewards d
    where d.user_id = _user_id and d.reward_date = _reward_date;
    return;
  end if;

  insert into public.daily_shortlink_rewards (user_id, reward_date, base_reward, bonus_reward)
  values (_user_id, _reward_date, 5, v_bonus)
  on conflict (user_id, reward_date) do nothing;

  -- Credita no saldo real (assinatura ativa) com linha no extrato; a chave impede crédito duplo.
  v_res := public.execute_atomic_credit_topup(
    _user_id,
    v_total,
    'Recompensa diária de shortlinks',
    'shortlink_reward',
    jsonb_build_object('reward_date', _reward_date, 'active_shortlinks', v_active_count,
                       'base_reward', 5, 'bonus_reward', v_bonus),
    'shortlink_daily:' || _reward_date::text
  );

  return query
  select _reward_date, 5, v_bonus, v_total, (v_res ->> 'balance_after')::numeric;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4) Compra avulsa via Stripe (stripe-payments) → assinatura + extrato
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_stripe_payment(_transaction_id uuid, _credits integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid;
BEGIN
  SELECT user_id INTO _user_id
  FROM public.stripe_transactions
  WHERE id = _transaction_id
  FOR UPDATE;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  -- Mesmo caminho das recompensas: soma em subscriptions.edits_limit e grava o extrato.
  -- A chave por transação impede crédito duplo se o webhook chegar mais de uma vez.
  PERFORM public.execute_atomic_credit_topup(
    _user_id,
    _credits,
    'Compra de créditos (Stripe)',
    'purchase',
    jsonb_build_object('stripe_transaction_id', _transaction_id, 'source', 'process_stripe_payment'),
    'stripe_tx:' || _transaction_id::text
  );

  UPDATE public.stripe_transactions
  SET status = 'completed', completed_at = COALESCE(completed_at, now())
  WHERE id = _transaction_id;

  RETURN true;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5) Dívida legada: paga a dívida primeiro, o resto vai para o saldo real
--    (sem chamadores hoje; mantida para não quebrar a assinatura da função)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_credit_debt(_user_id uuid, _reward_amount integer)
 RETURNS TABLE(reward_applied integer, debt_paid integer, new_balance integer, new_debt integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _current_debt integer;
  _debt_payment integer;
  _reward_applied integer;
  _new_debt integer;
  _balance integer;
  _res jsonb;
begin
  select uc.debt into _current_debt
  from public.user_credits uc
  where uc.user_id = _user_id
  for update;

  _current_debt := coalesce(_current_debt, 0);
  _debt_payment := least(coalesce(_reward_amount, 0), _current_debt);
  _reward_applied := coalesce(_reward_amount, 0) - _debt_payment;
  _new_debt := _current_debt - _debt_payment;

  if _debt_payment > 0 then
    update public.user_credits
    set debt = _new_debt, updated_at = now()
    where user_id = _user_id;
  end if;

  if _reward_applied > 0 then
    _res := public.execute_atomic_credit_topup(
      _user_id, _reward_applied, 'Recompensa (após quitar dívida)', 'reward',
      jsonb_build_object('debt_paid', _debt_payment, 'source', 'apply_credit_debt'), null);
    _balance := (_res ->> 'balance_after')::integer;
  else
    select (s.edits_limit - s.edits_used) into _balance
    from public.subscriptions s
    where s.user_id = _user_id and s.is_active = true
    limit 1;
  end if;

  return query select _reward_applied, _debt_payment, coalesce(_balance, 0), _new_debt;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6) Créditos diários do plano (cron 03:00 UTC) agora aparecem no extrato
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_daily_credits()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  WITH upd AS (
    UPDATE public.subscriptions s
    SET edits_limit = s.edits_limit + pc.daily_credits,
        last_daily_credit_at = now(),
        updated_at = now()
    FROM public.plan_config pc
    WHERE pc.plan = s.plan
      AND s.is_active = true
      AND pc.daily_credits > 0
      AND (s.last_daily_credit_at IS NULL OR s.last_daily_credit_at < now() - interval '1 day')
    RETURNING s.id, s.user_id, s.plan, pc.daily_credits AS amount, s.edits_limit, s.edits_used
  )
  INSERT INTO public.credit_transactions
    (user_id, delta, balance_after, reason, category, metadata, idempotency_key)
  SELECT u.user_id, u.amount, u.edits_limit - u.edits_used,
         'Créditos diários do plano', 'daily_plan',
         jsonb_build_object('plan', u.plan, 'subscription_id', u.id, 'source', 'apply_daily_credits'),
         'daily_plan_cron:' || u.id::text || ':' || (now() AT TIME ZONE 'UTC')::date::text
  FROM upd u
  ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7) Cadastro (handle_new_user): bônus de indicação e créditos pendentes → assinatura + extrato
--    (cópia da versão de produção; só os dois créditos na carteira legada foram trocados)
-- ---------------------------------------------------------------------------
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
  _bonus_credits constant integer := 50;
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
      VALUES (_referrer_id, NEW.id, _bonus_credits);

      -- Bônus de indicação no saldo real (assinatura ativa do indicador) + extrato.
      BEGIN
        PERFORM public.execute_atomic_credit_topup(
          _referrer_id, _bonus_credits, 'referral_bonus', 'referral',
          jsonb_build_object('referred_id', NEW.id), 'referral:' || NEW.id);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to credit referral bonus: %', SQLERRM;
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
                  'creditsEarned', _bonus_credits
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
      -- Créditos pendentes no saldo real (assinatura criada acima) + extrato.
      PERFORM public.execute_atomic_credit_topup(
        NEW.id, _pending_total, 'pending_credit_grant', 'admin_grant',
        jsonb_build_object('email', NEW.email, 'source', 'handle_new_user'),
        'pending_credit_grant:' || NEW.id);

      UPDATE public.pending_credits
        SET applied_at = now(), applied_user_id = NEW.id
        WHERE applied_at IS NULL AND lower(email) = lower(NEW.email);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to apply pending credits: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
