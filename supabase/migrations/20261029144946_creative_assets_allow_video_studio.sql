-- Production migration 20261029144946 "creative_assets_allow_video_studio", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

ALTER TABLE public.creative_assets DROP CONSTRAINT IF EXISTS creative_assets_tool_check;
ALTER TABLE public.creative_assets ADD CONSTRAINT creative_assets_tool_check CHECK (
  tool = ANY (ARRAY[
    'chat'::text, 'nano_banana'::text, 'downloader'::text, 'clips'::text,
    'avatar'::text, 'shorts'::text, 'music'::text, 'ebook'::text,
    'video_studio'::text
  ])
);
