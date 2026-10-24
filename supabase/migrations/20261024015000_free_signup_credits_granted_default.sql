-- Os 5 créditos de cadastro do plano free já são concedidos em handle_new_user
-- (ao criar a assinatura). Antes, signup_credits_granted nascia false e a
-- função daily-credits somava os mesmos 5 de novo na primeira chamada.
-- Marca como concedidos os planos free existentes e o padrão para novos.

UPDATE public.subscriptions
  SET signup_credits_granted = true
  WHERE plan = 'free' AND signup_credits_granted = false;

ALTER TABLE public.subscriptions
  ALTER COLUMN signup_credits_granted SET DEFAULT true;
