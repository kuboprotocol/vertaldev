-- Production migration 20260919141736 "ad_impressions_and_referral_code_rpc", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

-- ad_impressions: controla frequência de anúncios pro plano free (não
-- existia neste projeto — causava 404 no client).
CREATE TABLE IF NOT EXISTS public.ad_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_shown_at timestamptz NOT NULL DEFAULT now(),
  ad_type text NOT NULL DEFAULT 'interstitial',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, ad_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_impressions TO authenticated;
GRANT ALL ON public.ad_impressions TO service_role;
ALTER TABLE public.ad_impressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own ad impressions" ON public.ad_impressions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ad impressions" ON public.ad_impressions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ad impressions" ON public.ad_impressions FOR UPDATE USING (auth.uid() = user_id);

-- Colunas que faltavam em subscriptions (usadas pelo fluxo de créditos/parceria).
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS partnership_agreement_signed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signup_credits_granted boolean NOT NULL DEFAULT false;

-- plan_config já existia (criado por mim antes para o cron de crédito
-- diário) mas sem estas duas colunas que o frontend (planConfig.ts) espera.
ALTER TABLE public.plan_config
  ADD COLUMN IF NOT EXISTS ad_frequency_hours integer,
  ADD COLUMN IF NOT EXISTS partnership_required boolean NOT NULL DEFAULT false;

UPDATE public.plan_config SET ad_frequency_hours = v.ad_hours, partnership_required = v.partnership
FROM (VALUES
  ('free', 6, false),
  ('starter', 12, false),
  ('pro', 24, false),
  ('premium_1', 168, false),
  ('premium_2', 168, false),
  ('business_1', NULL, true),
  ('business_2', NULL, true),
  ('business_3', NULL, true),
  ('business_4', NULL, true),
  ('business_5', NULL, true),
  ('business_6', NULL, true),
  ('business_7', NULL, true),
  ('enterprise', NULL, true),
  ('beta', NULL, false)
) AS v(plan, ad_hours, partnership)
WHERE plan_config.plan = v.plan;

-- get_my_referral_code(): RPC que o client chama (estava dando 404).
-- SECURITY DEFINER porque o código de indicação não é exposto via SELECT
-- direto na tabela profiles para outros usuários.
CREATE OR REPLACE FUNCTION public.get_my_referral_code()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT referral_code FROM public.profiles WHERE id = auth.uid();
$$;
