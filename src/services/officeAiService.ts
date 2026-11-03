// Chamada da IA do Vertal Office (edge function `office-ai`).
// Cada chamada cobra 1 crédito. O X-Idempotency-Key evita cobrança dupla em retry.
import { supabase } from '@/integrations/supabase/client';
import type { BlockType } from '@/lib/office/documentModel';

export const OFFICE_AI_CREDIT_COST = 1;

export type OfficeAiRequest = { action: 'sheet' | 'doc'; prompt: string; source?: string };

export type OfficeAiResponse =
  | { action: 'sheet'; output: { headers: string[]; rows: Array<Array<string | number>> } }
  | { action: 'doc'; output: { title: string; blocks: Array<{ type: BlockType; text: string }> } };

const ERROR_MESSAGES: Record<string, string> = {
  insufficient_credits: 'Créditos insuficientes. Recarregue para usar a IA.',
  invalid_model_output: 'A IA não devolveu um resultado válido. Tente reformular o pedido. Nenhum crédito foi cobrado.',
  ai_unavailable: 'A IA está indisponível agora. Nenhum crédito foi cobrado.',
  Unauthorized: 'Faça login para usar a IA.',
};

async function readErrorCode(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: Response })?.context;
  if (!ctx || typeof ctx.json !== 'function') return null;
  try {
    const body = (await ctx.json()) as { error?: string };
    return body.error ?? null;
  } catch {
    return null;
  }
}

export async function runOfficeAi(request: OfficeAiRequest): Promise<OfficeAiResponse> {
  const { data, error } = await supabase.functions.invoke<OfficeAiResponse & { error?: string }>('office-ai', {
    body: request,
    headers: { 'X-Idempotency-Key': crypto.randomUUID() },
  });

  if (error) {
    const code = await readErrorCode(error);
    throw new Error((code && ERROR_MESSAGES[code]) || 'Não foi possível usar a IA agora.');
  }
  if (!data || !('output' in data)) {
    throw new Error('Resposta inesperada da IA.');
  }
  return data;
}
