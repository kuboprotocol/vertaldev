-- Endurecimento dos objetos restaurados por 20261102_restore_missing_objects.sql,
-- a partir do verificador de segurança do Supabase.

-- Views passam a respeitar o RLS de quem consulta. affiliate_install_stats não
-- filtra por afiliado: como SECURITY DEFINER, qualquer usuário logado veria os
-- domínios e números de todos os afiliados. As de leaderboard não são usadas.
ALTER VIEW public.affiliate_install_stats SET (security_invoker = true);
ALTER VIEW public.leaderboard_profiles SET (security_invoker = true);
ALTER VIEW public.leaderboard_streaks SET (security_invoker = true);
ALTER VIEW public.leaderboard_badges SET (security_invoker = true);

-- Funções antifraude: detect_fraud_by_ip não é chamada por nenhum cliente;
-- can_be_affiliate é chamada pelo usuário logado (affiliate-installs).
REVOKE EXECUTE ON FUNCTION public.detect_fraud_by_ip(inet) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_be_affiliate(uuid, inet) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_be_affiliate(uuid, inet) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.detect_fraud_by_ip(inet) TO service_role;

ALTER FUNCTION public.update_shortlinks_updated_at() SET search_path = public;
