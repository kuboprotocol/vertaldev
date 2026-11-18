// Ponte Chat → Vibe Code: lógica pura (corpo do pedido, leitura do stream e link),
// separada de runAction.ts para ser testável sem rede.
import type { AgentAction } from './contract';
import { isVibeConversationId, VIBE_CODE_CHAT_ORIGIN } from './contract';
import {
  type ChatDelegateResult,
  insertDelegateAnswer,
  type RouterCall,
  runChatDelegation,
} from '../../../supabase/functions/_shared/chatDelegate';

export type VibeCodeAction = Extract<AgentAction, { tool: 'vibe_code' }>;

/** Rota do Vibe Code que abre direto a conversa. */
export const VIBE_CODE_ROUTE = '/vibe-code';

export function vibeCodeHref(conversationId: string): string {
  return `${VIBE_CODE_ROUTE}?conversation=${encodeURIComponent(conversationId)}`;
}

/** Conversa pedida na URL do Vibe Code (?conversation=<uuid>), ou null. */
export function vibeConversationFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get('conversation');
  return isVibeConversationId(id) ? id.toLowerCase() : null;
}

/**
 * Corpo enviado ao vibe-code-agent. Sempre em preview (o chat nunca grava no
 * projeto) e com origin 'vertal_chat', que o servidor usa para barrar nova delegação.
 * "status" não chama a função (lê a conversa direto do banco).
 */
export function vibeCodeRequestBody(action: VibeCodeAction, chatConversationId?: string | null): Record<string, unknown> | null {
  const base = {
    origin: VIBE_CODE_CHAT_ORIGIN,
    delegationDepth: 1,
    ...(action.conversationId ? { conversationId: action.conversationId } : {}),
    ...(chatConversationId ? { chatConversationId } : {}),
  };
  switch (action.op) {
    case 'start':
    case 'continue':
      return { ...base, prompt: action.prompt, mode: 'preview' };
    case 'ask':
      return { ...base, prompt: action.prompt, review: { command: 'ask', question: action.prompt } };
    case 'status':
      return null;
  }
}

export interface VibeStreamSummary {
  conversationId?: string;
  title?: string;
  reply: string;
  files: string[];
  error?: string;
  done?: string;
}

/** Lê os eventos SSE ("data: {...}") que o vibe-code-agent manda e junta o que o chat precisa. */
export function summarizeVibeStream(raw: string): VibeStreamSummary {
  const out: VibeStreamSummary = { reply: '', files: [] };
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('data: ')) continue;
    let evt: Record<string, unknown>;
    try {
      evt = JSON.parse(line.slice(6)) as Record<string, unknown>;
    } catch {
      continue;
    }
    const kind = evt.kind;
    if (kind === 'conversation' && isVibeConversationId(evt.conversationId)) {
      out.conversationId = evt.conversationId;
      if (typeof evt.title === 'string') out.title = evt.title;
    } else if (kind === 'reply' && typeof evt.detail === 'string') {
      out.reply = evt.detail;
    } else if (kind === 'diff' && typeof evt.path === 'string' && !out.files.includes(evt.path)) {
      out.files.push(evt.path);
    } else if (kind === 'error') {
      out.error = typeof evt.title === 'string' ? evt.title : 'O Vibe Code parou.';
    } else if (kind === 'done' && typeof evt.title === 'string') {
      out.done = evt.title;
    }
  }
  return out;
}

const ORIGIN_ERRORS: Record<string, string> = {
  delegation_depth_exceeded: 'O Vibe Code não aceita delegar de novo um pedido que já veio do chat.',
  delegation_preview_only: 'Pelo chat o Vibe Code só prepara a prévia; aplique as mudanças no Vibe Code.',
  invalid_origin: 'Pedido ao Vibe Code com origem inválida.',
  rate_limited: 'Muitos pedidos ao Vibe Code em pouco tempo. Aguarde um minuto.',
  missing_authorization: 'Sua sessão expirou. Entre novamente.',
  invalid_token: 'Sua sessão expirou. Entre novamente.',
};

/** Erro HTTP do vibe-code-agent ({"error":"..."}) em linguagem de usuário. */
export function vibeHttpError(status: number, text: string): string {
  try {
    const code = (JSON.parse(text) as { error?: unknown }).error;
    if (typeof code === 'string' && ORIGIN_ERRORS[code]) return ORIGIN_ERRORS[code];
  } catch {
    /* corpo não é JSON */
  }
  return `O Vibe Code não respondeu (HTTP ${status}).`;
}

// ---------------------------------------------------------------------------
// Ponte Vibe Code → Vertal Chat (botão "Perguntar ao Vertal Chat")
// ---------------------------------------------------------------------------

export { CHAT_DELEGATE_ORIGIN, DELEGATED_CHAT_TOOLS, filterActionsForOrigin } from '../../../supabase/functions/_shared/chatDelegate';
export type { ChatDelegateResult } from '../../../supabase/functions/_shared/chatDelegate';
export { insertDelegateAnswer };

/** Transporte do navegador até o creative-router (mesmo endpoint que o Vertal Chat usa). */
export function creativeRouterCall(opts: { url: string; token: string; apikey?: string; fetchImpl?: typeof fetch; signal?: AbortSignal }): RouterCall {
  const doFetch = opts.fetchImpl ?? fetch;
  return async (body) => {
    const resp = await doFetch(opts.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.token}`,
        ...(opts.apikey ? { apikey: opts.apikey } : {}),
      },
      body: JSON.stringify(body),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    const text = await resp.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: 'invalid_json' };
    }
    return { status: resp.status, data };
  };
}

/**
 * Pergunta ao Vertal Chat a partir do Vibe Code: agent_chat com origin 'vibe_code'
 * (o servidor só libera leitura/pesquisa/imagem e nunca vibe_code).
 */
export async function askVertalChatFromVibe(
  question: string,
  opts: { url: string; token: string; apikey?: string; context?: string; fetchImpl?: typeof fetch; signal?: AbortSignal },
): Promise<ChatDelegateResult> {
  const router = creativeRouterCall(opts);
  return runChatDelegation(question, router, {
    context: opts.context,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

/** Cartão "delegate" vindo do stream do vibe-code-agent (ação ask_chat), ou null. */
export function delegateCardFromStep(step: { kind?: string; status?: string; delegate?: unknown }): ChatDelegateResult | null {
  if (step.kind !== 'delegate' || step.status !== 'success' || !step.delegate || typeof step.delegate !== 'object') return null;
  const d = step.delegate as Partial<ChatDelegateResult>;
  if (typeof d.answer !== 'string' || !d.answer.trim()) return null;
  return {
    ok: true,
    question: typeof d.question === 'string' ? d.question : '',
    answer: d.answer,
    tools: Array.isArray(d.tools) ? d.tools : [],
    images: Array.isArray(d.images) ? d.images.filter((u): u is string => typeof u === 'string') : [],
    refused: Array.isArray(d.refused) ? d.refused : [],
  };
}
