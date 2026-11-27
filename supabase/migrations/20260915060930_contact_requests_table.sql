-- Production migration 20260915060930 "contact_requests_table", recovered verbatim from
-- supabase_migrations.schema_migrations on project sccizjlpwezsgaxkclot (2026-11-27).
-- Already applied in production; kept here so the local history matches the remote one.

CREATE TABLE IF NOT EXISTS public.contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  full_name text NOT NULL,
  email text NOT NULL,
  company text,
  reason text NOT NULL CHECK (reason IN ('enterprise', 'support', 'other')),
  message text NOT NULL,
  estimated_volume text,
  team_size text,
  status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_andamento', 'respondido', 'fechado')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

-- Ninguém lê pelo client (nem o próprio remetente) — só a service role,
-- via edge function e futuro painel interno. Evita vazar lista de leads
-- pelo navegador de qualquer usuário autenticado.
CREATE POLICY "service_role_manages_contact_requests" ON public.contact_requests
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_contact_requests_status_created
  ON public.contact_requests (status, created_at DESC);
