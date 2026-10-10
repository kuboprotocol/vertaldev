-- These SECURITY DEFINER functions were created without a fixed search_path and with EXECUTE open to
-- anon/authenticated. apply_credit_debt let anyone change any user's user_credits balance through
-- /rest/v1/rpc; calculate_shortlink_rewards and get_user_credits accepted any _user_id.

ALTER FUNCTION public.apply_credit_debt(uuid, integer) SET search_path = public;
ALTER FUNCTION public.get_user_credits(uuid) SET search_path = public;
ALTER FUNCTION public.audit_user_credits_changes() SET search_path = public;
ALTER FUNCTION public.calculate_shortlink_rewards(uuid, date) SET search_path = public;
ALTER FUNCTION public.record_shortlink_view(uuid, inet, text) SET search_path = public;
ALTER FUNCTION public.get_user_shortlinks_with_stats(uuid) SET search_path = public;
ALTER FUNCTION public.check_shortlink_limits(uuid) SET search_path = public;

-- Server only (edge functions use the service role; apply_credit_debt has no caller).
REVOKE EXECUTE ON FUNCTION public.apply_credit_debt(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_credits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_shortlink_rewards(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_user_credits_changes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_credit_debt(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_credits(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_shortlink_rewards(uuid, date) TO service_role;

-- Called by the shortlinks edge function with the signed-in user's token.
REVOKE EXECUTE ON FUNCTION public.get_user_shortlinks_with_stats(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_shortlink_limits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_shortlinks_with_stats(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_shortlink_limits(uuid) TO authenticated, service_role;

-- record_shortlink_view stays callable by anon: public shortlink pages record views without login.
