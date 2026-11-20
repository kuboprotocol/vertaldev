-- Vertal Avatar AI: user cloned voices (MiniMax voice clone via fal.ai).
-- Written by the creative-video edge function (service role); users can read and delete their own rows.
-- provider_voice_id and sample_path are never readable or writable by clients: the edge function resolves
-- `clone:<uuid>` to the provider voice server-side, so a client can never point a row at someone else's voice.

CREATE TABLE IF NOT EXISTS public.avatar_user_voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  provider text NOT NULL DEFAULT 'minimax',
  provider_voice_id text,
  sample_path text,
  preview_path text,
  preview_url text,
  consent_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS avatar_user_voices_user_active_idx
  ON public.avatar_user_voices (user_id, created_at)
  WHERE deleted_at IS NULL;

ALTER TABLE public.avatar_user_voices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own avatar voices" ON public.avatar_user_voices;
CREATE POLICY "Users read own avatar voices" ON public.avatar_user_voices
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Users insert own avatar voices" ON public.avatar_user_voices;
CREATE POLICY "Users insert own avatar voices" ON public.avatar_user_voices
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND consent_at IS NOT NULL);

DROP POLICY IF EXISTS "Users delete own avatar voices" ON public.avatar_user_voices;
CREATE POLICY "Users delete own avatar voices" ON public.avatar_user_voices
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Column-level grants: clients never see or set the provider voice id or the sample location.
REVOKE ALL ON public.avatar_user_voices FROM anon, authenticated;
GRANT SELECT (id, user_id, name, provider, preview_url, consent_at, created_at, deleted_at)
  ON public.avatar_user_voices TO authenticated;
GRANT INSERT (user_id, name, consent_at) ON public.avatar_user_voices TO authenticated;
GRANT DELETE ON public.avatar_user_voices TO authenticated;
GRANT ALL ON public.avatar_user_voices TO service_role;

-- At most 5 active voices per user (also checked in the edge function before paying the provider).
CREATE OR REPLACE FUNCTION public.avatar_user_voices_enforce_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('avatar_user_voices:' || NEW.user_id::text, 0));
  IF (
    SELECT count(*) FROM public.avatar_user_voices
    WHERE user_id = NEW.user_id AND deleted_at IS NULL
  ) >= 5 THEN
    RAISE EXCEPTION 'voice_limit_reached' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS avatar_user_voices_cap ON public.avatar_user_voices;
CREATE TRIGGER avatar_user_voices_cap
  BEFORE INSERT ON public.avatar_user_voices
  FOR EACH ROW EXECUTE FUNCTION public.avatar_user_voices_enforce_cap();

COMMENT ON TABLE public.avatar_user_voices IS
  'Vertal Avatar AI cloned voices. consent_at records the owner''s consent checkbox at clone time.';
