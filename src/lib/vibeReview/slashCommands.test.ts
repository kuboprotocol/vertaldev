import { describe, expect, it } from "vitest";
import { matchSlashHints, parseSlashCommand } from "./slashCommands";
import { errorsFromMessages, looksLikeError, normalizePreviewMessage, previewErrorStore } from "./previewErrors";
import type { VibeChatMessage } from "@/lib/vibeCodeAgentTypes";

describe("comandos de barra", () => {
  it("reconhece comandos e apelidos em pt-BR com argumento", () => {
    expect(parseSlashCommand("/review segurança do login")).toMatchObject({ def: { command: "review" }, arg: "segurança do login" });
    expect(parseSlashCommand("/Melhorar")).toMatchObject({ def: { command: "improve" }, arg: "" });
    expect(parseSlashCommand("/corrigir TypeError: x\n  at a.ts:1")).toMatchObject({ def: { command: "fix_errors" }, arg: "TypeError: x\n  at a.ts:1" });
    expect(parseSlashCommand("/ask por que isso?")?.def.argRequired).toBe(true);
    expect(parseSlashCommand("/descrever")?.def.command).toBe("describe");
  });
  it("ignora texto comum e comandos desconhecidos", () => {
    expect(parseSlashCommand("crie uma landing page")).toBeNull();
    expect(parseSlashCommand("/deploy")).toBeNull();
  });
  it("sugere comandos enquanto digita", () => {
    expect(matchSlashHints("/").length).toBe(5);
    expect(matchSlashHints("/rev").map((c) => c.name)).toEqual(["/review"]);
    expect(matchSlashHints("/re").map((c) => c.name)).toEqual(["/review", "/describe"]); // /resumo
    expect(matchSlashHints("/me").map((c) => c.name)).toEqual(["/improve"]);
    expect(matchSlashHints("/review ")).toEqual([]);
    expect(matchSlashHints("oi")).toEqual([]);
  });
});

describe("erros do preview", () => {
  it("normaliza mensagens do app e do Vite", () => {
    expect(normalizePreviewMessage({ type: "vibe:preview-error", message: "x is not defined", filename: "src/App.tsx", lineno: 3 })).toBe(
      "x is not defined (src/App.tsx:3)",
    );
    expect(normalizePreviewMessage({ type: "error", err: { message: "Failed to resolve import", id: "src/main.tsx", loc: { line: 2 }, frame: "> 2 | import x" } })).toBe(
      "[vite] Failed to resolve import (src/main.tsx:2)\n> 2 | import x",
    );
    expect(normalizePreviewMessage({ type: "vibe:preview-error", message: " " })).toBeNull();
    expect(normalizePreviewMessage("texto")).toBeNull();
    expect(normalizePreviewMessage({ type: "outra" })).toBeNull();
  });
  it("looksLikeError", () => {
    expect(looksLikeError("Uncaught TypeError: a is undefined")).toBe(true);
    expect(looksLikeError("src/a.ts(3,1): error TS2304: Cannot find name")).toBe(true);
    expect(looksLikeError("crie um botão azul")).toBe(false);
  });
  it("store deduplica pela primeira linha e limpa", () => {
    previewErrorStore.clear();
    previewErrorStore.add("ReferenceError: a\n at 1");
    previewErrorStore.add("ReferenceError: a\n at 2");
    previewErrorStore.add("   ");
    expect(previewErrorStore.list()).toHaveLength(1);
    previewErrorStore.remove(previewErrorStore.list()[0].id);
    expect(previewErrorStore.list()).toHaveLength(0);
  });
  it("errorsFromMessages pega passos com falha do agente", () => {
    const msgs: VibeChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "",
        createdAt: 0,
        steps: [
          { id: "a", kind: "error", status: "failed", title: "Agente parou", detail: "plan_parse_failed", startedAt: 0 },
          { id: "b", kind: "review", status: "failed", title: "1 arquivo barrado", detail: "src/a.ts: JSON inválido", startedAt: 0 },
          { id: "c", kind: "review", status: "success", title: "ok", startedAt: 0 },
        ],
      },
    ];
    expect(errorsFromMessages(msgs)).toEqual(["Agente parou: plan_parse_failed", "1 arquivo barrado: src/a.ts: JSON inválido"]);
  });
});
