// Chamada única da IA do Auto Cadê (editor e Vertal Chat usam esta função). A cobrança é no servidor.
import { supabase } from '@/integrations/supabase/client';
import { CAD_LIMITS, CAD_SYSTEM_PROMPT, buildCadUserMessage, cadCredits, cadRequestChars, summarizeCadDocument } from './model';
import type { CadDocument } from './model';

export interface GenerateCadInput {
  prompt: string;
  mode: 'new' | 'edit';
  /** Desenho atual (só no ajuste). */
  current?: CadDocument;
}

export interface GenerateCadResult {
  document: CadDocument;
  creditsSpent: number;
}

/** Créditos que um pedido gasta. Igual ao cobrado no servidor (mesma função). */
export function estimateCadCredits(prompt: string, current?: CadDocument): number {
  const currentSummary = current ? summarizeCadDocument(current) : undefined;
  const userMessage = buildCadUserMessage(prompt.trim(), current ? 'edit' : 'new', currentSummary);
  return cadCredits(cadRequestChars(userMessage, CAD_SYSTEM_PROMPT));
}

const MESSAGES: Record<string, string> = {
  insufficient_credits: 'Créditos insuficientes para gerar este desenho.',
  deduction_failed: 'Créditos insuficientes para gerar este desenho.',
  invalid_input: 'Escreva o pedido com pelo menos 3 letras.',
  cad_generation_failed: 'A IA não conseguiu montar um desenho válido. Descreva com mais detalhes (medidas, número de quartos, cômodos).',
  image_provider_unavailable: 'A IA do Auto Cadê está indisponível agora. Tente de novo em instantes.',
  Unauthorized: 'Entre na sua conta para usar a IA do Auto Cadê.',
};

/** Gera ou ajusta uma planta. Lança Error com mensagem em português. */
export async function generateCad({ prompt, mode, current }: GenerateCadInput): Promise<GenerateCadResult> {
  const text = prompt.trim();
  if (text.length < 3) throw new Error(MESSAGES.invalid_input);
  if (mode === 'edit' && !current) throw new Error('Desenhe ou gere uma planta antes de pedir ajustes à IA.');

  const body = {
    prompt: text.slice(0, CAD_LIMITS.maxPromptChars),
    mode,
    current: current ? summarizeCadDocument(current) : undefined,
  };
  const { data, error } = await supabase.functions.invoke('cad-generate', {
    body,
    headers: { 'X-Idempotency-Key': requestId() },
  });

  if (error || (data && typeof data === 'object' && 'error' in data && data.error)) {
    const code = extractErrorCode(data, error);
    throw new Error(MESSAGES[code] ?? 'Não foi possível gerar o desenho agora. Tente de novo.');
  }
  const document = (data as { document?: CadDocument } | null)?.document;
  if (!document) throw new Error('Não foi possível gerar o desenho agora. Tente de novo.');
  return { document, creditsSpent: Number((data as { credits_spent?: number }).credits_spent ?? 0) };
}

/** Chave de idempotência: evita cobrar duas vezes o mesmo pedido se a conexão repetir o envio. */
function requestId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function extractErrorCode(data: unknown, error: unknown): string {
  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string') {
    return (data as { error: string }).error;
  }
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx && typeof ctx === 'object' && 'body' in ctx) {
    const body = (ctx as { body: unknown }).body;
    if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body) as { error?: string };
        if (parsed.error) return parsed.error;
      } catch {
        /* corpo não é JSON */
      }
    }
  }
  return '';
}
