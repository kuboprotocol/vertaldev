-- Production migration 20260926194345 "plan_config_ads_and_sale", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

ALTER TABLE public.plan_config
  ADD COLUMN IF NOT EXISTS ads_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_for_sale boolean NOT NULL DEFAULT false;

UPDATE public.plan_config
SET ads_enabled = plan IN ('free', 'starter'),
    ad_frequency_hours = CASE plan WHEN 'free' THEN 6 WHEN 'starter' THEN 12 ELSE NULL END,
    is_for_sale = plan IN ('free', 'starter', 'pro', 'premium_1');

ALTER TABLE public.plan_config DROP CONSTRAINT IF EXISTS plan_config_ads_only_free_starter;
ALTER TABLE public.plan_config
  ADD CONSTRAINT plan_config_ads_only_free_starter
  CHECK (
    (ads_enabled AND plan IN ('free', 'starter') AND ad_frequency_hours IS NOT NULL)
    OR (NOT ads_enabled AND ad_frequency_hours IS NULL)
  );

ALTER TABLE public.plan_config DROP CONSTRAINT IF EXISTS plan_config_sale_price_cap;
ALTER TABLE public.plan_config
  ADD CONSTRAINT plan_config_sale_price_cap
  CHECK (NOT is_for_sale OR price_usd <= 49.99);
