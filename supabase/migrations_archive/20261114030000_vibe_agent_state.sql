-- Vibe Code: estado do plano/executor por conversa + trava de escritor único.
--
-- agent_state (jsonb): grafo de tarefas (conceito à la Task Master, código
--   próprio), mudanças staged do executor estilo Plandex (ainda NÃO aplicadas
--   ao projeto), nível de autonomia, pacote de modelos, mapa do repositório em
--   cache, contador do auto-debug e pilha do que o executor aplicou (/voltar).
--   Lido/gravado só pela edge function vibe-code-agent (service role) e lido
--   pelo próprio dono no navegador (RLS de vibe_conversations).
--
-- writer_lock_owner / writer_lock_until: uma escrita por vez na conversa
--   (executor, fila de correções, aplicação manual, auto-debug, rewind). A
--   trava expira sozinha (VIBE_LOCK_TTL_SECONDS, padrão 180 s) para nunca
--   prender a conversa se uma função cair no meio.

ALTER TABLE public.vibe_conversations
  ADD COLUMN IF NOT EXISTS agent_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS writer_lock_owner text,
  ADD COLUMN IF NOT EXISTS writer_lock_until timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vibe_conversations_agent_state_size'
  ) THEN
    ALTER TABLE public.vibe_conversations
      ADD CONSTRAINT vibe_conversations_agent_state_size
      CHECK (pg_column_size(agent_state) <= 2000000);
  END IF;
END $$;

COMMENT ON COLUMN public.vibe_conversations.agent_state IS
  'Plano do Vibe Code: grafo de tarefas, mudanças staged, autonomia, pacote de modelos, cache do mapa do repo, auto-debug e histórico de aplicações.';
COMMENT ON COLUMN public.vibe_conversations.writer_lock_owner IS
  'Trava de escritor único: "<tipo>:<uuid>" de quem está gravando (executor, fix_queue, manual, debug, rewind).';
COMMENT ON COLUMN public.vibe_conversations.writer_lock_until IS
  'Validade da trava de escritor; depois disso outra ação pode gravar.';
