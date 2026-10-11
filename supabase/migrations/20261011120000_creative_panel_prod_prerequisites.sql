-- Objects the creative edge functions (_shared/creative.ts, creative-video-studio) rely on that are
-- missing in production, whose schema drifted from the earlier migrations. Idempotent, so it is a
-- no-op where they already exist.

-- Admin check used by the edge functions with the service role (rate-limit and credit bypass).
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'admin');
$$;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO service_role;

-- Idempotent credit refund, the mirror of execute_atomic_credit_deduction (same ledger and balance).
CREATE OR REPLACE FUNCTION public.execute_atomic_credit_topup(
  _user_id uuid,
  _amount integer,
  _reason text,
  _category text DEFAULT 'billing',
  _metadata jsonb DEFAULT '{}'::jsonb,
  _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub RECORD;
  _balance_after integer;
  _tx_id uuid;
  _existing RECORD;
BEGIN
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive';
  END IF;

  -- Lock first, then check the key: a concurrent refund with the same key waits here and replays.
  SELECT * INTO _sub FROM public.subscriptions WHERE user_id = _user_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'subscription_not_found';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id, balance_after INTO _existing
    FROM public.credit_transactions
    WHERE user_id = _user_id AND idempotency_key = _idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'replayed', true, 'transaction_id', _existing.id, 'balance_after', _existing.balance_after);
    END IF;
  END IF;

  UPDATE public.subscriptions SET edits_limit = edits_limit + _amount, updated_at = now() WHERE id = _sub.id;
  _balance_after := (_sub.edits_limit + _amount) - _sub.edits_used;

  INSERT INTO public.credit_transactions (user_id, delta, balance_after, reason, category, metadata, idempotency_key)
  VALUES (_user_id, _amount, _balance_after, _reason, _category, _metadata, _idempotency_key)
  RETURNING id INTO _tx_id;

  RETURN jsonb_build_object('success', true, 'replayed', false, 'transaction_id', _tx_id, 'balance_after', _balance_after);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.execute_atomic_credit_topup(uuid, integer, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_atomic_credit_topup(uuid, integer, text, text, jsonb, text) TO service_role;

-- Unified execution history. Written only by edge functions (service role); users read their own rows.
CREATE TABLE IF NOT EXISTS public.skill_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_slug text NOT NULL,
  skill_name text,
  input jsonb NOT NULL DEFAULT '{}',
  output jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  credits_charged integer DEFAULT 0,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.skill_executions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.skill_executions FROM anon, authenticated;
GRANT SELECT ON public.skill_executions TO authenticated;
GRANT ALL ON public.skill_executions TO service_role;
DROP POLICY IF EXISTS "Users can view their own skill executions" ON public.skill_executions;
CREATE POLICY "Users can view their own skill executions"
  ON public.skill_executions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_skill_executions_user_created ON public.skill_executions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_executions_skill_slug ON public.skill_executions(skill_slug);
DROP TRIGGER IF EXISTS update_skill_executions_updated_at ON public.skill_executions;
CREATE TRIGGER update_skill_executions_updated_at
  BEFORE UPDATE ON public.skill_executions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- creative-video-studio stores the client's x-idempotency-key on the asset.
ALTER TABLE public.creative_assets ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE INDEX IF NOT EXISTS idx_creative_assets_idempotency_key ON public.creative_assets(idempotency_key);
