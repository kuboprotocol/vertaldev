-- Instalações de embed para afiliados. Cada site/blog pode ter seu próprio código.
-- Rastreamento de cliques e conversões via affiliate_events.

CREATE TABLE IF NOT EXISTS public.affiliate_installs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  embed_code       text NOT NULL UNIQUE, -- código aleatório único (ex: aff_abc123...)
  domain           text NOT NULL,
  description      text,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'removed')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS affiliate_installs_affiliate_id_idx ON public.affiliate_installs(affiliate_id);
CREATE INDEX IF NOT EXISTS affiliate_installs_embed_code_idx ON public.affiliate_installs(embed_code);
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_installs_domain_idx ON public.affiliate_installs(affiliate_id, domain) WHERE status = 'active';

ALTER TABLE public.affiliate_installs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "affiliate_installs_select_own" ON public.affiliate_installs;
CREATE POLICY "affiliate_installs_select_own" ON public.affiliate_installs
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = affiliate_id);

DROP POLICY IF EXISTS "affiliate_installs_insert_own" ON public.affiliate_installs;
CREATE POLICY "affiliate_installs_insert_own" ON public.affiliate_installs
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = affiliate_id);

DROP POLICY IF EXISTS "affiliate_installs_update_own" ON public.affiliate_installs;
CREATE POLICY "affiliate_installs_update_own" ON public.affiliate_installs
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = affiliate_id);

REVOKE ALL ON public.affiliate_installs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.affiliate_installs TO authenticated;
GRANT SELECT ON public.affiliate_installs TO anon; -- anon pode ler para registrar eventos

-- Rastreamento de eventos: cliques, signups, conversões
CREATE TABLE IF NOT EXISTS public.affiliate_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  install_id       uuid NOT NULL REFERENCES public.affiliate_installs(id) ON DELETE CASCADE,
  event_type       text NOT NULL CHECK (event_type IN ('click', 'signup', 'conversion')),
  user_ip          inet,
  user_agent       text,
  referrer         text,
  converted_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS affiliate_events_install_id_idx ON public.affiliate_events(install_id, created_at DESC);
CREATE INDEX IF NOT EXISTS affiliate_events_event_type_idx ON public.affiliate_events(event_type);
CREATE INDEX IF NOT EXISTS affiliate_events_created_at_idx ON public.affiliate_events(created_at DESC);

ALTER TABLE public.affiliate_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "affiliate_events_select_own_install" ON public.affiliate_events;
CREATE POLICY "affiliate_events_select_own_install" ON public.affiliate_events
  FOR SELECT TO authenticated
  USING (
    install_id IN (
      SELECT id FROM public.affiliate_installs
      WHERE affiliate_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "affiliate_events_insert_anon" ON public.affiliate_events;
CREATE POLICY "affiliate_events_insert_anon" ON public.affiliate_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (true); -- anon pode registrar eventos

REVOKE ALL ON public.affiliate_events FROM anon, authenticated;
GRANT SELECT ON public.affiliate_events TO authenticated;
GRANT INSERT ON public.affiliate_events TO anon, authenticated;

-- Estatísticas agregadas por install (view para performance)
CREATE OR REPLACE VIEW public.affiliate_install_stats AS
SELECT
  ai.id,
  ai.affiliate_id,
  ai.domain,
  COUNT(CASE WHEN ae.event_type = 'click' THEN 1 END) as total_clicks,
  COUNT(CASE WHEN ae.event_type = 'signup' THEN 1 END) as total_signups,
  COUNT(CASE WHEN ae.event_type = 'conversion' THEN 1 END) as total_conversions,
  CASE
    WHEN COUNT(CASE WHEN ae.event_type = 'click' THEN 1 END) > 0
    THEN ROUND(
      COUNT(CASE WHEN ae.event_type = 'conversion' THEN 1 END)::numeric /
      COUNT(CASE WHEN ae.event_type = 'click' THEN 1 END)::numeric * 100,
      2
    )
    ELSE 0
  END as conversion_rate,
  MAX(ae.created_at) as last_activity_at
FROM public.affiliate_installs ai
LEFT JOIN public.affiliate_events ae ON ae.install_id = ai.id
WHERE ai.status = 'active'
GROUP BY ai.id, ai.affiliate_id, ai.domain;

GRANT SELECT ON public.affiliate_install_stats TO authenticated;

-- Função para registrar evento de afiliado
CREATE OR REPLACE FUNCTION public.record_affiliate_event(
  _embed_code text,
  _event_type text,
  _user_ip inet DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _referrer text DEFAULT NULL,
  _converted_user_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _install_id uuid;
  _event_id uuid;
BEGIN
  -- Encontra o install
  SELECT id INTO _install_id
  FROM public.affiliate_installs
  WHERE embed_code = _embed_code AND status = 'active'
  LIMIT 1;

  IF _install_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Registra evento
  INSERT INTO public.affiliate_events
    (install_id, event_type, user_ip, user_agent, referrer, converted_user_id, metadata)
  VALUES
    (_install_id, _event_type, _user_ip, _user_agent, _referrer, _converted_user_id, _metadata)
  RETURNING id INTO _event_id;

  -- Atualiza last_activity_at do install
  UPDATE public.affiliate_installs
  SET last_activity_at = now()
  WHERE id = _install_id;

  RETURN _event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_affiliate_event(text, text, inet, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_affiliate_event(text, text, inet, text, text, uuid, jsonb) TO anon, authenticated;
