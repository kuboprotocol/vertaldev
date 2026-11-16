import { describe, expect, it } from "vitest";
import {
  buildInstagramTextMessages,
  INSTAGRAM_TEXT_LIMIT,
  INSTAGRAM_WINDOW_MS,
  isInstagramWindowOpen,
  parseInstagramWebhook,
} from "./instagram";

const event = (over: Record<string, unknown> = {}) => ({
  sender: { id: "1234567890" },
  recipient: { id: "17841400000000" },
  timestamp: 1_800_000_000_000,
  message: { mid: "aWdfZAG1f", text: "Qual o preço do plano?" },
  ...over,
});

describe("parseInstagramWebhook", () => {
  it("normaliza uma DM de texto", () => {
    const out = parseInstagramWebhook({
      object: "instagram",
      entry: [{ id: "17841400000000", time: 1, messaging: [event()] }],
    });
    expect(out).toEqual([
      {
        channel: "instagram",
        externalUserId: "1234567890",
        displayName: null,
        conversationId: "1234567890",
        messageId: "aWdfZAG1f",
        kind: "text",
        text: "Qual o preço do plano?",
        attachment: null,
        receivedAt: 1_800_000_000_000,
      },
    ]);
  });

  it("ignora eco (mensagem que a própria conta enviou)", () => {
    const out = parseInstagramWebhook({
      object: "instagram",
      entry: [{ messaging: [event({ message: { mid: "m1", text: "oi", is_echo: true } })] }],
    });
    expect(out).toEqual([]);
  });

  it("marca anexo de imagem sem guardar URL expirável", () => {
    const out = parseInstagramWebhook({
      object: "instagram",
      entry: [{
        messaging: [event({ message: { mid: "m2", attachments: [{ type: "image", payload: { url: "https://cdn.example/x.jpg" } }] } })],
      }],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "image", text: null, attachment: null });
  });

  it("ignora objetos que não são Instagram, sem messaging ou sem id da mensagem", () => {
    expect(parseInstagramWebhook({ object: "page", entry: [{ messaging: [event()] }] })).toEqual([]);
    expect(parseInstagramWebhook({ object: "instagram", entry: [{}] })).toEqual([]);
    expect(parseInstagramWebhook({ object: "instagram", entry: [{ messaging: [event({ message: { text: "x" } })] }] })).toEqual([]);
    expect(parseInstagramWebhook(null)).toEqual([]);
  });
});

describe("janela de 24 h", () => {
  const now = 1_800_000_000_000;
  it("aberta só até 24 h depois da última mensagem do contato", () => {
    expect(isInstagramWindowOpen(now - 1000, now)).toBe(true);
    expect(isInstagramWindowOpen(now - INSTAGRAM_WINDOW_MS + 1, now)).toBe(true);
    expect(isInstagramWindowOpen(now - INSTAGRAM_WINDOW_MS, now)).toBe(false);
  });

  it("fechada se o contato nunca escreveu", () => {
    expect(isInstagramWindowOpen(null, now)).toBe(false);
  });
});

describe("buildInstagramTextMessages", () => {
  it("monta envio para a conta profissional com o id do destinatário", () => {
    const [req] = buildInstagramTextMessages({ igAccountId: "17841400000000", recipientId: "1234567890", text: "Olá" });
    expect(req).toEqual({
      channel: "instagram",
      method: "POST",
      path: "v21.0/17841400000000/messages",
      body: { recipient: { id: "1234567890" }, message: { text: "Olá" } },
    });
  });

  it("quebra textos maiores que o limite da Meta em vários envios", () => {
    const text = "palavra ".repeat(300).trim();
    const reqs = buildInstagramTextMessages({ igAccountId: "1", recipientId: "2", text });
    expect(reqs.length).toBeGreaterThan(1);
    for (const r of reqs) {
      expect((r.body.message as { text: string }).text.length).toBeLessThanOrEqual(INSTAGRAM_TEXT_LIMIT);
    }
    expect(reqs.map((r) => (r.body.message as { text: string }).text).join(" ").replace(/\s+/g, " ")).toBe(text);
  });
});
