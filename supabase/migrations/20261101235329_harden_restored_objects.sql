-- Production migration 20261101235329 "harden_restored_objects", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

ALTER VIEW public.affiliate_install_stats SET (security_invoker = true);
ALTER VIEW public.leaderboard_profiles SET (security_invoker = true);
ALTER VIEW public.leaderboard_streaks SET (security_invoker = true);
ALTER VIEW public.leaderboard_badges SET (security_invoker = true);
REVOKE EXECUTE ON FUNCTION public.detect_fraud_by_ip(inet) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_be_affiliate(uuid, inet) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_be_affiliate(uuid, inet) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.detect_fraud_by_ip(inet) TO service_role;
ALTER FUNCTION public.update_shortlinks_updated_at() SET search_path = public;
