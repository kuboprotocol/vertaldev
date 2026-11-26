-- TERRA ADS indisponível: o passo "anúncio" do checklist diário pode ser fechado com 1 vídeo premiado
-- extra no mesmo dia (pedido do Laércio, 2026-11-26).
--
-- Contexto: desde 20261126235000 o checklist do dia (America/Sao_Paulo) exige 1 vídeo premiado +
-- 5 músicas do Kubo + 1 anúncio TERRA ADS. Quando o anúncio TERRA não carrega (script recusado pela
-- rede de anúncios, sem preenchimento em ~15 s), o usuário não conseguia fechar o dia.
--
-- Regra nova:
--   * o painel informa a falha (edge daily-rewards ?action=terra-unavailable) e o servidor registra
--     UMA linha por usuário por dia em public.terra_unavailable_reports (idempotente; repetições só
--     somam report_count e atualizam last_reported_at). Nada é inventado: fica o motivo informado
--     pelo navegador e o horário;
--   * com o registro do dia, o passo TERRA conta como feito quando o usuário tem pelo menos
--     terra_fallback_videos_required vídeos premiados resgatados no dia (padrão 2 = o vídeo do
--     checklist + 1 extra). Um clique TERRA de verdade continua valendo normalmente;
--   * nenhum crédito é dado pelo registro em si (o vídeo extra rende o crédito normal do vídeo).
--
-- Puramente aditivo e idempotente: tabela nova, linha de configuração nova (ON CONFLICT DO NOTHING),
-- função nova e CREATE OR REPLACE de daily_reward_checklist com a MESMA assinatura e os mesmos campos
-- (só acrescenta terra_unavailable, terra_done_via, terra_fallback_videos_required).

-- 1. Registro honesto da indisponibilidade ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.terra_unavailable_reports (
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_day         date NOT NULL,
  reason             text NOT NULL CHECK (reason IN ('script_error', 'no_fill_timeout', 'panel_error')),
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_count       integer NOT NULL DEFAULT 1,
  first_reported_at  timestamptz NOT NULL DEFAULT now(),
  last_reported_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reward_day)
);
ALTER TABLE public.terra_unavailable_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS terra_unavailable_reports_select_own ON public.terra_unavailable_reports;
CREATE POLICY terra_unavailable_reports_select_own ON public.terra_unavailable_reports
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.terra_unavailable_reports FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.terra_unavailable_reports FROM authenticated;
GRANT SELECT ON public.terra_unavailable_reports TO authenticated;
GRANT ALL ON public.terra_unavailable_reports TO service_role;

-- 2. Quantos vídeos premiados no dia fecham o passo TERRA quando ele está indisponível ---------------
INSERT INTO public.reward_checklist_settings (key, value)
VALUES ('terra_fallback_videos_required', '2'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3. Estado do checklist (mesma assinatura; campos novos no fim) --------------------------------------
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
  _terra_unavailable boolean;
  _fallback_videos integer;
  _terra_done boolean;
  _terra_via text;
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

  _terra_unavailable := EXISTS (
    SELECT 1 FROM public.terra_unavailable_reports WHERE user_id = _user_id AND reward_day = _d);

  SELECT GREATEST(COALESCE((
           SELECT CASE WHEN pg_catalog.jsonb_typeof(value) = 'number' THEN (value #>> '{}')::integer END
           FROM public.reward_checklist_settings WHERE key = 'terra_fallback_videos_required'), 2), 2)
    INTO _fallback_videos;

  IF _terra >= 1 THEN
    _terra_done := true;  _terra_via := 'terra_click';
  ELSIF _terra_unavailable AND _videos >= _fallback_videos THEN
    _terra_done := true;  _terra_via := 'terra_unavailable';
  ELSE
    _terra_done := false; _terra_via := NULL;
  END IF;

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
    'terra_done', _terra_done,
    'terra_today', _terra,
    'terra_unavailable', _terra_unavailable,
    'terra_done_via', _terra_via,
    'terra_fallback_videos_required', _fallback_videos,
    'completed', _completed_at IS NOT NULL
                 OR (_videos >= 1 AND _terra_done AND _tracks_total > 0 AND _tracks_counted >= _tracks_total),
    'completed_at', _completed_at,
    'pending_credits', _pending,
    'released_credits', _released,
    'expired_credits', _expired
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.daily_reward_checklist(uuid, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daily_reward_checklist(uuid, date, text) TO service_role;

-- 4. Registra a indisponibilidade do dia e devolve o checklist (já liberando se fechou) --------------
CREATE OR REPLACE FUNCTION public.report_terra_unavailable(
  _user_id uuid,
  _reason text,
  _details jsonb DEFAULT '{}'::jsonb,
  _tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _today date := (pg_catalog.now() AT TIME ZONE _tz)::date;
  _first boolean;
BEGIN
  IF _reason IS NULL OR _reason NOT IN ('script_error', 'no_fill_timeout', 'panel_error') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_reason');
  END IF;

  INSERT INTO public.terra_unavailable_reports AS r (user_id, reward_day, reason, details)
  VALUES (_user_id, _today, _reason, COALESCE(_details, '{}'::jsonb))
  ON CONFLICT (user_id, reward_day) DO UPDATE
    SET report_count = r.report_count + 1,
        last_reported_at = pg_catalog.now()
  RETURNING (xmax = 0) INTO _first;

  RETURN pg_catalog.jsonb_build_object('ok', true, 'first_report_today', _first)
         || pg_catalog.jsonb_build_object('checklist', public.release_daily_rewards(_user_id, _tz));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.report_terra_unavailable(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_terra_unavailable(uuid, text, jsonb, text) TO service_role;
