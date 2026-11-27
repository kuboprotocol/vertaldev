-- Production migration 20260926202215 "creative_economy_founders", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

CREATE TABLE IF NOT EXISTS public.creative_economy_founders (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  founder_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  joined_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.creative_economy_founders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "creative_founders_select_own" ON public.creative_economy_founders;
CREATE POLICY "creative_founders_select_own" ON public.creative_economy_founders FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "creative_founders_insert_own" ON public.creative_economy_founders;
CREATE POLICY "creative_founders_insert_own" ON public.creative_economy_founders FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.creative_economy_founders FROM anon;
GRANT SELECT, INSERT (user_id) ON public.creative_economy_founders TO authenticated;
