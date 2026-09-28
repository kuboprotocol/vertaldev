/**
 * Lê o código de erro devolvido por uma edge function.
 *
 * `supabase.functions.invoke` não coloca em `data` o corpo de respostas
 * não-2xx; ele vem em `error.context` (um `Response`). Sem isso, a tela só
 * mostra "Edge Function returned a non-2xx status code".
 */
export async function functionErrorCode(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown } | null)?.context
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const body = await (ctx as Response).clone().json()
      if (body && typeof body.error === 'string') return body.error
    } catch {
      return null
    }
  }
  return null
}

const MESSAGES: Record<string, string> = {
  rate_limited: 'Muitas mensagens seguidas. Aguarde alguns segundos e tente de novo.',
  ai_unavailable: 'A IA está indisponível no momento. Tente de novo em instantes.',
  unauthorized: 'Sua sessão expirou. Entre novamente.',
  player_input_too_long: 'Mensagem muito longa (máx. 1000 caracteres).',
  prompt_length: 'Descreva o jogo com 4 a 4000 caracteres.',
}

/** Mensagem amigável em português para o código de erro (ou um texto genérico). */
export function friendlyFunctionError(code: string | null): string {
  return (code && MESSAGES[code]) || 'Algo deu errado. Tente novamente.'
}
