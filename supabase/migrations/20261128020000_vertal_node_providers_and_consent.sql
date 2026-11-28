-- Vertal Node: dispositivos multi-provedor + consentimento (LGPD) do botão "Accept & activate".
--
-- Substitui, de forma ADITIVA, a migração arquivada 20261124210000_vertal_node_providers.sql
-- (supabase/migrations_archive), que nunca foi aplicada porque não era aditiva:
--   * ela RENOMEAVA honeygain_nodes -> vertal_nodes e apagava record_honeygain_heartbeat;
--   * ela recriava reward_events_source_check SEM 'kubo_music' (fonte que produção já usa desde
--     20261126235000_daily_reward_checklist_kubo_music), o que quebraria o ledger das músicas.
-- Aqui:
--   1. vertal_nodes é criada ao lado de honeygain_nodes (as linhas antigas são copiadas com
--      provider = 'honeygain'); honeygain_nodes e record_honeygain_heartbeat ficam intactas.
--   2. reward_events_source_check NÃO é alterada: a versão em produção já aceita
--      ('rewarded_video', 'honeygain_node', 'vertal_node', 'kubo_music'). Só conferimos que
--      'vertal_node' e 'kubo_music' estão lá e abortamos (sem mudar nada) se não estiverem.
--   3. record_vertal_node_heartbeat (CREATE OR REPLACE; função nova).
--   4. vertal_node_consents: registro append-only do aceite/revogação feito no site
--      (versão do texto, plataforma, user agent, data). Prova de consentimento (LGPD art. 8º).
--
-- Tudo idempotente. RLS ligado; usuário só lê as próprias linhas; escrita só pela service role
-- (Edge Function vertal-node-heartbeat).

-- 1. Dispositivos ----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vertal_nodes (
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id        text NOT NULL CHECK (char_length(device_id) BETWEEN 8 AND 128),
  platform         text NOT NULL CHECK (platform IN ('desktop', 'android')),
  provider         text NOT NULL DEFAULT 'honeygain',
  app_version      text CHECK (app_version IS NULL OR char_length(app_version) <= 40),
  opted_in         boolean NOT NULL DEFAULT false,
  running          boolean NOT NULL DEFAULT false,
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);

-- Caso alguém tenha criado vertal_nodes à mão sem a coluna.
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

CREATE INDEX IF NOT EXISTS vertal_nodes_user_seen_idx ON public.vertal_nodes (user_id, last_seen_at DESC);

-- Copia os dispositivos da versão anterior (só Honeygain) sem apagar nada.
DO $$
BEGIN
  IF pg_catalog.to_regclass('public.honeygain_nodes') IS NOT NULL THEN
    INSERT INTO public.vertal_nodes
      (user_id, device_id, platform, provider, app_version, opted_in, running, last_seen_at, created_at)
    SELECT user_id, device_id, platform, 'honeygain', app_version, opted_in, running, last_seen_at, created_at
    FROM public.honeygain_nodes
    ON CONFLICT (user_id, device_id) DO NOTHING;
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

-- 2. Ledger: só confere a fonte (não altera a constraint) -------------------------------------------
DO $$
DECLARE
  _def text;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(oid) INTO _def
  FROM pg_catalog.pg_constraint
  WHERE conname = 'reward_events_source_check' AND conrelid = 'public.reward_events'::regclass;
  IF _def IS NOT NULL AND (_def NOT LIKE '%vertal_node%' OR _def NOT LIKE '%kubo_music%') THEN
    RAISE EXCEPTION 'reward_events_source_check sem vertal_node/kubo_music (%); ajuste numa migração própria', _def;
  END IF;
END
$$;

-- 3. Heartbeat multi-provedor ---------------------------------------------------------------------
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

  -- Crédito antigo (record_honeygain_heartbeat) no mesmo dia conta como "já creditado" no modo padrão.
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

-- 4. Consentimento (append-only) ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vertal_node_consents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted         boolean NOT NULL,
  consent_version  text NOT NULL CHECK (consent_version ~ '^[A-Za-z0-9._-]{1,32}$'),
  platform         text NOT NULL CHECK (platform IN ('android', 'desktop', 'ios', 'other')),
  user_agent       text CHECK (user_agent IS NULL OR char_length(user_agent) <= 300),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vertal_node_consents_user_idx ON public.vertal_node_consents (user_id, created_at DESC);

ALTER TABLE public.vertal_node_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vertal_node_consents_select_own ON public.vertal_node_consents;
CREATE POLICY vertal_node_consents_select_own ON public.vertal_node_consents
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.vertal_node_consents FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.vertal_node_consents FROM authenticated;
GRANT SELECT ON public.vertal_node_consents TO authenticated;
GRANT ALL ON public.vertal_node_consents TO service_role;
