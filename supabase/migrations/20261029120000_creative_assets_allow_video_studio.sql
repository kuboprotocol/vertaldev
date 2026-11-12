-- The Vertal Video Studio (image -> video) records its jobs in creative_assets with tool = 'video_studio'.
-- The tool CHECK constraint was created before that tool existed, so every submit failed at INSERT,
-- the request threw, the charge was refunded and the user saw a generic error. Allow the value.
ALTER TABLE public.creative_assets DROP CONSTRAINT IF EXISTS creative_assets_tool_check;
ALTER TABLE public.creative_assets ADD CONSTRAINT creative_assets_tool_check CHECK (
  tool = ANY (ARRAY[
    'chat'::text, 'nano_banana'::text, 'downloader'::text, 'clips'::text,
    'avatar'::text, 'shorts'::text, 'music'::text, 'ebook'::text,
    'video_studio'::text
  ])
);
