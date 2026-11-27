-- Production migration 20260926181215 "ai_gateway_runs_realtime", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ai_gateway_runs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_gateway_runs;
  END IF;
END $$;
