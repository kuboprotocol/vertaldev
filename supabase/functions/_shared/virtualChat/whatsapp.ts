/**
 * WhatsApp Business Cloud API (Meta Graph) — handshake, parse de webhook e envio.
 *
 * Só a API oficial de negócios. Automação de conta pessoal do WhatsApp viola os termos
 * da Meta e não é suportada aqui.
 *
 * Regras de janela: texto livre só pode ser enviado até 24 h depois da última
 * mensagem recebida do cliente. Fora disso, é preciso um template aprovado.
 */

import { asNumber, asRecord, asString, splitMessage } from "./util.ts";
import type { InboundAttachment, NormalizedInbound, OutboundRequest } from "./types.ts";

export const WHATSAPP_TEXT_LIMIT = 4096;
export const WHATSAPP_FREEFORM_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Versão da Graph API usada nos caminhos. Confirmar a versão vigente antes de publicar. */
export const WHATSAPP_GRAPH_VERSION = "v21.0";

/**
 * Handshake de verificação do webhook (GET com hub.mode, hub.verify_token, hub.challenge).
 * Devolve o challenge se o token bater; caso contrário null.
 */
export function verifyWhatsAppSubscription(
  query: Record<string, string | undefined>,
  expectedVerifyToken: string,
): string | null {
  if (query["hub.mode"] !== "subscribe") return null;
  if (!expectedVerifyToken || query["hub.verify_token"] !== expectedVerifyToken) return null;
  return query["hub.challenge"] ?? null;
}

export function parseWhatsAppWebhook(body: unknown): NormalizedInbound[] {
  const root = asRecord(body);
  if (!root || root.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return [];

  const out: NormalizedInbound[] = [];
  for (const entry of root.entry) {
    const changes = Array.isArray(asRecord(entry)?.changes) ? (asRecord(entry)!.changes as unknown[]) : [];
    for (const change of changes) {
      const changeRec = asRecord(change);
      if (changeRec?.field !== "messages") continue;
      const value = asRecord(changeRec.value);
      if (!value) continue;

      const names = new Map<string, string>();
      for (const c of Array.isArray(value.contacts) ? value.contacts : []) {
        const cr = asRecord(c);
        const waId = asString(cr?.wa_id);
        const name = asString(asRecord(cr?.profile)?.name);
        if (waId && name) names.set(waId, name);
      }

      for (const raw of Array.isArray(value.messages) ? value.messages : []) {
        const parsed = parseMessage(raw, names);
        if (parsed) out.push(parsed);
      }
    }
  }
  return out;
}

function parseMessage(raw: unknown, names: Map<string, string>): NormalizedInbound | null {
  const m = asRecord(raw);
  const from = asString(m?.from);
  const id = asString(m?.id);
  const type = asString(m?.type);
  if (!m || !from || !id || !type) return null;

  const receivedAt = (asNumber(Number(m.timestamp)) ?? Math.floor(Date.now() / 1000)) * 1000;
  const base = {
    channel: "whatsapp" as const,
    externalUserId: from,
    displayName: names.get(from) ?? null,
    conversationId: from,
    messageId: id,
    receivedAt,
  };

  if (type === "text") {
    const text = asString(asRecord(m.text)?.body);
    if (!text) return null;
    return { ...base, kind: "text", text, attachment: null };
  }

  if (type === "image" || type === "document") {
    const media = asRecord(m[type]);
    const mediaId = asString(media?.id);
    if (!media || !mediaId) return null;
    const attachment: InboundAttachment = {
      providerFileId: mediaId,
      mimeType: asString(media.mime_type) ?? "application/octet-stream",
      filename: asString(media.filename),
      sizeBytes: null,
    };
    return {
      ...base,
      kind: type === "image" ? "image" : "document",
      text: asString(media.caption),
      attachment,
    };
  }

  return { ...base, kind: "other", text: null, attachment: null };
}

/** true se ainda é possível mandar texto livre (até 24 h após a última mensagem do cliente). */
export function isFreeformWindowOpen(lastInboundAt: number | null, now: number): boolean {
  return lastInboundAt !== null && now - lastInboundAt < WHATSAPP_FREEFORM_WINDOW_MS;
}

export function buildWhatsAppTextMessages(input: {
  phoneNumberId: string;
  to: string;
  text: string;
}): OutboundRequest[] {
  return splitMessage(input.text, WHATSAPP_TEXT_LIMIT).map((part) => ({
    channel: "whatsapp",
    method: "POST",
    path: `${WHATSAPP_GRAPH_VERSION}/${input.phoneNumberId}/messages`,
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "text",
      text: { preview_url: false, body: part },
    },
  }));
}

/** Mídia recebida: primeiro obtém a URL pelo id (GET), depois baixa com o token da conta. */
export function buildWhatsAppMediaLookup(mediaId: string): OutboundRequest {
  return {
    channel: "whatsapp",
    method: "GET",
    path: `${WHATSAPP_GRAPH_VERSION}/${mediaId}`,
    body: {},
  };
}

/**
 * Valida `X-Hub-Signature-256` (formato `sha256=<hex>`): HMAC-SHA256 do corpo bruto com o app secret.
 * Comparação em tempo constante. Sem cabeçalho, cabeçalho malformado ou segredo vazio → false.
 */
export async function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader || !appSecret) return false;
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;
  const received = signatureHeader.slice(prefix.length).toLowerCase();

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");

  if (received.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}
