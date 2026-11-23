// Cobrança das ações de secretário do Gmail feitas pelo Vertal Chat.
// A caixa do Gmail no app (Conectores → Gmail) continua grátis: só cobra quando o
// chat manda `chatCharge` (uuid, também a chave de idempotência da cobrança).
import { deductCredits } from "./creative.ts";
import { CHAT_CHARGE_RE, GMAIL_SECRETARY_COST, gmailChargeError } from "./gmailOps.ts";

export { GMAIL_SECRETARY_COST };

/**
 * Cobra 2 créditos se o pedido veio do chat. Usar dentro de withRefundOnFailure:
 * se a ação no Gmail falhar (resposta não-2xx), os créditos voltam.
 * Retorna null quando pode seguir, ou {status, error} para responder.
 */
export async function chargeGmailChat(
  user: { id: string; email?: string | null },
  chatCharge: string | undefined,
  op: string,
): Promise<null | { status: number; error: string }> {
  if (!chatCharge) return null;
  if (!CHAT_CHARGE_RE.test(chatCharge)) return { status: 400, error: "invalid_input" };
  const ded = await deductCredits(user.id, GMAIL_SECRETARY_COST, `chat_gmail_${op}`, { source: "vertal_chat", op }, user.email, `gmail:${chatCharge}`);
  return ded.ok ? null : gmailChargeError(ded);
}
