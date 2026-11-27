-- Navbar customization for client apps
-- Allows users to create and customize navbars for their applications

CREATE TABLE IF NOT EXISTS public.app_navbar_configs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Navbar branding
  logo_url         text,
  logo_app_id      uuid REFERENCES public.app_logos(id) ON DELETE SET NULL,
  logo_height      integer DEFAULT 40, -- pixels

  -- Navbar styling
  bg_color         text DEFAULT '#ffffff',
  text_color       text DEFAULT '#000000',
  accent_color     text DEFAULT '#0066ff',
  position         text DEFAULT 'sticky', -- sticky, fixed, static
  shadow           boolean DEFAULT true,
  rounded          text DEFAULT 'lg', -- none, sm, md, lg, xl

  -- Navbar links/menu
  menu_items       jsonb DEFAULT '[]'::jsonb, -- Array of {label, href, icon?, target?}
  show_search      boolean DEFAULT false,
  show_auth_buttons boolean DEFAULT true,

  -- Advanced options
  sticky_top       text DEFAULT 'top-0', -- Tailwind positioning
  z_index          text DEFAULT 'z-50',
  padding          text DEFAULT 'px-6 h-16', -- Tailwind padding/height
  transparency     text DEFAULT 'opacity-100', -- opacity level

  -- Status
  is_active        boolean DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_navbar_configs_app_id_idx ON public.app_navbar_configs(app_id);
CREATE INDEX IF NOT EXISTS app_navbar_configs_user_id_idx ON public.app_navbar_configs(user_id);

ALTER TABLE public.app_navbar_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_navbar_configs_select_own" ON public.app_navbar_configs;
CREATE POLICY "app_navbar_configs_select_own" ON public.app_navbar_configs
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "app_navbar_configs_insert_own" ON public.app_navbar_configs;
CREATE POLICY "app_navbar_configs_insert_own" ON public.app_navbar_configs
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "app_navbar_configs_update_own" ON public.app_navbar_configs;
CREATE POLICY "app_navbar_configs_update_own" ON public.app_navbar_configs
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "app_navbar_configs_delete_own" ON public.app_navbar_configs;
CREATE POLICY "app_navbar_configs_delete_own" ON public.app_navbar_configs
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.app_navbar_configs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_navbar_configs TO authenticated;
