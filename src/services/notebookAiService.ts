// Chamada da IA do Vertal Notebook (creative-router, ferramenta `notebook_ai`).
// O X-Idempotency-Key evita cobrança dupla em retry; erro do servidor devolve o crédito.
import { supabase } from '@/integrations/supabase/client';
import {
  NOTEBOOK_AI_COSTS,
  type ChatOutput,
  type GuideOutput,
  type NotebookAiRequest,
  type PodcastOutput,
  type StudyOutput,
  type TransformOutput,
} from '../../supabase/functions/_shared/notebookAi';

export { NOTEBOOK_AI_COSTS };

type OutputFor<A extends NotebookAiRequest['action']> = A extends 'chat'
  ? ChatOutput
  : A extends 'transform'
    ? TransformOutput
    : A extends 'guide'
      ? GuideOutput
      : A extends 'study'
        ? StudyOutput
        : PodcastOutput;

const ERROR_MESSAGES: Record<string, string> = {
  insufficient_credits: 'Créditos insuficientes. Recarregue para usar a IA.',
  invalid_model_output: 'A IA não devolveu um resultado válido. Tente de novo. Nenhum crédito foi cobrado.',
  ai_unavailable: 'A IA está indisponível agora. Nenhum crédito foi cobrado.',
  invalid_input: 'Pedido inválido. Confira as fontes selecionadas.',
  Unauthorized: 'Faça login para usar a IA do Notebook.',
};

async function readErrorCode(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: Response })?.context;
  if (!ctx || typeof ctx.json !== 'function') return null;
  try {
    const body = (await ctx.json()) as { error?: string };
    return body.error ?? null;
  } catch {
    return ctx.status === 401 ? 'Unauthorized' : null;
  }
}

export async function runNotebookAi<A extends NotebookAiRequest['action']>(
  request: NotebookAiRequest & { action: A },
): Promise<OutputFor<A>> {
  const { data, error } = await supabase.functions.invoke<{ output?: OutputFor<A>; error?: string }>('creative-router', {
    body: { tool: 'notebook_ai', notebook: request },
    headers: { 'X-Idempotency-Key': crypto.randomUUID() },
  });
  if (error) {
    const code = await readErrorCode(error);
    throw new Error((code && ERROR_MESSAGES[code]) || 'Não foi possível usar a IA agora.');
  }
  if (!data?.output) throw new Error('Resposta inesperada da IA.');
  return data.output;
}
