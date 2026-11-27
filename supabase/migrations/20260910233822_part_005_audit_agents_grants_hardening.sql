-- Production migration 20260910233822 "part_005_audit_agents_grants_hardening", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id UUID,
  actor_role TEXT NOT NULL DEFAULT 'user',
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  job_id TEXT,
  request_id TEXT,
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.security_audit_logs TO authenticated;
GRANT ALL ON public.security_audit_logs TO service_role;

ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all audit logs"
  ON public.security_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_kubo_admin());

CREATE POLICY "Users can view their own audit logs"
  ON public.security_audit_logs
  FOR SELECT
  TO authenticated
  USING (actor_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_actor ON public.security_audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_job ON public.security_audit_logs(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_action ON public.security_audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_resource ON public.security_audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_created ON public.security_audit_logs(created_at DESC);

CREATE OR REPLACE FUNCTION public.log_security_audit(
  _action TEXT,
  _resource_type TEXT,
  _resource_id TEXT DEFAULT NULL,
  _job_id TEXT DEFAULT NULL,
  _request_id TEXT DEFAULT NULL,
  _ip INET DEFAULT NULL,
  _user_agent TEXT DEFAULT NULL,
  _success BOOLEAN DEFAULT true,
  _error_message TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb,
  _actor_user_id UUID DEFAULT NULL,
  _actor_role TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _resolved_user UUID;
  _resolved_role TEXT;
BEGIN
  _resolved_user := COALESCE(_actor_user_id, auth.uid());
  _resolved_role := COALESCE(
    _actor_role,
    CASE
      WHEN _resolved_user IS NULL THEN 'service'
      WHEN public.is_kubo_admin() THEN 'admin'
      ELSE 'user'
    END
  );

  INSERT INTO public.security_audit_logs (
    actor_user_id, actor_role, action, resource_type, resource_id,
    job_id, request_id, ip_address, user_agent, success, error_message, metadata
  ) VALUES (
    _resolved_user, _resolved_role, _action, _resource_type, _resource_id,
    _job_id, _request_id, _ip, _user_agent, _success, _error_message, _metadata
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_security_audit(TEXT, TEXT, TEXT, TEXT, TEXT, INET, TEXT, BOOLEAN, TEXT, JSONB, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_security_audit(TEXT, TEXT, TEXT, TEXT, TEXT, INET, TEXT, BOOLEAN, TEXT, JSONB, UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_clear_connector_run(_connector_slug text, _run_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _deleted int;
BEGIN
  IF NOT public.is_kubo_admin() THEN
    PERFORM public.log_security_audit(
      'admin_clear_connector_run', 'admin', _connector_slug, _run_id,
      NULL, NULL, NULL, false, 'forbidden',
      jsonb_build_object('connector_slug', _connector_slug, 'run_id', _run_id)
    );
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH d AS (
    DELETE FROM public.connector_activity_logs
    WHERE connector_slug = _connector_slug
      AND metadata->>'runId' = _run_id
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO _deleted FROM d;

  PERFORM public.log_security_audit(
    'admin_clear_connector_run', 'admin', _connector_slug, _run_id,
    NULL, NULL, NULL, true, NULL,
    jsonb_build_object('deleted', _deleted, 'connector_slug', _connector_slug, 'run_id', _run_id)
  );

  RETURN _deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_security_audit(TEXT, TEXT, TEXT, TEXT, TEXT, INET, TEXT, BOOLEAN, TEXT, JSONB, UUID, TEXT) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_security_audit(TEXT, TEXT, TEXT, TEXT, TEXT, INET, TEXT, BOOLEAN, TEXT, JSONB, UUID, TEXT) TO service_role;

DROP POLICY IF EXISTS "Users can update own clicks" ON public.shortlink_clicks;

CREATE TABLE public.agent_registry (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  credit_cost INTEGER NOT NULL DEFAULT 1,
  edge_function TEXT NOT NULL,
  icon TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','beta','planned','disabled')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agent_registry TO anon, authenticated;
GRANT ALL ON public.agent_registry TO service_role;

ALTER TABLE public.agent_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active agents"
  ON public.agent_registry FOR SELECT
  USING (status <> 'disabled');

CREATE TRIGGER touch_agent_registry_updated_at
  BEFORE UPDATE ON public.agent_registry
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.agent_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_slug TEXT NOT NULL REFERENCES public.agent_registry(slug) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','refunded')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  error_message TEXT,
  credits_charged INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE ON public.agent_jobs TO authenticated;
GRANT ALL ON public.agent_jobs TO service_role;

ALTER TABLE public.agent_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs"
  ON public.agent_jobs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all jobs"
  ON public.agent_jobs FOR SELECT TO authenticated
  USING (public.is_kubo_admin());

CREATE POLICY "Users can insert own jobs"
  ON public.agent_jobs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own jobs"
  ON public.agent_jobs FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_agent_jobs_user ON public.agent_jobs(user_id, created_at DESC);
CREATE INDEX idx_agent_jobs_agent ON public.agent_jobs(agent_slug, created_at DESC);
CREATE INDEX idx_agent_jobs_status ON public.agent_jobs(status) WHERE status IN ('queued','running');

CREATE TRIGGER touch_agent_jobs_updated_at
  BEFORE UPDATE ON public.agent_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.agent_registry (slug, name, description, category, credit_cost, edge_function, icon, status) VALUES
  ('pdf-creator',     'PDF Creator',        'Gera PDFs profissionais a partir de prompt/markdown.',           'documents', 5,  'agent-pdf-creator',  'FileText',   'active'),
  ('nano-banana',     'Nano Banana',        'Gerador rápido de conteúdo (legendas, posts, ideias).',          'content',   2,  'agent-nano-banana',  'Banana',     'active'),
  ('image-editor',    'Image Editor',       'Geração e edição de imagens com IA.',                            'media',     3,  'agent-image-editor', 'Image',      'active'),
  ('music-suno',      'Music AI (Suno)',    'Composição musical via Suno AI.',                                'media',     10, 'agent-music-suno',   'Music',      'active'),
  ('slides',          'Slides Generator',   'Cria apresentações estruturadas em slides.',                     'documents', 10, 'agent-slides',       'Presentation', 'beta'),
  ('docs-creator',    'Docs Creator',       'Documentos Word/Markdown longos.',                               'documents', 5,  'agent-docs-creator', 'FileEdit',   'beta'),
  ('doc-converter',   'Doc Converter',      'Converte entre PDF, DOCX, MD, HTML.',                            'documents', 3,  'agent-doc-converter','RefreshCw',  'beta'),
  ('video-downloader','Video Downloader',   'Baixa vídeos de múltiplas plataformas.',                         'media',     5,  'agent-video-downloader','Download','beta'),
  ('opusclip',        'OpusClip',           'Corte inteligente de vídeos longos em clipes virais.',           'media',     15, 'agent-opusclip',     'Scissors',   'beta'),
  ('avatar-speaker',  'Avatar Falante',     'Avatar com voz IA narrando script.',                             'media',     20, 'agent-avatar-speaker','UserCircle','beta'),
  ('short-video',     'Short Video Creator','Vídeos de 30s/60s prontos para reels/shorts.',                   'media',     15, 'agent-short-video',  'Film',       'beta'),
  ('chat-agent',      'Chat Inteligente',   'Chat conversacional multi-modelo.',                              'content',   1,  'agent-chat',         'MessageCircle', 'beta'),
  ('manus',           'Manus Tasks',        'Automação web e pesquisa profunda.',                             'automation',5,  'agent-manus',        'Bot',        'beta'),
  ('creative-panel',  'Creative Panel',     'Painel criativo interativo multi-tarefa.',                       'content',   2,  'agent-creative-panel','Palette',   'beta');

REVOKE SELECT (auth_code) ON public.kubo_domain_transfers FROM authenticated;
REVOKE SELECT (auth_code) ON public.kubo_domain_transfers FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_streaks TO authenticated;
GRANT ALL ON public.user_streaks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.web3_connections TO authenticated;
GRANT ALL ON public.web3_connections TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_badges TO authenticated;
GRANT ALL ON public.user_badges TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.npc_memories TO authenticated;
GRANT ALL ON public.npc_memories TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.connected_accounts TO authenticated;
GRANT ALL ON public.connected_accounts TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.slide_pages TO authenticated;
GRANT ALL ON public.slide_pages TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_credits TO authenticated;
GRANT ALL ON public.pending_credits TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.skill_imports TO authenticated;
GRANT ALL ON public.skill_imports TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limit_counters TO authenticated;
GRANT ALL ON public.rate_limit_counters TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.slide_decks TO authenticated;
GRANT ALL ON public.slide_decks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shortlink_clicks TO authenticated;
GRANT ALL ON public.shortlink_clicks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gmail_accounts TO authenticated;
GRANT ALL ON public.gmail_accounts TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kubo_domains TO authenticated;
GRANT ALL ON public.kubo_domains TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.connector_activity_logs TO authenticated;
GRANT ALL ON public.connector_activity_logs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_assets TO authenticated;
GRANT ALL ON public.creative_assets TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_versions TO authenticated;
GRANT ALL ON public.project_versions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kubo_dns_records TO authenticated;
GRANT ALL ON public.kubo_dns_records TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kubo_domain_transfers TO authenticated;
GRANT ALL ON public.kubo_domain_transfers TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kubo_ionos_contracts TO authenticated;
GRANT ALL ON public.kubo_ionos_contracts TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_rewards TO authenticated;
GRANT ALL ON public.ad_rewards TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.github_oauth_states TO authenticated;
GRANT ALL ON public.github_oauth_states TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.render_connections TO authenticated;
GRANT ALL ON public.render_connections TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orchestration_plans TO authenticated;
GRANT ALL ON public.orchestration_plans TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.github_connections TO authenticated;
GRANT ALL ON public.github_connections TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.render_auto_heal_policies TO authenticated;
GRANT ALL ON public.render_auto_heal_policies TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.render_heal_events TO authenticated;
GRANT ALL ON public.render_heal_events TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.connect_products TO authenticated;
GRANT ALL ON public.connect_products TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_deployments TO authenticated;
GRANT ALL ON public.contract_deployments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_contracts TO authenticated;
GRANT ALL ON public.generated_contracts TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_shares TO authenticated;
GRANT ALL ON public.audit_shares TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gmail_oauth_states TO authenticated;
GRANT ALL ON public.gmail_oauth_states TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shortlinks TO authenticated;
GRANT ALL ON public.shortlinks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_audit_logs TO authenticated;
GRANT ALL ON public.security_audit_logs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_credentials TO authenticated;
GRANT ALL ON public.api_credentials TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_registry TO authenticated;
GRANT ALL ON public.agent_registry TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kubo_domain_transfer_events TO authenticated;
GRANT ALL ON public.kubo_domain_transfer_events TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_jobs TO authenticated;
GRANT ALL ON public.agent_jobs TO service_role;

GRANT SELECT ON public.shortlinks TO anon;
GRANT SELECT ON public.projects TO anon;
GRANT SELECT ON public.profiles TO anon;

REVOKE SELECT (ciphertext, iv, tag) ON public.api_credentials FROM authenticated, anon;
REVOKE SELECT (password_hash) ON public.audit_shares FROM authenticated, anon;
REVOKE SELECT (rpc_url_ciphertext, rpc_url_iv, rpc_url_tag, api_key_ciphertext, api_key_iv, api_key_tag) ON public.web3_connections FROM authenticated, anon;
REVOKE SELECT (api_key_ciphertext, api_key_iv, api_key_tag) ON public.render_connections FROM authenticated, anon;
REVOKE SELECT (refresh_token_ciphertext, refresh_token_iv, refresh_token_tag, access_token_cache) ON public.gmail_accounts FROM authenticated, anon;
REVOKE SELECT (access_token) ON public.github_connections FROM authenticated, anon;

REVOKE SELECT ON public.api_credentials FROM authenticated, anon;
GRANT SELECT (id, user_id, connector_slug, masked_hint, created_at, updated_at) ON public.api_credentials TO authenticated;
GRANT ALL ON public.api_credentials TO service_role;

REVOKE SELECT ON public.audit_shares FROM authenticated, anon;
GRANT SELECT (id, user_id, storage_path, label, size_bytes, expires_at, revoked_at, download_count, last_accessed_at, created_at, updated_at) ON public.audit_shares TO authenticated;
GRANT ALL ON public.audit_shares TO service_role;

REVOKE SELECT ON public.web3_connections FROM authenticated, anon;
GRANT SELECT (id, user_id, provider, network, connection_name, api_key_hint, explorer_url, last_status, last_checked_at, last_block, last_latency_ms, last_error, created_at, updated_at) ON public.web3_connections TO authenticated;
GRANT ALL ON public.web3_connections TO service_role;

REVOKE SELECT ON public.render_connections FROM authenticated, anon;
GRANT SELECT (id, user_id, name, api_key_hint, workspace_id, last_status, last_checked_at, last_latency_ms, last_error, created_at, updated_at) ON public.render_connections TO authenticated;
GRANT ALL ON public.render_connections TO service_role;

REVOKE SELECT ON public.gmail_accounts FROM authenticated, anon;
GRANT SELECT (id, user_id, email, display_name, avatar_url, scope, access_token_expires_at, last_synced_at, created_at, updated_at) ON public.gmail_accounts TO authenticated;
GRANT ALL ON public.gmail_accounts TO service_role;

REVOKE SELECT ON public.github_connections FROM authenticated, anon;
GRANT SELECT (id, user_id, github_username, github_avatar_url, scope, connected_at, updated_at) ON public.github_connections TO authenticated;
GRANT ALL ON public.github_connections TO service_role;

CREATE OR REPLACE FUNCTION public.grant_credits(p_user_id UUID, p_amount NUMERIC)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan, edits_used, edits_limit, is_active)
  VALUES (p_user_id, 'free', 0, 5 + p_amount, true)
  ON CONFLICT (user_id) DO UPDATE
  SET edits_limit = subscriptions.edits_limit + p_amount,
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.grant_credits(UUID, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_credits(UUID, NUMERIC) FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_credits(UUID, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_credits(UUID, NUMERIC) TO service_role;

DROP POLICY IF EXISTS "Users can insert own jobs" ON public.agent_jobs;
DROP POLICY IF EXISTS "Users can update own jobs" ON public.agent_jobs;
CREATE POLICY "Service role manages all jobs" ON public.agent_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can insert own connector logs" ON public.connector_activity_logs;
CREATE POLICY "Service role inserts connector logs" ON public.connector_activity_logs FOR INSERT TO service_role WITH CHECK (true);

REVOKE EXECUTE ON FUNCTION public.execute_atomic_credit_deduction(uuid, integer, text, text, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.execute_atomic_credit_deduction(uuid, integer, text, text, jsonb, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.log_security_audit(text, text, text, text, text, inet, text, boolean, text, jsonb, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_security_audit(text, text, text, text, text, inet, text, boolean, text, jsonb, uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_clear_connector_run(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_clear_connector_run(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_list_connector_runs(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_connector_runs(text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.log_connector_activity(
  _connector_slug text,
  _event_type text,
  _message text,
  _status text DEFAULT 'info'::text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _id UUID;
  _user_id UUID := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  INSERT INTO public.connector_activity_logs (
    user_id, connector_slug, event_type, message, status, metadata
  ) VALUES (
    _user_id, _connector_slug, _event_type, _message, _status, _metadata
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_connector_activity(text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_connector_activity(text, text, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_connector_activity(text, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_connector_activity(text, text, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;

REVOKE ALL ON FUNCTION public.bump_rate_limit(text, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_rate_limit(text, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.bump_rate_limit(text, uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bump_rate_limit(text, uuid, integer) TO service_role;

ALTER FUNCTION public.log_connector_activity(text, text, text, text, jsonb) SECURITY INVOKER;

CREATE POLICY "Users can insert own connector logs" 
ON public.connector_activity_logs 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.github_connections 
ADD COLUMN access_token_ciphertext TEXT,
ADD COLUMN access_token_iv TEXT,
ADD COLUMN access_token_tag TEXT;

GRANT ALL ON public.github_connections TO service_role;
GRANT SELECT, DELETE ON public.github_connections TO authenticated;
GRANT ALL ON public.connector_activity_logs TO service_role;
GRANT SELECT, INSERT, DELETE ON public.connector_activity_logs TO authenticated;
