// Vertal Chat ─► VERTAL Code AI: a conversa passa o pedido (e um resumo do
// contexto) pela sessionStorage, e a tela do VERTAL Code AI abre em modo Plano.
export const HANDOFF_KEY = "vertal-code-ai:handoff";
const MAX_PROMPT = 6000;
const MAX_CONTEXT = 8000;

export interface VcaiHandoff {
  prompt: string;
  context?: string;
  from: "chat" | "vibe";
  at: number;
}

/** Mensagem do Vertal Chat (campo `text`) ou no formato OpenAI (campo `content`). */
export interface ChatLikeMessage {
  role: string;
  text?: unknown;
  content?: unknown;
}

function messageText(m: ChatLikeMessage | undefined): string {
  if (!m) return "";
  return typeof m.text === "string" ? m.text : textOf(m.content);
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : ""))
      .join("\n");
  }
  return "";
}

/** Pedido = rascunho atual ou a última mensagem do usuário; contexto = últimas trocas. */
export function handoffFromChat(messages: ChatLikeMessage[], draft = ""): VcaiHandoff | null {
  const lastUser = [...messages].reverse().find((m) => m.role === "user" && messageText(m).trim());
  const prompt = (draft.trim() || messageText(lastUser).trim()).slice(0, MAX_PROMPT);
  if (!prompt) return null;
  const context = messages
    .slice(-6)
    .map((m) => {
      const t = messageText(m).trim();
      return t ? `${m.role === "user" ? "Usuário" : "Vertal Chat"}: ${t.slice(0, 1500)}` : "";
    })
    .filter(Boolean)
    .join("\n\n")
    .slice(-MAX_CONTEXT);
  return { prompt, context: context || undefined, from: "chat", at: Date.now() };
}

export function saveHandoff(h: VcaiHandoff, storage: Pick<Storage, "setItem"> = sessionStorage): void {
  try {
    storage.setItem(HANDOFF_KEY, JSON.stringify(h));
  } catch {
    /* modo privado: a tela abre vazia */
  }
}

/** Lê e apaga (uma vez só). Ignora handoffs com mais de 10 minutos. */
export function takeHandoff(storage: Pick<Storage, "getItem" | "removeItem"> = sessionStorage, now = Date.now()): VcaiHandoff | null {
  try {
    const raw = storage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    storage.removeItem(HANDOFF_KEY);
    const h = JSON.parse(raw) as VcaiHandoff;
    if (!h || typeof h.prompt !== "string" || !h.prompt.trim()) return null;
    if (typeof h.at !== "number" || now - h.at > 10 * 60 * 1000) return null;
    return { prompt: h.prompt.slice(0, MAX_PROMPT), context: typeof h.context === "string" ? h.context.slice(0, MAX_CONTEXT) : undefined, from: h.from === "vibe" ? "vibe" : "chat", at: h.at };
  } catch {
    return null;
  }
}
