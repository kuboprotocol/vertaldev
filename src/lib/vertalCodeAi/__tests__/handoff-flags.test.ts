import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: vi.fn() } } }));
import { isVertalCodeAiEnabled } from "../flags";
import { HANDOFF_KEY, handoffFromChat, saveHandoff, takeHandoff } from "../handoff";
import { readApplyStream } from "../api";

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("interruptor", () => {
  it("desligado por padrão", () => {
    expect(isVertalCodeAiEnabled({}, memStorage())).toBe(false);
    expect(isVertalCodeAiEnabled({ VITE_VERTAL_CODE_AI: "false" }, null)).toBe(false);
    expect(isVertalCodeAiEnabled({ VITE_VERTAL_CODE_AI: "1" }, null)).toBe(false);
  });
  it("liga pela env ou pelo aparelho", () => {
    expect(isVertalCodeAiEnabled({ VITE_VERTAL_CODE_AI: "true" }, null)).toBe(true);
    const s = memStorage();
    s.setItem("vertal-code-ai", "on");
    expect(isVertalCodeAiEnabled({}, s)).toBe(true);
  });
});

describe("Vertal Chat ─► VERTAL Code AI", () => {
  it("usa o rascunho ou a última mensagem do usuário, com contexto", () => {
    const msgs = [
      { role: "user", text: "quero um login" },
      { role: "assistant", text: "posso ajudar" },
    ];
    expect(handoffFromChat(msgs, "")?.prompt).toBe("quero um login");
    const h = handoffFromChat(msgs, "  rascunho novo ");
    expect(h?.prompt).toBe("rascunho novo");
    expect(h?.context).toContain("Vertal Chat: posso ajudar");
    expect(handoffFromChat([], "")).toBeNull();
  });

  it("lê uma vez e expira", () => {
    const s = memStorage();
    saveHandoff({ prompt: "x", from: "chat", at: 1000 }, s);
    expect(takeHandoff(s, 2000)?.prompt).toBe("x");
    expect(takeHandoff(s, 2000)).toBeNull();
    saveHandoff({ prompt: "x", from: "chat", at: 0 }, s);
    expect(takeHandoff(s, 11 * 60 * 1000)).toBeNull();
    s.setItem(HANDOFF_KEY, "{quebrado");
    expect(takeHandoff(s)).toBeNull();
  });
});

describe("aplicar pelo caminho existente", () => {
  it("lê o SSE do vibe-code-agent", () => {
    expect(readApplyStream('data: {"kind":"reply","detail":"Apliquei"}\ndata: {"kind":"done","status":"success"}\n')).toEqual({ ok: true, message: "Apliquei" });
    expect(readApplyStream('data: {"kind":"error","detail":"arquivo_recusado"}\n').ok).toBe(false);
  });
});
