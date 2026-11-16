import { describe, expect, it } from "vitest";
import { parseTelegramUpdate, buildTelegramSendMessages, TELEGRAM_TEXT_LIMIT } from "./telegram";
import {
  parseWhatsAppWebhook,
  verifyWhatsAppSubscription,
  isFreeformWindowOpen,
  buildWhatsAppTextMessages,
  WHATSAPP_FREEFORM_WINDOW_MS,
  WHATSAPP_TEXT_LIMIT,
} from "./whatsapp";
import { splitMessage } from "../util";

describe("Telegram: parse de update", () => {
  it("normaliza texto de usuário", () => {
    const out = parseTelegramUpdate({
      update_id: 1,
      message: {
        message_id: 77,
        from: { id: 555, is_bot: false, first_name: "Ana", last_name: "Lima" },
        chat: { id: 555, type: "private" },
        date: 1_800_000_000,
        text: "Qual o preço do plano?",
      },
    });
    expect(out).toMatchObject({
      channel: "telegram",
      externalUserId: "555",
      displayName: "Ana Lima",
      conversationId: "555",
      messageId: "77",
      kind: "text",
      text: "Qual o preço do plano?",
      attachment: null,
      receivedAt: 1_800_000_000_000,
    });
  });

  it("captura documento com id do provedor (download fica na edge function)", () => {
    const out = parseTelegramUpdate({
      message: {
        message_id: 9,
        from: { id: 1, first_name: "Bia" },
        chat: { id: 1 },
        date: 1,
        caption: "segue o contrato",
        document: { file_id: "BQAD123", mime_type: "application/pdf", file_name: "contrato.pdf", file_size: 2048 },
      },
    });
    expect(out?.kind).toBe("document");
    expect(out?.text).toBe("segue o contrato");
    expect(out?.attachment).toEqual({
      providerFileId: "BQAD123",
      mimeType: "application/pdf",
      filename: "contrato.pdf",
      sizeBytes: 2048,
    });
  });

  it("ignora mensagens de bot e payloads inválidos", () => {
    expect(parseTelegramUpdate({ message: { message_id: 1, from: { id: 2, is_bot: true }, chat: { id: 2 }, text: "oi" } })).toBeNull();
    expect(parseTelegramUpdate({ edited_message: {} })).toBeNull();
    expect(parseTelegramUpdate("lixo")).toBeNull();
  });

  it("quebra resposta longa no limite de 4096 e responde a mensagem original só no primeiro pedaço", () => {
    const text = "palavra ".repeat(1200);
    const reqs = buildTelegramSendMessages({ chatId: "555", text, replyToMessageId: "77" });
    expect(reqs.length).toBeGreaterThan(1);
    for (const r of reqs) {
      expect(String(r.body.text).length).toBeLessThanOrEqual(TELEGRAM_TEXT_LIMIT);
    }
    expect(reqs[0].body.reply_parameters).toEqual({ message_id: 77 });
    expect(reqs[1].body.reply_parameters).toBeUndefined();
  });
});

describe("WhatsApp: handshake e parse", () => {
  it("devolve o challenge só com token correto", () => {
    const q = { "hub.mode": "subscribe", "hub.verify_token": "segredo", "hub.challenge": "123" };
    expect(verifyWhatsAppSubscription(q, "segredo")).toBe("123");
    expect(verifyWhatsAppSubscription(q, "outro")).toBeNull();
    expect(verifyWhatsAppSubscription({ ...q, "hub.mode": "unsubscribe" }, "segredo")).toBeNull();
    expect(verifyWhatsAppSubscription(q, "")).toBeNull();
  });

  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              contacts: [{ wa_id: "5511999", profile: { name: "Carlos" } }],
              messages: [
                { from: "5511999", id: "wamid.1", timestamp: "1800000000", type: "text", text: { body: "tem estoque?" } },
                { from: "5511999", id: "wamid.2", timestamp: "1800000010", type: "document", document: { id: "MEDIA9", mime_type: "application/pdf", filename: "pedido.pdf", caption: "pedido" } },
                { from: "5511999", id: "wamid.3", timestamp: "1800000020", type: "sticker", sticker: { id: "x" } },
              ],
            },
          },
          { field: "statuses", value: { statuses: [] } },
        ],
      },
    ],
  };

  it("normaliza texto, documento e ignora tipos não suportados e campo statuses", () => {
    const out = parseWhatsAppWebhook(payload);
    expect(out.map((m) => m.kind)).toEqual(["text", "document", "other"]);
    expect(out[0]).toMatchObject({ displayName: "Carlos", text: "tem estoque?", conversationId: "5511999" });
    expect(out[1].attachment).toEqual({ providerFileId: "MEDIA9", mimeType: "application/pdf", filename: "pedido.pdf", sizeBytes: null });
    expect(out[1].text).toBe("pedido");
  });

  it("não aceita objeto que não seja WhatsApp Business", () => {
    expect(parseWhatsAppWebhook({ object: "page", entry: [] })).toEqual([]);
  });

  it("janela de 24 h para texto livre", () => {
    const last = 1_800_000_000_000;
    expect(isFreeformWindowOpen(last, last + WHATSAPP_FREEFORM_WINDOW_MS - 1)).toBe(true);
    expect(isFreeformWindowOpen(last, last + WHATSAPP_FREEFORM_WINDOW_MS)).toBe(false);
    expect(isFreeformWindowOpen(null, last)).toBe(false);
  });

  it("monta envio com caminho da Graph API e quebra texto longo", () => {
    const [first] = buildWhatsAppTextMessages({ phoneNumberId: "PNID", to: "5511999", text: "oi" });
    expect(first.path).toMatch(/^v\d+\.\d+\/PNID\/messages$/);
    expect(first.body).toMatchObject({ messaging_product: "whatsapp", to: "5511999", type: "text", text: { body: "oi" } });
    const long = buildWhatsAppTextMessages({ phoneNumberId: "PNID", to: "5511999", text: "a".repeat(WHATSAPP_TEXT_LIMIT * 2 + 10) });
    expect(long.length).toBe(3);
  });
});

describe("util: splitMessage", () => {
  it("prefere quebra de linha e nunca passa do limite", () => {
    const parts = splitMessage("linha um\nlinha dois\nlinha tres", 15);
    expect(parts.every((p) => p.length <= 15)).toBe(true);
    expect(parts.join("\n")).toContain("linha dois");
  });
});
