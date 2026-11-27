-- Anti-fraude: Validações para impedir golpes no programa de afiliados
-- - Mesmo IP não pode ser afiliado E ganhar comissões
-- - Limitar múltiplas contas do mesmo IP (permitir, mas com controle)
-- - Rastreamento de IPs para detecção de fraude
-- - Reduzir bônus para 50 créditos (não 100)

-- Tabela de rastreamento de IPs por usuário
CREATE TABLE IF NOT EXISTS public.user_ip_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address       inet NOT NULL,
  user_agent       text,
  event_type       text NOT NULL DEFAULT 'signup', -- 'signup', 'affiliate_signup', 'conversion'
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_ip_logs_user_id_idx ON public.user_ip_logs(user_id);
CREATE INDEX IF NOT EXISTS user_ip_logs_ip_address_idx ON public.user_ip_logs(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS user_ip_logs_event_type_idx ON public.user_ip_logs(event_type);

-- Tabela de IPs suspeitos/bloqueados
CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address       inet NOT NULL UNIQUE,
  reason           text NOT NULL,
  severity         text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  flagged_at       timestamptz NOT NULL DEFAULT now(),
  reviewed_at      timestamptz,
  is_confirmed     boolean DEFAULT false,
  notes            text
);

CREATE INDEX IF NOT EXISTS fraud_flags_ip_address_idx ON public.fraud_flags(ip_address);
CREATE INDEX IF NOT EXISTS fraud_flags_severity_idx ON public.fraud_flags(severity);

-- Tabela de contas vinculadas (detecção de múltiplas contas)
CREATE TABLE IF NOT EXISTS public.linked_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address       inet NOT NULL,
  detection_type   text NOT NULL, -- 'ip_match', 'device_match', 'referral_pattern'
  confidence       numeric(5,2) NOT NULL, -- 0-100%
  flagged_at       timestamptz NOT NULL DEFAULT now(),
  is_confirmed     boolean DEFAULT false,
  CHECK (primary_user_id != linked_user_id)
);

CREATE INDEX IF NOT EXISTS linked_accounts_primary_user_id_idx ON public.linked_accounts(primary_user_id);
CREATE INDEX IF NOT EXISTS linked_accounts_linked_user_id_idx ON public.linked_accounts(linked_user_id);

-- Função para registrar IP no log
CREATE OR REPLACE FUNCTION public.log_user_ip(
  _user_id uuid,
  _ip_address inet DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _event_type text DEFAULT 'signup'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_ip_logs (user_id, ip_address, user_agent, event_type)
  VALUES (_user_id, _ip_address, _user_agent, _event_type);
END;
$$;

REVOKE ALL ON FUNCTION public.log_user_ip(uuid, inet, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_user_ip(uuid, inet, text, text) TO service_role;

-- Função para detectar fraude por IP
CREATE OR REPLACE FUNCTION public.detect_fraud_by_ip(
  _ip_address inet
) RETURNS TABLE (
  is_suspicious boolean,
  risk_level text,
  reason text,
  account_count integer,
  flagged boolean
) AS $$
DECLARE
  _account_count integer;
  _flagged_count integer;
  _is_flagged boolean;
  _reason text := '';
  _risk_level text := 'low';
BEGIN
  -- Contar contas no mesmo IP
  SELECT COUNT(DISTINCT user_id) INTO _account_count
  FROM public.user_ip_logs
  WHERE ip_address = _ip_address AND created_at > now() - interval '90 days';

  -- Verificar se IP está na lista de fraude
  SELECT COUNT(*) INTO _flagged_count
  FROM public.fraud_flags
  WHERE ip_address = _ip_address AND is_confirmed = true;

  _is_flagged := _flagged_count > 0;

  -- Lógica de risco
  IF _is_flagged THEN
    _risk_level := 'critical';
    _reason := 'IP bloqueado como fraudulento confirmado';
  ELSIF _account_count > 10 THEN
    _risk_level := 'high';
    _reason := format('%s contas no mesmo IP (último 90 dias)', _account_count);
  ELSIF _account_count > 5 THEN
    _risk_level := 'medium';
    _reason := format('%s contas no mesmo IP (último 90 dias)', _account_count);
  ELSIF _account_count > 1 THEN
    _risk_level := 'low';
    _reason := format('%s contas no mesmo IP (normal, múltiplos usuários em rede compartilhada)', _account_count);
  END IF;

  RETURN QUERY SELECT
    (_risk_level != 'low') as is_suspicious,
    _risk_level,
    _reason,
    _account_count,
    _is_flagged;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

GRANT EXECUTE ON FUNCTION public.detect_fraud_by_ip(inet) TO service_role;

-- Função para impedir afiliação de usuários do mesmo IP
CREATE OR REPLACE FUNCTION public.can_be_affiliate(
  _user_id uuid,
  _ip_address inet DEFAULT NULL
) RETURNS TABLE (
  allowed boolean,
  reason text
) AS $$
DECLARE
  _other_count integer;
  _fraud_risk record;
BEGIN
  -- Verificar risco de fraude no IP
  SELECT * INTO _fraud_risk
  FROM public.detect_fraud_by_ip(_ip_address)
  LIMIT 1;

  -- Se IP é crítico (confirmado fraude), bloquear
  IF _fraud_risk.risk_level = 'critical' THEN
    RETURN QUERY SELECT false, 'Este IP foi bloqueado por atividade fraudulenta confirmada';
    RETURN;
  END IF;

  -- Se IP tem muitas contas (>5), impedir afiliação para evitar golpes
  IF _fraud_risk.account_count > 5 THEN
    RETURN QUERY SELECT false, format(
      'Este IP tem %s contas. Afiliados devem usar IPs únicos para evitar fraude.',
      _fraud_risk.account_count
    );
    RETURN;
  END IF;

  -- Se tem outras contas do mesmo IP que já são afiliados, bloquear
  SELECT COUNT(DISTINCT ail.affiliate_id) INTO _other_count
  FROM public.user_ip_logs uil
  JOIN public.affiliate_installs ail ON ail.affiliate_id = uil.user_id
  WHERE uil.ip_address = _ip_address
    AND uil.user_id != _user_id
    AND ail.status = 'active'
    AND uil.created_at > now() - interval '90 days';

  IF _other_count > 0 THEN
    RETURN QUERY SELECT false, 'Outra conta neste IP já é afiliado. Um IP = um afiliado para evitar golpes.';
    RETURN;
  END IF;

  -- Tudo OK
  RETURN QUERY SELECT true, 'Usuário pode ser afiliado';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

GRANT EXECUTE ON FUNCTION public.can_be_affiliate(uuid, inet) TO service_role;

-- Atualizar referral_bonus_on_first_payment para 50 créditos (não 100)
-- A função handle_new_user será atualizada em outra migration

-- Política de detecção: se usuário tenta ganhar comissões com múltiplas contas, detectar
CREATE OR REPLACE VIEW public.potential_fraud_referrals AS
SELECT
  r.referrer_id,
  r.referred_id,
  uil1.ip_address as referrer_ip,
  uil2.ip_address as referred_ip,
  CASE WHEN uil1.ip_address = uil2.ip_address THEN true ELSE false END as same_ip,
  COUNT(DISTINCT uil1.user_id) FILTER (WHERE uil1.ip_address = uil2.ip_address) as accounts_on_same_ip,
  r.created_at
FROM public.referrals r
LEFT JOIN public.user_ip_logs uil1 ON uil1.user_id = r.referrer_id
LEFT JOIN public.user_ip_logs uil2 ON uil2.user_id = r.referred_id
WHERE uil1.created_at > now() - interval '30 days'
  AND uil2.created_at > now() - interval '30 days'
GROUP BY r.referrer_id, r.referred_id, uil1.ip_address, uil2.ip_address, r.created_at;

REVOKE ALL ON public.potential_fraud_referrals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.potential_fraud_referrals TO service_role;

-- Log para auditoria de afiliados
CREATE TABLE IF NOT EXISTS public.affiliate_audit_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action           text NOT NULL, -- 'create_install', 'receive_commission', 'fraud_flag', 'suspicious_activity'
  details          jsonb,
  ip_address       inet,
  user_agent       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS affiliate_audit_log_affiliate_id_idx ON public.affiliate_audit_log(affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS affiliate_audit_log_action_idx ON public.affiliate_audit_log(action);

GRANT INSERT ON public.affiliate_audit_log TO authenticated;

-- IP logs and fraud data are server-only (SECURITY DEFINER functions / service_role).
ALTER TABLE public.user_ip_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linked_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Affiliates log their own actions" ON public.affiliate_audit_log;
CREATE POLICY "Affiliates log their own actions"
  ON public.affiliate_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = affiliate_id);
