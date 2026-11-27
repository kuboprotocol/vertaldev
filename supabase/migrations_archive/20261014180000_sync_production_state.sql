-- Registra no repositório o estado atual de produção (kubovibe), lido do banco em 2026-10-14.
--
-- Em 2026-10-14 o AI Assistant do Supabase aplicou, direto em produção, versões diferentes das
-- migrações 20261011120000 e 20261011150000, e já existiam objetos criados fora das migrações.
-- Sem esta migração, um `db push` em outro ambiente (ou de novo neste) recriaria a versão antiga
-- de execute_atomic_credit_topup e is_admin, desfazendo as correções.
--
-- O que NÃO muda: skill_executions, vibe_agents e vibe_agent_runs já estão em produção exatamente
-- como nos arquivos 20261011120000 e 20261011150000.
--
-- Tudo é idempotente. Em produção a única mudança real é remover um índice único duplicado.

-- 1. execute_atomic_credit_topup ------------------------------------------------------------------
-- Versão de produção: confere a chave de idempotência antes E depois do lock da assinatura (uma
-- chamada concorrente pode ter gravado a mesma chave enquanto esta esperava o lock), trata
-- _amount NULL, usa search_path vazio e nomes totalmente qualificados.
CREATE OR REPLACE FUNCTION public.execute_atomic_credit_topup(
  _user_id uuid,
  _amount integer,
  _reason text,
  _category text DEFAULT 'billing'::text,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  _sub RECORD;
  _balance_after integer;
  _tx_id uuid;
  _existing RECORD;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id, balance_after INTO _existing
    FROM public.credit_transactions
    WHERE user_id = _user_id
      AND idempotency_key = _idempotency_key;
    IF FOUND THEN
      RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'replayed', true,
        'transaction_id', _existing.id,
        'balance_after', _existing.balance_after
      );
    END IF;
  END IF;

  SELECT * INTO _sub
  FROM public.subscriptions
  WHERE user_id = _user_id
    AND is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'subscription_not_found';
  END IF;

  -- Recheck after the per-user row lock: a concurrent request may have committed
  -- the same idempotency key while this call was waiting for the lock.
  IF _idempotency_key IS NOT NULL THEN
    SELECT id, balance_after INTO _existing
    FROM public.credit_transactions
    WHERE user_id = _user_id
      AND idempotency_key = _idempotency_key;
    IF FOUND THEN
      RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'replayed', true,
        'transaction_id', _existing.id,
        'balance_after', _existing.balance_after
      );
    END IF;
  END IF;

  UPDATE public.subscriptions
  SET edits_limit = edits_limit + _amount,
      updated_at = pg_catalog.now()
  WHERE id = _sub.id;

  _balance_after := (_sub.edits_limit + _amount) - _sub.edits_used;

  INSERT INTO public.credit_transactions
    (user_id, delta, balance_after, reason, category, metadata, idempotency_key)
  VALUES
    (_user_id, _amount, _balance_after, _reason, _category,
     COALESCE(_metadata, '{}'::jsonb), _idempotency_key)
  RETURNING id INTO _tx_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'replayed', false,
    'transaction_id', _tx_id,
    'balance_after', _balance_after
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.execute_atomic_credit_topup(uuid, integer, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_atomic_credit_topup(uuid, integer, text, text, jsonb, text) TO service_role;

-- 2. is_admin ---------------------------------------------------------------------------------------
-- Produção usa search_path vazio (endurecimento de 20261010180000); 20261011120000 voltava para
-- `public`. Só service_role executa.
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = p_user_id
      AND role = 'admin'
  );
$function$;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO service_role;

-- 3. Índices de idempotência -----------------------------------------------------------------------
-- credit_transactions: credit_transactions_idem_uniq (20260526190741) já garante (user_id,
-- idempotency_key) único; ux_credit_transactions_user_idempotency_key, criado pelo Assistant, é
-- idêntico e só custa escrita e espaço.
DROP INDEX IF EXISTS public.ux_credit_transactions_user_idempotency_key;
CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_idem_uniq
  ON public.credit_transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- creative_assets: impede dois assets com a mesma chave para o mesmo usuário.
CREATE UNIQUE INDEX IF NOT EXISTS ux_creative_assets_user_idempotency_key
  ON public.creative_assets (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 4. mcp_tool_calls ---------------------------------------------------------------------------------
-- Existe em produção (vazia), criada fora das migrações. Nenhum código do repositório a usa hoje.
-- api_key_id perdeu a FK quando mcp_api_keys saiu (20261014170000).
CREATE TABLE IF NOT EXISTS public.mcp_tool_calls (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id uuid,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  arguments jsonb NOT NULL DEFAULT '{}'::jsonb,
  ok boolean NOT NULL,
  error_message text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_user_created ON public.mcp_tool_calls (user_id, created_at DESC);
ALTER TABLE public.mcp_tool_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_manages_mcp_calls ON public.mcp_tool_calls;
CREATE POLICY service_role_manages_mcp_calls ON public.mcp_tool_calls
  FOR ALL TO public
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);
DROP POLICY IF EXISTS users_read_own_mcp_calls ON public.mcp_tool_calls;
CREATE POLICY users_read_own_mcp_calls ON public.mcp_tool_calls
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
