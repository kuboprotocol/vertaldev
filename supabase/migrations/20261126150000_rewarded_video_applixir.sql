-- Vídeo premiado com AppLixir (além do Google Ad Manager).
--
-- Puramente aditivo, depende de 20261124170000_rewarded_video_and_honeygain.sql:
--   * rewarded_video_sessions ganha a coluna `provider` ('applixir' | 'gam'), gravada no start;
--   * claim_rewarded_video mantém a MESMA assinatura e as mesmas regras (nonce de uso único,
--     trava por usuário, cooldown, limite diário em America/Sao_Paulo, crédito idempotente por
--     execute_atomic_credit_topup com a chave "rewarded_video:<nonce>"); só passa a registrar o
--     provedor real no metadata em vez do fixo 'gam_rewarded'.
-- Nada é apagado nem reescrito.

ALTER TABLE public.rewarded_video_sessions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'gam';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rewarded_video_sessions_provider_check'
      AND conrelid = 'public.rewarded_video_sessions'::regclass
  ) THEN
    ALTER TABLE public.rewarded_video_sessions
      ADD CONSTRAINT rewarded_video_sessions_provider_check CHECK (provider IN ('applixir', 'gam'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.claim_rewarded_video(
  _user_id uuid,
  _nonce text,
  _amount integer,
  _cooldown_seconds integer,
  _daily_cap integer,
  _tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _session RECORD;
  _today date := (pg_catalog.now() AT TIME ZONE _tz)::date;
  _claimed_today integer;
  _last_claim timestamptz;
  _topup jsonb;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('rewarded_video:' || _user_id::text));

  SELECT * INTO _session
  FROM public.rewarded_video_sessions
  WHERE nonce = _nonce AND user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_nonce');
  END IF;
  IF _session.claimed_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'nonce_already_used');
  END IF;
  IF _session.expires_at < pg_catalog.now() THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'nonce_expired');
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO _claimed_today
  FROM public.rewarded_video_sessions
  WHERE user_id = _user_id AND claimed_at IS NOT NULL AND reward_day = _today;

  IF _claimed_today >= _daily_cap THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'daily_cap_reached');
  END IF;

  SELECT pg_catalog.max(claimed_at) INTO _last_claim
  FROM public.rewarded_video_sessions
  WHERE user_id = _user_id AND claimed_at IS NOT NULL;

  IF _last_claim IS NOT NULL
     AND _last_claim > pg_catalog.now() - pg_catalog.make_interval(secs => _cooldown_seconds) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'cooldown');
  END IF;

  UPDATE public.rewarded_video_sessions
  SET claimed_at = pg_catalog.now(), reward_day = _today, credits = _amount
  WHERE nonce = _nonce;

  INSERT INTO public.reward_events (user_id, source, credits, reward_day, idempotency_key, metadata)
  VALUES (_user_id, 'rewarded_video', _amount, _today, 'rewarded_video:' || _nonce,
          pg_catalog.jsonb_build_object('nonce', _nonce, 'provider', _session.provider));

  _topup := public.execute_atomic_credit_topup(
    _user_id, _amount, 'reward:rewarded_video', 'ad_reward',
    pg_catalog.jsonb_build_object('source', 'rewarded_video', 'provider', _session.provider),
    'rewarded_video:' || _nonce
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'credits', _amount,
    'claimed_today', _claimed_today + 1,
    'balance_after', _topup -> 'balance_after'
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.claim_rewarded_video(uuid, text, integer, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_rewarded_video(uuid, text, integer, integer, integer, text) TO service_role;
