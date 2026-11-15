/**
 * Telegram Bot API — parse de updates (webhook) e montagem de envios.
 * Nenhuma chamada de rede aqui: a edge function recebe o update, valida o
 * header X-Telegram-Bot-Api-Secret-Token e executa o OutboundRequest com o token do bot.
 */

import { asNumber, asRecord, asString, splitMessage } from "../util";
import type { NormalizedInbound, OutboundRequest } from "../types";

export const TELEGRAM_TEXT_LIMIT = 4096;

/** Limite de download do Bot API (20 MB). Arquivos maiores precisam de outro caminho. */
export const TELEGRAM_DOWNLOAD_LIMIT_BYTES = 20 * 1024 * 1024;

export function parseTelegramUpdate(body: unknown): NormalizedInbound | null {
  const update = asRecord(body);
  const msg = asRecord(update?.message);
  if (!msg) return null;

  const from = asRecord(msg.from);
  const chat = asRecord(msg.chat);
  if (!from || !chat || from.is_bot === true) return null;

  const chatId = asNumber(chat.id);
  const messageId = asNumber(msg.message_id);
  const userId = asNumber(from.id);
  if (chatId === null || messageId === null || userId === null) return null;

  const text = asString(msg.text) ?? asString(msg.caption);
  const document = asRecord(msg.document);
  const photos = Array.isArray(msg.photo) ? msg.photo : [];
  const largestPhoto = asRecord(photos[photos.length - 1]);

  let kind: NormalizedInbound["kind"] = text ? "text" : "other";
  let attachment: NormalizedInbound["attachment"] = null;

  if (document && asString(document.file_id)) {
    kind = "document";
    attachment = {
      providerFileId: String(document.file_id),
      mimeType: asString(document.mime_type) ?? "application/octet-stream",
      filename: asString(document.file_name),
      sizeBytes: asNumber(document.file_size),
    };
  } else if (largestPhoto && asString(largestPhoto.file_id)) {
    kind = "image";
    attachment = {
      providerFileId: String(largestPhoto.file_id),
      mimeType: "image/jpeg",
      filename: null,
      sizeBytes: asNumber(largestPhoto.file_size),
    };
  }

  if (kind === "other" && !attachment && !text) return null;

  const firstName = asString(from.first_name) ?? "";
  const lastName = asString(from.last_name) ?? "";
  const displayName = `${firstName} ${lastName}`.trim() || asString(from.username);

  return {
    channel: "telegram",
    externalUserId: String(userId),
    displayName,
    conversationId: String(chatId),
    messageId: String(messageId),
    kind,
    text,
    attachment,
    receivedAt: (asNumber(msg.date) ?? Math.floor(Date.now() / 1000)) * 1000,
  };
}

/** Monta um ou mais sendMessage (quebra o texto no limite de 4096). */
export function buildTelegramSendMessages(input: {
  chatId: string;
  text: string;
  replyToMessageId?: string;
}): OutboundRequest[] {
  return splitMessage(input.text, TELEGRAM_TEXT_LIMIT).map((part, index) => {
    const body: Record<string, unknown> = { chat_id: input.chatId, text: part };
    if (index === 0 && input.replyToMessageId) {
      body.reply_parameters = { message_id: Number(input.replyToMessageId) };
    }
    return { channel: "telegram", method: "POST", path: "sendMessage", body };
  });
}

/** getFile: devolve file_path; o download é feito depois, pela edge function. */
export function buildTelegramGetFile(fileId: string): OutboundRequest {
  return { channel: "telegram", method: "POST", path: "getFile", body: { file_id: fileId } };
}
