// Ponte Chat → Vibe Code: lógica pura (corpo do pedido, leitura do stream e link),
// separada de runAction.ts para ser testável sem rede.
import type { AgentAction } from './contract';
import { isVibeConversationId, VIBE_CODE_CHAT_ORIGIN } from './contract';

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
export function vibeCodeRequestBody(action: VibeCodeAction): Record<string, unknown> | null {
  const base = {
    origin: VIBE_CODE_CHAT_ORIGIN,
    delegationDepth: 1,
    ...(action.conversationId ? { conversationId: action.conversationId } : {}),
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
