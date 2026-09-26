-- Planos e anúncios no banco (espelho de src/lib/planConfig.ts e de
-- docs/PLANOS_E_ANUNCIOS.md).
--
-- • ads_enabled: só Free e Starter (US$ 4,99) exibem anúncio intersticial.
--   Todos os outros planos ficam sem anúncio (ad_frequency_hours NULL),
--   com ou sem acordo de parceria.
-- • is_for_sale: só planos até US$ 49,99/mês são vendidos (Free, Starter,
--   Pro, Premium 1). Os demais continuam na tabela para assinaturas
--   existentes, mas não aparecem na página nem no checkout.

ALTER TABLE public.plan_config
  ADD COLUMN IF NOT EXISTS ads_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_for_sale boolean NOT NULL DEFAULT false;

UPDATE public.plan_config
SET ads_enabled = plan IN ('free', 'starter'),
    ad_frequency_hours = CASE plan WHEN 'free' THEN 6 WHEN 'starter' THEN 12 ELSE NULL END,
    is_for_sale = plan IN ('free', 'starter', 'pro', 'premium_1');

-- Invariante: anúncio só com frequência definida e só nos planos permitidos.
ALTER TABLE public.plan_config DROP CONSTRAINT IF EXISTS plan_config_ads_only_free_starter;
ALTER TABLE public.plan_config
  ADD CONSTRAINT plan_config_ads_only_free_starter
  CHECK (
    (ads_enabled AND plan IN ('free', 'starter') AND ad_frequency_hours IS NOT NULL)
    OR (NOT ads_enabled AND ad_frequency_hours IS NULL)
  );

-- Invariante: nada acima de US$ 49,99 à venda.
ALTER TABLE public.plan_config DROP CONSTRAINT IF EXISTS plan_config_sale_price_cap;
ALTER TABLE public.plan_config
  ADD CONSTRAINT plan_config_sale_price_cap
  CHECK (NOT is_for_sale OR price_usd <= 49.99);
