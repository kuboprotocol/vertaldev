-- Logo AI Generations: rastrear logos gerados com IA
-- Histórico de gerações DALL-E com prompts e status

CREATE TABLE IF NOT EXISTS public.logo_ai_generations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Generation info
  prompt           text NOT NULL, -- Descrição do logo desejado
  name             text NOT NULL DEFAULT 'AI Generated Logo',

  -- Storage
  storage_path     text NOT NULL, -- Caminho do logo no storage
  image_url        text, -- URL temporária da OpenAI (pode expirar)

  -- Status
  status           text NOT NULL DEFAULT 'completed', -- pending, completed, failed
  error_message    text, -- Se falhar, qual foi o erro

  -- Metadata
  model            text DEFAULT 'dall-e-3',
  created_at       timestamptz NOT NULL DEFAULT now(),
  imported_as_logo uuid REFERENCES public.app_logos(id) ON DELETE SET NULL -- Se foi importado como logo
);

CREATE INDEX IF NOT EXISTS logo_ai_generations_app_id_idx ON public.logo_ai_generations(app_id);
CREATE INDEX IF NOT EXISTS logo_ai_generations_user_id_idx ON public.logo_ai_generations(user_id);
CREATE INDEX IF NOT EXISTS logo_ai_generations_created_at_idx ON public.logo_ai_generations(created_at DESC);

ALTER TABLE public.logo_ai_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "logo_ai_generations_select_own" ON public.logo_ai_generations;
CREATE POLICY "logo_ai_generations_select_own" ON public.logo_ai_generations
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "logo_ai_generations_insert_own" ON public.logo_ai_generations;
CREATE POLICY "logo_ai_generations_insert_own" ON public.logo_ai_generations
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "logo_ai_generations_delete_own" ON public.logo_ai_generations;
CREATE POLICY "logo_ai_generations_delete_own" ON public.logo_ai_generations
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.logo_ai_generations FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.logo_ai_generations TO authenticated;
