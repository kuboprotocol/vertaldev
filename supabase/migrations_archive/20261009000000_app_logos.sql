-- App Logos: gerenciar logos dos aplicativos criados pelos usuários
-- Suporta múltiplos logos por app, histórico de versões

CREATE TABLE IF NOT EXISTS public.app_logos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Logo info
  name             text NOT NULL DEFAULT 'Logo',
  storage_path     text NOT NULL, -- Caminho no storage: buckets/app_logos/{app_id}/{id}.{ext}
  file_format      text NOT NULL, -- png, jpg, svg, webp
  file_size        integer, -- bytes

  -- Logo dimensions
  width            integer,
  height           integer,

  -- Status
  is_active        boolean DEFAULT true,
  is_primary       boolean DEFAULT false, -- Logo principal do app
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- Metadata
  description      text,
  color_palette    jsonb, -- Array de cores dominantes extraídas
  tags             text[] DEFAULT '{}'::text[] -- Tags: "favicon", "social", "hero", etc
);

CREATE INDEX IF NOT EXISTS app_logos_app_id_idx ON public.app_logos(app_id);
CREATE INDEX IF NOT EXISTS app_logos_user_id_idx ON public.app_logos(user_id);
CREATE INDEX IF NOT EXISTS app_logos_is_primary_idx ON public.app_logos(is_primary) WHERE is_primary = true;

ALTER TABLE public.app_logos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_logos_select_own" ON public.app_logos;
CREATE POLICY "app_logos_select_own" ON public.app_logos
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "app_logos_insert_own" ON public.app_logos;
CREATE POLICY "app_logos_insert_own" ON public.app_logos
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "app_logos_update_own" ON public.app_logos;
CREATE POLICY "app_logos_update_own" ON public.app_logos
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "app_logos_delete_own" ON public.app_logos;
CREATE POLICY "app_logos_delete_own" ON public.app_logos
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.app_logos FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_logos TO authenticated;

-- Storage bucket para logos dos apps
INSERT INTO storage.buckets (id, name, public)
VALUES ('app_logos', 'app_logos', true)
ON CONFLICT (id) DO NOTHING;

-- Permitir authenticated users fazer upload no próprio folder
CREATE POLICY "Allow authenticated to upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'app_logos');

CREATE POLICY "Allow authenticated to read logos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'app_logos');

CREATE POLICY "Allow authenticated to update logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'app_logos');

CREATE POLICY "Allow authenticated to delete logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'app_logos');
