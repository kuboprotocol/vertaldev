-- Biblioteca de designs do Canvas (Design Premium).
-- Regras de preço: ver src/config/designLibraryPricing.ts (mantenha as duas em sincronia).

CREATE TABLE IF NOT EXISTS public.design_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Sem título' CHECK (char_length(name) BETWEEN 1 AND 120),
  snapshot jsonb NOT NULL,
  is_published boolean NOT NULL DEFAULT false,
  reuse_count integer NOT NULL DEFAULT 0 CHECK (reuse_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_library_user_idx ON public.design_library (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS design_library_published_idx ON public.design_library (is_published, reuse_count DESC) WHERE is_published;

CREATE TABLE IF NOT EXISTS public.design_reuses (
  design_id uuid NOT NULL REFERENCES public.design_library(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (design_id, user_id)
);

ALTER TABLE public.design_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_reuses ENABLE ROW LEVEL SECURITY;

-- Dono gerencia os próprios designs; qualquer usuário logado vê os publicados.
DROP POLICY IF EXISTS "design_library_owner_all" ON public.design_library;
CREATE POLICY "design_library_owner_all" ON public.design_library
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "design_library_published_read" ON public.design_library;
CREATE POLICY "design_library_published_read" ON public.design_library
  FOR SELECT TO authenticated
  USING (is_published);

DROP POLICY IF EXISTS "design_reuses_own_read" ON public.design_reuses;
CREATE POLICY "design_reuses_own_read" ON public.design_reuses
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- reuse_count só muda pela função de reuso, nunca direto pelo cliente.
REVOKE UPDATE ON public.design_library FROM anon, authenticated;
GRANT UPDATE (name, snapshot, is_published, updated_at) ON public.design_library TO authenticated;
REVOKE ALL ON public.design_reuses FROM anon;

-- Quantos créditos por dia guardar N designs custam.
CREATE OR REPLACE FUNCTION public.design_storage_credits_per_day(_count integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN _count <= 0 THEN 0
    WHEN _count <= 10 THEN 1
    ELSE 1 + (length((_count - 1)::text) - 1)
  END
$$;

-- Usuário reutiliza um design publicado: autor ganha 1 crédito, uma vez por quem reutiliza.
CREATE OR REPLACE FUNCTION public.reuse_published_design(_design_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _design RECORD;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT id, user_id, name, snapshot, is_published
    INTO _design
    FROM public.design_library
    WHERE id = _design_id;

  IF NOT FOUND OR NOT _design.is_published THEN
    RAISE EXCEPTION 'design_not_published';
  END IF;

  IF _design.user_id = _uid THEN
    RAISE EXCEPTION 'cannot_reuse_own_design';
  END IF;

  INSERT INTO public.design_reuses (design_id, user_id)
  VALUES (_design_id, _uid)
  ON CONFLICT DO NOTHING;

  IF NOT FOUND THEN
    -- Já reutilizou antes: devolve o design, sem nova recompensa.
    RETURN jsonb_build_object('success', true, 'rewarded', false, 'name', _design.name, 'snapshot', _design.snapshot);
  END IF;

  UPDATE public.design_library
    SET reuse_count = reuse_count + 1
    WHERE id = _design_id;

  PERFORM public.execute_atomic_credit_topup(
    _design.user_id,
    1,
    'Design reutilizado',
    'design_reuse',
    jsonb_build_object('design_id', _design_id, 'reused_by', _uid),
    'design_reuse:' || _design_id || ':' || _uid
  );

  RETURN jsonb_build_object('success', true, 'rewarded', true, 'name', _design.name, 'snapshot', _design.snapshot);
END;
$$;

REVOKE ALL ON FUNCTION public.reuse_published_design(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reuse_published_design(uuid) TO authenticated, service_role;

-- Cobrança diária do armazenamento. Quem não tem saldo fica sem cobrança naquele dia e tenta de novo amanhã.
CREATE OR REPLACE FUNCTION public.charge_design_storage_daily()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row RECORD;
  _result jsonb;
  _charged integer := 0;
BEGIN
  FOR _row IN
    SELECT user_id, count(*)::integer AS saved
    FROM public.design_library
    GROUP BY user_id
  LOOP
    BEGIN
      _result := public.execute_atomic_credit_deduction(
        _row.user_id,
        public.design_storage_credits_per_day(_row.saved),
        'Armazenamento de designs',
        'design_storage',
        jsonb_build_object('saved_designs', _row.saved),
        'design_storage:' || _row.user_id || ':' || current_date
      );
      IF COALESCE((_result ->> 'success')::boolean, false) THEN
        _charged := _charged + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'design storage charge failed for %: %', _row.user_id, SQLERRM;
    END;
  END LOOP;

  RETURN _charged;
END;
$$;

REVOKE ALL ON FUNCTION public.charge_design_storage_daily() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_design_storage_daily() TO service_role;

-- Agenda a cobrança todo dia às 00:10 UTC (o pg_cron já é usado no projeto).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'design-library-storage-daily';
    PERFORM cron.schedule(
      'design-library-storage-daily',
      '10 0 * * *',
      'SELECT public.charge_design_storage_daily()'
    );
  END IF;
END;
$$;
