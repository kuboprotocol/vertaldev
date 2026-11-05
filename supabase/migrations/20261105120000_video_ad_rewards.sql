-- Recompensa por vídeo-propaganda: 0,020 crédito por vídeo, no máximo 1 vídeo por hora por usuário.
-- Saque via PIX a partir de 5 créditos.
--
-- Por que uma carteira separada e não user_credits.balance: user_credits.balance é integer e
-- 0,020 não cabe nele. A carteira abaixo guarda valores fracionários (numeric(12,3)).
--
-- Toda a regra (trava de 1 hora, crédito e saque) fica no banco, em funções SECURITY DEFINER
-- executáveis só por service_role. O cliente nunca escreve nessas tabelas.

-- 1. Carteira de recompensas por vídeo -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_reward_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric(12,3) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  last_claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Registro de cada vídeo recompensado (auditoria).
CREATE TABLE IF NOT EXISTS public.video_reward_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,3) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_video_reward_claims_user_created
  ON public.video_reward_claims (user_id, created_at DESC);

-- Pedidos de saque. Ficam 'pending' até pagamento manual via PIX.
CREATE TABLE IF NOT EXISTS public.credit_withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,3) NOT NULL CHECK (amount >= 5),
  pix_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_credit_withdrawal_requests_user
  ON public.credit_withdrawal_requests (user_id, created_at DESC);

-- RLS: o usuário só lê as próprias linhas. Escrita apenas via funções (service_role).
ALTER TABLE public.video_reward_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_reward_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own video reward wallet" ON public.video_reward_wallets;
CREATE POLICY "Users view own video reward wallet"
  ON public.video_reward_wallets FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own video reward claims" ON public.video_reward_claims;
CREATE POLICY "Users view own video reward claims"
  ON public.video_reward_claims FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own withdrawal requests" ON public.credit_withdrawal_requests;
CREATE POLICY "Users view own withdrawal requests"
  ON public.credit_withdrawal_requests FOR SELECT
  USING (auth.uid() = user_id);

-- 2. Reivindicar recompensa de vídeo (trava de 1 hora) -------------------------------------
-- Atômico: o UPSERT só credita quando last_claimed_at é nulo ou tem mais de 1 hora. Duas
-- chamadas simultâneas não geram dois créditos, porque a linha fica travada pelo ON CONFLICT.
CREATE OR REPLACE FUNCTION public.claim_video_reward(_user_id uuid, _amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _row public.video_reward_wallets%ROWTYPE;
  _cooldown interval := interval '1 hour';
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive';
  END IF;

  INSERT INTO public.video_reward_wallets AS w (user_id, balance, last_claimed_at)
  VALUES (_user_id, _amount, now())
  ON CONFLICT (user_id) DO UPDATE
    SET balance = w.balance + EXCLUDED.balance,
        last_claimed_at = now(),
        updated_at = now()
    WHERE w.last_claimed_at IS NULL OR w.last_claimed_at <= now() - _cooldown
  RETURNING * INTO _row;

  IF NOT FOUND THEN
    -- Ainda na janela de 1 hora: nada é creditado.
    SELECT * INTO _row FROM public.video_reward_wallets WHERE user_id = _user_id;
    RETURN jsonb_build_object(
      'claimed', false,
      'balance', COALESCE(_row.balance, 0),
      'next_available_at', _row.last_claimed_at + _cooldown
    );
  END IF;

  INSERT INTO public.video_reward_claims (user_id, amount) VALUES (_user_id, _amount);

  RETURN jsonb_build_object(
    'claimed', true,
    'balance', _row.balance,
    'next_available_at', _row.last_claimed_at + _cooldown
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_video_reward(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_video_reward(uuid, numeric) TO service_role;

-- 3. Pedido de saque (mínimo 5 créditos) ----------------------------------------------------
-- Debita o valor da carteira e cria o pedido na mesma transação. Se o pagamento falhar, o
-- administrador marca 'rejected' e devolve o valor manualmente.
CREATE OR REPLACE FUNCTION public.request_credit_withdrawal(
  _user_id uuid,
  _pix_key text,
  _amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _minimum constant numeric := 5;
  _balance numeric;
  _requested numeric;
  _request_id uuid;
BEGIN
  IF _pix_key IS NULL OR length(btrim(_pix_key)) < 3 THEN
    RAISE EXCEPTION 'invalid_pix_key';
  END IF;

  SELECT balance INTO _balance
  FROM public.video_reward_wallets
  WHERE user_id = _user_id
  FOR UPDATE;

  _balance := COALESCE(_balance, 0);

  IF _balance < _minimum THEN
    RAISE EXCEPTION 'below_minimum';
  END IF;

  _requested := COALESCE(_amount, _balance);
  IF _requested < _minimum OR _requested > _balance THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  UPDATE public.video_reward_wallets
  SET balance = balance - _requested,
      updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO public.credit_withdrawal_requests (user_id, amount, pix_key)
  VALUES (_user_id, _requested, btrim(_pix_key))
  RETURNING id INTO _request_id;

  RETURN jsonb_build_object(
    'request_id', _request_id,
    'amount', _requested,
    'balance', _balance - _requested
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_credit_withdrawal(uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_credit_withdrawal(uuid, text, numeric) TO service_role;
