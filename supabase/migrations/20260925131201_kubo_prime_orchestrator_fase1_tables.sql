-- Production migration 20260925131201 "kubo_prime_orchestrator_fase1_tables", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.


-- KUBO Prime Fase 1 — tabelas que orchestrator / orchestrator-route / orchestrator-health
-- já esperavam no código mas nunca existiram no banco.

-- Config chave/valor do roteador (ex.: disabled_agents, disabled_categories)
CREATE TABLE IF NOT EXISTS public.orchestrator_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orchestrator_config ENABLE ROW LEVEL SECURITY;
-- só service_role escreve/lê (edge functions); sem policies = bloqueado para anon/authenticated,
-- service_role sempre contorna RLS.

-- Trilha de auditoria de tentativas de execução (retry loop do orchestrator-route)
CREATE TABLE IF NOT EXISTS public.job_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  correlation_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.job_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS job_audit_logs_correlation_id_idx ON public.job_audit_logs (correlation_id);

-- Log de decisões de roteamento (separado de orchestration_plans, que tem um
-- check constraint de `intent` específico para planos de app completo e não
-- serve para logar qual agente foi escolhido para um pedido pontual).
CREATE TABLE IF NOT EXISTS public.orchestrator_routing_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  agent text NOT NULL,
  confidence numeric,
  source text CHECK (source IN ('rule', 'ai', 'fallback')),
  reason text,
  mode text,
  correlation_id text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orchestrator_routing_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS orchestrator_routing_log_user_id_idx ON public.orchestrator_routing_log (user_id);

CREATE POLICY "users_select_own_routing_log" ON public.orchestrator_routing_log
  FOR SELECT USING (auth.uid() = user_id);

-- Completa o suporte a idempotência do orchestrator-route (o código já lê
-- `idempotency_key` e `result`, mas as colunas nunca existiram).
ALTER TABLE public.agent_jobs
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS result jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS agent_jobs_idempotency_key_uidx
  ON public.agent_jobs (idempotency_key) WHERE idempotency_key IS NOT NULL;
