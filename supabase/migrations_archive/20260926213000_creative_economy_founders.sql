-- Fundadores da Economia Criativa: lista de quem quer entrar primeiro no
-- painel (em construção). Cada usuário entra uma vez e recebe um número de
-- fundador sequencial, mostrado no aviso "em construção".

CREATE TABLE IF NOT EXISTS public.creative_economy_founders (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  founder_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  joined_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.creative_economy_founders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creative_founders_select_own" ON public.creative_economy_founders;
CREATE POLICY "creative_founders_select_own"
  ON public.creative_economy_founders FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "creative_founders_insert_own" ON public.creative_economy_founders;
CREATE POLICY "creative_founders_insert_own"
  ON public.creative_economy_founders FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.creative_economy_founders FROM anon;
GRANT SELECT, INSERT (user_id) ON public.creative_economy_founders TO authenticated;
