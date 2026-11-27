-- Vibe Agents: agents users create in the Vibe Code, and their runs.
-- Writes go through the `vibe-agents` edge function (service role), which validates tools and limits;
-- users read their own rows and may delete their own agents.

CREATE TABLE IF NOT EXISTS public.vibe_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  instructions text NOT NULL CHECK (char_length(instructions) BETWEEN 1 AND 4000),
  tools text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vibe_agents_user ON public.vibe_agents(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.vibe_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.vibe_agents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  task text NOT NULL,
  output text,
  steps jsonb NOT NULL DEFAULT '[]',
  credits_spent integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_vibe_agent_runs_agent ON public.vibe_agent_runs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vibe_agent_runs_user ON public.vibe_agent_runs(user_id, created_at DESC);

ALTER TABLE public.vibe_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vibe_agent_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.vibe_agents, public.vibe_agent_runs FROM anon, authenticated;
GRANT SELECT, DELETE ON public.vibe_agents TO authenticated;
GRANT SELECT ON public.vibe_agent_runs TO authenticated;
GRANT ALL ON public.vibe_agents, public.vibe_agent_runs TO service_role;

DROP POLICY IF EXISTS "Users read own agents" ON public.vibe_agents;
CREATE POLICY "Users read own agents" ON public.vibe_agents FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete own agents" ON public.vibe_agents;
CREATE POLICY "Users delete own agents" ON public.vibe_agents FOR DELETE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users read own agent runs" ON public.vibe_agent_runs;
CREATE POLICY "Users read own agent runs" ON public.vibe_agent_runs FOR SELECT TO authenticated USING (auth.uid() = user_id);
