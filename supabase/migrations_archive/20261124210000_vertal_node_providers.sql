-- Vertal Node multi-provedor (Honeygain, Cash Raven e, futuramente, Pawns/Bright/Infatica/EarnFM).
--
-- Em cima de 20261124170000_rewarded_video_and_honeygain.sql (mesmo PR, ainda não aplicado):
--   * honeygain_nodes -> vertal_nodes, com a coluna `provider` (um provedor ativo por dispositivo:
--     o heartbeat sobrescreve o provedor do device_id);
--   * reward_events aceita a fonte 'vertal_node' e grava o provedor em metadata;
--   * record_vertal_node_heartbeat substitui record_honeygain_heartbeat. Crédito continua 1x por
--     usuário por dia (America/Sao_Paulo), qualquer que seja o provedor; com _per_provider = true
--     (env VERTAL_NODE_CREDIT_PER_PROVIDER) passa a ser 1x por usuário por PROVEDOR por dia.
--
-- Tudo idempotente. Segurança igual à migração anterior: RLS ligado, usuário só lê as próprias linhas,
-- escrita só pela service role (Edge Function vertal-node-heartbeat).

-- 1. Tabela de dispositivos ---------------------------------------------------------------------
DO $$
BEGIN
  IF pg_catalog.to_regclass('public.honeygain_nodes') IS NOT NULL
     AND pg_catalog.to_regclass('public.vertal_nodes') IS NULL THEN
    ALTER TABLE public.honeygain_nodes RENAME TO vertal_nodes;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_policies
               WHERE schemaname = 'public' AND tablename = 'vertal_nodes'
                 AND policyname = 'honeygain_nodes_select_own') THEN
      ALTER POLICY honeygain_nodes_select_own ON public.vertal_nodes RENAME TO vertal_nodes_select_own;
    END IF;
  END IF;
END
$$;

ALTER TABLE public.vertal_nodes
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'honeygain';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
                 WHERE conname = 'vertal_nodes_provider_check'
                   AND conrelid = 'public.vertal_nodes'::regclass) THEN
    ALTER TABLE public.vertal_nodes
      ADD CONSTRAINT vertal_nodes_provider_check CHECK (provider ~ '^[a-z0-9_]{2,32}$');
  END IF;
END
$$;

ALTER TABLE public.vertal_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vertal_nodes_select_own ON public.vertal_nodes;
CREATE POLICY vertal_nodes_select_own ON public.vertal_nodes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.vertal_nodes FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.vertal_nodes FROM authenticated;
GRANT SELECT ON public.vertal_nodes TO authenticated;
GRANT ALL ON public.vertal_nodes TO service_role;

-- 2. Ledger: nova fonte 'vertal_node' (mantém 'honeygain_node' para linhas antigas) ----------------
ALTER TABLE public.reward_events DROP CONSTRAINT IF EXISTS reward_events_source_check;
ALTER TABLE public.reward_events
  ADD CONSTRAINT reward_events_source_check
  CHECK (source IN ('rewarded_video', 'honeygain_node', 'vertal_node'));

-- 3. Heartbeat multi-provedor --------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.record_honeygain_heartbeat(uuid, text, text, text, boolean, boolean, integer, text);

CREATE OR REPLACE FUNCTION public.record_vertal_node_heartbeat(
  _user_id uuid,
  _device_id text,
  _platform text,
  _provider text,
  _app_version text,
  _opted_in boolean,
  _running boolean,
  _amount integer,
  _per_provider boolean DEFAULT false,
  _tz text DEFAULT 'America/Sao_Paulo'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _today date := (pg_catalog.now() AT TIME ZONE _tz)::date;
  _key text;
  _inserted uuid;
BEGIN
  IF _provider IS NULL OR _provider !~ '^[a-z0-9_]{2,32}$' THEN
    RAISE EXCEPTION 'invalid_provider';
  END IF;

  -- Mesma chave para todos os provedores = 1 crédito por usuário por dia (padrão).
  _key := CASE WHEN COALESCE(_per_provider, false)
               THEN 'vertal_node:' || _provider || ':' || _today::text
               ELSE 'vertal_node:' || _today::text END;

  -- Um provedor por dispositivo: o heartbeat grava o provedor atual do device_id.
  INSERT INTO public.vertal_nodes AS n
    (user_id, device_id, platform, provider, app_version, opted_in, running, last_seen_at)
  VALUES (_user_id, _device_id, _platform, _provider, _app_version, _opted_in, _running, pg_catalog.now())
  ON CONFLICT (user_id, device_id) DO UPDATE
    SET platform = EXCLUDED.platform,
        provider = EXCLUDED.provider,
        app_version = EXCLUDED.app_version,
        opted_in = EXCLUDED.opted_in,
        running = EXCLUDED.running,
        last_seen_at = pg_catalog.now();

  IF NOT (_opted_in AND _running) OR _amount IS NULL OR _amount <= 0 THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'credited', false, 'reason', 'not_active',
                                         'day', _today, 'provider', _provider);
  END IF;

  -- Crédito antigo (função record_honeygain_heartbeat) no mesmo dia também conta como "já creditado"
  -- no modo padrão, para nunca pagar duas vezes na transição.
  IF NOT COALESCE(_per_provider, false) AND EXISTS (
       SELECT 1 FROM public.reward_events
       WHERE user_id = _user_id AND source = 'honeygain_node' AND reward_day = _today) THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'credited', false, 'reason', 'already_credited_today',
                                         'day', _today, 'provider', _provider);
  END IF;

  INSERT INTO public.reward_events (user_id, source, credits, reward_day, idempotency_key, metadata)
  VALUES (_user_id, 'vertal_node', _amount, _today, _key,
          pg_catalog.jsonb_build_object('provider', _provider, 'device_id', _device_id, 'platform', _platform))
  ON CONFLICT (user_id, idempotency_key) DO NOTHING
  RETURNING id INTO _inserted;

  IF _inserted IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'credited', false, 'reason', 'already_credited_today',
                                         'day', _today, 'provider', _provider);
  END IF;

  PERFORM public.execute_atomic_credit_topup(
    _user_id, _amount, 'reward:vertal_node', 'bandwidth_reward',
    pg_catalog.jsonb_build_object('source', 'vertal_node', 'provider', _provider,
                                  'device_id', _device_id, 'platform', _platform),
    _key
  );

  RETURN pg_catalog.jsonb_build_object('ok', true, 'credited', true, 'credits', _amount,
                                       'day', _today, 'provider', _provider);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.record_vertal_node_heartbeat(uuid, text, text, text, text, boolean, boolean, integer, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_vertal_node_heartbeat(uuid, text, text, text, text, boolean, boolean, integer, boolean, text) TO service_role;
