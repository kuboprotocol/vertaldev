-- Production migration 20260925141259 "harden_security_definer_functions", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

REVOKE EXECUTE ON FUNCTION public.apply_daily_credits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_daily_credits() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_my_referral_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_referral_code() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO service_role;
