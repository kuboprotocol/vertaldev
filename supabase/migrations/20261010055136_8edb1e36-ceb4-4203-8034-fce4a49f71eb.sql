-- ============================================================
-- KUBO VIBE - Game Tables + RLS (SECURE VERSION)
-- ============================================================
-- RLS Best Practices Applied:
-- - All tables require authentication
-- - Users can only access their own data
-- - Storage buckets require explicit authentication
-- - No anon access to game data
-- ============================================================

CREATE TABLE IF NOT EXISTS public.games (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title            text NOT NULL,
  description      text,
  cover_image_url  text,
  game_type        text NOT NULL CHECK (game_type IN ('2d', '3d', 'retro', 'realistic', 'metaverse', '4d')),
  engine           text NOT NULL CHECK (engine IN ('babylon', 'threejs', 'playcanvas', 'pixijs', 'phaser', 'custom')),
  config           jsonb DEFAULT '{}'::jsonb,
  assets_count     integer DEFAULT 0,
  meshes_count     integer DEFAULT 0,
  textures_count   integer DEFAULT 0,
  animations_count integer DEFAULT 0,
  scripts_count    integer DEFAULT 0,
  status           text DEFAULT 'draft',
  is_multiplayer   boolean DEFAULT false,
  has_ai           boolean DEFAULT false,
  has_monetization boolean DEFAULT false,
  monetization_type text,
  published_url    text,
  embed_code       text,
  plays            bigint DEFAULT 0,
  likes            bigint DEFAULT 0,
  rating           float DEFAULT 0.0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  published_at     timestamptz
);

CREATE INDEX IF NOT EXISTS games_user_id_idx ON public.games(user_id);
CREATE INDEX IF NOT EXISTS games_game_type_idx ON public.games(game_type);
CREATE INDEX IF NOT EXISTS games_status_idx ON public.games(status);
CREATE INDEX IF NOT EXISTS games_created_at_idx ON public.games(created_at DESC);

CREATE TABLE IF NOT EXISTS public.game_scenes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text,
  scene_data       jsonb DEFAULT '{}'::jsonb,
  thumbnail_url    text,
  environment      text,
  physics_enabled  boolean DEFAULT true,
  physics_type     text DEFAULT 'rapier',
  draw_calls       integer DEFAULT 0,
  polygon_count    integer DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_scenes_game_id_idx ON public.game_scenes(game_id);
CREATE INDEX IF NOT EXISTS game_scenes_user_id_idx ON public.game_scenes(user_id);

CREATE TABLE IF NOT EXISTS public.game_assets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  asset_type       text NOT NULL,
  file_url         text NOT NULL,
  file_size        bigint,
  mime_type        text,
  tags             text[] DEFAULT '{}',
  metadata         jsonb DEFAULT '{}'::jsonb,
  usage_count      integer DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_assets_game_id_idx ON public.game_assets(game_id);
CREATE INDEX IF NOT EXISTS game_assets_asset_type_idx ON public.game_assets(asset_type);
CREATE INDEX IF NOT EXISTS game_assets_tags_idx ON public.game_assets USING GIN(tags);

CREATE TABLE IF NOT EXISTS public.game_entities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id         uuid NOT NULL REFERENCES public.game_scenes(id) ON DELETE CASCADE,
  game_id          uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  name             text NOT NULL,
  entity_type      text NOT NULL,
  position         jsonb DEFAULT '{"x":0,"y":0,"z":0}'::jsonb,
  rotation         jsonb DEFAULT '{"x":0,"y":0,"z":0,"w":1}'::jsonb,
  scale            jsonb DEFAULT '{"x":1,"y":1,"z":1}'::jsonb,
  mesh_asset_id    uuid REFERENCES public.game_assets(id) ON DELETE SET NULL,
  components       jsonb DEFAULT '[]'::jsonb,
  parent_entity_id uuid REFERENCES public.game_entities(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_entities_scene_id_idx ON public.game_entities(scene_id);
CREATE INDEX IF NOT EXISTS game_entities_game_id_idx ON public.game_entities(game_id);
CREATE INDEX IF NOT EXISTS game_entities_entity_type_idx ON public.game_entities(entity_type);

CREATE TABLE IF NOT EXISTS public.game_scripts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text,
  language         text DEFAULT 'typescript',
  source_code      text NOT NULL,
  version          integer DEFAULT 1,
  is_builtin       boolean DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_scripts_game_id_idx ON public.game_scripts(game_id);

CREATE TABLE IF NOT EXISTS public.game_builds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version          text NOT NULL,
  build_status     text DEFAULT 'pending',
  bundle_url       text,
  bundle_size      bigint,
  target_platform  text[],
  build_config     jsonb DEFAULT '{}'::jsonb,
  build_time_ms    integer,
  compressed_size  bigint,
  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  completed_at     timestamptz
);

CREATE INDEX IF NOT EXISTS game_builds_game_id_idx ON public.game_builds(game_id);
CREATE INDEX IF NOT EXISTS game_builds_status_idx ON public.game_builds(build_status);

-- ============================================================
-- Enable RLS on all tables
-- ============================================================

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_builds ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- GAMES TABLE POLICIES
-- ============================================================

DROP POLICY IF EXISTS "Users can view own games" ON public.games;
CREATE POLICY "Users can view own games"
  ON public.games FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create games" ON public.games;
CREATE POLICY "Users can create games"
  ON public.games FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own games" ON public.games;
CREATE POLICY "Users can update own games"
  ON public.games FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own games" ON public.games;
CREATE POLICY "Users can delete own games"
  ON public.games FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- GAME SCENES TABLE POLICIES
-- ============================================================

DROP POLICY IF EXISTS "Users can view own scenes" ON public.game_scenes;
CREATE POLICY "Users can view own scenes"
  ON public.game_scenes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create scenes" ON public.game_scenes;
CREATE POLICY "Users can create scenes"
  ON public.game_scenes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.games WHERE id = game_id AND user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can update own scenes" ON public.game_scenes;
CREATE POLICY "Users can update own scenes"
  ON public.game_scenes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own scenes" ON public.game_scenes;
CREATE POLICY "Users can delete own scenes"
  ON public.game_scenes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- GAME ASSETS TABLE POLICIES
-- ============================================================

DROP POLICY IF EXISTS "Users can view own assets" ON public.game_assets;
CREATE POLICY "Users can view own assets"
  ON public.game_assets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create assets" ON public.game_assets;
CREATE POLICY "Users can create assets"
  ON public.game_assets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.games WHERE id = game_id AND user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can update own assets" ON public.game_assets;
CREATE POLICY "Users can update own assets"
  ON public.game_assets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own assets" ON public.game_assets;
CREATE POLICY "Users can delete own assets"
  ON public.game_assets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- GAME ENTITIES TABLE POLICIES
-- ============================================================

DROP POLICY IF EXISTS "Users can view own entities" ON public.game_entities;
CREATE POLICY "Users can view own entities"
  ON public.game_entities FOR SELECT
  TO authenticated
  USING (game_id IN (
    SELECT id FROM public.games WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can create entities" ON public.game_entities;
CREATE POLICY "Users can create entities"
  ON public.game_entities FOR INSERT
  TO authenticated
  WITH CHECK (game_id IN (
    SELECT id FROM public.games WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can update own entities" ON public.game_entities;
CREATE POLICY "Users can update own entities"
  ON public.game_entities FOR UPDATE
  TO authenticated
  USING (game_id IN (
    SELECT id FROM public.games WHERE user_id = auth.uid()
  ))
  WITH CHECK (game_id IN (
    SELECT id FROM public.games WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can delete own entities" ON public.game_entities;
CREATE POLICY "Users can delete own entities"
  ON public.game_entities FOR DELETE
  TO authenticated
  USING (game_id IN (
    SELECT id FROM public.games WHERE user_id = auth.uid()
  ));

-- ============================================================
-- GAME SCRIPTS TABLE POLICIES
-- ============================================================

DROP POLICY IF EXISTS "Users can view own scripts" ON public.game_scripts;
CREATE POLICY "Users can view own scripts"
  ON public.game_scripts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create scripts" ON public.game_scripts;
CREATE POLICY "Users can create scripts"
  ON public.game_scripts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.games WHERE id = game_id AND user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can update own scripts" ON public.game_scripts;
CREATE POLICY "Users can update own scripts"
  ON public.game_scripts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own scripts" ON public.game_scripts;
CREATE POLICY "Users can delete own scripts"
  ON public.game_scripts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- GAME BUILDS TABLE POLICIES
-- ============================================================

DROP POLICY IF EXISTS "Users can view own builds" ON public.game_builds;
CREATE POLICY "Users can view own builds"
  ON public.game_builds FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create builds" ON public.game_builds;
CREATE POLICY "Users can create builds"
  ON public.game_builds FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.games WHERE id = game_id AND user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can update own builds" ON public.game_builds;
CREATE POLICY "Users can update own builds"
  ON public.game_builds FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own builds" ON public.game_builds;
CREATE POLICY "Users can delete own builds"
  ON public.game_builds FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- Storage Buckets (Creative Assets & Games)
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('creative-assets', 'creative-assets', false),
  ('videos', 'videos', false),
  ('game-assets', 'game-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Creative Assets bucket - authenticated users only
DROP POLICY IF EXISTS "Authenticated users can upload creative assets" ON storage.objects;
CREATE POLICY "Authenticated users can upload creative assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'creative-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can read own creative assets" ON storage.objects;
CREATE POLICY "Users can read own creative assets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'creative-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete own creative assets" ON storage.objects;
CREATE POLICY "Users can delete own creative assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'creative-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Videos bucket - authenticated users only
DROP POLICY IF EXISTS "Authenticated users can upload videos" ON storage.objects;
CREATE POLICY "Authenticated users can upload videos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can read own videos" ON storage.objects;
CREATE POLICY "Users can read own videos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete own videos" ON storage.objects;
CREATE POLICY "Users can delete own videos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Game Assets bucket - authenticated users only
DROP POLICY IF EXISTS "Authenticated users can upload game assets" ON storage.objects;
CREATE POLICY "Authenticated users can upload game assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'game-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can read own game assets" ON storage.objects;
CREATE POLICY "Users can read own game assets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'game-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete own game assets" ON storage.objects;
CREATE POLICY "Users can delete own game assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'game-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Migration Complete - All tables secure with proper RLS
-- ============================================================
