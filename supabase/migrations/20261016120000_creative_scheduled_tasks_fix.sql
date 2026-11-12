-- Painel Criativo › Tarefas agendadas — correções da auditoria de 2026-10-16.
--
-- 1. creative_audit_schedules: um agendamento por usuário (o client faz upsert
--    e lê com .single(); sem UNIQUE o upsert duplicava linhas e a leitura quebrava).
-- 2. Bucket `exports` privado (os arquivos contêm a trilha de auditoria do usuário;
--    o download passa a ser por signed URL).
-- 3. Cancelar / reprocessar exportação via RPC com checagem de dono e de estado
--    (a tabela não tem policy de UPDATE para authenticated, então o .update() do
--    client afetava 0 linhas e a UI mostrava sucesso falso).
-- 4. pg_cron chamando creative-scheduled-export a cada 15 min (antes nada
--    executava os agendamentos).

-- 1) Deduplicar e garantir unicidade -------------------------------------------
DELETE FROM public.creative_audit_schedules s
USING public.creative_audit_schedules newer
WHERE s.user_id = newer.user_id
  AND (COALESCE(s.updated_at, s.created_at), s.id) < (COALESCE(newer.updated_at, newer.created_at), newer.id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'creative_audit_schedules_user_id_key'
  ) THEN
    ALTER TABLE public.creative_audit_schedules
      ADD CONSTRAINT creative_audit_schedules_user_id_key UNIQUE (user_id);
  END IF;
END $$;

ALTER TABLE public.creative_audit_schedules
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'json',
  ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMP WITH TIME ZONE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_audit_schedules_interval_chk') THEN
    ALTER TABLE public.creative_audit_schedules
      ADD CONSTRAINT creative_audit_schedules_interval_chk CHECK (export_interval_days BETWEEN 1 AND 90);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_audit_schedules_format_chk') THEN
    ALTER TABLE public.creative_audit_schedules
      ADD CONSTRAINT creative_audit_schedules_format_chk CHECK (format IN ('json', 'csv'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_creative_audit_schedules_due
  ON public.creative_audit_schedules (next_run_at) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_creative_export_history_queued
  ON public.creative_export_history (created_at) WHERE status = 'queued';

-- Próxima execução: no horário local escolhido, `export_interval_days` após a última.
CREATE OR REPLACE FUNCTION public.creative_schedule_next_run(
  p_time TIME, p_tz TEXT, p_interval_days INTEGER, p_last_run TIMESTAMPTZ
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_tz TEXT := COALESCE(NULLIF(p_tz, ''), 'UTC');
  v_base DATE;
  v_candidate TIMESTAMPTZ;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_tz) THEN
    v_tz := 'UTC';
  END IF;
  IF p_last_run IS NULL THEN
    v_base := (now() AT TIME ZONE v_tz)::date;
  ELSE
    v_base := (p_last_run AT TIME ZONE v_tz)::date + GREATEST(COALESCE(p_interval_days, 7), 1);
  END IF;
  v_candidate := (v_base + p_time) AT TIME ZONE v_tz;
  IF v_candidate < now() AND p_last_run IS NULL THEN
    v_candidate := v_candidate + interval '1 day';
  END IF;
  RETURN v_candidate;
END $$;

CREATE OR REPLACE FUNCTION public.creative_schedule_set_next_run()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.schedule_time IS DISTINCT FROM OLD.schedule_time
     OR NEW.timezone IS DISTINCT FROM OLD.timezone
     OR NEW.export_interval_days IS DISTINCT FROM OLD.export_interval_days
     OR NEW.last_run IS DISTINCT FROM OLD.last_run
     OR (NEW.is_active AND NOT COALESCE(OLD.is_active, false)) THEN
    NEW.next_run_at := public.creative_schedule_next_run(
      NEW.schedule_time, NEW.timezone, NEW.export_interval_days, NEW.last_run);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS creative_audit_schedules_next_run ON public.creative_audit_schedules;
CREATE TRIGGER creative_audit_schedules_next_run
  BEFORE INSERT OR UPDATE ON public.creative_audit_schedules
  FOR EACH ROW EXECUTE FUNCTION public.creative_schedule_set_next_run();

UPDATE public.creative_audit_schedules
SET next_run_at = public.creative_schedule_next_run(schedule_time, timezone, export_interval_days, last_run);

-- Os campos de execução são do servidor; o client só edita a configuração.
REVOKE UPDATE ON public.creative_audit_schedules FROM authenticated;
GRANT UPDATE (email, schedule_time, export_interval_days, is_active, timezone, format)
  ON public.creative_audit_schedules TO authenticated;

-- creative_scheduled_exports era uma tabela paralela nunca usada pelo app/funções.
COMMENT ON TABLE public.creative_scheduled_exports IS
  'DEPRECATED: substituída por creative_audit_schedules (auditoria 2026-10-16). Não usar.';

-- 2) Bucket privado --------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('exports', 'exports', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Arquivos ficam em exports/<user_id>/<export_id>.<ext>; o dono pode gerar signed URL.
DROP POLICY IF EXISTS "Users read own creative exports" ON storage.objects;
CREATE POLICY "Users read own creative exports"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'exports' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3) Cancelar / reprocessar --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_creative_export(p_export_id UUID)
RETURNS public.creative_export_history
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_row public.creative_export_history;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;

  UPDATE public.creative_export_history
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         error_message = 'Cancelado pelo usuário', updated_at = now()
   WHERE id = p_export_id AND user_id = auth.uid()
     AND status IN ('queued', 'processing')
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Exportação não encontrada ou já finalizada' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.creative_export_audit_log (export_id, user_id, action, details)
  VALUES (p_export_id, auth.uid(), 'cancel', jsonb_build_object('at', now()));
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.retry_creative_export(p_export_id UUID)
RETURNS public.creative_export_history
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_prev TEXT;
  v_row public.creative_export_history;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT status INTO v_prev FROM public.creative_export_history
   WHERE id = p_export_id AND user_id = auth.uid() FOR UPDATE;

  IF v_prev IS NULL OR v_prev NOT IN ('failed', 'cancelled') THEN
    RAISE EXCEPTION 'Só exportações com falha ou canceladas podem ser reprocessadas' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.creative_export_history
     SET status = 'queued', error_message = NULL, file_url = NULL,
         retry_count = COALESCE(retry_count, 0) + 1, last_retry_at = now(),
         cancelled_at = NULL, cancelled_by = NULL, updated_at = now()
   WHERE id = p_export_id
  RETURNING * INTO v_row;

  INSERT INTO public.creative_export_audit_log (export_id, user_id, action, details)
  VALUES (p_export_id, auth.uid(), 'retry',
          jsonb_build_object('at', now(), 'previous_status', v_prev, 'attempt', v_row.retry_count));
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.cancel_creative_export(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.retry_creative_export(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_creative_export(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retry_creative_export(UUID) TO authenticated;

-- 4) pg_cron -----------------------------------------------------------------------
-- Usa o mesmo segredo do Vault que o cron de domain-transfer (service role key),
-- enviado em x-cron-secret. Se cron/net/vault não existirem no ambiente, só avisa.
DO $$
DECLARE
  v_url TEXT;
BEGIN
  IF to_regnamespace('cron') IS NULL OR to_regnamespace('net') IS NULL OR to_regnamespace('vault') IS NULL THEN
    RAISE NOTICE 'pg_cron/pg_net/vault ausentes: agendamento creative-scheduled-export não criado';
    RETURN;
  END IF;

  IF to_regclass('public.settings') IS NOT NULL THEN
    EXECUTE $q$SELECT value FROM public.settings WHERE key = 'supabase_url'$q$ INTO v_url;
  END IF;
  v_url := COALESCE(NULLIF(v_url, ''), 'https://sccizjlpwezsgaxkclot.supabase.co');

  PERFORM cron.unschedule('creative-scheduled-export')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'creative-scheduled-export');

  PERFORM cron.schedule(
    'creative-scheduled-export',
    '*/15 * * * *',
    format($cmd$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', COALESCE(
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'kubo_domain_cron_key' LIMIT 1),
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
          )
        ),
        body := jsonb_build_object('action', 'cron_run')
      );
    $cmd$, v_url || '/functions/v1/creative-scheduled-export')
  );
END $$;
