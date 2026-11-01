-- Restaura objetos definidos nas migrations do repositório que nunca chegaram ao
-- banco de produção (que foi montado com blocos consolidados part_001..part_005).
-- Extraído das migrations: só comandos sobre objetos AUSENTES; funções e views na
-- definição mais recente. Nenhum objeto que já existe é redefinido.
-- Desvios das migrations: (1) a FK app_id -> public.apps(id) foi removida porque a
-- tabela apps não existe; (2) enqueue_email/delete_email/move_to_dlq/read_email_batch
-- ficaram de fora: são atalhos para internal.* sobre pgmq, que não está instalado,
-- e nada no código as chama.

-- ===== tabelas, índices, constraints, grants (268) =====
-- 20260607210209 [performance_metrics]
CREATE TABLE IF NOT EXISTS public.performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL,
  value_ms FLOAT NOT NULL,
  context JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 20260607210209 [performance_metrics]
GRANT ALL ON public.performance_metrics TO authenticated;

-- 20260607210209 [performance_metrics]
GRANT ALL ON public.performance_metrics TO service_role;

-- 20260607210223 [performance_metrics]
ALTER TABLE public.performance_metrics ENABLE ROW LEVEL SECURITY;

-- 20260608015041 [performance_metrics]
ALTER TABLE public.performance_metrics ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();

-- 20260608015041 [performance_metrics]
ALTER TABLE public.performance_metrics ENABLE ROW LEVEL SECURITY;

-- 20260608015041 [performance_metrics]
GRANT SELECT, INSERT ON public.performance_metrics TO authenticated;

-- 20260608015041 [performance_metrics]
GRANT ALL ON public.performance_metrics TO service_role;

-- 20260608133712 [creative_user_settings]
CREATE TABLE IF NOT EXISTS public.creative_user_settings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    filter TEXT DEFAULT 'all',
    search_query TEXT DEFAULT '',
    sort_order TEXT DEFAULT 'desc',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id)
);

-- 20260608133712 [creative_user_settings]
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_user_settings TO authenticated;

-- 20260608133712 [creative_user_settings]
GRANT ALL ON public.creative_user_settings TO service_role;

-- 20260608133712 [creative_user_settings]
ALTER TABLE public.creative_user_settings ENABLE ROW LEVEL SECURITY;

-- 20260608133712 [creative_audit_schedules]
CREATE TABLE IF NOT EXISTS public.creative_audit_schedules (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    schedule_time TIME NOT NULL, 
    last_run TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 20260608133712 [creative_audit_schedules]
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_audit_schedules TO authenticated;

-- 20260608133712 [creative_audit_schedules]
GRANT ALL ON public.creative_audit_schedules TO service_role;

-- 20260608133712 [creative_audit_schedules]
ALTER TABLE public.creative_audit_schedules ENABLE ROW LEVEL SECURITY;

-- 20260608140625 [creative_scheduled_exports]
CREATE TABLE IF NOT EXISTS public.creative_scheduled_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    schedule_time TIME NOT NULL,
    last_run_at TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 20260608140625 [creative_scheduled_exports]
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_scheduled_exports TO authenticated;

-- 20260608140625 [creative_scheduled_exports]
GRANT ALL ON public.creative_scheduled_exports TO service_role;

-- 20260608140625 [creative_scheduled_exports]
ALTER TABLE public.creative_scheduled_exports ENABLE ROW LEVEL SECURITY;

-- 20260608140625 [creative_org_branding]
CREATE TABLE IF NOT EXISTS public.creative_org_branding (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    org_name TEXT,
    logo_url TEXT,
    primary_color TEXT DEFAULT '#6366f1',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 20260608140625 [creative_org_branding]
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_org_branding TO authenticated;

-- 20260608140625 [creative_org_branding]
GRANT ALL ON public.creative_org_branding TO service_role;

-- 20260608140625 [creative_org_branding]
ALTER TABLE public.creative_org_branding ENABLE ROW LEVEL SECURITY;

-- 20260608141156 [creative_filter_presets]
CREATE TABLE IF NOT EXISTS public.creative_filter_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 20260608141156 [creative_filter_presets]
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_filter_presets TO authenticated;

-- 20260608141156 [creative_filter_presets]
GRANT ALL ON public.creative_filter_presets TO service_role;

-- 20260608141156 [creative_filter_presets]
ALTER TABLE public.creative_filter_presets ENABLE ROW LEVEL SECURITY;

-- 20260608141156 [creative_export_history]
CREATE TABLE IF NOT EXISTS public.creative_export_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    schedule_id UUID REFERENCES public.creative_audit_schedules(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'processing', 
    file_url TEXT,
    format TEXT NOT NULL, 
    item_count INTEGER DEFAULT 0,
    period_start TIMESTAMP WITH TIME ZONE,
    period_end TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 20260608141156 [creative_export_history]
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_export_history TO authenticated;

-- 20260608141156 [creative_export_history]
GRANT ALL ON public.creative_export_history TO service_role;

-- 20260608141156 [creative_export_history]
ALTER TABLE public.creative_export_history ENABLE ROW LEVEL SECURITY;

-- 20260608141156 [creative_export_logs]
CREATE TABLE IF NOT EXISTS public.creative_export_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    export_id UUID REFERENCES public.creative_export_history(id) ON DELETE CASCADE,
    level TEXT NOT NULL DEFAULT 'info', 
    message TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 20260608141156 [creative_export_logs]
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_export_logs TO authenticated;

-- 20260608141156 [creative_export_logs]
GRANT ALL ON public.creative_export_logs TO service_role;

-- 20260608141156 [creative_export_logs]
ALTER TABLE public.creative_export_logs ENABLE ROW LEVEL SECURITY;

-- 20260608141156 [creative_audit_schedules]
ALTER TABLE public.creative_audit_schedules ADD COLUMN IF NOT EXISTS export_interval_days INTEGER DEFAULT 7;

-- 20260608141156 [creative_audit_schedules]
ALTER TABLE public.creative_audit_schedules ADD COLUMN IF NOT EXISTS last_error_notified_at TIMESTAMP WITH TIME ZONE;

-- 20260608142235 [creative_filter_presets]
CREATE TABLE IF NOT EXISTS public.creative_filter_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    filter TEXT NOT NULL,
    search_query TEXT,
    sort_order TEXT DEFAULT 'desc',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 20260608142235 [creative_filter_presets]
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_filter_presets TO authenticated;

-- 20260608142235 [creative_filter_presets]
GRANT ALL ON public.creative_filter_presets TO service_role;

-- 20260608142235 [creative_filter_presets]
ALTER TABLE public.creative_filter_presets ENABLE ROW LEVEL SECURITY;

-- 20260608142235 [creative_export_history]
ALTER TABLE public.creative_export_history 
ADD COLUMN IF NOT EXISTS included_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS generation_time_ms INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS item_ids TEXT[],
ADD COLUMN IF NOT EXISTS date_range_start TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS date_range_end TIMESTAMP WITH TIME ZONE;

-- 20260608142235 [creative_audit_logs]
CREATE TABLE IF NOT EXISTS public.creative_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES public.creative_assets(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    tool TEXT,
    idempotency_key TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 20260608142235 [creative_audit_logs]
GRANT SELECT, INSERT ON public.creative_audit_logs TO authenticated;

-- 20260608142235 [creative_audit_logs]
GRANT ALL ON public.creative_audit_logs TO service_role;

-- 20260608142235 [creative_audit_logs]
ALTER TABLE public.creative_audit_logs ENABLE ROW LEVEL SECURITY;

-- 20260608145925 [creative_filter_presets]
ALTER TABLE public.creative_filter_presets ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- 20260608145925 [creative_export_history]
ALTER TABLE public.creative_export_history ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

-- 20260608145925 [creative_export_history]
ALTER TABLE public.creative_export_history ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id);

-- 20260608145925 [creative_export_history]
ALTER TABLE public.creative_export_history ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- 20260608145925 [creative_export_history]
ALTER TABLE public.creative_export_history ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP WITH TIME ZONE;

-- 20260608145925 [creative_export_history]
ALTER TABLE public.creative_export_history ADD COLUMN IF NOT EXISTS generation_started_at TIMESTAMP WITH TIME ZONE;

-- 20260608145925 [creative_export_audit_log]
CREATE TABLE IF NOT EXISTS public.creative_export_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_id UUID NOT NULL REFERENCES public.creative_export_history(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL, 
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 20260608145925 [creative_export_audit_log]
CREATE INDEX IF NOT EXISTS idx_creative_export_audit_log_export_id ON public.creative_export_audit_log(export_id);

-- 20260608145925 [creative_export_history]
CREATE INDEX IF NOT EXISTS idx_creative_export_history_user_id ON public.creative_export_history(user_id);

-- 20260608145925 [creative_export_history]
GRANT SELECT, INSERT, UPDATE ON public.creative_export_history TO authenticated;

-- 20260608145925 [creative_export_audit_log]
GRANT SELECT, INSERT ON public.creative_export_audit_log TO authenticated;

-- 20260608145925 [creative_export_history]
GRANT ALL ON public.creative_export_history TO service_role;

-- 20260608145925 [creative_export_audit_log]
GRANT ALL ON public.creative_export_audit_log TO service_role;

-- 20260608145925 [creative_export_audit_log]
ALTER TABLE public.creative_export_audit_log ENABLE ROW LEVEL SECURITY;

-- 20260608170310 [creative_notification_preferences]
CREATE TABLE public.creative_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notify_cancel BOOLEAN NOT NULL DEFAULT true,
  notify_retry BOOLEAN NOT NULL DEFAULT true,
  include_investigation_link BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- 20260608170310 [creative_notification_preferences]
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_notification_preferences TO authenticated;

-- 20260608170310 [creative_notification_preferences]
GRANT ALL ON public.creative_notification_preferences TO service_role;

-- 20260608170310 [creative_notification_preferences]
ALTER TABLE public.creative_notification_preferences ENABLE ROW LEVEL SECURITY;

-- 20260608221224 [creative_user_settings]
ALTER TABLE public.creative_user_settings ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- 20260608221224 [creative_user_settings]
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_user_settings TO authenticated;

-- 20260608221224 [creative_user_settings]
GRANT ALL ON public.creative_user_settings TO service_role;

-- 20260608230156 [creative_audit_trail]
CREATE TABLE IF NOT EXISTS public.creative_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  step TEXT NOT NULL,
  action TEXT NOT NULL,
  params JSONB,
  correlation_id TEXT,
  trace_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 20260608230156 [creative_audit_trail]
GRANT SELECT, INSERT ON public.creative_audit_trail TO authenticated;

-- 20260608230156 [creative_audit_trail]
GRANT ALL ON public.creative_audit_trail TO service_role;

-- 20260608230156 [creative_audit_trail]
ALTER TABLE public.creative_audit_trail ENABLE ROW LEVEL SECURITY;

-- 20260610195339 [creative_audit_logs]
GRANT ALL ON public.creative_audit_logs TO authenticated, service_role;

-- 20260610195339 [creative_audit_logs]
ALTER TABLE public.creative_audit_logs ENABLE ROW LEVEL SECURITY;

-- 20260610230106 [filter_presets]
CREATE TABLE public.filter_presets (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    sorting JSONB NOT NULL DEFAULT '{"column": "created_at", "direction": "desc"}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 20260610230106 [filter_presets]
GRANT SELECT, INSERT, UPDATE, DELETE ON public.filter_presets TO authenticated;

-- 20260610230106 [filter_presets]
GRANT ALL ON public.filter_presets TO service_role;

-- 20260610230106 [filter_presets]
ALTER TABLE public.filter_presets ENABLE ROW LEVEL SECURITY;

-- 20260611025235 [pwa_telemetry_events]
CREATE TABLE IF NOT EXISTS public.pwa_telemetry_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  canvas_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('image','svg','font','other')),
  url TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20260611025235 [pwa_telemetry_events]
CREATE INDEX IF NOT EXISTS idx_pwa_telem_user ON public.pwa_telemetry_events(user_id);

-- 20260611025235 [pwa_telemetry_events]
CREATE INDEX IF NOT EXISTS idx_pwa_telem_session ON public.pwa_telemetry_events(session_id);

-- 20260611025235 [pwa_telemetry_events]
CREATE INDEX IF NOT EXISTS idx_pwa_telem_canvas ON public.pwa_telemetry_events(canvas_id);

-- 20260611025235 [pwa_telemetry_events]
CREATE INDEX IF NOT EXISTS idx_pwa_telem_type ON public.pwa_telemetry_events(type);

-- 20260611025235 [pwa_telemetry_events]
CREATE INDEX IF NOT EXISTS idx_pwa_telem_created_at ON public.pwa_telemetry_events(created_at DESC);

-- 20260611025235 [pwa_telemetry_events]
GRANT SELECT, INSERT, DELETE ON public.pwa_telemetry_events TO authenticated;

-- 20260611025235 [pwa_telemetry_events]
GRANT ALL ON public.pwa_telemetry_events TO service_role;

-- 20260611025235 [pwa_telemetry_events]
ALTER TABLE public.pwa_telemetry_events ENABLE ROW LEVEL SECURITY;

-- 20260611031357 [pwa_telemetry_clear_logs]
CREATE TABLE IF NOT EXISTS public.pwa_telemetry_clear_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 20260611031357 [pwa_telemetry_clear_logs]
GRANT SELECT ON public.pwa_telemetry_clear_logs TO authenticated;

-- 20260611031357 [pwa_telemetry_clear_logs]
GRANT ALL ON public.pwa_telemetry_clear_logs TO service_role;

-- 20260611031357 [pwa_telemetry_clear_logs]
ALTER TABLE public.pwa_telemetry_clear_logs ENABLE ROW LEVEL SECURITY;

-- 20260611031856 [pwa_telemetry_webhooks]
CREATE TABLE IF NOT EXISTS public.pwa_telemetry_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  event_types TEXT[] NOT NULL DEFAULT '{anomaly}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 20260611031856 [pwa_telemetry_metrics]
CREATE TABLE IF NOT EXISTS public.pwa_telemetry_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT NOT NULL, 
  duration_ms INTEGER NOT NULL,
  row_count INTEGER DEFAULT 0,
  filters JSONB DEFAULT '{}'::jsonb,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 20260611031856 [pwa_telemetry_clear_logs]
ALTER TABLE public.pwa_telemetry_clear_logs RENAME TO pwa_telemetry_audit_logs;

-- 20260611031856 [pwa_telemetry_audit_logs]
ALTER TABLE public.pwa_telemetry_audit_logs ADD COLUMN IF NOT EXISTS action_type TEXT NOT NULL DEFAULT 'clear';

-- 20260611031856 [pwa_telemetry_webhooks]
GRANT SELECT ON public.pwa_telemetry_webhooks TO authenticated;

-- 20260611031856 [pwa_telemetry_webhooks]
GRANT ALL ON public.pwa_telemetry_webhooks TO service_role;

-- 20260611031856 [pwa_telemetry_metrics]
GRANT SELECT ON public.pwa_telemetry_metrics TO authenticated;

-- 20260611031856 [pwa_telemetry_metrics]
GRANT ALL ON public.pwa_telemetry_metrics TO service_role;

-- 20260611031856 [pwa_telemetry_audit_logs]
GRANT SELECT ON public.pwa_telemetry_audit_logs TO authenticated;

-- 20260611031856 [pwa_telemetry_audit_logs]
GRANT ALL ON public.pwa_telemetry_audit_logs TO service_role;

-- 20260611031856 [pwa_telemetry_webhooks]
ALTER TABLE public.pwa_telemetry_webhooks ENABLE ROW LEVEL SECURITY;

-- 20260611031856 [pwa_telemetry_metrics]
ALTER TABLE public.pwa_telemetry_metrics ENABLE ROW LEVEL SECURITY;

-- 20260611031856 [pwa_telemetry_audit_logs]
ALTER TABLE public.pwa_telemetry_audit_logs ENABLE ROW LEVEL SECURITY;

-- 20260611040545 [pwa_telemetry_export_jobs]
CREATE TABLE IF NOT EXISTS public.pwa_telemetry_export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    status TEXT NOT NULL DEFAULT 'pending', 
    filters JSONB DEFAULT '{}'::jsonb,
    format TEXT NOT NULL, 
    progress INTEGER DEFAULT 0,
    result_url TEXT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 20260611040545 [pwa_telemetry_settings]
CREATE TABLE IF NOT EXISTS public.pwa_telemetry_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) UNIQUE,
    webhook_url TEXT,
    is_notifications_enabled BOOLEAN DEFAULT false,
    anomaly_threshold_sigma DECIMAL DEFAULT 2.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 20260611040545 [pwa_telemetry_export_jobs]
GRANT SELECT, INSERT, UPDATE ON public.pwa_telemetry_export_jobs TO authenticated;

-- 20260611040545 [pwa_telemetry_export_jobs]
GRANT SELECT, INSERT, UPDATE ON public.pwa_telemetry_export_jobs TO service_role;

-- 20260611040545 [pwa_telemetry_settings]
GRANT SELECT, INSERT, UPDATE ON public.pwa_telemetry_settings TO authenticated;

-- 20260611040545 [pwa_telemetry_settings]
GRANT SELECT, INSERT, UPDATE ON public.pwa_telemetry_settings TO service_role;

-- 20260611040545 [pwa_telemetry_export_jobs]
ALTER TABLE public.pwa_telemetry_export_jobs ENABLE ROW LEVEL SECURITY;

-- 20260611040545 [pwa_telemetry_settings]
ALTER TABLE public.pwa_telemetry_settings ENABLE ROW LEVEL SECURITY;

-- 20260611174758 [pwa_telemetry_events]
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pwa_telemetry_events TO authenticated;

-- 20260611174758 [pwa_telemetry_events]
GRANT ALL ON public.pwa_telemetry_events TO service_role;

-- 20260611174758 [pwa_telemetry_export_jobs]
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pwa_telemetry_export_jobs TO authenticated;

-- 20260611174758 [pwa_telemetry_export_jobs]
GRANT ALL ON public.pwa_telemetry_export_jobs TO service_role;

-- 20260611174758 [pwa_telemetry_settings]
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pwa_telemetry_settings TO authenticated;

-- 20260611174758 [pwa_telemetry_settings]
GRANT ALL ON public.pwa_telemetry_settings TO service_role;

-- 20260611174758 [pwa_telemetry_audit_logs]
GRANT SELECT, INSERT ON public.pwa_telemetry_audit_logs TO authenticated;

-- 20260611174758 [pwa_telemetry_audit_logs]
GRANT ALL ON public.pwa_telemetry_audit_logs TO service_role;

-- 20260611174758 [pwa_telemetry_metrics]
GRANT SELECT ON public.pwa_telemetry_metrics TO authenticated;

-- 20260611174758 [pwa_telemetry_metrics]
GRANT ALL ON public.pwa_telemetry_metrics TO service_role;

-- 20260611174758 [pwa_telemetry_webhooks]
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pwa_telemetry_webhooks TO authenticated;

-- 20260611174758 [pwa_telemetry_webhooks]
GRANT ALL ON public.pwa_telemetry_webhooks TO service_role;

-- 20260704174327 [crash_reports]
CREATE TABLE IF NOT EXISTS public.crash_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resource text,
  route text,
  message text NOT NULL,
  stack text,
  component_stack text,
  user_agent text,
  viewport text,
  retry_count int DEFAULT 0,
  health jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 20260704174327 [crash_reports]
CREATE INDEX IF NOT EXISTS idx_crash_reports_created_at ON public.crash_reports (created_at DESC);

-- 20260704174327 [crash_reports]
CREATE INDEX IF NOT EXISTS idx_crash_reports_user_id ON public.crash_reports (user_id);

-- 20260704174327 [crash_reports]
GRANT SELECT, INSERT ON public.crash_reports TO authenticated;

-- 20260704174327 [crash_reports]
GRANT INSERT ON public.crash_reports TO anon;

-- 20260704174327 [crash_reports]
GRANT ALL ON public.crash_reports TO service_role;

-- 20260704174327 [crash_reports]
ALTER TABLE public.crash_reports ENABLE ROW LEVEL SECURITY;

-- 20260830145942 [cloud_sessions]
CREATE TABLE public.cloud_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  container_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'starting',
  preview_url TEXT,
  terminal_url TEXT,
  idle_timeout_seconds INTEGER NOT NULL DEFAULT 900,
  billed_minutes INTEGER NOT NULL DEFAULT 0,
  credits_spent NUMERIC(10,2) NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  terminated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20260830145942 [cloud_sessions]
CREATE INDEX idx_cloud_sessions_user ON public.cloud_sessions(user_id, started_at DESC);

-- 20260830145942 [cloud_sessions]
GRANT SELECT ON public.cloud_sessions TO authenticated;

-- 20260830145942 [cloud_sessions]
GRANT ALL ON public.cloud_sessions TO service_role;

-- 20260830145942 [cloud_sessions]
ALTER TABLE public.cloud_sessions ENABLE ROW LEVEL SECURITY;

-- 20260830145942 [mobile_devices]
CREATE TABLE public.mobile_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  apns_token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'ios',
  app_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20260830145942 [mobile_devices]
CREATE INDEX idx_mobile_devices_user ON public.mobile_devices(user_id);

-- 20260830145942 [mobile_devices]
GRANT SELECT, DELETE ON public.mobile_devices TO authenticated;

-- 20260830145942 [mobile_devices]
GRANT ALL ON public.mobile_devices TO service_role;

-- 20260830145942 [mobile_devices]
ALTER TABLE public.mobile_devices ENABLE ROW LEVEL SECURITY;

-- 20260903004216 [session_builds]
CREATE TABLE public.session_builds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.cloud_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  project_id UUID,
  kind TEXT NOT NULL DEFAULT 'build',
  status TEXT NOT NULL DEFAULT 'queued',
  command TEXT,
  logs TEXT NOT NULL DEFAULT '',
  preview_url TEXT,
  credits_spent NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20260903004216 [session_builds]
CREATE INDEX idx_session_builds_session ON public.session_builds(session_id, created_at DESC);

-- 20260903004216 [session_builds]
CREATE INDEX idx_session_builds_user ON public.session_builds(user_id, created_at DESC);

-- 20260903004216 [session_builds]
GRANT SELECT ON public.session_builds TO authenticated;

-- 20260903004216 [session_builds]
GRANT ALL ON public.session_builds TO service_role;

-- 20260903004216 [session_builds]
ALTER TABLE public.session_builds ENABLE ROW LEVEL SECURITY;

-- 20260903004216 [session_builds]
ALTER TABLE public.session_builds REPLICA IDENTITY FULL;

-- 20260903004216 [cloud_sessions]
ALTER TABLE public.cloud_sessions REPLICA IDENTITY FULL;

-- 20260904035931 [session_builds]
ALTER TABLE public.session_builds
  ADD COLUMN IF NOT EXISTS arch TEXT NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'web';

-- 20260904035931 [session_builds]
CREATE INDEX IF NOT EXISTS idx_session_builds_arch ON public.session_builds(arch, created_at DESC);

-- 20260904040820 [push_deliveries]
CREATE TABLE IF NOT EXISTS public.push_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  triggered_by UUID,
  kind TEXT NOT NULL DEFAULT 'manual',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'delivered',
  apns_id TEXT,
  error_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20260904040820 [push_deliveries]
GRANT SELECT ON public.push_deliveries TO authenticated;

-- 20260904040820 [push_deliveries]
GRANT ALL ON public.push_deliveries TO service_role;

-- 20260904040820 [push_deliveries]
ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;

-- 20260904040820 [push_deliveries]
CREATE INDEX IF NOT EXISTS idx_push_deliveries_created ON public.push_deliveries (created_at DESC);

-- 20260904040820 [push_deliveries]
CREATE INDEX IF NOT EXISTS idx_push_deliveries_user ON public.push_deliveries (user_id, created_at DESC);

-- 20260927041000 [affiliate_installs]
CREATE TABLE IF NOT EXISTS public.affiliate_installs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  embed_code       text NOT NULL UNIQUE, 
  domain           text NOT NULL,
  description      text,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'removed')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz DEFAULT now()
);

-- 20260927041000 [affiliate_installs]
CREATE INDEX IF NOT EXISTS affiliate_installs_affiliate_id_idx ON public.affiliate_installs(affiliate_id);

-- 20260927041000 [affiliate_installs]
CREATE INDEX IF NOT EXISTS affiliate_installs_embed_code_idx ON public.affiliate_installs(embed_code);

-- 20260927041000 [affiliate_installs]
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_installs_domain_idx ON public.affiliate_installs(affiliate_id, domain) WHERE status = 'active';

-- 20260927041000 [affiliate_installs]
ALTER TABLE public.affiliate_installs ENABLE ROW LEVEL SECURITY;

-- 20260927041000 [affiliate_installs]
REVOKE ALL ON public.affiliate_installs FROM anon, authenticated;

-- 20260927041000 [affiliate_installs]
GRANT SELECT, INSERT, UPDATE ON public.affiliate_installs TO authenticated;

-- 20260927041000 [affiliate_installs]
GRANT SELECT ON public.affiliate_installs TO anon;

-- 20260927041000 [affiliate_events]
CREATE TABLE IF NOT EXISTS public.affiliate_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  install_id       uuid NOT NULL REFERENCES public.affiliate_installs(id) ON DELETE CASCADE,
  event_type       text NOT NULL CHECK (event_type IN ('click', 'signup', 'conversion')),
  user_ip          inet,
  user_agent       text,
  referrer         text,
  converted_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 20260927041000 [affiliate_events]
CREATE INDEX IF NOT EXISTS affiliate_events_install_id_idx ON public.affiliate_events(install_id, created_at DESC);

-- 20260927041000 [affiliate_events]
CREATE INDEX IF NOT EXISTS affiliate_events_event_type_idx ON public.affiliate_events(event_type);

-- 20260927041000 [affiliate_events]
CREATE INDEX IF NOT EXISTS affiliate_events_created_at_idx ON public.affiliate_events(created_at DESC);

-- 20260927041000 [affiliate_events]
ALTER TABLE public.affiliate_events ENABLE ROW LEVEL SECURITY;

-- 20260927041000 [affiliate_events]
REVOKE ALL ON public.affiliate_events FROM anon, authenticated;

-- 20260927041000 [affiliate_events]
GRANT SELECT ON public.affiliate_events TO authenticated;

-- 20260927041000 [affiliate_events]
GRANT INSERT ON public.affiliate_events TO anon, authenticated;

-- 20260927050000 [user_ip_logs]
CREATE TABLE IF NOT EXISTS public.user_ip_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address       inet NOT NULL,
  user_agent       text,
  event_type       text NOT NULL DEFAULT 'signup', 
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 20260927050000 [user_ip_logs]
CREATE INDEX IF NOT EXISTS user_ip_logs_user_id_idx ON public.user_ip_logs(user_id);

-- 20260927050000 [user_ip_logs]
CREATE INDEX IF NOT EXISTS user_ip_logs_ip_address_idx ON public.user_ip_logs(ip_address, created_at DESC);

-- 20260927050000 [user_ip_logs]
CREATE INDEX IF NOT EXISTS user_ip_logs_event_type_idx ON public.user_ip_logs(event_type);

-- 20260927050000 [fraud_flags]
CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address       inet NOT NULL UNIQUE,
  reason           text NOT NULL,
  severity         text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  flagged_at       timestamptz NOT NULL DEFAULT now(),
  reviewed_at      timestamptz,
  is_confirmed     boolean DEFAULT false,
  notes            text
);

-- 20260927050000 [fraud_flags]
CREATE INDEX IF NOT EXISTS fraud_flags_ip_address_idx ON public.fraud_flags(ip_address);

-- 20260927050000 [fraud_flags]
CREATE INDEX IF NOT EXISTS fraud_flags_severity_idx ON public.fraud_flags(severity);

-- 20260927050000 [linked_accounts]
CREATE TABLE IF NOT EXISTS public.linked_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address       inet NOT NULL,
  detection_type   text NOT NULL, 
  confidence       numeric(5,2) NOT NULL, 
  flagged_at       timestamptz NOT NULL DEFAULT now(),
  is_confirmed     boolean DEFAULT false,
  CHECK (primary_user_id != linked_user_id)
);

-- 20260927050000 [linked_accounts]
CREATE INDEX IF NOT EXISTS linked_accounts_primary_user_id_idx ON public.linked_accounts(primary_user_id);

-- 20260927050000 [linked_accounts]
CREATE INDEX IF NOT EXISTS linked_accounts_linked_user_id_idx ON public.linked_accounts(linked_user_id);

-- 20260927050000 [affiliate_audit_log]
CREATE TABLE IF NOT EXISTS public.affiliate_audit_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action           text NOT NULL, 
  details          jsonb,
  ip_address       inet,
  user_agent       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 20260927050000 [affiliate_audit_log]
CREATE INDEX IF NOT EXISTS affiliate_audit_log_affiliate_id_idx ON public.affiliate_audit_log(affiliate_id, created_at DESC);

-- 20260927050000 [affiliate_audit_log]
CREATE INDEX IF NOT EXISTS affiliate_audit_log_action_idx ON public.affiliate_audit_log(action);

-- 20260927050000 [affiliate_audit_log]
GRANT INSERT ON public.affiliate_audit_log TO authenticated;

-- 20260927050000 [user_ip_logs]
ALTER TABLE public.user_ip_logs ENABLE ROW LEVEL SECURITY;

-- 20260927050000 [fraud_flags]
ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;

-- 20260927050000 [linked_accounts]
ALTER TABLE public.linked_accounts ENABLE ROW LEVEL SECURITY;

-- 20260927050000 [affiliate_audit_log]
ALTER TABLE public.affiliate_audit_log ENABLE ROW LEVEL SECURITY;

-- 20260927060000 [daily_shortlink_rewards]
create table if not exists daily_shortlink_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_date date not null,
  base_reward int not null default 5,
  bonus_reward int not null default 0,
  total_reward int not null generated always as (base_reward + bonus_reward) stored,
  applied_at timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  unique(user_id, reward_date)
);

-- 20260927060000 [daily_shortlink_rewards]
create index daily_rewards_user_id_idx on daily_shortlink_rewards(user_id);

-- 20260927060000 [daily_shortlink_rewards]
create index daily_rewards_date_idx on daily_shortlink_rewards(reward_date);

-- 20260927060000 [daily_shortlink_rewards]
alter table daily_shortlink_rewards enable row level security;

-- 20260927060000 [daily_shortlink_rewards]
grant select, insert on daily_shortlink_rewards to authenticated;

-- 20260927060000 [daily_shortlink_rewards]
grant select on daily_shortlink_rewards to authenticated;

-- 20261009000000 [app_logos]
CREATE TABLE IF NOT EXISTS public.app_logos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           uuid NOT NULL,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  
  name             text NOT NULL DEFAULT 'Logo',
  storage_path     text NOT NULL, 
  file_format      text NOT NULL, 
  file_size        integer, 

  
  width            integer,
  height           integer,

  
  is_active        boolean DEFAULT true,
  is_primary       boolean DEFAULT false, 
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  
  description      text,
  color_palette    jsonb, 
  tags             text[] DEFAULT '{}'::text[] 
);

-- 20261009000000 [app_logos]
CREATE INDEX IF NOT EXISTS app_logos_app_id_idx ON public.app_logos(app_id);

-- 20261009000000 [app_logos]
CREATE INDEX IF NOT EXISTS app_logos_user_id_idx ON public.app_logos(user_id);

-- 20261009000000 [app_logos]
CREATE INDEX IF NOT EXISTS app_logos_is_primary_idx ON public.app_logos(is_primary) WHERE is_primary = true;

-- 20261009000000 [app_logos]
ALTER TABLE public.app_logos ENABLE ROW LEVEL SECURITY;

-- 20261009000000 [app_logos]
REVOKE ALL ON public.app_logos FROM anon, authenticated;

-- 20261009000000 [app_logos]
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_logos TO authenticated;

-- 20261009010000 [logo_ai_generations]
CREATE TABLE IF NOT EXISTS public.logo_ai_generations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           uuid NOT NULL,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  
  prompt           text NOT NULL, 
  name             text NOT NULL DEFAULT 'AI Generated Logo',

  
  storage_path     text NOT NULL, 
  image_url        text, 

  
  status           text NOT NULL DEFAULT 'completed', 
  error_message    text, 

  
  model            text DEFAULT 'dall-e-3',
  created_at       timestamptz NOT NULL DEFAULT now(),
  imported_as_logo uuid REFERENCES public.app_logos(id) ON DELETE SET NULL 
);

-- 20261009010000 [logo_ai_generations]
CREATE INDEX IF NOT EXISTS logo_ai_generations_app_id_idx ON public.logo_ai_generations(app_id);

-- 20261009010000 [logo_ai_generations]
CREATE INDEX IF NOT EXISTS logo_ai_generations_user_id_idx ON public.logo_ai_generations(user_id);

-- 20261009010000 [logo_ai_generations]
CREATE INDEX IF NOT EXISTS logo_ai_generations_created_at_idx ON public.logo_ai_generations(created_at DESC);

-- 20261009010000 [logo_ai_generations]
ALTER TABLE public.logo_ai_generations ENABLE ROW LEVEL SECURITY;

-- 20261009010000 [logo_ai_generations]
REVOKE ALL ON public.logo_ai_generations FROM anon, authenticated;

-- 20261009010000 [logo_ai_generations]
GRANT SELECT, INSERT, DELETE ON public.logo_ai_generations TO authenticated;

-- 20261009020000 [stripe_transactions]
CREATE TABLE IF NOT EXISTS public.stripe_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  
  stripe_customer_id text NOT NULL,
  stripe_payment_intent_id text UNIQUE,
  stripe_session_id text UNIQUE,

  
  amount_cents      integer NOT NULL, 
  currency          text DEFAULT 'usd',
  credits_purchased integer NOT NULL, 

  
  tier              text NOT NULL, 

  
  status            text NOT NULL DEFAULT 'pending', 

  
  description       text,
  metadata          jsonb, 

  
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,

  
  error_message     text
);

-- 20261009020000 [stripe_transactions]
CREATE INDEX IF NOT EXISTS stripe_transactions_user_id_idx ON public.stripe_transactions(user_id);

-- 20261009020000 [stripe_transactions]
CREATE INDEX IF NOT EXISTS stripe_transactions_status_idx ON public.stripe_transactions(status);

-- 20261009020000 [stripe_transactions]
CREATE INDEX IF NOT EXISTS stripe_transactions_stripe_customer_id_idx ON public.stripe_transactions(stripe_customer_id);

-- 20261009020000 [stripe_transactions]
CREATE INDEX IF NOT EXISTS stripe_transactions_created_at_idx ON public.stripe_transactions(created_at DESC);

-- 20261009020000 [stripe_transactions]
ALTER TABLE public.stripe_transactions ENABLE ROW LEVEL SECURITY;

-- 20261009020000 [stripe_transactions]
REVOKE ALL ON public.stripe_transactions FROM anon, authenticated;

-- 20261009020000 [stripe_transactions]
GRANT SELECT ON public.stripe_transactions TO authenticated;

-- 20261009020000 [stripe_webhook_events]
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id  text UNIQUE NOT NULL,
  event_type       text NOT NULL, 

  data             jsonb NOT NULL, 
  processed        boolean DEFAULT false,
  processed_at     timestamptz,
  error_message    text,

  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 20261009020000 [stripe_webhook_events]
CREATE INDEX IF NOT EXISTS stripe_webhook_events_event_type_idx ON public.stripe_webhook_events(event_type);

-- 20261009020000 [stripe_webhook_events]
CREATE INDEX IF NOT EXISTS stripe_webhook_events_processed_idx ON public.stripe_webhook_events(processed);

-- 20261009020000 [stripe_webhook_events]
CREATE INDEX IF NOT EXISTS stripe_webhook_events_created_at_idx ON public.stripe_webhook_events(created_at DESC);

-- 20261009020000 [app_analytics]
CREATE TABLE IF NOT EXISTS public.app_analytics (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           uuid NOT NULL,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  
  date             date NOT NULL,

  views            integer DEFAULT 0,
  deploys          integer DEFAULT 0,
  errors           integer DEFAULT 0,

  credits_used     integer DEFAULT 0,
  uptime_percent   decimal DEFAULT 100,

  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 20261009020000 [app_analytics]
CREATE INDEX IF NOT EXISTS app_analytics_app_id_idx ON public.app_analytics(app_id);

-- 20261009020000 [app_analytics]
CREATE INDEX IF NOT EXISTS app_analytics_user_id_idx ON public.app_analytics(user_id);

-- 20261009020000 [app_analytics]
CREATE INDEX IF NOT EXISTS app_analytics_date_idx ON public.app_analytics(date DESC);

-- 20261009020000 [app_analytics]
CREATE UNIQUE INDEX IF NOT EXISTS app_analytics_app_id_date_idx ON public.app_analytics(app_id, date);

-- 20261009020000 [app_analytics]
ALTER TABLE public.app_analytics ENABLE ROW LEVEL SECURITY;

-- 20261009020000 [app_analytics]
REVOKE ALL ON public.app_analytics FROM anon, authenticated;

-- 20261009020000 [app_analytics]
GRANT SELECT ON public.app_analytics TO authenticated;

-- 20261009030000 [app_integrations]
CREATE TABLE IF NOT EXISTS public.app_integrations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           uuid NOT NULL,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  
  provider         text NOT NULL, 

  
  provider_account_id text, 
  provider_app_id  text, 

  
  access_token     text, 
  refresh_token    text, 
  token_expires_at timestamptz,

  
  status           text DEFAULT 'connected', 
  last_sync        timestamptz,
  last_error       text,

  
  metadata         jsonb, 

  
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 20261009030000 [app_integrations]
CREATE INDEX IF NOT EXISTS app_integrations_app_id_idx ON public.app_integrations(app_id);

-- 20261009030000 [app_integrations]
CREATE INDEX IF NOT EXISTS app_integrations_user_id_idx ON public.app_integrations(user_id);

-- 20261009030000 [app_integrations]
CREATE INDEX IF NOT EXISTS app_integrations_provider_idx ON public.app_integrations(provider);

-- 20261009030000 [app_integrations]
ALTER TABLE public.app_integrations ENABLE ROW LEVEL SECURITY;

-- 20261009030000 [app_integrations]
REVOKE ALL ON public.app_integrations FROM anon, authenticated;

-- 20261009030000 [app_integrations]
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_integrations TO authenticated;

-- 20261009030000 [app_deployments]
CREATE TABLE IF NOT EXISTS public.app_deployments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           uuid NOT NULL,
  integration_id   uuid REFERENCES public.app_integrations(id) ON DELETE SET NULL,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  
  provider         text NOT NULL, 
  provider_deployment_id text, 

  
  status           text DEFAULT 'pending', 

  
  branch           text,
  commit_hash      text,
  commit_message   text,

  
  deployment_url   text, 
  logs_url         text,

  
  metadata         jsonb,

  
  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  completed_at     timestamptz
);

-- 20261009030000 [app_deployments]
CREATE INDEX IF NOT EXISTS app_deployments_app_id_idx ON public.app_deployments(app_id);

-- 20261009030000 [app_deployments]
CREATE INDEX IF NOT EXISTS app_deployments_status_idx ON public.app_deployments(status);

-- 20261009030000 [app_deployments]
CREATE INDEX IF NOT EXISTS app_deployments_created_at_idx ON public.app_deployments(created_at DESC);

-- 20261009030000 [app_deployments]
ALTER TABLE public.app_deployments ENABLE ROW LEVEL SECURITY;

-- 20261009030000 [app_deployments]
REVOKE ALL ON public.app_deployments FROM anon, authenticated;

-- 20261009030000 [app_deployments]
GRANT SELECT ON public.app_deployments TO authenticated;

-- 20261009030000 [oauth_states]
CREATE TABLE IF NOT EXISTS public.oauth_states (
  state            text PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider         text NOT NULL,
  app_id           uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL
);

-- 20261009030000 [oauth_states]
CREATE INDEX IF NOT EXISTS oauth_states_user_id_idx ON public.oauth_states(user_id);

-- 20261009030000 [oauth_states]
CREATE INDEX IF NOT EXISTS oauth_states_expires_at_idx ON public.oauth_states(expires_at);

-- 20261009040000 [app_navbar_configs]
CREATE TABLE IF NOT EXISTS public.app_navbar_configs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           uuid NOT NULL,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  
  logo_url         text,
  logo_app_id      uuid REFERENCES public.app_logos(id) ON DELETE SET NULL,
  logo_height      integer DEFAULT 40, 

  
  bg_color         text DEFAULT '#ffffff',
  text_color       text DEFAULT '#000000',
  accent_color     text DEFAULT '#0066ff',
  position         text DEFAULT 'sticky', 
  shadow           boolean DEFAULT true,
  rounded          text DEFAULT 'lg', 

  
  menu_items       jsonb DEFAULT '[]'::jsonb, 
  show_search      boolean DEFAULT false,
  show_auth_buttons boolean DEFAULT true,

  
  sticky_top       text DEFAULT 'top-0', 
  z_index          text DEFAULT 'z-50',
  padding          text DEFAULT 'px-6 h-16', 
  transparency     text DEFAULT 'opacity-100', 

  
  is_active        boolean DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 20261009040000 [app_navbar_configs]
CREATE INDEX IF NOT EXISTS app_navbar_configs_app_id_idx ON public.app_navbar_configs(app_id);

-- 20261009040000 [app_navbar_configs]
CREATE INDEX IF NOT EXISTS app_navbar_configs_user_id_idx ON public.app_navbar_configs(user_id);

-- 20261009040000 [app_navbar_configs]
ALTER TABLE public.app_navbar_configs ENABLE ROW LEVEL SECURITY;

-- 20261009040000 [app_navbar_configs]
REVOKE ALL ON public.app_navbar_configs FROM anon, authenticated;

-- 20261009040000 [app_navbar_configs]
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_navbar_configs TO authenticated;

-- 20261010090000 [creative_conversations]
CREATE TABLE creative_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  model_used TEXT NOT NULL DEFAULT 'openai/gpt-3.5-turbo',
  total_messages INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  credits_used INT DEFAULT 0,
  free_conversations_used INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  archived BOOLEAN DEFAULT FALSE,
  pinned BOOLEAN DEFAULT FALSE,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[]
);

-- 20261010090000 [creative_conversations]
CREATE INDEX idx_creative_conversations_user_id ON creative_conversations(user_id);

-- 20261010090000 [creative_conversations]
CREATE INDEX idx_creative_conversations_created_at ON creative_conversations(created_at DESC);

-- 20261010090000 [creative_conversations]
CREATE INDEX idx_creative_conversations_archived ON creative_conversations(archived);

-- 20261010090000 [creative_conversations]
CREATE INDEX idx_creative_conversations_user_archived ON creative_conversations(user_id, archived);

-- 20261010090000 [creative_conversations]
CREATE INDEX idx_creative_conversations_user_pinned ON creative_conversations(user_id, pinned DESC, updated_at DESC);

-- 20261010090000 [creative_messages]
CREATE TABLE creative_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES creative_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tokens_used INT DEFAULT 0,
  is_free BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 20261010090000 [creative_messages]
CREATE INDEX idx_creative_messages_conversation_id ON creative_messages(conversation_id);

-- 20261010090000 [creative_messages]
CREATE INDEX idx_creative_messages_created_at ON creative_messages(created_at);

-- 20261010090000 [creative_messages]
CREATE INDEX idx_creative_messages_conversation_created ON creative_messages(conversation_id, created_at);

-- 20261010090000 [creative_conversations]
ALTER TABLE creative_conversations ENABLE ROW LEVEL SECURITY;

-- 20261010090000 [creative_messages]
ALTER TABLE creative_messages ENABLE ROW LEVEL SECURITY;

-- 20261010090000 [creative_conversations]
GRANT SELECT, INSERT ON creative_conversations TO anon;

-- 20261010090000 [creative_messages]
GRANT SELECT, INSERT, UPDATE ON creative_messages TO anon;

-- ===== funções (definição mais recente) (10) =====
-- 20260608004728 [execute_job_action]
CREATE OR REPLACE FUNCTION public.execute_job_action(p_job_id uuid, p_action text, p_actor_id uuid, p_correlation_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_job RECORD;
    v_new_status TEXT;
    v_audit_id UUID;
    v_resolved_actor UUID;
BEGIN
    -- Use auth.uid() if available (trusted), otherwise fallback to parameter (for service_role)
    v_resolved_actor := COALESCE(auth.uid(), p_actor_id);

    -- Seleciona e trava a linha para atualização. 
    -- SECURITY INVOKER will enforce RLS here.
    SELECT * INTO v_job FROM public.agent_jobs WHERE id = p_job_id FOR UPDATE;
    
    IF NOT FOUND THEN
        -- If RLS filters it out, it will look like 'Not found' to the user, which is correct.
        RETURN jsonb_build_object('ok', false, 'error', 'Job not found');
    END IF;

    -- Verificação de permissão redundante (RLS já garante isso se invocado por usuário)
    IF auth.role() != 'service_role' THEN
        IF v_job.user_id IS NOT NULL AND v_job.user_id != v_resolved_actor THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Permission denied');
        END IF;
    END IF;

    -- Define novo status e valida transição (IDEMPOTENTE)
    CASE p_action
        WHEN 'cancel' THEN
            IF v_job.status = 'failed' THEN
                RETURN jsonb_build_object('ok', true, 'new_status', 'failed', 'message', 'Job already cancelled');
            END IF;
            IF v_job.status = 'completed' THEN
                RETURN jsonb_build_object('ok', false, 'error', 'Cannot cancel completed job');
            END IF;
            v_new_status := 'failed';
        WHEN 'pause' THEN
            IF v_job.status = 'paused' THEN
                RETURN jsonb_build_object('ok', true, 'new_status', 'paused', 'message', 'Job already paused');
            END IF;
            IF v_job.status != 'processing' THEN
                RETURN jsonb_build_object('ok', false, 'error', 'Only processing jobs can be paused');
            END IF;
            v_new_status := 'paused';
        WHEN 'resume' THEN
            IF v_job.status = 'processing' THEN
                RETURN jsonb_build_object('ok', true, 'new_status', 'processing', 'message', 'Job already running');
            END IF;
            IF v_job.status != 'paused' THEN
                RETURN jsonb_build_object('ok', false, 'error', 'Only paused jobs can be resumed');
            END IF;
            v_new_status := 'processing';
        WHEN 'retry' THEN
            IF v_job.status = 'processing' OR v_job.status = 'queued' THEN
                RETURN jsonb_build_object('ok', true, 'new_status', v_job.status, 'message', 'Job already active');
            END IF;
            v_new_status := 'processing';
        ELSE
            RETURN jsonb_build_object('ok', false, 'error', 'Invalid action');
    END CASE;

    -- Atualiza o job
    UPDATE public.agent_jobs 
    SET 
        status = v_new_status,
        updated_at = now(),
        paused_at = CASE WHEN p_action = 'pause' THEN now() WHEN p_action = 'resume' THEN NULL ELSE paused_at END,
        error_message = CASE WHEN p_action = 'cancel' THEN 'Cancelado pelo usuário' WHEN p_action = 'retry' THEN NULL ELSE error_message END,
        retry_count = CASE WHEN p_action = 'retry' THEN 0 ELSE retry_count END,
        next_retry_at = CASE WHEN p_action = 'retry' THEN NULL ELSE next_retry_at END
    WHERE id = p_job_id;

    -- Insere log de auditoria
    INSERT INTO public.job_audit_logs (job_id, action, actor_id, correlation_id, details)
    VALUES (p_job_id, p_action, v_resolved_actor, p_correlation_id, jsonb_build_object('source', 'rpc_action', 'timestamp', now(), 'idempotent', true))
    RETURNING id INTO v_audit_id;

    RETURN jsonb_build_object('ok', true, 'new_status', v_new_status, 'audit_id', v_audit_id);
END;
$function$;

-- 20260609155319 [notify_creative_status_change]
CREATE OR REPLACE FUNCTION public.notify_creative_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only execute if it's a relevant status change
  IF (OLD.status IS DISTINCT FROM NEW.status) AND (NEW.status IN ('completed', 'failed', 'cancelled', 'error')) THEN
    PERFORM
      net.http_post(
        url := (SELECT value FROM settings WHERE key = 'supabase_url') || '/functions/v1/creative-status-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT value FROM settings WHERE key = 'service_role_key')
        ),
        body := jsonb_build_object(
          'asset_id', NEW.id,
          'user_id', NEW.user_id,
          'status', NEW.status,
          'tool', NEW.tool
        )
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 20260611025235 [has_any_role]
CREATE OR REPLACE FUNCTION public.has_any_role(_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = ANY(_roles)
  )
$$;

-- 20260611233127 [cleanup_old_rate_limits]
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits() 
RETURNS trigger AS $$
BEGIN
    DELETE FROM public.rate_limit_counters WHERE created_at < now() - interval '24 hours';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 20260927041000 [record_affiliate_event]
CREATE OR REPLACE FUNCTION public.record_affiliate_event(
  _embed_code text,
  _event_type text,
  _user_ip inet DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _referrer text DEFAULT NULL,
  _converted_user_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _install_id uuid;
  _event_id uuid;
BEGIN
  -- Encontra o install
  SELECT id INTO _install_id
  FROM public.affiliate_installs
  WHERE embed_code = _embed_code AND status = 'active'
  LIMIT 1;

  IF _install_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Registra evento
  INSERT INTO public.affiliate_events
    (install_id, event_type, user_ip, user_agent, referrer, converted_user_id, metadata)
  VALUES
    (_install_id, _event_type, _user_ip, _user_agent, _referrer, _converted_user_id, _metadata)
  RETURNING id INTO _event_id;

  -- Atualiza last_activity_at do install
  UPDATE public.affiliate_installs
  SET last_activity_at = now()
  WHERE id = _install_id;

  RETURN _event_id;
END;
$$;

-- 20260927050000 [log_user_ip]
CREATE OR REPLACE FUNCTION public.log_user_ip(
  _user_id uuid,
  _ip_address inet DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _event_type text DEFAULT 'signup'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_ip_logs (user_id, ip_address, user_agent, event_type)
  VALUES (_user_id, _ip_address, _user_agent, _event_type);
END;
$$;

-- 20260927050000 [detect_fraud_by_ip]
CREATE OR REPLACE FUNCTION public.detect_fraud_by_ip(
  _ip_address inet
) RETURNS TABLE (
  is_suspicious boolean,
  risk_level text,
  reason text,
  account_count integer,
  flagged boolean
) AS $$
DECLARE
  _account_count integer;
  _flagged_count integer;
  _is_flagged boolean;
  _reason text := '';
  _risk_level text := 'low';
BEGIN
  -- Contar contas no mesmo IP
  SELECT COUNT(DISTINCT user_id) INTO _account_count
  FROM public.user_ip_logs
  WHERE ip_address = _ip_address AND created_at > now() - interval '90 days';

  -- Verificar se IP está na lista de fraude
  SELECT COUNT(*) INTO _flagged_count
  FROM public.fraud_flags
  WHERE ip_address = _ip_address AND is_confirmed = true;

  _is_flagged := _flagged_count > 0;

  -- Lógica de risco
  IF _is_flagged THEN
    _risk_level := 'critical';
    _reason := 'IP bloqueado como fraudulento confirmado';
  ELSIF _account_count > 10 THEN
    _risk_level := 'high';
    _reason := format('%s contas no mesmo IP (último 90 dias)', _account_count);
  ELSIF _account_count > 5 THEN
    _risk_level := 'medium';
    _reason := format('%s contas no mesmo IP (último 90 dias)', _account_count);
  ELSIF _account_count > 1 THEN
    _risk_level := 'low';
    _reason := format('%s contas no mesmo IP (normal, múltiplos usuários em rede compartilhada)', _account_count);
  END IF;

  RETURN QUERY SELECT
    (_risk_level != 'low') as is_suspicious,
    _risk_level,
    _reason,
    _account_count,
    _is_flagged;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- 20260927050000 [can_be_affiliate]
CREATE OR REPLACE FUNCTION public.can_be_affiliate(
  _user_id uuid,
  _ip_address inet DEFAULT NULL
) RETURNS TABLE (
  allowed boolean,
  reason text
) AS $$
DECLARE
  _other_count integer;
  _fraud_risk record;
BEGIN
  -- Verificar risco de fraude no IP
  SELECT * INTO _fraud_risk
  FROM public.detect_fraud_by_ip(_ip_address)
  LIMIT 1;

  -- Se IP é crítico (confirmado fraude), bloquear
  IF _fraud_risk.risk_level = 'critical' THEN
    RETURN QUERY SELECT false, 'Este IP foi bloqueado por atividade fraudulenta confirmada';
    RETURN;
  END IF;

  -- Se IP tem muitas contas (>5), impedir afiliação para evitar golpes
  IF _fraud_risk.account_count > 5 THEN
    RETURN QUERY SELECT false, format(
      'Este IP tem %s contas. Afiliados devem usar IPs únicos para evitar fraude.',
      _fraud_risk.account_count
    );
    RETURN;
  END IF;

  -- Se tem outras contas do mesmo IP que já são afiliados, bloquear
  SELECT COUNT(DISTINCT ail.affiliate_id) INTO _other_count
  FROM public.user_ip_logs uil
  JOIN public.affiliate_installs ail ON ail.affiliate_id = uil.user_id
  WHERE uil.ip_address = _ip_address
    AND uil.user_id != _user_id
    AND ail.status = 'active'
    AND uil.created_at > now() - interval '90 days';

  IF _other_count > 0 THEN
    RETURN QUERY SELECT false, 'Outra conta neste IP já é afiliado. Um IP = um afiliado para evitar golpes.';
    RETURN;
  END IF;

  -- Tudo OK
  RETURN QUERY SELECT true, 'Usuário pode ser afiliado';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- 20260927060000 [update_shortlinks_updated_at]
create or replace function update_shortlinks_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 20261009020000 [process_stripe_payment]
CREATE OR REPLACE FUNCTION public.process_stripe_payment(_transaction_id uuid, _credits integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
BEGIN
  SELECT user_id INTO _user_id FROM public.stripe_transactions WHERE id = _transaction_id;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  -- Adicionar créditos ao user
  INSERT INTO public.user_credits (user_id, credit_type, amount, description)
  VALUES (_user_id, 'purchase', _credits, 'Créditos comprados via Stripe')
  ON CONFLICT (user_id) DO UPDATE
  SET balance = user_credits.balance + _credits,
      updated_at = now();

  -- Atualizar transação
  UPDATE public.stripe_transactions
  SET status = 'completed', completed_at = now()
  WHERE id = _transaction_id;

  RETURN true;
END;
$$;

-- ===== permissões de funções (29) =====
-- 20260609155345 [notify_creative_status_change]
REVOKE EXECUTE ON FUNCTION public.notify_creative_status_change() FROM PUBLIC;

-- 20260609155345 [notify_creative_status_change]
REVOKE EXECUTE ON FUNCTION public.notify_creative_status_change() FROM authenticated;

-- 20260609155345 [notify_creative_status_change]
REVOKE EXECUTE ON FUNCTION public.notify_creative_status_change() FROM anon;

-- 20260611025250 [has_any_role]
REVOKE EXECUTE ON FUNCTION public.has_any_role(text[]) FROM PUBLIC, anon, authenticated;

-- 20260611025250 [has_any_role]
GRANT EXECUTE ON FUNCTION public.has_any_role(text[]) TO service_role;

-- 20260611025305 [has_any_role]
GRANT EXECUTE ON FUNCTION public.has_any_role(text[]) TO authenticated;

-- 20260611204733 [notify_creative_status_change]
REVOKE EXECUTE ON FUNCTION public.notify_creative_status_change() FROM PUBLIC;

-- 20260611204733 [notify_creative_status_change]
REVOKE EXECUTE ON FUNCTION public.notify_creative_status_change() FROM authenticated;

-- 20260611204733 [notify_creative_status_change]
REVOKE EXECUTE ON FUNCTION public.notify_creative_status_change() FROM anon;

-- 20260611233127 [has_any_role]
REVOKE EXECUTE ON FUNCTION public.has_any_role(text[]) FROM PUBLIC, authenticated, anon;

-- 20260611233127 [has_any_role]
GRANT EXECUTE ON FUNCTION public.has_any_role(text[]) TO authenticated, service_role;

-- 20260611233148 [cleanup_old_rate_limits]
ALTER FUNCTION public.cleanup_old_rate_limits() SET search_path = public;

-- 20260611233148 [cleanup_old_rate_limits]
REVOKE ALL ON FUNCTION public.cleanup_old_rate_limits() FROM PUBLIC, authenticated, anon;

-- 20260611233148 [notify_creative_status_change]
REVOKE ALL ON FUNCTION public.notify_creative_status_change() FROM PUBLIC, authenticated, anon;

-- 20260611234925 [notify_creative_status_change]
ALTER FUNCTION public.notify_creative_status_change() SET search_path = public;

-- 20260611234925 [notify_creative_status_change]
REVOKE ALL ON FUNCTION public.notify_creative_status_change() FROM PUBLIC, authenticated, anon;

-- 20260611234925 [has_any_role]
ALTER FUNCTION public.has_any_role(text[]) SET search_path = public;

-- 20260611234925 [has_any_role]
REVOKE EXECUTE ON FUNCTION public.has_any_role(text[]) FROM PUBLIC, anon;

-- 20260611234925 [has_any_role]
GRANT EXECUTE ON FUNCTION public.has_any_role(text[]) TO authenticated, service_role;

-- 20260611234925 [cleanup_old_rate_limits]
ALTER FUNCTION public.cleanup_old_rate_limits() SET search_path = public;

-- 20260611234925 [cleanup_old_rate_limits]
REVOKE ALL ON FUNCTION public.cleanup_old_rate_limits() FROM PUBLIC, authenticated, anon;

-- 20260927041000 [record_affiliate_event]
REVOKE ALL ON FUNCTION public.record_affiliate_event(text, text, inet, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- 20260927041000 [record_affiliate_event]
GRANT EXECUTE ON FUNCTION public.record_affiliate_event(text, text, inet, text, text, uuid, jsonb) TO anon, authenticated;

-- 20260927050000 [log_user_ip]
REVOKE ALL ON FUNCTION public.log_user_ip(uuid, inet, text, text) FROM PUBLIC, anon, authenticated;

-- 20260927050000 [log_user_ip]
GRANT EXECUTE ON FUNCTION public.log_user_ip(uuid, inet, text, text) TO service_role;

-- 20260927050000 [detect_fraud_by_ip]
GRANT EXECUTE ON FUNCTION public.detect_fraud_by_ip(inet) TO service_role;

-- 20260927050000 [can_be_affiliate]
GRANT EXECUTE ON FUNCTION public.can_be_affiliate(uuid, inet) TO service_role;

-- 20261009020000 [process_stripe_payment]
REVOKE ALL ON FUNCTION public.process_stripe_payment(uuid, integer) FROM PUBLIC, anon, authenticated;

-- 20261009020000 [process_stripe_payment]
GRANT EXECUTE ON FUNCTION public.process_stripe_payment(uuid, integer) TO service_role;

-- ===== políticas RLS (110) =====
-- 20260607210223 [performance_metrics]
CREATE POLICY "Authenticated users can insert metrics" ON public.performance_metrics 
FOR INSERT TO authenticated WITH CHECK (true);

-- 20260607210223 [performance_metrics]
CREATE POLICY "Authenticated users can view metrics" ON public.performance_metrics 
FOR SELECT TO authenticated USING (true);

-- 20260608015041 [performance_metrics]
DROP POLICY IF EXISTS "Authenticated users can view metrics" ON public.performance_metrics;

-- 20260608015041 [performance_metrics]
DROP POLICY IF EXISTS "Authenticated users can insert metrics" ON public.performance_metrics;

-- 20260608015041 [performance_metrics]
CREATE POLICY "Users can view own metrics" ON public.performance_metrics
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR internal.is_kubo_admin());

-- 20260608015041 [performance_metrics]
CREATE POLICY "Users can insert own metrics" ON public.performance_metrics
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 20260608133712 [creative_user_settings]
CREATE POLICY "Users can manage their own creative settings" 
ON public.creative_user_settings FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- 20260608133712 [creative_audit_schedules]
CREATE POLICY "Users can manage their own audit schedules" 
ON public.creative_audit_schedules FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- 20260608141156 [creative_filter_presets]
CREATE POLICY "Users can manage their own filter presets" ON public.creative_filter_presets 
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 20260608141156 [creative_export_history]
CREATE POLICY "Users can view their own export history" ON public.creative_export_history 
    FOR SELECT USING (auth.uid() = user_id);

-- 20260608141156 [creative_export_logs]
CREATE POLICY "Users can view their own export logs" ON public.creative_export_logs 
    FOR SELECT USING (auth.uid() = user_id);

-- 20260608142235 [creative_filter_presets]
CREATE POLICY "Users can manage their own presets" ON public.creative_filter_presets
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 20260608142235 [creative_audit_logs]
CREATE POLICY "Users can view their own audit logs" ON public.creative_audit_logs
    FOR SELECT USING (auth.uid() = user_id);

-- 20260608145925 [creative_export_audit_log]
CREATE POLICY "Users can view their own export audit logs" 
ON public.creative_export_audit_log FOR SELECT 
USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.creative_export_history e 
    WHERE e.id = export_id AND e.user_id = auth.uid()
));

-- 20260608145925 [creative_export_audit_log]
CREATE POLICY "Users can insert their own export audit logs" 
ON public.creative_export_audit_log FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- 20260608170310 [creative_notification_preferences]
CREATE POLICY "Users can manage their own notification preferences"
  ON public.creative_notification_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 20260608230156 [creative_audit_trail]
CREATE POLICY "Users can view their own audit trail"
  ON public.creative_audit_trail FOR SELECT
  USING (auth.uid() = user_id);

-- 20260608230156 [creative_audit_trail]
CREATE POLICY "Users can insert their own audit trail"
  ON public.creative_audit_trail FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 20260609155544 [creative_audit_trail]
CREATE POLICY "Admins can view all audit trail" 
ON public.creative_audit_trail FOR SELECT 
USING (internal.is_kubo_admin());

-- 20260609155544 [creative_export_audit_log]
CREATE POLICY "Admins can view all export audit logs" 
ON public.creative_export_audit_log FOR SELECT 
USING (internal.is_kubo_admin());

-- 20260610195339 [creative_audit_logs]
DROP POLICY IF EXISTS "Users can insert their own audit logs" ON public.creative_audit_logs;

-- 20260610195339 [creative_audit_logs]
CREATE POLICY "Users can insert their own audit logs" ON public.creative_audit_logs 
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 20260610230106 [filter_presets]
CREATE POLICY "Users can manage their own presets" ON public.filter_presets
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 20260611025235 [pwa_telemetry_events]
CREATE POLICY "Users can insert own telemetry"
ON public.pwa_telemetry_events
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 20260611025235 [pwa_telemetry_events]
CREATE POLICY "Telemetry readers can view"
ON public.pwa_telemetry_events
FOR SELECT TO authenticated
USING (public.has_any_role(ARRAY['admin','analyst','viewer']));

-- 20260611025235 [pwa_telemetry_events]
CREATE POLICY "Telemetry admins can delete"
ON public.pwa_telemetry_events
FOR DELETE TO authenticated
USING (public.has_any_role(ARRAY['admin','analyst']));

-- 20260611031357 [pwa_telemetry_clear_logs]
CREATE POLICY "Admins can view clear logs" ON public.pwa_telemetry_audit_logs
  FOR SELECT USING (public.has_any_role(ARRAY['admin']));

-- 20260611031856 [pwa_telemetry_webhooks]
CREATE POLICY "Admins can manage webhooks" ON public.pwa_telemetry_webhooks
  FOR ALL USING (public.has_any_role(ARRAY['admin']));

-- 20260611031856 [pwa_telemetry_metrics]
CREATE POLICY "Admins can view metrics" ON public.pwa_telemetry_metrics
  FOR SELECT USING (public.has_any_role(ARRAY['admin']));

-- 20260611031856 [pwa_telemetry_audit_logs]
CREATE POLICY "Admins can view audit logs" ON public.pwa_telemetry_audit_logs
  FOR SELECT USING (public.has_any_role(ARRAY['admin']));

-- 20260611040545 [pwa_telemetry_export_jobs]
CREATE POLICY "Users can manage their own export jobs" ON public.pwa_telemetry_export_jobs
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 20260611040545 [pwa_telemetry_settings]
CREATE POLICY "Users can manage their own settings" ON public.pwa_telemetry_settings
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 20260611040545 [pwa_telemetry_export_jobs]
CREATE POLICY "Admins can view all jobs" ON public.pwa_telemetry_export_jobs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() AND role IN ('admin', 'analyst')
        )
    );

-- 20260611040545 [pwa_telemetry_settings]
CREATE POLICY "Admins can view all settings" ON public.pwa_telemetry_settings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- 20260613235922 [creative_export_history]
DROP POLICY IF EXISTS "Service role manages export history" ON public.creative_export_history;

-- 20260613235922 [creative_export_history]
CREATE POLICY "Service role manages export history"
  ON public.creative_export_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 20260613235922 [pwa_telemetry_audit_logs]
DROP POLICY IF EXISTS "Service role manages pwa audit logs" ON public.pwa_telemetry_audit_logs;

-- 20260613235922 [pwa_telemetry_audit_logs]
CREATE POLICY "Service role manages pwa audit logs"
  ON public.pwa_telemetry_audit_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 20260614000125 [creative_export_audit_log]
DROP POLICY IF EXISTS "Users can insert their own export audit logs" ON public.creative_export_audit_log;

-- 20260614000125 [creative_export_audit_log]
DROP POLICY IF EXISTS "Service role writes export audit logs" ON public.creative_export_audit_log;

-- 20260614000125 [creative_export_audit_log]
CREATE POLICY "Service role writes export audit logs"
  ON public.creative_export_audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 20260614000125 [creative_audit_trail]
DROP POLICY IF EXISTS "Users can insert their own audit trail" ON public.creative_audit_trail;

-- 20260614000125 [creative_audit_trail]
DROP POLICY IF EXISTS "Service role writes audit trail" ON public.creative_audit_trail;

-- 20260614000125 [creative_audit_trail]
CREATE POLICY "Service role writes audit trail"
  ON public.creative_audit_trail
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 20260704174327 [crash_reports]
CREATE POLICY "insert_crash_reports_any"
  ON public.crash_reports FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 20260704174327 [crash_reports]
CREATE POLICY "select_own_crash_reports"
  ON public.crash_reports FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role('admin'));

-- 20260830145942 [cloud_sessions]
CREATE POLICY "Users can view their own cloud sessions"
  ON public.cloud_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 20260830145942 [mobile_devices]
CREATE POLICY "Users can view their own devices"
  ON public.mobile_devices FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 20260830145942 [mobile_devices]
CREATE POLICY "Users can delete their own devices"
  ON public.mobile_devices FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 20260903004216 [session_builds]
CREATE POLICY "Users can view their own builds"
  ON public.session_builds FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 20260903004216 [session_builds]
CREATE POLICY "Admins can view all builds"
  ON public.session_builds FOR SELECT
  TO authenticated
  USING (public.has_role('admin'));

-- 20260903004216 [cloud_sessions]
CREATE POLICY "Admins can view all cloud sessions"
  ON public.cloud_sessions FOR SELECT
  TO authenticated
  USING (public.has_role('admin'));

-- 20260904040820 [push_deliveries]
DROP POLICY IF EXISTS "Users read own push deliveries" ON public.push_deliveries;

-- 20260904040820 [push_deliveries]
CREATE POLICY "Users read own push deliveries" ON public.push_deliveries
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role('admin'));

-- 20260927041000 [affiliate_installs]
DROP POLICY IF EXISTS "affiliate_installs_select_own" ON public.affiliate_installs;

-- 20260927041000 [affiliate_installs]
CREATE POLICY "affiliate_installs_select_own" ON public.affiliate_installs
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = affiliate_id);

-- 20260927041000 [affiliate_installs]
DROP POLICY IF EXISTS "affiliate_installs_insert_own" ON public.affiliate_installs;

-- 20260927041000 [affiliate_installs]
CREATE POLICY "affiliate_installs_insert_own" ON public.affiliate_installs
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = affiliate_id);

-- 20260927041000 [affiliate_installs]
DROP POLICY IF EXISTS "affiliate_installs_update_own" ON public.affiliate_installs;

-- 20260927041000 [affiliate_installs]
CREATE POLICY "affiliate_installs_update_own" ON public.affiliate_installs
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = affiliate_id);

-- 20260927041000 [affiliate_events]
DROP POLICY IF EXISTS "affiliate_events_select_own_install" ON public.affiliate_events;

-- 20260927041000 [affiliate_events]
CREATE POLICY "affiliate_events_select_own_install" ON public.affiliate_events
  FOR SELECT TO authenticated
  USING (
    install_id IN (
      SELECT id FROM public.affiliate_installs
      WHERE affiliate_id = (SELECT auth.uid())
    )
  );

-- 20260927041000 [affiliate_events]
DROP POLICY IF EXISTS "affiliate_events_insert_anon" ON public.affiliate_events;

-- 20260927041000 [affiliate_events]
CREATE POLICY "affiliate_events_insert_anon" ON public.affiliate_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- 20260927050000 [affiliate_audit_log]
DROP POLICY IF EXISTS "Affiliates log their own actions" ON public.affiliate_audit_log;

-- 20260927050000 [affiliate_audit_log]
CREATE POLICY "Affiliates log their own actions"
  ON public.affiliate_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = affiliate_id);

-- 20260927060000 [daily_shortlink_rewards]
create policy "Users can view their own rewards"
  on daily_shortlink_rewards
  for select
  using (auth.uid() = user_id);

-- 20261009000000 [app_logos]
DROP POLICY IF EXISTS "app_logos_select_own" ON public.app_logos;

-- 20261009000000 [app_logos]
CREATE POLICY "app_logos_select_own" ON public.app_logos
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- 20261009000000 [app_logos]
DROP POLICY IF EXISTS "app_logos_insert_own" ON public.app_logos;

-- 20261009000000 [app_logos]
CREATE POLICY "app_logos_insert_own" ON public.app_logos
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

-- 20261009000000 [app_logos]
DROP POLICY IF EXISTS "app_logos_update_own" ON public.app_logos;

-- 20261009000000 [app_logos]
CREATE POLICY "app_logos_update_own" ON public.app_logos
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- 20261009000000 [app_logos]
DROP POLICY IF EXISTS "app_logos_delete_own" ON public.app_logos;

-- 20261009000000 [app_logos]
CREATE POLICY "app_logos_delete_own" ON public.app_logos
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- 20261009010000 [logo_ai_generations]
DROP POLICY IF EXISTS "logo_ai_generations_select_own" ON public.logo_ai_generations;

-- 20261009010000 [logo_ai_generations]
CREATE POLICY "logo_ai_generations_select_own" ON public.logo_ai_generations
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- 20261009010000 [logo_ai_generations]
DROP POLICY IF EXISTS "logo_ai_generations_insert_own" ON public.logo_ai_generations;

-- 20261009010000 [logo_ai_generations]
CREATE POLICY "logo_ai_generations_insert_own" ON public.logo_ai_generations
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

-- 20261009010000 [logo_ai_generations]
DROP POLICY IF EXISTS "logo_ai_generations_delete_own" ON public.logo_ai_generations;

-- 20261009010000 [logo_ai_generations]
CREATE POLICY "logo_ai_generations_delete_own" ON public.logo_ai_generations
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- 20261009020000 [stripe_transactions]
DROP POLICY IF EXISTS "stripe_transactions_select_own" ON public.stripe_transactions;

-- 20261009020000 [stripe_transactions]
CREATE POLICY "stripe_transactions_select_own" ON public.stripe_transactions
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- 20261009020000 [app_analytics]
DROP POLICY IF EXISTS "app_analytics_select_own" ON public.app_analytics;

-- 20261009020000 [app_analytics]
CREATE POLICY "app_analytics_select_own" ON public.app_analytics
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- 20261009030000 [app_integrations]
DROP POLICY IF EXISTS "app_integrations_select_own" ON public.app_integrations;

-- 20261009030000 [app_integrations]
CREATE POLICY "app_integrations_select_own" ON public.app_integrations
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- 20261009030000 [app_integrations]
DROP POLICY IF EXISTS "app_integrations_insert_own" ON public.app_integrations;

-- 20261009030000 [app_integrations]
CREATE POLICY "app_integrations_insert_own" ON public.app_integrations
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

-- 20261009030000 [app_integrations]
DROP POLICY IF EXISTS "app_integrations_update_own" ON public.app_integrations;

-- 20261009030000 [app_integrations]
CREATE POLICY "app_integrations_update_own" ON public.app_integrations
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- 20261009030000 [app_integrations]
DROP POLICY IF EXISTS "app_integrations_delete_own" ON public.app_integrations;

-- 20261009030000 [app_integrations]
CREATE POLICY "app_integrations_delete_own" ON public.app_integrations
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- 20261009030000 [app_deployments]
DROP POLICY IF EXISTS "app_deployments_select_own" ON public.app_deployments;

-- 20261009030000 [app_deployments]
CREATE POLICY "app_deployments_select_own" ON public.app_deployments
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- 20261009040000 [app_navbar_configs]
DROP POLICY IF EXISTS "app_navbar_configs_select_own" ON public.app_navbar_configs;

-- 20261009040000 [app_navbar_configs]
CREATE POLICY "app_navbar_configs_select_own" ON public.app_navbar_configs
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- 20261009040000 [app_navbar_configs]
DROP POLICY IF EXISTS "app_navbar_configs_insert_own" ON public.app_navbar_configs;

-- 20261009040000 [app_navbar_configs]
CREATE POLICY "app_navbar_configs_insert_own" ON public.app_navbar_configs
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

-- 20261009040000 [app_navbar_configs]
DROP POLICY IF EXISTS "app_navbar_configs_update_own" ON public.app_navbar_configs;

-- 20261009040000 [app_navbar_configs]
CREATE POLICY "app_navbar_configs_update_own" ON public.app_navbar_configs
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- 20261009040000 [app_navbar_configs]
DROP POLICY IF EXISTS "app_navbar_configs_delete_own" ON public.app_navbar_configs;

-- 20261009040000 [app_navbar_configs]
CREATE POLICY "app_navbar_configs_delete_own" ON public.app_navbar_configs
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- 20261010090000 [creative_conversations]
CREATE POLICY "Users can view their own conversations"
  ON creative_conversations
  FOR SELECT
  USING (auth.uid() = user_id);

-- 20261010090000 [creative_conversations]
CREATE POLICY "Users can create their own conversations"
  ON creative_conversations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 20261010090000 [creative_conversations]
CREATE POLICY "Users can update their own conversations"
  ON creative_conversations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 20261010090000 [creative_conversations]
CREATE POLICY "Users can delete their own conversations"
  ON creative_conversations
  FOR DELETE
  USING (auth.uid() = user_id);

-- 20261010090000 [creative_messages]
CREATE POLICY "Users can view messages in their conversations"
  ON creative_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM creative_conversations
      WHERE id = conversation_id
      AND user_id = auth.uid()
    )
  );

-- 20261010090000 [creative_messages]
CREATE POLICY "Users can create messages in their conversations"
  ON creative_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM creative_conversations
      WHERE id = conversation_id
      AND user_id = auth.uid()
    )
  );

-- 20261010090000 [creative_messages]
CREATE POLICY "Users can update their own messages"
  ON creative_messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM creative_conversations
      WHERE id = conversation_id
      AND user_id = auth.uid()
    )
  );

-- ===== views (7) =====
-- 20260608110421 [gmail_accounts_safe]
CREATE OR REPLACE VIEW public.gmail_accounts_safe WITH (security_invoker = on) AS
SELECT id, user_id, email, display_name, avatar_url, scope, access_token_expires_at, last_synced_at, created_at, updated_at
FROM public.gmail_accounts
WHERE (auth.uid() = user_id) OR internal.is_kubo_admin();

-- 20260611204733 [leaderboard_profiles]
CREATE OR REPLACE VIEW public.leaderboard_profiles AS
SELECT id, display_name, avatar_url FROM public.profiles;

-- 20260611204733 [leaderboard_streaks]
CREATE OR REPLACE VIEW public.leaderboard_streaks AS
SELECT user_id, current_streak, longest_streak, last_activity_date FROM public.user_streaks;

-- 20260611204733 [leaderboard_badges]
CREATE OR REPLACE VIEW public.leaderboard_badges AS
SELECT user_id, badge_type FROM public.user_badges;

-- 20260719175030 [public_profiles]
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true) AS
SELECT id, display_name, avatar_url
FROM public.profiles;

-- 20260927041000 [affiliate_install_stats]
CREATE OR REPLACE VIEW public.affiliate_install_stats AS
SELECT
  ai.id,
  ai.affiliate_id,
  ai.domain,
  COUNT(CASE WHEN ae.event_type = 'click' THEN 1 END) as total_clicks,
  COUNT(CASE WHEN ae.event_type = 'signup' THEN 1 END) as total_signups,
  COUNT(CASE WHEN ae.event_type = 'conversion' THEN 1 END) as total_conversions,
  CASE
    WHEN COUNT(CASE WHEN ae.event_type = 'click' THEN 1 END) > 0
    THEN ROUND(
      COUNT(CASE WHEN ae.event_type = 'conversion' THEN 1 END)::numeric /
      COUNT(CASE WHEN ae.event_type = 'click' THEN 1 END)::numeric * 100,
      2
    )
    ELSE 0
  END as conversion_rate,
  MAX(ae.created_at) as last_activity_at
FROM public.affiliate_installs ai
LEFT JOIN public.affiliate_events ae ON ae.install_id = ai.id
WHERE ai.status = 'active'
GROUP BY ai.id, ai.affiliate_id, ai.domain;

-- 20260927050000 [potential_fraud_referrals]
CREATE OR REPLACE VIEW public.potential_fraud_referrals AS
SELECT
  r.referrer_id,
  r.referred_id,
  uil1.ip_address as referrer_ip,
  uil2.ip_address as referred_ip,
  CASE WHEN uil1.ip_address = uil2.ip_address THEN true ELSE false END as same_ip,
  COUNT(DISTINCT uil1.user_id) FILTER (WHERE uil1.ip_address = uil2.ip_address) as accounts_on_same_ip,
  r.created_at
FROM public.referrals r
LEFT JOIN public.user_ip_logs uil1 ON uil1.user_id = r.referrer_id
LEFT JOIN public.user_ip_logs uil2 ON uil2.user_id = r.referred_id
WHERE uil1.created_at > now() - interval '30 days'
  AND uil2.created_at > now() - interval '30 days'
GROUP BY r.referrer_id, r.referred_id, uil1.ip_address, uil2.ip_address, r.created_at;

-- ===== permissões de views (7) =====
-- 20260611204733 [leaderboard_profiles]
GRANT SELECT ON public.leaderboard_profiles TO authenticated, anon;

-- 20260611204733 [leaderboard_streaks]
GRANT SELECT ON public.leaderboard_streaks TO authenticated;

-- 20260611204733 [leaderboard_badges]
GRANT SELECT ON public.leaderboard_badges TO authenticated;

-- 20260719175030 [public_profiles]
GRANT SELECT ON public.public_profiles TO authenticated, anon;

-- 20260927041000 [affiliate_install_stats]
GRANT SELECT ON public.affiliate_install_stats TO authenticated;

-- 20260927050000 [potential_fraud_referrals]
REVOKE ALL ON public.potential_fraud_referrals FROM PUBLIC, anon, authenticated;

-- 20260927050000 [potential_fraud_referrals]
GRANT SELECT ON public.potential_fraud_referrals TO service_role;

-- ===== triggers (12) =====
-- 20260608133712
DROP TRIGGER IF EXISTS update_creative_user_settings_updated_at ON public.creative_user_settings;
CREATE TRIGGER update_creative_user_settings_updated_at 
BEFORE UPDATE ON public.creative_user_settings 
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 20260608133712
DROP TRIGGER IF EXISTS update_creative_audit_schedules_updated_at ON public.creative_audit_schedules;
CREATE TRIGGER update_creative_audit_schedules_updated_at 
BEFORE UPDATE ON public.creative_audit_schedules 
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 20260608151215
DROP TRIGGER IF EXISTS on_creative_status_change ON public.creative_assets;
CREATE TRIGGER on_creative_status_change
  AFTER UPDATE OF status ON public.creative_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_creative_status_change();

-- 20260608170310
DROP TRIGGER IF EXISTS update_creative_notification_preferences_updated_at ON public.creative_notification_preferences;
CREATE TRIGGER update_creative_notification_preferences_updated_at
BEFORE UPDATE ON public.creative_notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 20260610230106
DROP TRIGGER IF EXISTS update_filter_presets_updated_at ON public.filter_presets;
CREATE TRIGGER update_filter_presets_updated_at
    BEFORE UPDATE ON public.filter_presets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 20260611040545
DROP TRIGGER IF EXISTS update_pwa_telemetry_export_jobs_updated_at ON public.pwa_telemetry_export_jobs;
CREATE TRIGGER update_pwa_telemetry_export_jobs_updated_at
    BEFORE UPDATE ON public.pwa_telemetry_export_jobs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 20260611040545
DROP TRIGGER IF EXISTS update_pwa_telemetry_settings_updated_at ON public.pwa_telemetry_settings;
CREATE TRIGGER update_pwa_telemetry_settings_updated_at
    BEFORE UPDATE ON public.pwa_telemetry_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 20260611233127
DROP TRIGGER IF EXISTS trigger_cleanup_rate_limits ON public.rate_limit_counters;
CREATE TRIGGER trigger_cleanup_rate_limits
    AFTER INSERT ON public.rate_limit_counters
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.cleanup_old_rate_limits();

-- 20260830145942
DROP TRIGGER IF EXISTS update_cloud_sessions_updated_at ON public.cloud_sessions;
CREATE TRIGGER update_cloud_sessions_updated_at
  BEFORE UPDATE ON public.cloud_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 20260830145942
DROP TRIGGER IF EXISTS update_mobile_devices_updated_at ON public.mobile_devices;
CREATE TRIGGER update_mobile_devices_updated_at
  BEFORE UPDATE ON public.mobile_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 20260903004216
DROP TRIGGER IF EXISTS update_session_builds_updated_at ON public.session_builds;
CREATE TRIGGER update_session_builds_updated_at
  BEFORE UPDATE ON public.session_builds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 20260927060000
DROP TRIGGER IF EXISTS shortlinks_updated_at_trigger ON public.shortlinks;
create trigger shortlinks_updated_at_trigger
before update on shortlinks
for each row
execute function update_shortlinks_updated_at();
