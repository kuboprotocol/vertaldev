// Erros de build/runtime vistos no Vibe Code, para alimentar a fila de correções.
//
// Fontes:
//  - o Live Preview (iframe E2B): o app pode mandar window.parent.postMessage
//    com { type: "vibe:preview-error", message, stack?, filename?, lineno? }
//    ou um payload de erro do Vite ({ type: "error", err: { message, id, loc, frame } });
//  - passos de erro do próprio agente (auto-revisão barrou um arquivo, agente parou);
//  - o que o Dev cola com /fix.
import { useSyncExternalStore } from "react";
import type { VibeChatMessage } from "@/lib/vibeCodeAgentTypes";

export type PreviewErrorSource = "preview" | "agent" | "manual";

export interface PreviewError {
  id: string;
  message: string;
  source: PreviewErrorSource;
  at: number;
}

const MAX_ERRORS = 20;
const MAX_LEN = 1500;

const ERROR_RE = /\b(?:Error|TypeError|ReferenceError|SyntaxError|RangeError|Uncaught|Unhandled|Failed to (?:compile|resolve|fetch|load)|Cannot (?:find|read)|is not defined|is not a function|error TS\d+|\[vite\]|\[plugin:|Internal server error|Module not found|Unexpected token)\b/i;

/** Texto parece um erro de build/runtime (stack trace, Vite, tsc)? */
export function looksLikeError(text: string): boolean {
  return ERROR_RE.test(text);
}

/** Converte uma mensagem recebida do iframe do preview num texto de erro, ou null. */
export function normalizePreviewMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const type = typeof d.type === "string" ? d.type : "";
  if (type === "vibe:preview-error" || type === "vibe-preview-error") {
    const message = typeof d.message === "string" ? d.message : "";
    if (!message.trim()) return null;
    const where = typeof d.filename === "string" ? ` (${d.filename}${typeof d.lineno === "number" ? `:${d.lineno}` : ""})` : "";
    const stack = typeof d.stack === "string" && d.stack.trim() ? `\n${d.stack}` : "";
    return `${message}${where}${stack}`.slice(0, MAX_LEN);
  }
  if (type === "error" && d.err && typeof d.err === "object") {
    const err = d.err as Record<string, unknown>;
    const message = typeof err.message === "string" ? err.message : "";
    if (!message.trim()) return null;
    const loc = err.loc && typeof err.loc === "object" ? (err.loc as Record<string, unknown>) : null;
    const id = typeof err.id === "string" ? err.id : typeof loc?.file === "string" ? (loc.file as string) : "";
    const where = id ? ` (${id}${typeof loc?.line === "number" ? `:${loc.line}` : ""})` : "";
    const frame = typeof err.frame === "string" && err.frame.trim() ? `\n${err.frame}` : "";
    return `[vite] ${message}${where}${frame}`.slice(0, MAX_LEN);
  }
  return null;
}

/** Erros que o próprio agente reportou nas últimas mensagens da conversa. */
export function errorsFromMessages(messages: VibeChatMessage[], lastN = 6): string[] {
  const out: string[] = [];
  for (const m of messages.slice(-lastN)) {
    for (const s of m.steps ?? []) {
      if (s.status !== "failed") continue;
      if (s.kind !== "error" && s.kind !== "review") continue;
      const text = [s.title, s.detail].filter(Boolean).join(": ").trim();
      if (text && !out.includes(text)) out.push(text.slice(0, MAX_LEN));
    }
  }
  return out.slice(-5);
}

// ---------------------------------------------------------------------------
// Store global simples (o preview e o chat ficam em componentes irmãos)
// ---------------------------------------------------------------------------

type Listener = () => void;
let errors: PreviewError[] = [];
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

export const previewErrorStore = {
  list(): PreviewError[] {
    return errors;
  },
  add(message: string, source: PreviewErrorSource = "preview"): void {
    const text = message.trim().slice(0, MAX_LEN);
    if (!text) return;
    const key = text.split("\n")[0];
    if (errors.some((e) => e.message.split("\n")[0] === key)) return;
    errors = [...errors, { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, message: text, source, at: Date.now() }].slice(-MAX_ERRORS);
    emit();
  },
  remove(id: string): void {
    errors = errors.filter((e) => e.id !== id);
    emit();
  },
  clear(): void {
    if (!errors.length) return;
    errors = [];
    emit();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function usePreviewErrors(): PreviewError[] {
  return useSyncExternalStore(previewErrorStore.subscribe, previewErrorStore.list, previewErrorStore.list);
}
