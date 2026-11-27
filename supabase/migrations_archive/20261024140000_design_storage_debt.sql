-- Cobrança diária de armazenamento com saldo devedor.
-- O armazenamento é descontado do saldo do usuário (inclusive dos 5 créditos diários de indicado,
-- que entram às 00:00 UTC). Se o saldo não cobrir o custo do dia, a parte que falta fica como
-- saldo devedor: edits_used sobe além de edits_limit e o saldo fica negativo. A conta não é bloqueada.
-- Substitui charge_design_storage_daily da migração 20261024120000.

CREATE OR REPLACE FUNCTION public.charge_design_storage_daily()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row RECORD;
  _sub RECORD;
  _cost integer;
  _available integer;
  _charge integer;
  _debt integer;
  _result jsonb;
  _day text := current_date::text;
  _charged integer := 0;
BEGIN
  FOR _row IN
    SELECT user_id, count(*)::integer AS saved
    FROM public.design_library
    GROUP BY user_id
  LOOP
    BEGIN
      -- Já cobrado hoje (job rodou de novo): não cobra outra vez.
      IF EXISTS (
        SELECT 1 FROM public.credit_transactions
        WHERE user_id = _row.user_id
          AND idempotency_key IN (
            'design_storage:' || _row.user_id || ':' || _day,
            'design_storage_debt:' || _row.user_id || ':' || _day
          )
      ) THEN
        CONTINUE;
      END IF;

      SELECT edits_limit, edits_used INTO _sub
      FROM public.subscriptions
      WHERE user_id = _row.user_id AND is_active = true
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE WARNING 'design storage: no active subscription for %', _row.user_id;
        CONTINUE;
      END IF;

      _cost := public.design_storage_credits_per_day(_row.saved);
      _available := greatest(_sub.edits_limit - _sub.edits_used, 0);
      _charge := least(_cost, _available);
      _debt := _cost - _charge;

      IF _charge > 0 THEN
        _result := public.execute_atomic_credit_deduction(
          _row.user_id,
          _charge,
          'Armazenamento de designs',
          'design_storage',
          jsonb_build_object('saved_designs', _row.saved, 'cost', _cost),
          'design_storage:' || _row.user_id || ':' || _day
        );
      END IF;

      IF _debt > 0 THEN
        UPDATE public.subscriptions
          SET edits_used = edits_used + _debt, updated_at = now()
          WHERE user_id = _row.user_id AND is_active = true;

        INSERT INTO public.credit_transactions
          (user_id, delta, balance_after, reason, category, metadata, idempotency_key)
        SELECT _row.user_id, -_debt, (edits_limit - edits_used), 'Saldo devedor de armazenamento', 'design_storage_debt',
               jsonb_build_object('saved_designs', _row.saved, 'cost', _cost, 'debt', _debt),
               'design_storage_debt:' || _row.user_id || ':' || _day
        FROM public.subscriptions
        WHERE user_id = _row.user_id AND is_active = true
        LIMIT 1;
      END IF;

      _charged := _charged + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'design storage charge failed for %: %', _row.user_id, SQLERRM;
    END;
  END LOOP;

  RETURN _charged;
END;
$$;

REVOKE ALL ON FUNCTION public.charge_design_storage_daily() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_design_storage_daily() TO service_role;
