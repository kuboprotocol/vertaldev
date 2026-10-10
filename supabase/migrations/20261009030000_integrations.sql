-- App Integrations: conexões com Vercel, Railway, GitHub, etc
-- Armazenar tokens e status das integrações

CREATE TABLE IF NOT EXISTS public.app_integrations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Integration type
  provider         text NOT NULL, -- 'github', 'vercel', 'railway', 'slack', 'discord'

  -- Connection info
  provider_account_id text, -- ex: GitHub username, Vercel team ID
  provider_app_id  text, -- App ID na plataforma

  -- Auth tokens (encrypted via Supabase secrets)
  access_token     text, -- JWT/OAuth token
  refresh_token    text, -- Se aplicável
  token_expires_at timestamptz,

  -- Status
  status           text DEFAULT 'connected', -- connected, disconnected, error, expired
  last_sync        timestamptz,
  last_error       text,

  -- Metadata
  metadata         jsonb, -- Dados adicionais (branch, repo, etc)

  -- Timestamps
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_integrations_app_id_idx ON public.app_integrations(app_id);
CREATE INDEX IF NOT EXISTS app_integrations_user_id_idx ON public.app_integrations(user_id);
CREATE INDEX IF NOT EXISTS app_integrations_provider_idx ON public.app_integrations(provider);

ALTER TABLE public.app_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_integrations_select_own" ON public.app_integrations;
CREATE POLICY "app_integrations_select_own" ON public.app_integrations
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "app_integrations_insert_own" ON public.app_integrations;
CREATE POLICY "app_integrations_insert_own" ON public.app_integrations
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "app_integrations_update_own" ON public.app_integrations;
CREATE POLICY "app_integrations_update_own" ON public.app_integrations
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "app_integrations_delete_own" ON public.app_integrations;
CREATE POLICY "app_integrations_delete_own" ON public.app_integrations
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.app_integrations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_integrations TO authenticated;

-- Deployment history: rastrear cada deploy realizado
CREATE TABLE IF NOT EXISTS public.app_deployments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  integration_id   uuid REFERENCES public.app_integrations(id) ON DELETE SET NULL,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Deploy info
  provider         text NOT NULL, -- 'vercel', 'railway', etc
  provider_deployment_id text, -- ex: Vercel deployment ID

  -- Status
  status           text DEFAULT 'pending', -- pending, building, deploying, success, failed

  -- Details
  branch           text,
  commit_hash      text,
  commit_message   text,

  -- URLs
  deployment_url   text, -- URL do deploy (ex: https://project.vercel.app)
  logs_url         text,

  -- Metadata
  metadata         jsonb,

  -- Timestamps
  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  completed_at     timestamptz
);

CREATE INDEX IF NOT EXISTS app_deployments_app_id_idx ON public.app_deployments(app_id);
CREATE INDEX IF NOT EXISTS app_deployments_status_idx ON public.app_deployments(status);
CREATE INDEX IF NOT EXISTS app_deployments_created_at_idx ON public.app_deployments(created_at DESC);

ALTER TABLE public.app_deployments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_deployments_select_own" ON public.app_deployments;
CREATE POLICY "app_deployments_select_own" ON public.app_deployments
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.app_deployments FROM anon, authenticated;
GRANT SELECT ON public.app_deployments TO authenticated;

-- OAuth state para verificação (CSRF protection)
CREATE TABLE IF NOT EXISTS public.oauth_states (
  state            text PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider         text NOT NULL,
  app_id           uuid REFERENCES public.apps(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS oauth_states_user_id_idx ON public.oauth_states(user_id);
CREATE INDEX IF NOT EXISTS oauth_states_expires_at_idx ON public.oauth_states(expires_at);
