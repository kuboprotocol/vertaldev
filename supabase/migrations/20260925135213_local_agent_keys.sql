-- Production migration 20260925135213 "local_agent_keys", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

CREATE TABLE IF NOT EXISTS public.local_agent_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL DEFAULT 'Local Agent',
  key_prefix   text NOT NULL,
  key_hash     text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

CREATE INDEX IF NOT EXISTS local_agent_keys_user_id_idx ON public.local_agent_keys (user_id);

ALTER TABLE public.local_agent_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "local_agent_keys_select_own" ON public.local_agent_keys;
CREATE POLICY "local_agent_keys_select_own"
  ON public.local_agent_keys FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.local_agent_keys FROM anon;
GRANT SELECT ON public.local_agent_keys TO authenticated;
