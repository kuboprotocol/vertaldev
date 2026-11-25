-- Recompensas novas na página /shortlinks:
--   1. Vídeo premiado (Google Ad Manager GPT rewarded) -> função `rewarded-video-claim`.
--   2. Vertal Node (Honeygain SDK, desktop e Android) -> função `honeygain-node-heartbeat`.
--
-- O crédito sai sempre por public.execute_atomic_credit_topup (soma em subscriptions.edits_limit e
-- grava em credit_transactions com chave de idempotência), o mesmo caminho das outras recompensas.
-- As tabelas abaixo são o registro de cada recompensa (reward_events) e o estado necessário para
-- idempotência, cooldown, limite diário e deduplicação por dia.
--
-- "Dia" é sempre o dia civil em America/Sao_Paulo (parâmetro _tz das funções).
--
-- Segurança: RLS ligado em tudo. O usuário só LÊ as próprias linhas; toda escrita passa pelas
-- Edge Functions (service role) e pelas funções SECURITY DEFINER abaixo, que só a service role executa.

-- 1. Ledger de recompensas ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reward_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source           text NOT NULL CHECK (source IN ('rewarded_video', 'honeygain_node')),
  credits          integer NOT NULL CHECK (credits >= 0),
  reward_day       date NOT NULL,
  idempotency_key  text NOT NULL,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reward_events_idem_uniq UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS reward_events_user_source_day_idx
  ON public.reward_events (user_id, source, reward_day DESC);

ALTER TABLE public.reward_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reward_events_select_own ON public.reward_events;
CREATE POLICY reward_events_select_own ON public.reward_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.reward_events FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.reward_events FROM authenticated;
GRANT SELECT ON public.reward_events TO authenticated;
GRANT ALL ON public.reward_events TO service_role;

-- 2. Sessões de vídeo premiado (nonce de uso único) ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.rewarded_video_sessions (
  nonce        text PRIMARY KEY CHECK (char_length(nonce) BETWEEN 32 AND 128),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  claimed_at   timestamptz,
  reward_day   date,
  credits      integer
);
CREATE INDEX IF NOT EXISTS rewarded_video_sessions_user_idx
  ON public.rewarded_video_sessions (user_id, claimed_at DESC);

ALTER TABLE public.rewarded_video_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rewarded_video_sessions_select_own ON public.rewarded_video_sessions;
CREATE POLICY rewarded_video_sessions_select_own ON public.rewarded_video_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.rewarded_video_sessions FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.rewarded_video_sessions FROM authenticated;
GRANT SELECT ON public.rewarded_video_sessions TO authenticated;
GRANT ALL ON public.rewarded_video_sessions TO service_role;

-- 3. Dispositivos Vertal Node (Honeygain) -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.honeygain_nodes (
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id        text NOT NULL CHECK (char_length(device_id) BETWEEN 8 AND 128),
  platform         text NOT NULL CHECK (platform IN ('desktop', 'android')),
  app_version      text CHECK (app_version IS NULL OR char_length(app_version) <= 40),
  opted_in         boolean NOT NULL DEFAULT false,
  running          boolean NOT NULL DEFAULT false,
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);

ALTER TABLE public.honeygain_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS honeygain_nodes_select_own ON public.honeygain_nodes;
CREATE POLICY honeygain_nodes_select_own ON public.honeygain_nodes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.honeygain_nodes FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.honeygain_nodes FROM authenticated;
GRANT SELECT ON public.honeygain_nodes TO authenticated;
GRANT ALL ON public.honeygain_nodes TO service_role;

-- 4. Resgate do vídeo premiado (atômico) --------------------------------------------------------
-- Trava por usuário (advisory lock) para que dois resgates simultâneos com nonces diferentes não
-- furem o cooldown nem o limite diário. O nonce é marcado como usado na mesma transação do crédito.
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
          pg_catalog.jsonb_build_object('nonce', _nonce));

  _topup := public.execute_atomic_credit_topup(
    _user_id, _amount, 'reward:rewarded_video', 'ad_reward',
    pg_catalog.jsonb_build_object('source', 'gam_rewarded'),
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

-- 5. Heartbeat do Vertal Node (crédito 1x por dia por usuário) -----------------------------------
-- Atualiza o dispositivo sempre. Credita só quando opted_in E running, uma vez por usuário por dia
-- (vários dispositivos no mesmo dia não multiplicam o crédito).
CREATE OR REPLACE FUNCTION public.record_honeygain_heartbeat(
  _user_id uuid,
  _device_id text,
  _platform text,
  _app_version text,
  _opted_in boolean,
  _running boolean,
  _amount integer,
  _tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _today date := (pg_catalog.now() AT TIME ZONE _tz)::date;
  _key text := 'honeygain_node:' || _today::text;
  _inserted uuid;
BEGIN
  INSERT INTO public.honeygain_nodes AS n
    (user_id, device_id, platform, app_version, opted_in, running, last_seen_at)
  VALUES (_user_id, _device_id, _platform, _app_version, _opted_in, _running, pg_catalog.now())
  ON CONFLICT (user_id, device_id) DO UPDATE
    SET platform = EXCLUDED.platform,
        app_version = EXCLUDED.app_version,
        opted_in = EXCLUDED.opted_in,
        running = EXCLUDED.running,
        last_seen_at = pg_catalog.now();

  IF NOT (_opted_in AND _running) OR _amount IS NULL OR _amount <= 0 THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'credited', false, 'reason', 'not_active', 'day', _today);
  END IF;

  INSERT INTO public.reward_events (user_id, source, credits, reward_day, idempotency_key, metadata)
  VALUES (_user_id, 'honeygain_node', _amount, _today, _key,
          pg_catalog.jsonb_build_object('device_id', _device_id, 'platform', _platform))
  ON CONFLICT (user_id, idempotency_key) DO NOTHING
  RETURNING id INTO _inserted;

  IF _inserted IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'credited', false, 'reason', 'already_credited_today', 'day', _today);
  END IF;

  PERFORM public.execute_atomic_credit_topup(
    _user_id, _amount, 'reward:honeygain_node', 'bandwidth_reward',
    pg_catalog.jsonb_build_object('source', 'honeygain', 'device_id', _device_id, 'platform', _platform),
    _key
  );

  RETURN pg_catalog.jsonb_build_object('ok', true, 'credited', true, 'credits', _amount, 'day', _today);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.record_honeygain_heartbeat(uuid, text, text, text, boolean, boolean, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_honeygain_heartbeat(uuid, text, text, text, boolean, boolean, integer, text) TO service_role;
