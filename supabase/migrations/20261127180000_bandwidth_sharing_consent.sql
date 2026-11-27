-- Consentimento de compartilhamento de banda ociosa (Vertal Node / parceiro Pawns.app).
--
-- NÃO APLICADA AUTOMATICAMENTE: o deploy não roda `supabase db push` (ver .github/workflows/deploy.yml).
-- Aplicar à mão, depois de revisar.
--
-- Por que uma tabela nova e não public.vertal_nodes (antiga honeygain_nodes):
--   * vertal_nodes é escrita só pela service role no heartbeat do app (desktop/Android) e não guarda
--     quando nem como o usuário aceitou; o consentimento precisa de data/hora, versão do texto e
--     histórico de revogação, e é dado pelo próprio usuário na web ou no app.
--   * platform de vertal_nodes só aceita 'desktop'/'android'; o consentimento também é dado no navegador.
--
-- Regras:
--   * Padrão é DESLIGADO (opted_in = false). Nada liga sozinho: só a função abaixo, chamada pelo
--     próprio usuário autenticado (auth.uid()), muda o valor.
--   * Um registro por usuário + dispositivo + parceiro, com opted_in_at / opted_out_at.
--   * Toda mudança vira uma linha em bandwidth_sharing_consent_events (trilha de auditoria, só leitura
--     para o dono).

-- 1. Estado atual por dispositivo ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bandwidth_sharing_consents (
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id        text NOT NULL CHECK (char_length(device_id) BETWEEN 8 AND 128),
  provider         text NOT NULL DEFAULT 'pawns' CHECK (provider ~ '^[a-z0-9_]{2,32}$'),
  platform         text NOT NULL DEFAULT 'web' CHECK (platform IN ('web', 'desktop', 'android', 'ios')),
  opted_in         boolean NOT NULL DEFAULT false,
  consent_version  text NOT NULL CHECK (char_length(consent_version) BETWEEN 1 AND 40),
  opted_in_at      timestamptz,
  opted_out_at     timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id, provider)
);

ALTER TABLE public.bandwidth_sharing_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bandwidth_sharing_consents_select_own ON public.bandwidth_sharing_consents;
CREATE POLICY bandwidth_sharing_consents_select_own ON public.bandwidth_sharing_consents
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.bandwidth_sharing_consents FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.bandwidth_sharing_consents FROM authenticated;
GRANT SELECT ON public.bandwidth_sharing_consents TO authenticated;
GRANT ALL ON public.bandwidth_sharing_consents TO service_role;

-- 2. Histórico (auditoria) -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bandwidth_sharing_consent_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id        text NOT NULL,
  provider         text NOT NULL,
  platform         text NOT NULL,
  opted_in         boolean NOT NULL,
  consent_version  text NOT NULL,
  source           text NOT NULL DEFAULT 'web' CHECK (char_length(source) <= 40),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bandwidth_sharing_consent_events_user_idx
  ON public.bandwidth_sharing_consent_events (user_id, created_at DESC);

ALTER TABLE public.bandwidth_sharing_consent_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bandwidth_sharing_consent_events_select_own ON public.bandwidth_sharing_consent_events;
CREATE POLICY bandwidth_sharing_consent_events_select_own ON public.bandwidth_sharing_consent_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.bandwidth_sharing_consent_events FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.bandwidth_sharing_consent_events FROM authenticated;
GRANT SELECT ON public.bandwidth_sharing_consent_events TO authenticated;
GRANT ALL ON public.bandwidth_sharing_consent_events TO service_role;

-- 3. Gravação pelo próprio usuário -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_bandwidth_sharing_consent(
  _device_id text,
  _opted_in boolean,
  _consent_version text,
  _platform text DEFAULT 'web',
  _provider text DEFAULT 'pawns',
  _source text DEFAULT 'web'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.bandwidth_sharing_consents%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _opted_in IS NULL THEN
    RAISE EXCEPTION 'invalid_opted_in';
  END IF;

  INSERT INTO public.bandwidth_sharing_consents AS c
    (user_id, device_id, provider, platform, opted_in, consent_version, opted_in_at, opted_out_at, updated_at)
  VALUES (
    _uid, _device_id, COALESCE(_provider, 'pawns'), COALESCE(_platform, 'web'), _opted_in, _consent_version,
    CASE WHEN _opted_in THEN pg_catalog.now() END,
    CASE WHEN NOT _opted_in THEN pg_catalog.now() END,
    pg_catalog.now()
  )
  ON CONFLICT (user_id, device_id, provider) DO UPDATE
    SET platform = EXCLUDED.platform,
        opted_in = EXCLUDED.opted_in,
        consent_version = EXCLUDED.consent_version,
        opted_in_at = CASE WHEN EXCLUDED.opted_in THEN pg_catalog.now() ELSE c.opted_in_at END,
        opted_out_at = CASE WHEN NOT EXCLUDED.opted_in THEN pg_catalog.now() ELSE c.opted_out_at END,
        updated_at = pg_catalog.now()
  RETURNING * INTO _row;

  INSERT INTO public.bandwidth_sharing_consent_events
    (user_id, device_id, provider, platform, opted_in, consent_version, source)
  VALUES (_uid, _row.device_id, _row.provider, _row.platform, _row.opted_in, _row.consent_version,
          COALESCE(NULLIF(_source, ''), 'web'));

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'device_id', _row.device_id,
    'provider', _row.provider,
    'opted_in', _row.opted_in,
    'consent_version', _row.consent_version,
    'opted_in_at', _row.opted_in_at,
    'opted_out_at', _row.opted_out_at,
    'updated_at', _row.updated_at
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.set_bandwidth_sharing_consent(text, boolean, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_bandwidth_sharing_consent(text, boolean, text, text, text, text) TO authenticated, service_role;
