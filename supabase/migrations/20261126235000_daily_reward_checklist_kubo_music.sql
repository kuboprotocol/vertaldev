-- Checklist diário de recompensas + músicas do Kubo no painel /recompensas.
--
-- Regra (pedido do Laércio, 2026-11-26): para ganhar as recompensas do dia o usuário precisa
-- completar TODAS as atividades do dia (dia civil em America/Sao_Paulo):
--   1. vídeo premiado: pelo menos 1 vídeo resgatado hoje;
--   2. músicas do Kubo: as 5 faixas ouvidas hoje (cada uma conta com >= N s de reprodução real);
--   3. TERRA ADS: pelo menos 1 anúncio recebido hoje.
-- O Vertal Node continua bônus opcional (não entra no checklist e não passa por aqui).
--
-- Créditos das atividades do dia entram como PENDENTES em reward_events (status 'pending') e só
-- vão para o saldo (execute_atomic_credit_topup, idempotente pela mesma chave do evento) quando o
-- checklist do dia fecha. Pendentes de dias que não fecharam viram 'expired' (nada é apagado).
-- TERRA ADS: os cliques continuam em ad_rewards (frações); cliques feitos depois do início da regra
-- só entram no saldo retirável se o dia do clique fechou o checklist (ver terra_reward_gating).
--
-- Puramente aditivo e idempotente: colunas novas com default, tabelas novas, CREATE OR REPLACE.
-- claim_rewarded_video mantém a mesma assinatura. Linhas antigas de reward_events ficam 'released'.

-- 1. reward_events: status do crédito + fonte nova 'kubo_music' -------------------------------------
ALTER TABLE public.reward_events ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'released';
ALTER TABLE public.reward_events ADD COLUMN IF NOT EXISTS released_at timestamptz;
ALTER TABLE public.reward_events ADD COLUMN IF NOT EXISTS expired_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reward_events_status_check' AND conrelid = 'public.reward_events'::regclass
  ) THEN
    ALTER TABLE public.reward_events
      ADD CONSTRAINT reward_events_status_check CHECK (status IN ('pending', 'released', 'expired'));
  END IF;
END $$;

-- Mantém todas as fontes já conhecidas (inclusive 'vertal_node' de 20261124210000).
ALTER TABLE public.reward_events DROP CONSTRAINT IF EXISTS reward_events_source_check;
ALTER TABLE public.reward_events
  ADD CONSTRAINT reward_events_source_check
  CHECK (source IN ('rewarded_video', 'honeygain_node', 'vertal_node', 'kubo_music'));

CREATE INDEX IF NOT EXISTS reward_events_user_day_status_idx
  ON public.reward_events (user_id, reward_day, status);

-- 2. Configuração da regra (início do checklist) ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reward_checklist_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reward_checklist_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reward_checklist_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.reward_checklist_settings TO service_role;
-- Fica gravado o momento em que a migration rodou; atividades anteriores seguem a regra antiga.
INSERT INTO public.reward_checklist_settings (key, value)
VALUES ('gating_started_at', pg_catalog.to_jsonb(pg_catalog.now()))
ON CONFLICT (key) DO NOTHING;

-- 3. Faixas do Kubo (Spotify) ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kubo_music_tracks (
  track_id          text PRIMARY KEY CHECK (track_id ~ '^[A-Za-z0-9]{22}$'),
  title             text NOT NULL,
  duration_seconds  integer NOT NULL CHECK (duration_seconds > 0),
  position          integer NOT NULL DEFAULT 0,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kubo_music_tracks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kubo_music_tracks_read ON public.kubo_music_tracks;
CREATE POLICY kubo_music_tracks_read ON public.kubo_music_tracks FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.kubo_music_tracks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kubo_music_tracks TO anon, authenticated;
GRANT ALL ON public.kubo_music_tracks TO service_role;

INSERT INTO public.kubo_music_tracks (track_id, title, duration_seconds, position) VALUES
  ('21WDwktTTX1IYwsrnN7mk9', 'Milagre em Códgo', 162, 1),
  ('02ph1xmr2fPzONA7uXS6I7', 'Kubo é Vida', 183, 2),
  ('0ksUwTc8HCB7KbJ0yHEPvx', 'Vibe Elevvada', 140, 3),
  ('5o4iRiBgxjFTyIeYbctSq3', 'Deus no Comando', 129, 4),
  ('3ArhPi46d9w8jR6jobBL6y', 'Vibe que não para', 154, 5)
ON CONFLICT (track_id) DO NOTHING;

-- 4. Sessões de escuta (nonce de uso único por faixa tocada) -----------------------------------------
CREATE TABLE IF NOT EXISTS public.kubo_music_sessions (
  nonce             text PRIMARY KEY CHECK (char_length(nonce) BETWEEN 32 AND 128),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id          text NOT NULL REFERENCES public.kubo_music_tracks(track_id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  closed_at         timestamptz,
  listened_seconds  numeric(8,2) NOT NULL DEFAULT 0,
  reports           integer NOT NULL DEFAULT 0,
  last_report_at    timestamptz
);
CREATE INDEX IF NOT EXISTS kubo_music_sessions_user_idx ON public.kubo_music_sessions (user_id, created_at DESC);
ALTER TABLE public.kubo_music_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kubo_music_sessions_select_own ON public.kubo_music_sessions;
CREATE POLICY kubo_music_sessions_select_own ON public.kubo_music_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.kubo_music_sessions FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.kubo_music_sessions FROM authenticated;
GRANT SELECT ON public.kubo_music_sessions TO authenticated;
GRANT ALL ON public.kubo_music_sessions TO service_role;

-- 5. Escuta por usuário, dia e faixa ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kubo_music_listens (
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_day        date NOT NULL,
  track_id          text NOT NULL REFERENCES public.kubo_music_tracks(track_id),
  listened_seconds  numeric(8,2) NOT NULL DEFAULT 0,
  counted_at        timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reward_day, track_id)
);
ALTER TABLE public.kubo_music_listens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kubo_music_listens_select_own ON public.kubo_music_listens;
CREATE POLICY kubo_music_listens_select_own ON public.kubo_music_listens
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.kubo_music_listens FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.kubo_music_listens FROM authenticated;
GRANT SELECT ON public.kubo_music_listens TO authenticated;
GRANT ALL ON public.kubo_music_listens TO service_role;

-- 6. Dias em que o checklist fechou ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reward_daily_completions (
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_day        date NOT NULL,
  completed_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reward_day)
);
ALTER TABLE public.reward_daily_completions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reward_daily_completions_select_own ON public.reward_daily_completions;
CREATE POLICY reward_daily_completions_select_own ON public.reward_daily_completions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.reward_daily_completions FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.reward_daily_completions FROM authenticated;
GRANT SELECT ON public.reward_daily_completions TO authenticated;
GRANT ALL ON public.reward_daily_completions TO service_role;

-- 7. Estado do checklist de um dia (só leitura) ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.daily_reward_checklist(
  _user_id uuid,
  _day date DEFAULT NULL,
  _tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _d date := COALESCE(_day, (pg_catalog.now() AT TIME ZONE _tz)::date);
  _videos integer;
  _terra integer;
  _tracks_total integer;
  _tracks_counted integer;
  _completed_at timestamptz;
  _pending integer;
  _released integer;
  _expired integer;
  _tracks jsonb;
BEGIN
  SELECT pg_catalog.count(*)::integer INTO _videos
  FROM public.rewarded_video_sessions
  WHERE user_id = _user_id AND claimed_at IS NOT NULL AND reward_day = _d;

  SELECT pg_catalog.count(*)::integer INTO _terra
  FROM public.ad_rewards
  WHERE user_id = _user_id AND ad_type = 'terra_click'
    AND (created_at AT TIME ZONE _tz)::date = _d;

  SELECT pg_catalog.count(*)::integer INTO _tracks_total
  FROM public.kubo_music_tracks WHERE active;

  SELECT pg_catalog.count(*)::integer INTO _tracks_counted
  FROM public.kubo_music_listens l
  JOIN public.kubo_music_tracks t ON t.track_id = l.track_id AND t.active
  WHERE l.user_id = _user_id AND l.reward_day = _d AND l.counted_at IS NOT NULL;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'track_id', t.track_id,
           'title', t.title,
           'duration_seconds', t.duration_seconds,
           'listened_seconds', COALESCE(l.listened_seconds, 0),
           'counted', l.counted_at IS NOT NULL
         ) ORDER BY t.position), '[]'::jsonb)
    INTO _tracks
  FROM public.kubo_music_tracks t
  LEFT JOIN public.kubo_music_listens l
    ON l.track_id = t.track_id AND l.user_id = _user_id AND l.reward_day = _d
  WHERE t.active;

  SELECT completed_at INTO _completed_at
  FROM public.reward_daily_completions WHERE user_id = _user_id AND reward_day = _d;

  SELECT COALESCE(pg_catalog.sum(credits) FILTER (WHERE status = 'pending'), 0)::integer,
         COALESCE(pg_catalog.sum(credits) FILTER (WHERE status = 'released'), 0)::integer,
         COALESCE(pg_catalog.sum(credits) FILTER (WHERE status = 'expired'), 0)::integer
    INTO _pending, _released, _expired
  FROM public.reward_events
  WHERE user_id = _user_id AND reward_day = _d;

  RETURN pg_catalog.jsonb_build_object(
    'day', _d,
    'video_done', _videos >= 1,
    'videos_today', _videos,
    'music_done', _tracks_total > 0 AND _tracks_counted >= _tracks_total,
    'music_tracks_counted', _tracks_counted,
    'music_tracks_total', _tracks_total,
    'tracks', _tracks,
    'terra_done', _terra >= 1,
    'terra_today', _terra,
    'completed', _completed_at IS NOT NULL
                 OR (_videos >= 1 AND _terra >= 1 AND _tracks_total > 0 AND _tracks_counted >= _tracks_total),
    'completed_at', _completed_at,
    'pending_credits', _pending,
    'released_credits', _released,
    'expired_credits', _expired
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.daily_reward_checklist(uuid, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daily_reward_checklist(uuid, date, text) TO service_role;

-- 8. Expira pendentes de dias passados (cron + chamada preguiçosa por usuário) ----------------------
CREATE OR REPLACE FUNCTION public.expire_pending_rewards(
  _user_id uuid DEFAULT NULL,
  _tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _today date := (pg_catalog.now() AT TIME ZONE _tz)::date;
  _n integer;
BEGIN
  UPDATE public.reward_events e
  SET status = 'expired', expired_at = pg_catalog.now()
  WHERE e.status = 'pending'
    AND e.reward_day < _today
    AND (_user_id IS NULL OR e.user_id = _user_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.reward_daily_completions c
      WHERE c.user_id = e.user_id AND c.reward_day = e.reward_day
    );
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.expire_pending_rewards(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_pending_rewards(uuid, text) TO service_role;

-- 9. Libera os pendentes de hoje quando o checklist fecha --------------------------------------------
CREATE OR REPLACE FUNCTION public.release_daily_rewards(
  _user_id uuid,
  _tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _today date := (pg_catalog.now() AT TIME ZONE _tz)::date;
  _check jsonb;
  _inserted date;
  _just_completed boolean := false;
  _released_now integer := 0;
  _ev RECORD;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('daily_rewards:' || _user_id::text));

  PERFORM public.expire_pending_rewards(_user_id, _tz);

  _check := public.daily_reward_checklist(_user_id, _today, _tz);

  IF (_check ->> 'video_done')::boolean
     AND (_check ->> 'music_done')::boolean
     AND (_check ->> 'terra_done')::boolean THEN
    INSERT INTO public.reward_daily_completions (user_id, reward_day)
    VALUES (_user_id, _today)
    ON CONFLICT (user_id, reward_day) DO NOTHING
    RETURNING reward_day INTO _inserted;
    _just_completed := _inserted IS NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM public.reward_daily_completions WHERE user_id = _user_id AND reward_day = _today) THEN
    FOR _ev IN
      SELECT * FROM public.reward_events
      WHERE user_id = _user_id AND reward_day = _today AND status = 'pending'
      ORDER BY created_at
      FOR UPDATE
    LOOP
      BEGIN
        IF _ev.credits > 0 THEN
          PERFORM public.execute_atomic_credit_topup(
            _user_id, _ev.credits, 'reward:' || _ev.source,
            CASE WHEN _ev.source = 'kubo_music' THEN 'music_reward' ELSE 'ad_reward' END,
            _ev.metadata || pg_catalog.jsonb_build_object('source', _ev.source, 'daily_checklist', _today),
            _ev.idempotency_key
          );
        END IF;
        UPDATE public.reward_events SET status = 'released', released_at = pg_catalog.now() WHERE id = _ev.id;
        _released_now := _released_now + _ev.credits;
      EXCEPTION WHEN OTHERS THEN
        -- Ex.: usuário sem assinatura ativa. O evento continua pendente; o resto do fluxo segue.
        RAISE WARNING 'release_daily_rewards: % (%): %', _ev.id, _ev.source, SQLERRM;
      END;
    END LOOP;
    _check := public.daily_reward_checklist(_user_id, _today, _tz);
  END IF;

  RETURN _check || pg_catalog.jsonb_build_object('just_completed', _just_completed, 'released_now', _released_now);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.release_daily_rewards(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_daily_rewards(uuid, text) TO service_role;

-- 10. Vídeo premiado: mesma assinatura, crédito agora fica pendente até o checklist fechar ----------
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
  _release jsonb;
  _status text;
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

  -- Pendente: só vai para o saldo quando o checklist do dia fechar (release_daily_rewards usa
  -- a mesma chave "rewarded_video:<nonce>" no execute_atomic_credit_topup).
  INSERT INTO public.reward_events (user_id, source, credits, reward_day, idempotency_key, metadata, status)
  VALUES (_user_id, 'rewarded_video', _amount, _today, 'rewarded_video:' || _nonce,
          pg_catalog.jsonb_build_object('nonce', _nonce, 'provider', _session.provider), 'pending')
  ON CONFLICT (user_id, idempotency_key) DO NOTHING;

  _release := public.release_daily_rewards(_user_id, _tz);

  SELECT status INTO _status FROM public.reward_events
  WHERE user_id = _user_id AND idempotency_key = 'rewarded_video:' || _nonce;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'credits', _amount,
    'claimed_today', _claimed_today + 1,
    'pending', _status = 'pending',
    'checklist', _release
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.claim_rewarded_video(uuid, text, integer, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_rewarded_video(uuid, text, integer, integer, integer, text) TO service_role;

-- 11. Músicas: abrir sessão de escuta ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_kubo_music_session(
  _user_id uuid,
  _track_id text,
  _ttl_seconds integer DEFAULT 1800,
  _max_starts_per_hour integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _starts integer;
  _nonce text;
  _expires timestamptz := pg_catalog.now() + pg_catalog.make_interval(secs => _ttl_seconds);
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kubo_music:' || _user_id::text));

  IF NOT EXISTS (SELECT 1 FROM public.kubo_music_tracks WHERE track_id = _track_id AND active) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_track');
  END IF;

  SELECT pg_catalog.count(*)::integer INTO _starts
  FROM public.kubo_music_sessions
  WHERE user_id = _user_id AND created_at > pg_catalog.now() - interval '1 hour';
  IF _starts >= _max_starts_per_hour THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  -- Uma faixa contando por vez: abrir outra fecha as sessões abertas (abas paralelas não somam).
  UPDATE public.kubo_music_sessions
  SET closed_at = pg_catalog.now()
  WHERE user_id = _user_id AND closed_at IS NULL;

  _nonce := pg_catalog.replace(gen_random_uuid()::text, '-', '') || pg_catalog.replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.kubo_music_sessions (nonce, user_id, track_id, expires_at)
  VALUES (_nonce, _user_id, _track_id, _expires);

  RETURN pg_catalog.jsonb_build_object('ok', true, 'nonce', _nonce, 'track_id', _track_id, 'expires_at', _expires);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.start_kubo_music_session(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_kubo_music_session(uuid, text, integer, integer) TO service_role;

-- 12. Músicas: registrar tempo ouvido (cumulativo por sessão, idempotente) -------------------------
-- O servidor nunca aceita mais tempo do que passou no relógio desde o início da sessão (+2 s de folga)
-- nem mais que a duração da faixa; repetir o mesmo relatório não soma de novo.
CREATE OR REPLACE FUNCTION public.record_kubo_music_progress(
  _user_id uuid,
  _nonce text,
  _listened_seconds numeric,
  _threshold_seconds integer DEFAULT 30,
  _amount integer DEFAULT 1,
  _min_report_interval_seconds numeric DEFAULT 2,
  _tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _today date := (pg_catalog.now() AT TIME ZONE _tz)::date;
  _s RECORD;
  _duration integer;
  _elapsed numeric;
  _allowed numeric;
  _delta numeric;
  _listen RECORD;
  _total integer;
  _counted integer;
  _release jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kubo_music:' || _user_id::text));

  SELECT * INTO _s FROM public.kubo_music_sessions
  WHERE nonce = _nonce AND user_id = _user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_nonce');
  END IF;
  IF _s.closed_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'session_closed');
  END IF;
  IF _s.expires_at < pg_catalog.now() THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'nonce_expired');
  END IF;
  IF _s.last_report_at IS NOT NULL
     AND _s.last_report_at > pg_catalog.now() - pg_catalog.make_interval(secs => _min_report_interval_seconds::double precision) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'too_fast');
  END IF;

  SELECT duration_seconds INTO _duration FROM public.kubo_music_tracks WHERE track_id = _s.track_id;
  _elapsed := EXTRACT(EPOCH FROM (pg_catalog.now() - _s.created_at));
  _allowed := LEAST(GREATEST(COALESCE(_listened_seconds, 0), 0), _elapsed + 2, _duration + 5);
  _delta := GREATEST(0, _allowed - _s.listened_seconds);

  UPDATE public.kubo_music_sessions
  SET listened_seconds = GREATEST(listened_seconds, _allowed),
      reports = reports + 1,
      last_report_at = pg_catalog.now()
  WHERE nonce = _nonce;

  INSERT INTO public.kubo_music_listens AS l (user_id, reward_day, track_id, listened_seconds, counted_at)
  VALUES (_user_id, _today, _s.track_id, _delta,
          CASE WHEN _delta >= _threshold_seconds THEN pg_catalog.now() END)
  ON CONFLICT (user_id, reward_day, track_id) DO UPDATE
    SET listened_seconds = l.listened_seconds + EXCLUDED.listened_seconds,
        counted_at = COALESCE(l.counted_at,
                              CASE WHEN l.listened_seconds + EXCLUDED.listened_seconds >= _threshold_seconds
                                   THEN pg_catalog.now() END),
        updated_at = pg_catalog.now()
  RETURNING * INTO _listen;

  SELECT pg_catalog.count(*)::integer INTO _total FROM public.kubo_music_tracks WHERE active;
  SELECT pg_catalog.count(*)::integer INTO _counted
  FROM public.kubo_music_listens l JOIN public.kubo_music_tracks t ON t.track_id = l.track_id AND t.active
  WHERE l.user_id = _user_id AND l.reward_day = _today AND l.counted_at IS NOT NULL;

  IF _total > 0 AND _counted >= _total AND _amount > 0 THEN
    INSERT INTO public.reward_events (user_id, source, credits, reward_day, idempotency_key, metadata, status)
    VALUES (_user_id, 'kubo_music', _amount, _today, 'kubo_music:' || _today::text,
            pg_catalog.jsonb_build_object('tracks', _total), 'pending')
    ON CONFLICT (user_id, idempotency_key) DO NOTHING;
  END IF;

  _release := public.release_daily_rewards(_user_id, _tz);

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'track_id', _s.track_id,
    'accepted_seconds', _delta,
    'track_listened_seconds', _listen.listened_seconds,
    'track_counted', _listen.counted_at IS NOT NULL,
    'checklist', _release
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.record_kubo_music_progress(uuid, text, numeric, integer, integer, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_kubo_music_progress(uuid, text, numeric, integer, integer, numeric, text) TO service_role;

-- 13. TERRA ADS: dias que fecharam o checklist (para o saldo retirável) -----------------------------
CREATE OR REPLACE FUNCTION public.terra_reward_gating(
  _user_id uuid,
  _tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'gating_started_at', (SELECT value FROM public.reward_checklist_settings WHERE key = 'gating_started_at'),
    'today', (pg_catalog.now() AT TIME ZONE _tz)::date,
    'completed_days', COALESCE((
      SELECT pg_catalog.jsonb_agg(reward_day ORDER BY reward_day)
      FROM public.reward_daily_completions WHERE user_id = _user_id
    ), '[]'::jsonb)
  );
$function$;
REVOKE EXECUTE ON FUNCTION public.terra_reward_gating(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.terra_reward_gating(uuid, text) TO service_role;

-- 14. Painel do admin: atividades por usuário por dia ------------------------------------------------
-- Pelo app: admin logado (is_admin). Pelo SQL Editor do Supabase: SELECT * FROM public.admin_reward_daily_activity(30);
CREATE OR REPLACE FUNCTION public.admin_reward_daily_activity(
  _days integer DEFAULT 14,
  _tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE (
  reward_day date,
  user_id uuid,
  email text,
  videos integer,
  music_tracks_counted integer,
  music_tracks_total integer,
  terra_ads integer,
  completed boolean,
  completed_at timestamptz,
  pending_credits integer,
  released_credits integer,
  expired_credits integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _since date := (pg_catalog.now() AT TIME ZONE _tz)::date - GREATEST(COALESCE(_days, 14), 1) + 1;
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR session_user IN ('postgres', 'supabase_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH acts AS (
    SELECT s.user_id, s.reward_day AS d FROM public.rewarded_video_sessions s
      WHERE s.claimed_at IS NOT NULL AND s.reward_day >= _since
    UNION
    SELECT l.user_id, l.reward_day FROM public.kubo_music_listens l WHERE l.reward_day >= _since
    UNION
    SELECT a.user_id, (a.created_at AT TIME ZONE _tz)::date FROM public.ad_rewards a
      WHERE a.ad_type = 'terra_click' AND a.created_at >= (_since::timestamp AT TIME ZONE _tz)
    UNION
    SELECT e.user_id, e.reward_day FROM public.reward_events e WHERE e.reward_day >= _since
  ),
  total AS (SELECT pg_catalog.count(*)::integer AS n FROM public.kubo_music_tracks WHERE active)
  SELECT
    acts.d,
    acts.user_id,
    u.email::text,
    (SELECT pg_catalog.count(*)::integer FROM public.rewarded_video_sessions s
      WHERE s.user_id = acts.user_id AND s.claimed_at IS NOT NULL AND s.reward_day = acts.d),
    (SELECT pg_catalog.count(*)::integer FROM public.kubo_music_listens l
      JOIN public.kubo_music_tracks t ON t.track_id = l.track_id AND t.active
      WHERE l.user_id = acts.user_id AND l.reward_day = acts.d AND l.counted_at IS NOT NULL),
    total.n,
    (SELECT pg_catalog.count(*)::integer FROM public.ad_rewards a
      WHERE a.user_id = acts.user_id AND a.ad_type = 'terra_click'
        AND (a.created_at AT TIME ZONE _tz)::date = acts.d),
    c.completed_at IS NOT NULL,
    c.completed_at,
    COALESCE((SELECT pg_catalog.sum(e.credits) FROM public.reward_events e
      WHERE e.user_id = acts.user_id AND e.reward_day = acts.d AND e.status = 'pending'), 0)::integer,
    COALESCE((SELECT pg_catalog.sum(e.credits) FROM public.reward_events e
      WHERE e.user_id = acts.user_id AND e.reward_day = acts.d AND e.status = 'released'), 0)::integer,
    COALESCE((SELECT pg_catalog.sum(e.credits) FROM public.reward_events e
      WHERE e.user_id = acts.user_id AND e.reward_day = acts.d AND e.status = 'expired'), 0)::integer
  FROM acts
  CROSS JOIN total
  LEFT JOIN auth.users u ON u.id = acts.user_id
  LEFT JOIN public.reward_daily_completions c ON c.user_id = acts.user_id AND c.reward_day = acts.d
  ORDER BY acts.d DESC, u.email;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.admin_reward_daily_activity(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reward_daily_activity(integer, text) TO authenticated, service_role;

-- 15. Cron: expira pendentes logo depois da meia-noite de São Paulo (03:05 UTC) ---------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'expire-pending-rewards-daily';
    PERFORM cron.schedule('expire-pending-rewards-daily', '5 3 * * *',
      $cron$SELECT public.expire_pending_rewards(NULL, 'America/Sao_Paulo');$cron$);
  END IF;
END $$;
