-- Advanced game creation and management system
-- Support for 2D, 3D, Retro, Realistic, Metaverse, 4D games

CREATE TABLE IF NOT EXISTS public.games (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Game metadata
  title            text NOT NULL,
  description      text,
  cover_image_url  text,

  -- Game type & engine
  game_type        text NOT NULL CHECK (game_type IN ('2d', '3d', 'retro', 'realistic', 'metaverse', '4d')),
  engine           text NOT NULL CHECK (engine IN ('babylon', 'threejs', 'playcanvas', 'pixijs', 'phaser', 'custom')),

  -- Game configuration
  config           jsonb DEFAULT '{}'::jsonb, -- Game-specific settings

  -- Assets & resources
  assets_count     integer DEFAULT 0,
  meshes_count     integer DEFAULT 0,
  textures_count   integer DEFAULT 0,
  animations_count integer DEFAULT 0,
  scripts_count    integer DEFAULT 0,

  -- Game status
  status           text DEFAULT 'draft', -- draft, published, archived
  is_multiplayer   boolean DEFAULT false,
  has_ai           boolean DEFAULT false,
  has_monetization boolean DEFAULT false,

  -- Monetization
  monetization_type text, -- ads, premium, iap, none

  -- Publishing
  published_url    text,
  embed_code       text,

  -- Statistics
  plays            bigint DEFAULT 0,
  likes            bigint DEFAULT 0,
  rating           float DEFAULT 0.0,

  -- Timestamps
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  published_at     timestamptz
);

CREATE INDEX IF NOT EXISTS games_user_id_idx ON public.games(user_id);
CREATE INDEX IF NOT EXISTS games_game_type_idx ON public.games(game_type);
CREATE INDEX IF NOT EXISTS games_status_idx ON public.games(status);
CREATE INDEX IF NOT EXISTS games_created_at_idx ON public.games(created_at DESC);

-- Game scenes (for 3D, metaverse, etc)
CREATE TABLE IF NOT EXISTS public.game_scenes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name             text NOT NULL,
  description      text,

  -- Scene data
  scene_data       jsonb DEFAULT '{}'::jsonb, -- Full scene hierarchy
  thumbnail_url    text,

  -- Scene properties
  environment      text, -- sky, lighting, fog settings (JSONB)
  physics_enabled  boolean DEFAULT true,
  physics_type     text DEFAULT 'rapier', -- cannon, rapier, oimo

  -- Performance
  draw_calls       integer DEFAULT 0,
  polygon_count    integer DEFAULT 0,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_scenes_game_id_idx ON public.game_scenes(game_id);
CREATE INDEX IF NOT EXISTS game_scenes_user_id_idx ON public.game_scenes(user_id);

-- Game assets (meshes, textures, sounds, animations)
CREATE TABLE IF NOT EXISTS public.game_assets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name             text NOT NULL,
  asset_type       text NOT NULL, -- mesh, texture, audio, animation, shader, script
  file_url         text NOT NULL, -- Stored in Supabase Storage
  file_size        bigint,
  mime_type        text,

  -- Asset properties
  tags             text[] DEFAULT '{}',
  metadata         jsonb DEFAULT '{}'::jsonb,

  -- Usage stats
  usage_count      integer DEFAULT 0,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_assets_game_id_idx ON public.game_assets(game_id);
CREATE INDEX IF NOT EXISTS game_assets_asset_type_idx ON public.game_assets(asset_type);
CREATE INDEX IF NOT EXISTS game_assets_tags_idx ON public.game_assets USING GIN(tags);

-- Game entities (for scene composition)
CREATE TABLE IF NOT EXISTS public.game_entities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id         uuid NOT NULL REFERENCES public.game_scenes(id) ON DELETE CASCADE,
  game_id          uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,

  name             text NOT NULL,
  entity_type      text NOT NULL, -- player, npc, object, prop, light, camera

  -- Transform
  position         jsonb DEFAULT '{"x":0,"y":0,"z":0}'::jsonb,
  rotation         jsonb DEFAULT '{"x":0,"y":0,"z":0,"w":1}'::jsonb,
  scale            jsonb DEFAULT '{"x":1,"y":1,"z":1}'::jsonb,

  -- Components
  mesh_asset_id    uuid REFERENCES public.game_assets(id) ON DELETE SET NULL,
  components       jsonb DEFAULT '[]'::jsonb, -- collider, rigidbody, script, animation, ai, etc

  -- Hierarchy
  parent_entity_id uuid REFERENCES public.game_entities(id) ON DELETE SET NULL,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_entities_scene_id_idx ON public.game_entities(scene_id);
CREATE INDEX IF NOT EXISTS game_entities_game_id_idx ON public.game_entities(game_id);
CREATE INDEX IF NOT EXISTS game_entities_entity_type_idx ON public.game_entities(entity_type);

-- Game scripts (gameplay logic)
CREATE TABLE IF NOT EXISTS public.game_scripts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name             text NOT NULL,
  description      text,

  -- Script code
  language         text DEFAULT 'typescript', -- typescript, javascript, wasm
  source_code      text NOT NULL,

  -- Metadata
  version          integer DEFAULT 1,
  is_builtin       boolean DEFAULT false,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_scripts_game_id_idx ON public.game_scripts(game_id);

-- Game publish configuration
CREATE TABLE IF NOT EXISTS public.game_builds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  version          text NOT NULL,
  build_status     text DEFAULT 'pending', -- pending, building, success, failed

  -- Build output
  bundle_url       text,
  bundle_size      bigint,

  -- Build info
  target_platform  text[], -- web, ios, android, windows, mac, linux
  build_config     jsonb DEFAULT '{}'::jsonb,

  -- Performance metrics
  build_time_ms    integer,
  compressed_size  bigint,

  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  completed_at     timestamptz
);

CREATE INDEX IF NOT EXISTS game_builds_game_id_idx ON public.game_builds(game_id);
CREATE INDEX IF NOT EXISTS game_builds_status_idx ON public.game_builds(build_status);

-- RLS Policies
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_builds ENABLE ROW LEVEL SECURITY;

-- Games policies
DROP POLICY IF EXISTS "games_select_own" ON public.games;
CREATE POLICY "games_select_own" ON public.games FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "games_insert_own" ON public.games;
CREATE POLICY "games_insert_own" ON public.games FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "games_update_own" ON public.games;
CREATE POLICY "games_update_own" ON public.games FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "games_delete_own" ON public.games;
CREATE POLICY "games_delete_own" ON public.games FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- Game scenes policies
DROP POLICY IF EXISTS "game_scenes_select_own" ON public.game_scenes;
CREATE POLICY "game_scenes_select_own" ON public.game_scenes FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "game_scenes_insert_own" ON public.game_scenes;
CREATE POLICY "game_scenes_insert_own" ON public.game_scenes FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "game_scenes_update_own" ON public.game_scenes;
CREATE POLICY "game_scenes_update_own" ON public.game_scenes FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

-- Game assets policies
DROP POLICY IF EXISTS "game_assets_select_own" ON public.game_assets;
CREATE POLICY "game_assets_select_own" ON public.game_assets FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "game_assets_insert_own" ON public.game_assets;
CREATE POLICY "game_assets_insert_own" ON public.game_assets FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

-- Game entities policies
DROP POLICY IF EXISTS "game_entities_select_own" ON public.game_entities;
CREATE POLICY "game_entities_select_own" ON public.game_entities FOR SELECT TO authenticated USING ((SELECT auth.uid()) IN (
  SELECT user_id FROM public.game_scenes WHERE id = game_entities.scene_id
));

-- Game scripts policies
DROP POLICY IF EXISTS "game_scripts_select_own" ON public.game_scripts;
CREATE POLICY "game_scripts_select_own" ON public.game_scripts FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "game_scripts_insert_own" ON public.game_scripts;
CREATE POLICY "game_scripts_insert_own" ON public.game_scripts FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

-- Game builds policies
DROP POLICY IF EXISTS "game_builds_select_own" ON public.game_builds;
CREATE POLICY "game_builds_select_own" ON public.game_builds FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "game_builds_insert_own" ON public.game_builds;
CREATE POLICY "game_builds_insert_own" ON public.game_builds FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

-- Grant permissions
REVOKE ALL ON public.games FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.games TO authenticated;

REVOKE ALL ON public.game_scenes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_scenes TO authenticated;

REVOKE ALL ON public.game_assets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_assets TO authenticated;

REVOKE ALL ON public.game_entities FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_entities TO authenticated;

REVOKE ALL ON public.game_scripts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_scripts TO authenticated;

REVOKE ALL ON public.game_builds FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_builds TO authenticated;
