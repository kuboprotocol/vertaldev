-- Production migration 20260916082841 "fix_credit_bootstrap_and_daily_topup", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

-- Espelha o PLAN_CONFIG do frontend (src/lib/planConfig.ts) no banco, pra
-- que o cron de crédito diário e o handle_new_user() tenham uma fonte de
-- verdade sem duplicar a lógica em dois lugares desalinhados.
CREATE TABLE public.plan_config (
  plan text PRIMARY KEY,
  display_name text NOT NULL,
  price_usd numeric NOT NULL DEFAULT 0,
  daily_credits integer NOT NULL DEFAULT 0,
  signup_credits integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.plan_config TO authenticated;
GRANT ALL ON public.plan_config TO service_role;
ALTER TABLE public.plan_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_signed_in_reads_plan_config" ON public.plan_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role_manages_plan_config" ON public.plan_config
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

INSERT INTO public.plan_config (plan, display_name, price_usd, daily_credits, signup_credits) VALUES
  ('free',       'Free',       0,      0,    5),
  ('starter',    'Starter',    4.99,   5,    0),
  ('pro',        'Pro',        19.99,  5,    0),
  ('premium_1',  'Premium 1',  49.99,  5,    0),
  ('premium_2',  'Premium 2',  79.99,  5,    0),
  ('business_1', 'Business 1', 99.99,  12,   0),
  ('business_2', 'Business 2', 199.99, 50,   0),
  ('business_3', 'Business 3', 299.99, 200,  0),
  ('business_4', 'Business 4', 399.99, 400,  0),
  ('business_5', 'Business 5', 499.99, 600,  0),
  ('business_6', 'Business 6', 599.99, 800,  0),
  ('business_7', 'Business 7', 699.99, 1000, 0),
  ('enterprise', 'Enterprise', 0,      1200, 0),
  ('beta',       'Beta',       0,      5,    0);

-- Controle de quando o topo diário foi aplicado pela última vez, pra não
-- dar crédito duas vezes no mesmo dia.
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_daily_credit_at timestamptz;

-- Corrige handle_new_user(): agora SEMPRE cria a assinatura base (antes só
-- criava se houvesse crédito pendente de indicação — cadastro normal
-- ficava sem nenhuma linha de assinatura, logo sem crédito nenhum).
-- Contas admin ganham plano 'enterprise' com um bônus inicial equivalente
-- a 1 dia de crédito, em vez do free padrão.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Função de topo diário: roda 1x/dia via pg_cron, soma daily_credits ao
-- limite de cada assinatura ativa (ignora planos com daily_credits = 0,
-- como o free — esse só ganha no cadastro mesmo).
CREATE OR REPLACE FUNCTION public.apply_daily_credits()
RETURNS void AS $$
BEGIN
  UPDATE public.subscriptions s
  SET edits_limit = s.edits_limit + pc.daily_credits,
      last_daily_credit_at = now(),
      updated_at = now()
  FROM public.plan_config pc
  WHERE pc.plan = s.plan
    AND s.is_active = true
    AND pc.daily_credits > 0
    AND (s.last_daily_credit_at IS NULL OR s.last_daily_credit_at < now() - interval '1 day');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

SELECT cron.schedule('apply-daily-credits', '0 3 * * *', $$SELECT public.apply_daily_credits()$$);

-- Retroativo: cria a assinatura que kuboprotocol@gmail.com deveria ter
-- ganhado no cadastro (já é admin, então plano enterprise + bônus inicial).
DO $$
DECLARE
    uid uuid;
    _credits integer;
BEGIN
    SELECT id INTO uid FROM auth.users WHERE email = 'kuboprotocol@gmail.com';
    SELECT daily_credits INTO _credits FROM public.plan_config WHERE plan = 'enterprise';
    IF uid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = uid) THEN
        INSERT INTO public.subscriptions (user_id, plan, edits_limit, edits_used, is_active, last_daily_credit_at)
        VALUES (uid, 'enterprise', _credits, 0, true, now());
    END IF;
END $$;
