/**
 * Instagram (Messenger API for Instagram, Meta Graph) — parse de webhook e envio de DM.
 *
 * Só conta PROFISSIONAL do Instagram vinculada a uma Página do Facebook, com a permissão
 * instagram_manage_messages aprovada pela Meta. Automação de conta pessoal não é suportada.
 *
 * Regras:
 * - Texto livre só pode ser enviado até 24 h depois da última mensagem recebida do usuário.
 * - Cada mensagem tem no máximo 1000 caracteres (o envio quebra textos maiores).
 * - Assinatura e handshake são os mesmos do app Meta (ver whatsapp.ts: verifyWhatsAppSignature
 *   e verifyWhatsAppSubscription), porque o Instagram usa o mesmo app secret.
 */

import { asNumber, asRecord, asString, splitMessage } from "./util.ts";
import type { NormalizedInbound, OutboundRequest } from "./types.ts";

export const INSTAGRAM_TEXT_LIMIT = 1000;
export const INSTAGRAM_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Versão da Graph API. Confirmar a versão vigente antes de publicar (mesma do WhatsApp). */
export const INSTAGRAM_GRAPH_VERSION = "v21.0";

/**
 * Extrai as mensagens de DM de um webhook `object: "instagram"`.
 * Ignora ecos (mensagens que a própria conta enviou) e eventos sem texto ou anexo.
 */
export function parseInstagramWebhook(body: unknown): NormalizedInbound[] {
  const root = asRecord(body);
  if (!root || root.object !== "instagram" || !Array.isArray(root.entry)) return [];

  const out: NormalizedInbound[] = [];
  for (const entry of root.entry) {
    const messaging = Array.isArray(asRecord(entry)?.messaging) ? (asRecord(entry)!.messaging as unknown[]) : [];
    for (const event of messaging) {
      const parsed = parseMessagingEvent(event);
      if (parsed) out.push(parsed);
    }
  }
  return out;
}

function parseMessagingEvent(raw: unknown): NormalizedInbound | null {
  const ev = asRecord(raw);
  const senderId = asString(asRecord(ev?.sender)?.id);
  const recipientId = asString(asRecord(ev?.recipient)?.id);
  const message = asRecord(ev?.message);
  if (!ev || !senderId || !message) return null;
  // Eco: a própria conta enviou esta mensagem. Não é entrada do cliente.
  if (message.is_echo === true) return null;

  const messageId = asString(message.mid);
  if (!messageId) return null;
  const receivedAt = asNumber(Number(ev.timestamp)) ?? Date.now();

  const base = {
    channel: "instagram" as const,
    externalUserId: senderId,
    displayName: null,
    conversationId: senderId,
    messageId,
    receivedAt,
  };

  const text = asString(message.text);
  if (text) return { ...base, kind: "text", text, attachment: null };

  // Anexos: a URL expira e exige o token da conta, então não há id de arquivo para baixar depois.
  const first = asRecord(Array.isArray(message.attachments) ? message.attachments[0] : undefined);
  if (first) {
    const kind = asString(first.type) === "image" ? "image" : "other";
    return { ...base, kind, text: null, attachment: null };
  }

  return { ...base, kind: "other", text: null, attachment: null };
}

/** true se ainda é possível mandar texto livre (até 24 h após a última mensagem do usuário). */
export function isInstagramWindowOpen(lastInboundAt: number | null, now: number): boolean {
  return lastInboundAt !== null && now - lastInboundAt < INSTAGRAM_WINDOW_MS;
}

/** Monta as chamadas de envio de texto (uma por pedaço de até 1000 caracteres). */
export function buildInstagramTextMessages(input: {
  igAccountId: string;
  recipientId: string;
  text: string;
}): OutboundRequest[] {
  return splitMessage(input.text, INSTAGRAM_TEXT_LIMIT).map((part) => ({
    channel: "instagram",
    method: "POST",
    path: `${INSTAGRAM_GRAPH_VERSION}/${input.igAccountId}/messages`,
    body: {
      recipient: { id: input.recipientId },
      message: { text: part },
    },
  }));
}
