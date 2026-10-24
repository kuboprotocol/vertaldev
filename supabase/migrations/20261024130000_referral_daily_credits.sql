-- Créditos diários para indicados (Canvas do Design Premium).
-- Quem foi indicado e já fez o primeiro pagamento recebe 5 créditos por dia, todos os dias,
-- para cobrir o armazenamento da biblioteca. A trava de primeiro pagamento vem da regra de
-- indicação (referrals.credits_awarded > 0 só depois do primeiro pagamento): sem ela, contas
-- falsas indicadas por uma mesma pessoa renderiam créditos todo dia.
-- Valor: DESIGN_REFERRAL_DAILY_CREDITS em src/config/designLibraryPricing.ts (mantenha em sincronia).

CREATE OR REPLACE FUNCTION public.grant_referral_daily_credits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _referred RECORD;
  _result jsonb;
  _granted integer := 0;
BEGIN
  FOR _referred IN
    SELECT DISTINCT referred_id
    FROM public.referrals
    WHERE credits_awarded > 0
  LOOP
    BEGIN
      _result := public.execute_atomic_credit_topup(
        _referred.referred_id,
        5,
        'Crédito diário por indicação',
        'referral_daily',
        jsonb_build_object('source', 'referral_daily'),
        'referral_daily:' || _referred.referred_id || ':' || current_date
      );
      -- Replay (já concedido hoje) não conta como concessão nova.
      IF NOT COALESCE((_result ->> 'replayed')::boolean, false) THEN
        _granted := _granted + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'referral daily credits failed for %: %', _referred.referred_id, SQLERRM;
    END;
  END LOOP;

  RETURN _granted;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_referral_daily_credits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_referral_daily_credits() TO service_role;

-- Roda antes da cobrança de armazenamento (00:10 UTC), para o saldo do dia já estar creditado.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'referral-daily-credits';
    PERFORM cron.schedule(
      'referral-daily-credits',
      '0 0 * * *',
      'SELECT public.grant_referral_daily_credits()'
    );
  END IF;
END;
$$;
