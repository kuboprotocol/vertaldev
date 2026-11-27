-- Production migration 20260910233624 "part_004_domains_credits_creative_hardening", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

CREATE TABLE public.kubo_ionos_contracts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  contract_id text NOT NULL UNIQUE,
  admin_id text,
  reseller_reference text NOT NULL,
  plan text NOT NULL DEFAULT 'starter',
  resource_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.kubo_ionos_contracts TO authenticated;
GRANT ALL ON public.kubo_ionos_contracts TO service_role;
ALTER TABLE public.kubo_ionos_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own contract" ON public.kubo_ionos_contracts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role manages contracts" ON public.kubo_ionos_contracts FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE public.kubo_domains (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  contract_id text,
  ionos_domain_id text,
  domain_name text NOT NULL,
  tld text NOT NULL,
  source text NOT NULL CHECK (source IN ('purchase','transfer','connect')),
  status text NOT NULL DEFAULT 'pending',
  auto_renew boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  nameservers text[] DEFAULT '{}',
  project_id uuid,
  ssl_status text NOT NULL DEFAULT 'pending',
  credits_spent integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain_name)
);
CREATE INDEX idx_kubo_domains_user ON public.kubo_domains(user_id);
CREATE INDEX idx_kubo_domains_project ON public.kubo_domains(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kubo_domains TO authenticated;
GRANT ALL ON public.kubo_domains TO service_role;
ALTER TABLE public.kubo_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own domains" ON public.kubo_domains FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own domains" ON public.kubo_domains FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own domains" ON public.kubo_domains FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own domains" ON public.kubo_domains FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role manages domains" ON public.kubo_domains FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE public.kubo_domain_transfers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  domain_id uuid REFERENCES public.kubo_domains(id) ON DELETE CASCADE,
  domain_name text NOT NULL,
  auth_code text NOT NULL,
  current_registrar text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','validating','transferring','completed','failed')),
  status_message text,
  ionos_transfer_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kubo_transfers_user ON public.kubo_domain_transfers(user_id);
GRANT SELECT, INSERT ON public.kubo_domain_transfers TO authenticated;
GRANT ALL ON public.kubo_domain_transfers TO service_role;
ALTER TABLE public.kubo_domain_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own transfers" ON public.kubo_domain_transfers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own transfers" ON public.kubo_domain_transfers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role manages transfers" ON public.kubo_domain_transfers FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE public.kubo_dns_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain_id uuid NOT NULL REFERENCES public.kubo_domains(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  record_type text NOT NULL CHECK (record_type IN ('A','AAAA','CNAME','TXT','MX','SRV','NS')),
  name text NOT NULL,
  value text NOT NULL,
  ttl integer NOT NULL DEFAULT 3600,
  priority integer,
  ionos_record_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_kubo_dns_domain ON public.kubo_dns_records(domain_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kubo_dns_records TO authenticated;
GRANT ALL ON public.kubo_dns_records TO service_role;
ALTER TABLE public.kubo_dns_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own dns" ON public.kubo_dns_records FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own dns" ON public.kubo_dns_records FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own dns" ON public.kubo_dns_records FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own dns" ON public.kubo_dns_records FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role manages dns" ON public.kubo_dns_records FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_kubo_ionos_contracts_updated BEFORE UPDATE ON public.kubo_ionos_contracts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_kubo_domains_updated BEFORE UPDATE ON public.kubo_domains FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_kubo_domain_transfers_updated BEFORE UPDATE ON public.kubo_domain_transfers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_kubo_dns_records_updated BEFORE UPDATE ON public.kubo_dns_records FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.kubo_domain_transfers DROP CONSTRAINT IF EXISTS kubo_domain_transfers_status_check;
ALTER TABLE public.kubo_domain_transfers ADD CONSTRAINT kubo_domain_transfers_status_check
  CHECK (status = ANY (ARRAY['pending','validating','transferring','completed','failed','cancelled']));

ALTER TABLE public.kubo_domain_transfers
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS notify_email text,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_notified_status text;

CREATE INDEX IF NOT EXISTS idx_kubo_transfers_active_poll
  ON public.kubo_domain_transfers (next_retry_at)
  WHERE status IN ('pending','validating','transferring');

CREATE TABLE IF NOT EXISTS public.kubo_domain_transfer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.kubo_domain_transfers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kubo_domain_transfer_events TO authenticated;
GRANT ALL ON public.kubo_domain_transfer_events TO service_role;

ALTER TABLE public.kubo_domain_transfer_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own transfer events" ON public.kubo_domain_transfer_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service role manages transfer events" ON public.kubo_domain_transfer_events
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_transfer_events_transfer ON public.kubo_domain_transfer_events (transfer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_events_user ON public.kubo_domain_transfer_events (user_id, created_at DESC);

ALTER TABLE public.kubo_domain_transfers ADD COLUMN IF NOT EXISTS last_notified_at timestamp with time zone DEFAULT NULL;

DROP POLICY IF EXISTS "Public can view published project meta" ON public.projects;

CREATE POLICY "Anon can view published project meta"
ON public.projects
FOR SELECT
TO anon
USING (is_published = true);

CREATE TABLE IF NOT EXISTS public.pending_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  credits integer NOT NULL CHECK (credits > 0),
  reason text NOT NULL DEFAULT 'admin_grant',
  granted_by uuid,
  applied_at timestamptz,
  applied_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pending_credits_email_idx
  ON public.pending_credits (lower(email)) WHERE applied_at IS NULL;

GRANT SELECT ON public.pending_credits TO authenticated;
GRANT ALL ON public.pending_credits TO service_role;

ALTER TABLE public.pending_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin reads pending credits"
  ON public.pending_credits FOR SELECT TO authenticated
  USING (public.is_kubo_admin());

CREATE POLICY "Service role manages pending credits"
  ON public.pending_credits FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

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
  _new_limit integer;
  _new_used integer;
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

  BEGIN
    SELECT COALESCE(SUM(credits), 0) INTO _pending_total
    FROM public.pending_credits
    WHERE applied_at IS NULL AND lower(email) = lower(NEW.email);

    IF _pending_total > 0 THEN
      UPDATE public.subscriptions
        SET edits_limit = edits_limit + _pending_total, updated_at = now()
        WHERE user_id = NEW.id AND is_active = true
        RETURNING edits_limit, edits_used INTO _new_limit, _new_used;

      IF NOT FOUND THEN
        INSERT INTO public.subscriptions (user_id, plan, edits_limit, edits_used, is_active)
        VALUES (NEW.id, 'beta', 20 + _pending_total, 0, true)
        RETURNING edits_limit, edits_used INTO _new_limit, _new_used;
      END IF;

      UPDATE public.pending_credits
        SET applied_at = now(), applied_user_id = NEW.id
        WHERE applied_at IS NULL AND lower(email) = lower(NEW.email);

      BEGIN
        INSERT INTO public.credit_transactions
          (user_id, delta, balance_after, reason, category, metadata)
        VALUES
          (NEW.id, _pending_total, (_new_limit - _new_used), 'pending_credit_grant', 'admin_grant',
           jsonb_build_object('email', NEW.email, 'source', 'handle_new_user'));
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

CREATE TABLE public.creative_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool TEXT NOT NULL CHECK (tool IN ('chat','nano_banana','downloader','clips','avatar','shorts','music','ebook')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('queued','processing','completed','failed')),
  prompt TEXT,
  output_url TEXT,
  output_text TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  credits_spent INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_assets TO authenticated;
GRANT ALL ON public.creative_assets TO service_role;

ALTER TABLE public.creative_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own creative assets" ON public.creative_assets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own creative assets" ON public.creative_assets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own creative assets" ON public.creative_assets
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own creative assets" ON public.creative_assets
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role manages creative assets" ON public.creative_assets
  FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX creative_assets_user_tool_idx ON public.creative_assets(user_id, tool, created_at DESC);

CREATE TRIGGER creative_assets_touch BEFORE UPDATE ON public.creative_assets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.creative_assets REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.creative_assets;

ALTER VIEW public.published_projects SET (security_invoker = false);

GRANT SELECT ON public.published_projects TO anon, authenticated;

DROP POLICY IF EXISTS "Anon can view published project meta" ON public.projects;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_kubo_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_kubo_admin() TO service_role;

GRANT EXECUTE ON FUNCTION public.is_skill_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_skill_admin() TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_clear_connector_run(text, text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_connector_runs(text, integer) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_clear_connector_run(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_connector_runs(text, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.execute_atomic_credit_deduction(uuid, integer, text, text, jsonb, text) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.execute_atomic_credit_deduction(uuid, integer, text, text, jsonb, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.bump_rate_limit(text, uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.bump_rate_limit(text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bump_rate_limit(text, uuid, integer) TO service_role;

DROP VIEW IF EXISTS public.github_connections_safe;
CREATE OR REPLACE VIEW public.github_connections_safe AS
SELECT id, user_id, github_username, github_avatar_url, scope, connected_at, updated_at
FROM public.github_connections
WHERE auth.uid() = user_id;
ALTER VIEW public.github_connections_safe OWNER TO postgres;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'github_oauth_states' AND policyname = 'Users can manage their own github oauth states') THEN
    CREATE POLICY "Users can manage their own github oauth states" ON public.github_oauth_states
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gmail_oauth_states' AND policyname = 'Users can manage their own gmail oauth states') THEN
    CREATE POLICY "Users can manage their own gmail oauth states" ON public.gmail_oauth_states
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

ALTER VIEW public.published_projects SET (security_invoker = on);
ALTER VIEW public.github_connections_safe SET (security_invoker = on);

REVOKE EXECUTE ON FUNCTION public.is_skill_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_skill_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_skill_admin() TO service_role;

REVOKE EXECUTE ON FUNCTION public.is_kubo_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_kubo_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_kubo_admin() TO service_role;

DROP POLICY IF EXISTS "Anyone can view published project versions" ON public.project_versions;

REVOKE SELECT (auth_code) ON public.kubo_domain_transfers FROM authenticated;
REVOKE SELECT (auth_code) ON public.kubo_domain_transfers FROM anon;

REVOKE SELECT (ip_address) ON public.shortlink_clicks FROM authenticated;
REVOKE SELECT (ip_address) ON public.shortlink_clicks FROM anon;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Users can update own uploads'
  ) THEN
    CREATE POLICY "Users can update own uploads" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text)
      WITH CHECK (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS internal;
GRANT USAGE ON SCHEMA internal TO authenticated, service_role;

ALTER FUNCTION public.is_kubo_admin() SET SCHEMA internal;
CREATE OR REPLACE FUNCTION public.is_kubo_admin()
RETURNS boolean AS $$
BEGIN
  RETURN internal.is_kubo_admin();
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

ALTER FUNCTION public.is_skill_admin() SET SCHEMA internal;
CREATE OR REPLACE FUNCTION public.is_skill_admin()
RETURNS boolean AS $$
BEGIN
  RETURN internal.is_skill_admin();
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.bump_rate_limit(text, uuid, integer) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.bump_rate_limit(text, uuid, integer) TO service_role;

DROP POLICY IF EXISTS "Public read access for avatars" ON storage.objects;
CREATE POLICY "Users can view own avatar metadata" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Public read access for uploads" ON storage.objects;
CREATE POLICY "Users can view own uploads" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

GRANT EXECUTE ON FUNCTION public.is_kubo_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_skill_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.is_kubo_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.is_skill_admin() TO authenticated, service_role;
