-- execute_atomic_credit_deduction checked the idempotency key before locking the subscription row.
-- Two concurrent requests with the same key both passed the check; the second one then failed on
-- credit_transactions_idem_uniq (no double charge, but a raw "duplicate key" error instead of a replay,
-- which creative edge functions surfaced as 402). Lock first, then check the key, like
-- execute_atomic_credit_topup: the concurrent call waits on the lock and returns replayed = true.
CREATE OR REPLACE FUNCTION public.execute_atomic_credit_deduction(
  _user_id uuid,
  _amount integer,
  _reason text,
  _category text DEFAULT 'general'::text,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _idempotency_key text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _sub RECORD;
  _balance_after INTEGER;
  _tx_id UUID;
  _existing RECORD;
BEGIN
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive';
  END IF;

  SELECT * INTO _sub
  FROM public.subscriptions
  WHERE user_id = _user_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'subscription_not_found';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id, balance_after INTO _existing
    FROM public.credit_transactions
    WHERE user_id = _user_id AND idempotency_key = _idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'replayed', true,
        'transaction_id', _existing.id,
        'balance_after', _existing.balance_after
      );
    END IF;
  END IF;

  IF (_sub.edits_limit - _sub.edits_used) < _amount THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  UPDATE public.subscriptions
  SET edits_used = edits_used + _amount, updated_at = now()
  WHERE id = _sub.id;

  _balance_after := (_sub.edits_limit - (_sub.edits_used + _amount));

  INSERT INTO public.credit_transactions
    (user_id, delta, balance_after, reason, category, metadata, idempotency_key)
  VALUES
    (_user_id, -_amount, _balance_after, _reason, _category, _metadata, _idempotency_key)
  RETURNING id INTO _tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'replayed', false,
    'transaction_id', _tx_id,
    'balance_after', _balance_after
  );
END;
$function$;
