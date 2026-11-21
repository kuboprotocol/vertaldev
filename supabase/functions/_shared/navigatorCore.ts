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
import { isTotpSecretName } from "./totp.ts";

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
  /** Teto do "aprovar automático até R$X" (fase 2): nem o usuário passa disso. Em centavos. */
  autoApproveMaxCentsCap: 100_000,
  /** Screenshot do cartão de aprovação (data URL JPEG). */
  maxApprovalScreenshotChars: 600_000,
  /** Texto da página enviado pelo navd para ler loja/itens/total (fica no servidor). */
  maxPageTextChars: 20_000,
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
  // Semente TOTP nunca é digitada num campo: só gera código (pickTotpForHost).
  if (isTotpSecretName(key)) return null;
  const matches = secrets.filter((s) => s.env_key === key && secretMatchesHost(s.bound_to, host));
  return matches.find((s) => s.role === "owner") ?? matches[0] ?? null;
}

/**
 * Semente TOTP (env_key terminando em _TOTP) vinculada ao site da página, para o
 * código 2FA ser gerado no servidor. Com `name`, só aquele segredo. Dono vence convidado.
 */
export function pickTotpForHost(secrets: VaultSecretMeta[], host: unknown, name?: unknown): VaultSecretMeta | null {
  const wanted = typeof name === "string" && name.trim() ? name.trim().toUpperCase() : null;
  const matches = secrets.filter((s) => isTotpSecretName(s.env_key) && (!wanted || s.env_key === wanted) && secretMatchesHost(s.bound_to, host));
  return matches.find((s) => s.role === "owner") ?? matches[0] ?? null;
}

export { isTotpSecretName };

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
  /** Fase 4: modelo pedido para esta tarefa (o Worker só aceita os da lista permitida). */
  model?: string;
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
  const model = typeof body.model === "string" && MODEL_ID_RE.test(body.model.trim()) ? body.model.trim() : undefined;
  return { ok: true, data: { sessionId: body.sessionId, task, ...(url ? { url } : {}), maxSteps, ...(model ? { model } : {}) } };
}

// ─── Fase 4: modelo por tarefa, enquadramento da tarefa, eventos da tarefa ───
const MODEL_ID_RE = /^[a-z0-9][a-z0-9._-]{0,60}(\/[a-z0-9][a-z0-9._:-]{0,80})?$/i;

/** Modelo padrão do agente do navegador (OpenRouter, com visão). */
export const NAVIGATOR_DEFAULT_MODEL = "google/gemini-3-flash-preview";

/**
 * Modelo da tarefa: o pedido só vale se estiver na lista permitida
 * (NAVIGATOR_ALLOWED_MODELS, separada por vírgula) ou for o próprio padrão.
 * Sem lista = sempre o padrão (nada muda para quem não configurou).
 */
export function pickNavigatorModel(requested: unknown, opts: { defaultModel?: string; allowed?: string; provider?: "openrouter" | "deepseek" } = {}): string {
  const fallback = opts.defaultModel || (opts.provider === "deepseek" ? "deepseek-flash" : NAVIGATOR_DEFAULT_MODEL);
  const want = typeof requested === "string" ? requested.trim() : "";
  if (!want || !MODEL_ID_RE.test(want)) return fallback;
  if (want === fallback) return fallback;
  const allowed = String(opts.allowed ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return allowed.includes(want) ? want : fallback;
}

/**
 * Instruções que vão junto da tarefa (fase 4, "mais inteligente"): planejar antes
 * de agir, ler a página com read_page_text e responder citando o que foi lido.
 * Curto de propósito (o prompt do browser-use já é grande).
 */
export function framedNavigatorTask(task: string, url?: string): string {
  // Sem URL, o navegador começa em branco: o agente precisa ABRIR um buscador e pesquisar.
  // Sem essa instrução explícita, ele podia responder sem navegar (bug: "não faz a busca").
  const head = url ? `Comece abrindo ${url}. ` : "Comece abrindo um buscador público (https://duckduckgo.com) e pesquise os termos da tarefa; abra os resultados antes de responder. ";
  return [
    `${head}${task}`,
    "",
    "Como trabalhar: 1) no 1º passo, escreva em next_goal um plano curto (2–4 etapas); 2) para ler respostas, use read_page_text (se não existir, a ação de extrair conteúdo) em vez de adivinhar pela imagem; 3) pode abrir outra aba se precisar comparar páginas e voltar depois; 4) não responda de memória: a resposta precisa vir do que você abriu e leu na página; 5) na resposta final (done), responda em português e cite entre aspas o trecho exato lido na página que comprova a resposta, com a URL.",
  ].join("\n");
}

/**
 * O evento "done" é desta tarefa? Com runId no evento (navd fase 4), compara o
 * runId; sem runId (navd antigo), só aceita eventos posteriores ao início da tarefa.
 * Evita mostrar a resposta de OUTRA conversa (bug: "You logged into a secure area!").
 */
export function isDoneForTask(ev: { type?: unknown; seq?: unknown; runId?: unknown }, task: { runId: string; baseSeq: number }): boolean {
  if (ev.type !== "done" || typeof ev.seq !== "number") return false;
  if (typeof ev.runId === "string" && ev.runId) return ev.runId === task.runId;
  return ev.seq > task.baseSeq;
}

/** Eventos desta tarefa (passos ao vivo do cartão no chat). */
export function eventsForTask<T extends { seq: number; runId?: unknown }>(events: T[], task: { runId: string | null; baseSeq: number } | null): T[] {
  if (!task) return [];
  return events.filter((e) => e.seq > task.baseSeq && (typeof e.runId !== "string" || !task.runId || e.runId === task.runId));
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
  kind: "approval" | "code" | "text" | "secret" | "totp";
  question?: string;
  action?: string;
  target?: string;
  url?: string;
  reason?: string;
  name?: string;
  host?: string;
  /** Aprovação de pagamento (fase 2): lidos da página pelo servidor. */
  store?: string;
  pageTitle?: string;
  total?: string;
  totalCents?: number;
  currency?: string;
  items?: string[];
  /** data:image/jpeg;base64,… capturado no momento do pedido. */
  screenshot?: string;
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
  const kinds = new Set(["approval", "code", "text", "secret", "totp"]);
  return pending
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && kinds.has(String((p as NavigatorPending).kind)) && REQUEST_ID_RE.test(String((p as NavigatorPending).id)))
    .map((p) => {
      const out: NavigatorPending = { id: String(p.id), kind: p.kind as NavigatorPending["kind"] };
      for (const k of ["question", "action", "target", "url", "reason", "name", "host", "store", "pageTitle", "total", "currency"] as const) {
        if (typeof p[k] === "string") out[k] = String(p[k]).slice(0, 400);
      }
      if (typeof p.totalCents === "number" && Number.isFinite(p.totalCents) && p.totalCents >= 0) out.totalCents = Math.round(p.totalCents);
      if (Array.isArray(p.items)) out.items = p.items.filter((i): i is string => typeof i === "string").slice(0, 10).map((i) => i.slice(0, 160));
      // Screenshot só no cartão de aprovação, só JPEG em data URL e com tamanho limitado.
      if (out.kind === "approval" && typeof p.screenshot === "string" && p.screenshot.startsWith("data:image/jpeg;base64,") && p.screenshot.length <= NAVIGATOR_LIMITS.maxApprovalScreenshotChars) {
        out.screenshot = p.screenshot;
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

// ─── Fase 2: resumo do checkout (cartão de aprovação) ────────────────────
export interface MoneyValue {
  /** Como apareceu na página ("R$ 1.234,56"). */
  text: string;
  cents: number;
  currency: "BRL" | "USD" | "EUR" | "GBP";
}

const MONEY_RE = /(R\$|US\$|\$|€|£)\s?(\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/g;

/** "1.234,56" (BR) ou "1,234.56" (US) → centavos. */
export function parseMoneyAmount(raw: string): number | null {
  const s = raw.replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastSep = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  let intPart = s;
  let frac = "";
  if (lastSep >= 0 && s.length - lastSep - 1 <= 2) {
    intPart = s.slice(0, lastSep);
    frac = s.slice(lastSep + 1);
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d+$/.test(intPart) || intPart.length > 9) return null;
  return Number(intPart) * 100 + Number((frac + "00").slice(0, 2));
}

const CURRENCY_OF: Record<string, MoneyValue["currency"]> = { "R$": "BRL", "US$": "USD", "$": "USD", "€": "EUR", "£": "GBP" };

/** Valores monetários de um trecho de texto, na ordem em que aparecem. */
export function findMoney(text: string): MoneyValue[] {
  const out: MoneyValue[] = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const cents = parseMoneyAmount(m[2]);
    if (cents === null) continue;
    out.push({ text: `${m[1]} ${m[2].trim()}`, cents, currency: CURRENCY_OF[m[1]] ?? "BRL" });
  }
  return out;
}

export function formatCents(cents: number, currency: MoneyValue["currency"] = "BRL"): string {
  const v = (cents / 100).toFixed(2);
  if (currency === "BRL") {
    const [i, f] = v.split(".");
    return `R$ ${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${f}`;
  }
  const sym = currency === "USD" ? "US$" : currency === "EUR" ? "€" : "£";
  return `${sym} ${v}`;
}

export interface CheckoutSummary {
  store: string;
  pageTitle: string;
  total: MoneyValue | null;
  /** "high": achou um rótulo de total ("Total do pedido", "Valor total"…); "low": palpite. */
  confidence: "high" | "low" | "none";
  items: string[];
}

/** Rótulos de total em ordem de preferência (minúsculas, sem acento). */
const TOTAL_LABELS = [
  "total do pedido", "total da compra", "valor total", "total a pagar", "total geral", "order total", "grand total",
  "total due", "amount due", "you pay", "voce paga", "total",
];
const NOT_ITEM = /\b(sub ?total|total|frete|entrega|shipping|delivery|desconto|discount|cupom|coupon|imposto|tax(es)?|taxa|juros|parcela|parcelas|em ate|x de|economize|saldo|cashback)\b/;

function storeFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Lê loja, itens e valor total do texto visível da página de checkout (heurística).
 * O valor só serve para o cartão e para o "aprovar automático" — que exige
 * confidence "high" e moeda BRL. Na dúvida, o usuário sempre decide.
 */
export function extractCheckoutSummary(pageText: unknown, title: unknown = "", url: unknown = ""): CheckoutSummary {
  const text = String(pageText ?? "").slice(0, NAVIGATOR_LIMITS.maxPageTextChars);
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const out: CheckoutSummary = { store: storeFromUrl(String(url ?? "")), pageTitle: String(title ?? "").slice(0, 200), total: null, confidence: "none", items: [] };

  // Total: o rótulo mais específico vence; entre linhas com o mesmo rótulo, a última (o total final costuma vir embaixo).
  let best: { rank: number; idx: number; money: MoneyValue } | null = null;
  lines.forEach((line, idx) => {
    const norm = normalizeText(line);
    if (/\bsub ?total\b/.test(norm) && !/\btotal (do|da|a|geral)\b/.test(norm)) return;
    const rank = TOTAL_LABELS.findIndex((l) => wordRe(l).test(norm));
    if (rank < 0) return;
    const money = findMoney(line).slice(-1)[0] ?? (lines[idx + 1] && findMoney(lines[idx + 1]).length === 1 && lines[idx + 1].length < 30 ? findMoney(lines[idx + 1])[0] : undefined);
    if (!money) return;
    if (!best || rank < best.rank || (rank === best.rank && idx > best.idx)) best = { rank, idx, money };
  });
  const found = best as { rank: number; idx: number; money: MoneyValue } | null;
  if (found) {
    out.total = found.money;
    out.confidence = "high";
  } else {
    const all = lines.flatMap((l) => findMoney(l));
    if (all.length) {
      out.total = all.reduce((a, b) => (b.cents > a.cents ? b : a));
      out.confidence = "low";
    }
  }

  // Itens: linhas com um valor e texto descritivo, sem rótulos de total/frete/desconto.
  for (const line of lines) {
    if (out.items.length >= 8) break;
    const money = findMoney(line);
    if (money.length !== 1) continue;
    const label = line.replace(MONEY_RE, "").replace(/[\s:–—-]+$/g, "").trim();
    if (label.length < 3 || label.length > 140 || NOT_ITEM.test(normalizeText(label))) continue;
    const item = `${label} — ${money[0].text}`;
    if (!out.items.includes(item)) out.items.push(item);
  }
  return out;
}

// ─── Fase 2: preferências (aprovar automático até R$X) ───────────────────
export interface NavigatorSettings {
  autoApproveEnabled: boolean;
  /** Em centavos de real. 0 = sempre pedir. */
  autoApproveMaxCents: number;
}

export const DEFAULT_NAVIGATOR_SETTINGS: NavigatorSettings = { autoApproveEnabled: false, autoApproveMaxCents: 0 };

export function parseSettingsBody(body: Record<string, unknown>): ParsedNavigator<NavigatorSettings> {
  const enabled = body.autoApproveEnabled;
  if (typeof enabled !== "boolean") return { ok: false, status: "bad_request", detail: "auto_approve_enabled" };
  const raw = Number(body.autoApproveMaxCents ?? 0);
  if (!Number.isFinite(raw) || raw < 0) return { ok: false, status: "bad_request", detail: "auto_approve_max" };
  const cents = Math.round(raw);
  if (cents > NAVIGATOR_LIMITS.autoApproveMaxCentsCap) return { ok: false, status: "bad_request", detail: "auto_approve_cap" };
  if (enabled && cents <= 0) return { ok: false, status: "bad_request", detail: "auto_approve_max" };
  // Ligar o automático exige o clique explícito do usuário na tela (como a aprovação).
  if (enabled && body.confirmed !== true) return { ok: false, status: "bad_request", detail: "confirmation_required" };
  return { ok: true, data: { autoApproveEnabled: enabled, autoApproveMaxCents: enabled ? cents : 0 } };
}

/**
 * O pedido de pagamento pode ser aprovado sem perguntar? Só se o usuário ligou o
 * automático, o total foi lido com confiança (rótulo de total na página), em reais,
 * e está dentro do limite. Qualquer dúvida = pedir ao usuário.
 */
export function autoApproveDecision(settings: NavigatorSettings | null | undefined, summary: Pick<CheckoutSummary, "total" | "confidence">): { auto: boolean; reason: string } {
  if (!settings?.autoApproveEnabled || settings.autoApproveMaxCents <= 0) return { auto: false, reason: "disabled" };
  if (!summary.total || summary.confidence !== "high") return { auto: false, reason: "total_unknown" };
  if (summary.total.currency !== "BRL") return { auto: false, reason: "currency" };
  const cap = Math.min(settings.autoApproveMaxCents, NAVIGATOR_LIMITS.autoApproveMaxCentsCap);
  if (summary.total.cents <= 0 || summary.total.cents > cap) return { auto: false, reason: "over_limit" };
  return { auto: true, reason: "within_limit" };
}

// ─── Fase 2: auditoria e aba "Atividade" ─────────────────────────────────
export const NAVIGATOR_AUDIT_KINDS = [
  "session_start", "session_end", "task", "secret_used", "totp_used", "code_entered", "approval_granted",
  "approval_denied", "auto_approved", "takeover", "release", "settings_changed", "totp_consent",
] as const;
export type NavigatorAuditKind = (typeof NAVIGATOR_AUDIT_KINDS)[number];

export interface NavigatorAuditRow {
  id?: string;
  session_id: string | null;
  kind: NavigatorAuditKind;
  detail: Record<string, unknown>;
  created_at: string;
}

const AUDIT_DETAIL_KEYS = ["task", "name", "host", "store", "total", "target", "url", "reason", "limit", "items", "end_reason", "minutes"] as const;

/** Detalhe de auditoria sem nada sensível: só chaves conhecidas, textos curtos, nunca valor de segredo. */
export function auditDetail(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of AUDIT_DETAIL_KEYS) {
    const v = raw[k];
    if (typeof v === "string") out[k] = v.slice(0, k === "task" ? 300 : 200);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (k === "items" && Array.isArray(v)) out[k] = v.filter((i) => typeof i === "string").slice(0, 8).map((i) => String(i).slice(0, 160));
  }
  return out;
}

/** Linha legível para a aba Atividade. */
export function describeAudit(row: Pick<NavigatorAuditRow, "kind" | "detail">): string {
  const d = row.detail ?? {};
  const s = (k: string) => (typeof d[k] === "string" ? String(d[k]) : "");
  switch (row.kind) {
    case "session_start": return "Navegador aberto";
    case "session_end": return `Navegador fechado${s("end_reason") ? ` (${s("end_reason")})` : ""}`;
    case "task": return `Tarefa: ${s("task")}`;
    case "secret_used": return `Segredo usado: ${s("name")}${s("host") ? ` em ${s("host")}` : ""}`;
    case "totp_used": return `Código 2FA gerado do cofre (${s("name")})${s("host") ? ` em ${s("host")}` : ""}`;
    case "code_entered": return `Você digitou um código de verificação${s("host") ? ` em ${s("host")}` : ""}`;
    case "approval_granted": return `Pagamento aprovado por você${s("store") ? ` em ${s("store")}` : ""}${s("total") ? ` · ${s("total")}` : ""}`;
    case "approval_denied": return `Pagamento recusado${s("store") ? ` em ${s("store")}` : ""}${s("total") ? ` · ${s("total")}` : ""}`;
    case "auto_approved": return `Pagamento aprovado automaticamente (até ${s("limit")})${s("store") ? ` em ${s("store")}` : ""}${s("total") ? ` · ${s("total")}` : ""}`;
    case "takeover": return "Você assumiu o controle";
    case "release": return "Controle devolvido ao agente";
    case "settings_changed": return s("limit") ? `Aprovação automática ligada até ${s("limit")}` : "Aprovação automática desligada (sempre pedir)";
    case "totp_consent": return `Autenticador (TOTP) guardado no cofre: ${s("name")} para ${s("host")}`;
    default: return row.kind;
  }
}
