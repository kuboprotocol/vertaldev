-- Production migration 20261112024255 "user_wallet_grants", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

-- Garante o GRANT da carteira mesmo em bancos onde 20261111220000_user_wallet.sql
-- já foi aplicada antes do ajuste. Idempotente.
REVOKE ALL ON public.wallet_payment_methods FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_payment_methods TO service_role;
