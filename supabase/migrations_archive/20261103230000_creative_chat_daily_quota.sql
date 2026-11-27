-- Modo de conversa: cota diária de conversas grátis, contada no servidor.
-- As 5 primeiras conversas do dia (UTC) são grátis; a partir da sexta, 1 crédito por conversa.
-- A tabela só é acessada pelo service role (RLS ligado, sem políticas para anon/authenticated).

CREATE TABLE IF NOT EXISTS public.creative_chat_daily_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_day DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (user_id, usage_day)
);

ALTER TABLE public.creative_chat_daily_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creative_chat_daily_usage FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.creative_chat_daily_usage TO service_role;

-- Conta uma conversa e devolve o total do dia (incluindo esta).
CREATE OR REPLACE FUNCTION public.increment_creative_chat_usage(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.creative_chat_daily_usage (user_id, usage_day, count)
  VALUES (p_user_id, (now() AT TIME ZONE 'UTC')::date, 1)
  ON CONFLICT (user_id, usage_day)
  DO UPDATE SET count = public.creative_chat_daily_usage.count + 1
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

-- Devolve uma vaga grátis quando a conversa falha antes de gerar resposta.
CREATE OR REPLACE FUNCTION public.release_creative_chat_usage(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.creative_chat_daily_usage
     SET count = GREATEST(count - 1, 0)
   WHERE user_id = p_user_id AND usage_day = (now() AT TIME ZONE 'UTC')::date;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_creative_chat_usage(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_creative_chat_usage(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_creative_chat_usage(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_creative_chat_usage(UUID) TO service_role;
