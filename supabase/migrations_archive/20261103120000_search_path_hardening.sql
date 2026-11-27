-- Hardening: fixa search_path em funções SECURITY DEFINER que não tinham.
-- Sem isso, uma função com privilégio elevado pode resolver nomes no schema
-- errado (sequestro de search_path). As definições de origem também foram
-- atualizadas com SET search_path; este arquivo aplica o mesmo no banco.
-- Guardado com to_regprocedure: se a função não existir neste ambiente, não falha.
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'internal.is_kubo_admin()',
    'public.notify_creative_status_change()',
    'public.get_creative_audit_logs(text, text, uuid, text, text, text)',
    'public.cleanup_old_rate_limits()'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', f);
    END IF;
  END LOOP;
END $$;
