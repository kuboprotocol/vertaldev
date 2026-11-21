// Núcleo puro do Vertal Navigator (agente de navegação com sessão persistente).
//
// Sem APIs do Deno/DOM: roda no Worker do vertal.dev, no front-end (Vitest) e
// nas edge functions. Tudo que decide "pode ou não pode" mora aqui:
//   * validação das rotas /api/navigator/*;
//   * gate de pagamento (cliques de pagar/comprar/confirmar pedido exigem aprovação);
//   * vínculo segredo ↔ domínio (fill_secret);
//   * cobrança por minuto (quantos minutos faltam cobrar);
//   * guarda SSRF — reaproveitada de browserForm.ts (normalizeFormUrl).
//
// As listas de palavras do gate têm um espelho em Python no daemon do sandbox
// (infra/vertal-browser/navd.py). O teste navigatorCore.test.ts garante que as
// duas cópias são iguais.
import { isBlockedHost, normalizeFormUrl } from "./browserForm.ts";

export const NAVIGATOR_OPS = ["start", "task", "status", "input", "takeover", "release", "stop"] as const;
export type NavigatorOp = (typeof NAVIGATOR_OPS)[number];

export const NAVIGATOR_LIMITS = {
  /** Sessões simultâneas no E2B (todas as contas). Sobrescrito por NAVIGATOR_MAX_SESSIONS. */
  maxConcurrentSessions: 2,
  /** Sessões simultâneas por usuário (start reaproveita a que já existe). */
  maxSessionsPerUser: 1,
  /** Créditos por minuto de sessão (cobrança pré-paga, minuto a minuto). */
  creditsPerMinute: 1,
  /** Tempo máximo de uma sessão. */
  maxSessionMinutes: 60,
  /** Sem chamadas por este tempo, o sandbox morre sozinho (timeout do E2B). */
  idleTimeoutSeconds: 600,
  maxTaskChars: 4_000,
  defaultMaxSteps: 25,
  maxStepsCap: 60,
  maxInputChars: 512,
  maxBodyBytes: 16 * 1024,
  /** Cookies cifrados por usuário (JSON). */
  maxProfileBytes: 1_000_000,
  maxCookies: 3_000,
} as const;

export type NavigatorStatus =
  | "ok"
  | "blocked_url"
  | "busy"
  | "capacity"
  | "no_session"
  | "session_ended"
  | "not_pending"
  | "rate_limited"
  | "insufficient_credits"
  | "not_configured"
  | "unauthorized"
  | "bad_request"
  | "sandbox_error"
  | "error";

export const NAVIGATOR_MESSAGES: Record<Exclude<NavigatorStatus, "ok">, string> = {
  blocked_url: "Esse endereço não pode ser aberto (só sites públicos http/https, sem rede interna).",
  busy: "O navegador já está executando uma tarefa. Espere terminar ou pare a atual.",
  capacity: "Todos os navegadores na nuvem estão ocupados agora. Tente de novo em alguns minutos.",
  no_session: "Nenhum navegador aberto. Abra um novo.",
  session_ended: "Esta sessão do navegador terminou. Abra um novo.",
  not_pending: "Esse pedido já foi respondido ou expirou.",
  rate_limited: "Muitos pedidos em pouco tempo. Aguarde um minuto e tente de novo.",
  insufficient_credits: "Créditos insuficientes para usar o navegador na nuvem.",
  not_configured: "O navegador na nuvem ainda não está configurado.",
  unauthorized: "Sua sessão expirou. Entre novamente.",
  bad_request: "Pedido inválido para o navegador.",
  sandbox_error: "O navegador na nuvem não respondeu. Tente abrir de novo.",
  error: "Algo falhou no navegador na nuvem.",
};

// ─── Guarda SSRF (reaproveita browserForm.ts) ────────────────────────────
/** URL pública http/https normalizada, ou null. Mesma regra do browser_form. */
export function normalizeNavigatorUrl(raw: unknown): string | null {
  return normalizeFormUrl(raw);
}

export { isBlockedHost };

// ─── Gate de pagamento ───────────────────────────────────────────────────
/** Espelhado em navd.py (PAYMENT_KEYWORDS). Minúsculas, sem acento. */
export const PAYMENT_KEYWORDS = [
  "pagar", "pague", "pagamento", "pagar agora", "finalizar compra", "finalizar pedido",
  "concluir compra", "concluir pedido", "confirmar compra", "confirmar pedido",
  "confirmar pagamento", "fechar pedido", "efetuar pagamento", "comprar", "compre agora",
  "comprar agora", "assinar", "assine", "contratar", "doar", "gerar boleto", "pagar com pix",
  "pay", "pay now", "place order", "place your order", "buy", "buy now", "purchase",
  "checkout", "check out", "complete order", "complete purchase", "confirm order",
  "confirm purchase", "confirm payment", "submit order", "subscribe", "donate", "order now",
] as const;

/** Espelhado em navd.py (CHECKOUT_URL_HINTS). */
export const CHECKOUT_URL_HINTS = ["checkout", "payment", "pagamento", "carrinho/finalizar", "pay", "billing", "cart/confirm"] as const;

/** Em página de checkout, estes rótulos também confirmam o pedido ("Finish", "Continuar"). Espelhado em navd.py. */
export const CHECKOUT_CONFIRM_WORDS = ["finish", "finalizar", "concluir", "confirmar", "confirm", "continuar", "continue", "submit", "enviar", "place"] as const;

/** Ações do browser-use que passam pelo gate (espelhado em navd.py). */
export const GATED_ACTIONS = ["click", "send_keys", "select_dropdown", "input"] as const;

export function normalizeText(text: unknown): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const wordRe = (kw: string) => new RegExp(`(?<![a-z0-9])${escapeRe(kw)}(?![a-z0-9])`);

/** Primeira palavra-chave de pagamento no texto (rótulo, aria-label, value…), ou null. */
export function paymentKeyword(text: unknown): string | null {
  const norm = normalizeText(text);
  if (!norm) return null;
  return PAYMENT_KEYWORDS.find((kw) => wordRe(kw).test(norm)) ?? null;
}

export function looksLikeCheckout(url: unknown, title: unknown = ""): boolean {
  const hay = normalizeText(`${url ?? ""} ${title ?? ""}`);
  return CHECKOUT_URL_HINTS.some((h) => wordRe(h).test(hay));
}

/**
 * Motivo para pedir aprovação antes da ação, ou null se ela pode seguir.
 * click/select_dropdown: texto do alvo com palavra de pagamento; numa página de
 * checkout, também "Finish", "Continuar", "Confirmar"…
 * send_keys: Enter numa página de checkout. input: nunca (digitar não paga).
 */
export function needsPaymentApproval(action: string, targetText: unknown, url: unknown = "", title: unknown = "", keys: unknown = ""): string | null {
  if (!(GATED_ACTIONS as readonly string[]).includes(action)) return null;
  if (action === "send_keys") {
    return /enter|return/i.test(String(keys ?? "")) && looksLikeCheckout(url, title) ? "enter_on_checkout" : null;
  }
  if (action === "input") return null;
  const kw = paymentKeyword(targetText);
  if (kw) return kw;
  if (looksLikeCheckout(url, title)) {
    const norm = normalizeText(targetText);
    const w = CHECKOUT_CONFIRM_WORDS.find((word) => wordRe(word).test(norm));
    if (w) return `checkout:${w}`;
  }
  return null;
}

// ─── Segredos (fill_secret) ──────────────────────────────────────────────
/**
 * O segredo do cofre (bound_to é um slug: "github", "github-com", "app-vertal-dev")
 * pode ser digitado nesta página? Casa o host exato, um domínio-pai, ou o rótulo
 * registrável ("github" → github.com, api.github.com). Sem bound_to: nunca.
 */
export function secretMatchesHost(boundTo: unknown, host: unknown): boolean {
  if (typeof boundTo !== "string" || !boundTo) return false;
  const slug = boundTo.toLowerCase();
  const h = String(host ?? "").toLowerCase().replace(/\.$/, "");
  if (!h || isBlockedHost(h)) return false;
  const labels = h.split(".");
  const dotted = slug.replace(/-/g, ".");
  for (let i = 0; i < labels.length - 1; i++) {
    if (labels.slice(i).join(".") === dotted) return true;
  }
  return labels.length >= 2 && labels[labels.length - 2] === slug;
}

/**
 * Segredo que não é identificador (usuário, e-mail, login, CPF…) só pode ser
 * digitado num <input type="password">, cujo valor o agente nunca vê. Espelhado em navd.py.
 */
export function secretNeedsPasswordField(name: unknown): boolean {
  return !/(USER|EMAIL|LOGIN|ACCOUNT|CPF|CNPJ|PHONE)/.test(String(name ?? "").toUpperCase());
}

export interface VaultSecretMeta {
  id: string;
  owner_id: string;
  env_key: string;
  bound_to: string | null;
  role: "owner" | "grant";
}

/** Escolhe o segredo pedido pelo agente: precisa existir, ser visível e casar com o host. Dono vence convidado. */
export function pickSecretForHost(secrets: VaultSecretMeta[], name: unknown, host: unknown): VaultSecretMeta | null {
  const key = String(name ?? "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(key)) return null;
  const matches = secrets.filter((s) => s.env_key === key && secretMatchesHost(s.bound_to, host));
  return matches.find((s) => s.role === "owner") ?? matches[0] ?? null;
}

// ─── Validação das rotas ─────────────────────────────────────────────────
export type ParsedNavigator<T> = { ok: true; data: T } | { ok: false; status: Exclude<NavigatorStatus, "ok">; detail?: string };

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_ID_RE = /^[a-f0-9]{8,32}$/;

export const isSessionId = (v: unknown): v is string => typeof v === "string" && SESSION_ID_RE.test(v);

export function parseStartBody(body: Record<string, unknown>): ParsedNavigator<{ url?: string }> {
  if (body.url === undefined || body.url === null || body.url === "") return { ok: true, data: {} };
  const url = normalizeNavigatorUrl(body.url);
  return url ? { ok: true, data: { url } } : { ok: false, status: "blocked_url" };
}

export interface TaskInput {
  sessionId: string;
  task: string;
  url?: string;
  maxSteps: number;
}

export function parseTaskBody(body: Record<string, unknown>): ParsedNavigator<TaskInput> {
  if (!isSessionId(body.sessionId)) return { ok: false, status: "bad_request", detail: "session_id" };
  const task = typeof body.task === "string" ? body.task.trim() : "";
  if (task.length < 3) return { ok: false, status: "bad_request", detail: "task" };
  if (task.length > NAVIGATOR_LIMITS.maxTaskChars) return { ok: false, status: "bad_request", detail: "task_too_long" };
  let url: string | undefined;
  if (body.url !== undefined && body.url !== null && body.url !== "") {
    const u = normalizeNavigatorUrl(body.url);
    if (!u) return { ok: false, status: "blocked_url" };
    url = u;
  }
  const raw = Number(body.maxSteps ?? NAVIGATOR_LIMITS.defaultMaxSteps);
  const maxSteps = Number.isFinite(raw) ? Math.max(1, Math.min(Math.round(raw), NAVIGATOR_LIMITS.maxStepsCap)) : NAVIGATOR_LIMITS.defaultMaxSteps;
  return { ok: true, data: { sessionId: body.sessionId, task, ...(url ? { url } : {}), maxSteps } };
}

export type InputBody =
  | { sessionId: string; requestId: string; kind: "approval"; approve: boolean }
  | { sessionId: string; requestId: string; kind: "code" | "text"; value: string };

/**
 * Resposta do usuário a um pedido do agente. Aprovação de pagamento só vale com
 * `confirmed: true` (vem do clique no cartão, nunca do modelo). Segredos nunca
 * passam por aqui: o Worker os busca no cofre.
 */
export function parseInputBody(body: Record<string, unknown>): ParsedNavigator<InputBody> {
  if (!isSessionId(body.sessionId)) return { ok: false, status: "bad_request", detail: "session_id" };
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  if (!REQUEST_ID_RE.test(requestId)) return { ok: false, status: "bad_request", detail: "request_id" };
  if (body.kind === "approval") {
    if (typeof body.approve !== "boolean") return { ok: false, status: "bad_request", detail: "approve" };
    if (body.approve && body.confirmed !== true) return { ok: false, status: "bad_request", detail: "confirmation_required" };
    return { ok: true, data: { sessionId: body.sessionId, requestId, kind: "approval", approve: body.approve } };
  }
  if (body.kind === "code" || body.kind === "text") {
    const value = typeof body.value === "string" ? body.value.trim() : "";
    if (!value || value.length > NAVIGATOR_LIMITS.maxInputChars) return { ok: false, status: "bad_request", detail: "value" };
    if (body.kind === "code" && !/^[A-Za-z0-9 -]{3,32}$/.test(value)) return { ok: false, status: "bad_request", detail: "code_format" };
    return { ok: true, data: { sessionId: body.sessionId, requestId, kind: body.kind, value } };
  }
  return { ok: false, status: "bad_request", detail: "kind" };
}

export function parseSessionBody(body: Record<string, unknown>): ParsedNavigator<{ sessionId: string; after: number }> {
  if (!isSessionId(body.sessionId)) return { ok: false, status: "bad_request", detail: "session_id" };
  const after = Number(body.after ?? 0);
  return { ok: true, data: { sessionId: body.sessionId, after: Number.isFinite(after) && after > 0 ? Math.floor(after) : 0 } };
}

// ─── Eventos do sandbox → cliente ────────────────────────────────────────
export interface NavigatorEvent {
  seq: number;
  ts: number;
  type: string;
  [key: string]: unknown;
}

export interface NavigatorPending {
  id: string;
  kind: "approval" | "code" | "text" | "secret";
  question?: string;
  action?: string;
  target?: string;
  url?: string;
  reason?: string;
  name?: string;
  host?: string;
}

const FORBIDDEN_EVENT_KEYS = new Set(["value", "password", "secret", "token", "apiKey", "api_key", "code"]);

/** Tira de cada evento qualquer campo que possa carregar valor sensível (defesa em profundidade). */
export function sanitizeEvents(events: unknown): NavigatorEvent[] {
  if (!Array.isArray(events)) return [];
  return events
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && typeof (e as NavigatorEvent).seq === "number")
    .slice(-100)
    .map((e) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(e)) {
        if (FORBIDDEN_EVENT_KEYS.has(k)) continue;
        out[k] = typeof v === "string" ? v.slice(0, 4_000) : v;
      }
      return out as NavigatorEvent;
    });
}

/** Pedidos que o usuário vê (segredos são resolvidos pelo Worker e só aparecem como aviso). */
export function sanitizePending(pending: unknown): NavigatorPending[] {
  if (!Array.isArray(pending)) return [];
  const kinds = new Set(["approval", "code", "text", "secret"]);
  return pending
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && kinds.has(String((p as NavigatorPending).kind)) && REQUEST_ID_RE.test(String((p as NavigatorPending).id)))
    .map((p) => {
      const out: NavigatorPending = { id: String(p.id), kind: p.kind as NavigatorPending["kind"] };
      for (const k of ["question", "action", "target", "url", "reason", "name", "host"] as const) {
        if (typeof p[k] === "string") out[k] = String(p[k]).slice(0, 400);
      }
      return out;
    });
}

// ─── Cobrança por minuto ─────────────────────────────────────────────────
/**
 * Minutos a cobrar agora. A sessão é pré-paga: o minuto N é cobrado assim que
 * começa. `billedMinutes` já cobrados desde `startedAt`; o tempo para em
 * `endAt` (fim/expiração), se houver.
 */
export function minutesDue(startedAtMs: number, billedMinutes: number, nowMs: number, endAtMs?: number | null, maxMinutes: number = NAVIGATOR_LIMITS.maxSessionMinutes): number {
  const until = endAtMs ? Math.min(nowMs, endAtMs) : nowMs;
  const elapsed = Math.max(0, until - startedAtMs);
  const owed = Math.min(maxMinutes, Math.floor(elapsed / 60_000) + 1);
  return Math.max(0, owed - Math.max(0, billedMinutes));
}

// ─── Tela ao vivo (noVNC) ────────────────────────────────────────────────
export function sandboxHost(port: number, sandboxId: string, domain: string): string {
  return `${port}-${sandboxId}.${domain}`;
}

/**
 * URL do noVNC no sandbox. A senha vai no fragmento (#), que o navegador não
 * envia ao servidor. view_only é só a interface: o x11vnc aplica de verdade
 * (senha de ver ≠ senha de controlar).
 */
export function liveViewUrl(sandboxId: string, domain: string, password: string, control: boolean): string {
  const host = sandboxHost(6080, sandboxId, domain);
  const view = control ? "0" : "1";
  return `https://${host}/vnc.html?autoconnect=1&resize=scale&reconnect=1&show_dot=1&view_only=${view}#password=${encodeURIComponent(password)}`;
}

export const VNC_PASSWORD_RE = /^[A-Za-z0-9]{8}$/;

// ─── Chat: quando oferecer a ferramenta ──────────────────────────────────
const NAVIGATOR_HINTS = /\b(naveg(ue|ar|ador)|entr(e|ar) no site|acess(e|ar) (o )?(site|portal|minha conta)|fa(ç|c)a login|logar|loga(r)? no|abr(a|ir) o site|no site d[oa]|pesquis(e|ar) no site|vertal navigator|browse|log ?in to)\b/i;

/** A conversa recente pede para operar um site (login, navegar, pesquisar dentro dele)? */
export function wantsNavigator(recent: Array<string | { content?: unknown; summary?: unknown; tool?: unknown }>, lookback = 8): boolean {
  return recent.slice(-lookback).some((m) => {
    if (typeof m === "string") return NAVIGATOR_HINTS.test(m);
    if (m && typeof m === "object") {
      if (m.tool === "navigator") return true;
      return NAVIGATOR_HINTS.test(String(m.content ?? "")) || NAVIGATOR_HINTS.test(String(m.summary ?? ""));
    }
    return false;
  });
}
