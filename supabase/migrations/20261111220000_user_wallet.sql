-- Carteira do perfil: cartões de crédito/débito e chaves Pix do usuário.
--
-- Segurança:
--   * Nenhum número de cartão, CVV ou validade completa passa pelo nosso
--     servidor. O cartão é digitado no Stripe Elements (iframe do Stripe),
--     salvo como PaymentMethod no Customer do Stripe, e aqui guardamos só a
--     referência (pm_...), bandeira, final, mês/ano de validade, tipo
--     (crédito/débito/pré-pago) e país emissor. Isso mantém o app fora do
--     escopo PCI-DSS (SAQ A).
--   * Chave Pix (CPF, CNPJ, e-mail, celular ou aleatória) é dado pessoal (LGPD):
--     fica cifrada em AES-GCM com CONNECTOR_ENC_KEY e o cliente só vê a versão
--     mascarada.
--   * Todo acesso passa pela Edge Function `wallet` (service role). O cliente
--     não tem nenhuma policy de leitura ou escrita direta.

CREATE TABLE IF NOT EXISTS public.wallet_payment_methods (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind                     text NOT NULL CHECK (kind IN ('card', 'pix')),
  label                    text CHECK (label IS NULL OR char_length(label) <= 40),
  is_default               boolean NOT NULL DEFAULT false,

  -- Cartão (referência Stripe)
  stripe_payment_method_id text UNIQUE,
  card_brand               text,
  card_last4               text CHECK (card_last4 IS NULL OR card_last4 ~ '^\d{4}$'),
  card_exp_month           smallint CHECK (card_exp_month IS NULL OR card_exp_month BETWEEN 1 AND 12),
  card_exp_year            smallint,
  card_funding             text CHECK (card_funding IS NULL OR card_funding IN ('credit', 'debit', 'prepaid', 'unknown')),
  card_country             text CHECK (card_country IS NULL OR card_country ~ '^[A-Z]{2}$'),
  holder_name              text CHECK (holder_name IS NULL OR char_length(holder_name) <= 80),

  -- Pix (chave cifrada)
  pix_key_type             text CHECK (pix_key_type IS NULL OR pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')),
  pix_key_ciphertext       text,
  pix_key_iv               text,
  pix_key_tag              text,
  pix_key_masked           text,
  pix_key_hash             text,   -- sha256 da chave normalizada, para impedir duplicata sem decifrar
  pix_countries            text[] NOT NULL DEFAULT ARRAY['BR']::text[],

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wallet_card_fields CHECK (
    kind <> 'card' OR (stripe_payment_method_id IS NOT NULL AND card_last4 IS NOT NULL AND card_brand IS NOT NULL)
  ),
  CONSTRAINT wallet_pix_fields CHECK (
    kind <> 'pix' OR (pix_key_type IS NOT NULL AND pix_key_ciphertext IS NOT NULL AND pix_key_iv IS NOT NULL
                      AND pix_key_tag IS NOT NULL AND pix_key_masked IS NOT NULL AND pix_key_hash IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS wallet_payment_methods_user_idx
  ON public.wallet_payment_methods (user_id, kind, created_at DESC);

-- Uma mesma chave Pix não entra duas vezes na carteira do mesmo usuário.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_pix_key_unique
  ON public.wallet_payment_methods (user_id, pix_key_hash)
  WHERE kind = 'pix';

-- No máximo um padrão por tipo (um cartão padrão e uma chave Pix padrão).
CREATE UNIQUE INDEX IF NOT EXISTS wallet_one_default_per_kind
  ON public.wallet_payment_methods (user_id, kind)
  WHERE is_default;

ALTER TABLE public.wallet_payment_methods ENABLE ROW LEVEL SECURITY;
-- Sem policies de propósito: só a service role (Edge Function `wallet`) acessa.

CREATE OR REPLACE FUNCTION public.wallet_payment_methods_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wallet_payment_methods_touch ON public.wallet_payment_methods;
CREATE TRIGGER wallet_payment_methods_touch
  BEFORE UPDATE ON public.wallet_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.wallet_payment_methods_touch();
