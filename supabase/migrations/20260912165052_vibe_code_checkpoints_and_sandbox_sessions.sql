-- Production migration 20260912165052 "vibe_code_checkpoints_and_sandbox_sessions", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

-- Checkpoints: um registro por ciclo de commit do Vibe Code Agent, para timeline + rollback de 1 clique
CREATE TABLE IF NOT EXISTS public.vibe_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_repo text NOT NULL,
  commit_sha text NOT NULL,
  parent_sha text,
  summary text NOT NULL,
  files_changed jsonb NOT NULL DEFAULT '[]'::jsonb,
  credits_spent integer NOT NULL DEFAULT 0,
  model_used text,
  reverted_checkpoint_id uuid REFERENCES public.vibe_checkpoints(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vibe_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_checkpoints" ON public.vibe_checkpoints
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "service_role_manages_checkpoints" ON public.vibe_checkpoints
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_vibe_checkpoints_user_repo
  ON public.vibe_checkpoints (user_id, project_repo, created_at DESC);

-- Sandbox sessions: preview ao vivo via E2B, cobrado por minuto do mesmo ledger de créditos
CREATE TABLE IF NOT EXISTS public.vibe_sandbox_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_repo text NOT NULL,
  e2b_sandbox_id text,
  preview_url text,
  status text NOT NULL DEFAULT 'starting' CHECK (status IN ('starting','running','stopped','failed','timed_out')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  credits_charged integer NOT NULL DEFAULT 0,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  error_message text
);

ALTER TABLE public.vibe_sandbox_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_sandbox_sessions" ON public.vibe_sandbox_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "service_role_manages_sandbox_sessions" ON public.vibe_sandbox_sessions
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_vibe_sandbox_sessions_user_status
  ON public.vibe_sandbox_sessions (user_id, status);
