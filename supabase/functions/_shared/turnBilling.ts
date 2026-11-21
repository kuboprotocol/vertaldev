// Cobrança idempotente por turno do Vertal Chat (agent_chat) com o consent gate (F5).
//
// Problema: a 1ª rodada do turno era cobrada ANTES do consent gate. Quando o gate segurava o
// pedido (termo a assinar, esclarecimento ou bloqueio), o usuário pagava por uma resposta que só
// pedia o termo e pagava de novo ao repetir a mensagem depois de assinar.
//
// Regra agora:
//   1. Na 1ª rodada do turno o gate roda ANTES da cobrança. Turno segurado pelo gate não cobra
//      nada (nem crédito, nem vaga grátis do dia).
//   2. A cobrança usa uma chave de idempotência do TURNO (`agent_chat:turn:<user>:<turnId>`).
//      O cliente gera um turnId por mensagem do usuário e o reaproveita na repetição automática
//      depois de assinar o termo e em qualquer reenvio da mesma rodada: a mesma chave nunca
//      debita duas vezes (o RPC execute_atomic_credit_deduction devolve "replayed").
//   3. Sem turnId (cliente antigo) vale a chave de antes (cabeçalho X-Idempotency-Key ou aleatória).
// Módulo puro (sem Deno): roda na edge function e no Vitest.

const TURN_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** turnId vindo do cliente (agent.turn_id). Fora do formato = null (cai na chave antiga). */
export function parseTurnId(raw: unknown): string | null {
  return typeof raw === "string" && TURN_ID_RE.test(raw) ? raw : null;
}

/** Id de turno gerado no cliente (aceito por parseTurnId). */
export function newTurnId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** Chave de idempotência da cobrança do turno (namespaced pelo usuário: turnId de outro não colide). */
export function turnChargeKey(userId: string, turnId: string): string {
  return `agent_chat:turn:${userId}:${turnId}`;
}

/** Chave usada na cobrança: a do turno quando houver turnId; senão a de antes (cabeçalho ou nenhuma). */
export function chargeKeyFor(userId: string, turnId: string | null, headerKey?: string | null): string | undefined {
  if (turnId) return turnChargeKey(userId, turnId);
  return headerKey && headerKey.length > 0 ? headerKey : undefined;
}

export type ChargeResult = { ok: true; cost: number } | { ok: false; cost: number; status: number; error: string };

/**
 * 1ª rodada: roda o gate e só cobra se o pedido seguir. Cobra no máximo uma vez por chamada
 * (o `charge` é memorizado). Se o gate falhar (exceção), o pedido segue e é cobrado como antes.
 */
export async function gateThenCharge(o: {
  gate: () => Promise<{ held: boolean }>;
  charge: () => Promise<ChargeResult>;
}): Promise<{ held: true; charged: 0 } | { held: false; charge: ChargeResult }> {
  let held = false;
  try {
    held = (await o.gate()).held;
  } catch {
    held = false;
  }
  if (held) return { held: true, charged: 0 };
  return { held: false, charge: await o.charge() };
}

/** Memoriza uma cobrança: chamar de novo na mesma requisição não debita outra vez. */
export function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= fn());
}
