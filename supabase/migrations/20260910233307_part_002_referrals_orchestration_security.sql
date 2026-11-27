-- Production migration 20260910233307 "part_002_referrals_orchestration_security", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

CREATE POLICY "Authenticated users can view all streaks for leaderboard"
  ON public.user_streaks FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view all profiles for leaderboard"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);



CREATE TABLE public.user_badges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  badge_type text NOT NULL,
  unlocked_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_type)
);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all badges" ON public.user_badges FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own badges" ON public.user_badges FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);



-- Add referral_code to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;

-- Backfill existing profiles with referral codes
UPDATE public.profiles SET referral_code = substr(id::text, 1, 8) WHERE referral_code IS NULL;

-- Create referrals table
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_id uuid NOT NULL UNIQUE,
  credits_awarded numeric NOT NULL DEFAULT 100,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referrals" ON public.referrals
  FOR SELECT TO authenticated USING (auth.uid() = referrer_id);

CREATE POLICY "System can insert referrals" ON public.referrals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = referred_id);

-- Update handle_new_user to generate referral_code and process referral
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _ref_code text;
  _referrer_id uuid;
BEGIN
  _ref_code := substr(NEW.id::text, 1, 8);

  INSERT INTO public.profiles (id, display_name, referral_code)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email), _ref_code);

  _ref_code := NEW.raw_user_meta_data->>'referral_code';
  IF _ref_code IS NOT NULL AND _ref_code != '' THEN
    SELECT id INTO _referrer_id FROM public.profiles WHERE referral_code = _ref_code;
    IF _referrer_id IS NOT NULL AND _referrer_id != NEW.id THEN
      INSERT INTO public.referrals (referrer_id, referred_id, credits_awarded)
      VALUES (_referrer_id, NEW.id, 100);
      UPDATE public.subscriptions
      SET edits_limit = edits_limit + 100, updated_at = now()
      WHERE user_id = _referrer_id AND is_active = true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


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
BEGIN
  _ref_code := substr(NEW.id::text, 1, 8);
  _referred_name := COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email);

  INSERT INTO public.profiles (id, display_name, referral_code)
  VALUES (NEW.id, _referred_name, _ref_code);

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

  RETURN NEW;
END;
$function$;


CREATE TABLE public.github_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  github_username TEXT,
  github_avatar_url TEXT,
  access_token TEXT NOT NULL,
  scope TEXT,
  connected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own github connection"
ON public.github_connections FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own github connection"
ON public.github_connections FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own github connection"
ON public.github_connections FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own github connection"
ON public.github_connections FOR DELETE
TO authenticated
USING (auth.uid() = user_id);


CREATE TABLE public.connector_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  connector_slug TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_connector_logs_user_slug ON public.connector_activity_logs(user_id, connector_slug, created_at DESC);

ALTER TABLE public.connector_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connector logs"
ON public.connector_activity_logs FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connector logs"
ON public.connector_activity_logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own connector logs"
ON public.connector_activity_logs FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

ALTER TABLE public.connector_activity_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.connector_activity_logs;

CREATE OR REPLACE FUNCTION public.is_kubo_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid() AND email = 'kuboprotocol@gmail.com'
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_list_connector_runs(_connector_slug text, _limit int DEFAULT 50)
RETURNS TABLE(run_id text, run_label text, event_count bigint, started_at timestamptz, user_id uuid, is_mine boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_kubo_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    (l.metadata->>'runId')::text AS run_id,
    COALESCE(MAX(l.metadata->>'runLabel'), 'Run') AS run_label,
    COUNT(*)::bigint AS event_count,
    MIN(l.created_at) AS started_at,
    (ARRAY_AGG(l.user_id ORDER BY l.created_at))[1] AS user_id,
    BOOL_OR(l.user_id = auth.uid()) AS is_mine
  FROM public.connector_activity_logs l
  WHERE l.connector_slug = _connector_slug
    AND l.metadata ? 'runId'
  GROUP BY (l.metadata->>'runId')
  ORDER BY MIN(l.created_at) DESC
  LIMIT _limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_clear_connector_run(_connector_slug text, _run_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _deleted int;
BEGIN
  IF NOT public.is_kubo_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH d AS (
    DELETE FROM public.connector_activity_logs
    WHERE connector_slug = _connector_slug
      AND metadata->>'runId' = _run_id
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO _deleted FROM d;

  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_connector_runs(text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_clear_connector_run(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_connector_runs(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_connector_run(text, text) TO authenticated;

CREATE TABLE public.orchestration_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  intent TEXT NOT NULL CHECK (intent IN ('web2_app','web3_app','hybrid')),
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  stack JSONB NOT NULL DEFAULT '{}'::jsonb,
  tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  model TEXT NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orchestration_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own plans"
  ON public.orchestration_plans FOR SELECT
  USING (auth.uid() = user_id OR public.is_kubo_admin());

CREATE POLICY "Users insert own plans"
  ON public.orchestration_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own plans"
  ON public.orchestration_plans FOR UPDATE
  USING (auth.uid() = user_id OR public.is_kubo_admin());

CREATE INDEX idx_orchestration_plans_user_created
  ON public.orchestration_plans (user_id, created_at DESC);

CREATE TABLE public.generated_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.orchestration_plans(id) ON DELETE SET NULL,
  standard TEXT NOT NULL DEFAULT 'erc20' CHECK (standard IN ('erc20','erc721','erc1155','custom')),
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimals INTEGER NOT NULL DEFAULT 18 CHECK (decimals BETWEEN 0 AND 36),
  initial_supply NUMERIC NOT NULL DEFAULT 0,
  source_code TEXT NOT NULL,
  solidity_version TEXT NOT NULL DEFAULT '0.8.24',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.generated_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own contracts" ON public.generated_contracts
  FOR SELECT USING (auth.uid() = user_id OR public.is_kubo_admin());
CREATE POLICY "Users insert own contracts" ON public.generated_contracts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own contracts" ON public.generated_contracts
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_generated_contracts_user ON public.generated_contracts (user_id, created_at DESC);
CREATE INDEX idx_generated_contracts_plan ON public.generated_contracts (plan_id);

ALTER TABLE public.orchestration_plans
  ADD COLUMN task_states JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE public.contract_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  contract_id UUID NOT NULL REFERENCES public.generated_contracts(id) ON DELETE CASCADE,
  network TEXT NOT NULL DEFAULT 'sepolia',
  chain_id INTEGER NOT NULL DEFAULT 11155111,
  contract_address TEXT NOT NULL,
  deployer_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  block_number BIGINT,
  gas_used TEXT,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  abi JSONB NOT NULL DEFAULT '[]'::jsonb,
  explorer_url TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own deployments" ON public.contract_deployments
  FOR SELECT USING (auth.uid() = user_id OR public.is_kubo_admin());
CREATE POLICY "Users insert own deployments" ON public.contract_deployments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_contract_deployments_contract ON public.contract_deployments(contract_id);
CREATE INDEX idx_contract_deployments_user ON public.contract_deployments(user_id);

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_clear_connector_run(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_connector_runs(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_kubo_admin() FROM PUBLIC, anon;

DROP POLICY IF EXISTS "Anyone can view published projects" ON public.projects;
DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;

CREATE POLICY "Owners can view own projects (full)" ON public.projects
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE VIEW public.published_projects
WITH (security_invoker = true) AS
SELECT id, title, description, generated_code, published_at, published_url, is_published, created_at, updated_at, user_id
FROM public.projects
WHERE is_published = true;

GRANT SELECT ON public.published_projects TO anon, authenticated;

CREATE POLICY "Public can view published project meta" ON public.projects
  FOR SELECT TO anon, authenticated
  USING (is_published = true AND auth.uid() IS DISTINCT FROM user_id);

DROP POLICY IF EXISTS "Users can view own github connection" ON public.github_connections;
DROP POLICY IF EXISTS "Users can insert own github connection" ON public.github_connections;
DROP POLICY IF EXISTS "Users can update own github connection" ON public.github_connections;

CREATE OR REPLACE VIEW public.github_connections_safe
WITH (security_invoker = true) AS
SELECT id, user_id, github_username, github_avatar_url, scope, connected_at, updated_at
FROM public.github_connections
WHERE auth.uid() = user_id;

GRANT SELECT ON public.github_connections_safe TO authenticated;

CREATE POLICY "Service role manages tokens" ON public.github_connections
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can delete own github connection (token-safe)" ON public.github_connections
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

REVOKE SELECT ON public.github_connections FROM anon, authenticated;
GRANT SELECT (id, user_id, github_username, github_avatar_url, scope, connected_at, updated_at)
  ON public.github_connections TO authenticated;

DROP POLICY IF EXISTS "Anyone can view products" ON public.connect_products;
CREATE POLICY "Authenticated users can view products" ON public.connect_products
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update own subscription" ON public.subscriptions;

CREATE POLICY "Service role manages subscriptions" ON public.subscriptions
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can insert own badges" ON public.user_badges;
CREATE POLICY "Service role inserts badges" ON public.user_badges
  FOR INSERT TO public WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can insert own ad rewards" ON public.ad_rewards;
CREATE POLICY "Service role inserts ad rewards" ON public.ad_rewards
  FOR INSERT TO public WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "System can insert referrals" ON public.referrals;
CREATE POLICY "Service role inserts referrals" ON public.referrals
  FOR INSERT TO public WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  bucket_key text NOT NULL,
  user_id uuid,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, user_id, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON public.rate_limit_counters(window_start);

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages rate limits"
  ON public.rate_limit_counters FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.bump_rate_limit(_bucket text, _user uuid, _window_seconds int)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _window timestamptz;
  _count int;
BEGIN
  _window := date_trunc('second', now()) - (extract(epoch from now())::int % _window_seconds) * interval '1 second';
  INSERT INTO public.rate_limit_counters (bucket_key, user_id, window_start, count)
  VALUES (_bucket, _user, _window, 1)
  ON CONFLICT (bucket_key, user_id, window_start)
  DO UPDATE SET count = public.rate_limit_counters.count + 1
  RETURNING count INTO _count;
  DELETE FROM public.rate_limit_counters WHERE window_start < now() - interval '1 hour';
  RETURN _count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_rate_limit(text, uuid, int) FROM PUBLIC, anon, authenticated;
