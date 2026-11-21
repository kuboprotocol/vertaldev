// Núcleo puro da coleta web com Scrapling (Vertal Chat, Vibe Code e Navigator).
//
// Sem APIs do Deno/DOM: roda no Worker do vertal.dev (/api/scrape/*), no front-end
// (Vitest) e nas edge functions. Tudo que decide "pode ou não pode" mora aqui:
//   * tabela de créditos (preço Scrapling = serviço vigente equivalente × 1,45, para cima);
//   * limites (páginas por tarefa, profundidade, rate limit por domínio e por usuário);
//   * robots.txt (respeitado por padrão; parser próprio, testado);
//   * validação dos corpos das rotas e da ferramenta do agente;
//   * mascaramento de dados pessoais (sem coleta de dados pessoais em massa);
//   * diff dos monitores e detecção de captcha/desafio anti-bot (NUNCA resolvido).
//
// A lista CAPTCHA_MARKERS tem espelho em Python no daemon do sandbox
// (infra/vertal-browser/navd.py). O teste scrapeCore.test.ts confere as duas.
// Licença do Scrapling: BSD-3-Clause (ver docs/VERTAL_SCRAPLING.md e THIRD_PARTY_NOTICES.md).
import { BROWSER_FORM_LIMITS, normalizeFormUrl } from "./browserForm.ts";
import { NAVIGATOR_LIMITS } from "./navigatorCore.ts";

// ─── Créditos ────────────────────────────────────────────────────────────

/** Multiplicador sobre o serviço vigente equivalente (45% mais caro). */
export const SCRAPLING_MARKUP_PERCENT = 145;

/** Preço Scrapling: atual × 1,45 arredondado para cima (conta inteira, sem erro de ponto flutuante). */
export function scraplingPrice(baseCredits: number): number {
  const base = Math.max(0, Math.floor(baseCredits));
  return Math.floor((base * SCRAPLING_MARKUP_PERCENT + 99) / 100);
}

/**
 * Serviços vigentes da Vertal Dev usados como base. Os valores vêm do código:
 *   chat_action        → LOCAL_CREDIT_COSTS.chatMessage (src/lib/anywhereConfig.ts), OFFICE_AI_CREDIT_COST (officeAi.ts),
 *                        TOOL_COSTS image/document/… (chatAgent.ts) e CHAT_COST (creative-groq): 1 crédito.
 *   cloud_build        → CLOUD_CREDIT_COSTS.build (src/lib/anywhereConfig.ts): 2 créditos.
 *   browser_form_submit→ BROWSER_FORM_LIMITS.submitCredits (browserForm.ts, = "Agent run"): 4 créditos.
 *   navigator_minute   → NAVIGATOR_LIMITS.creditsPerMinute (navigatorCore.ts): 1 crédito/min.
 * O teste scrapeCore.test.ts confere que estes números são os mesmos das fontes.
 */
export const SCRAPE_BASE_SERVICES = {
  chat_action: { label: "Ação de IA no Vertal Chat (mensagem, Office AI, imagem/documento)", credits: 1 },
  cloud_build: { label: "Vertal Cloud — build (container na nuvem por operação)", credits: 2 },
  browser_form_submit: { label: "Navegador na nuvem — envio de formulário (= Agent run)", credits: BROWSER_FORM_LIMITS.submitCredits },
  navigator_minute: { label: "Vertal Navigator — 1 minuto de navegador", credits: NAVIGATOR_LIMITS.creditsPerMinute },
} as const;
export type ScrapeBaseService = keyof typeof SCRAPE_BASE_SERVICES;

export const SCRAPE_MODES = ["fetch", "dynamic", "stealth"] as const;
export type ScrapeMode = (typeof SCRAPE_MODES)[number];

export type ScrapePriceKey =
  | "scrape_fetch" | "scrape_dynamic" | "scrape_stealth"
  | "crawl_fetch" | "crawl_dynamic"
  | "monitor_fetch" | "monitor_dynamic" | "monitor_stealth"
  | "monitor_create" | "monitor_alert";

export interface ScrapePriceRow {
  key: ScrapePriceKey;
  service: string;
  unit: string;
  base: ScrapeBaseService | null;
  baseCredits: number;
  credits: number;
}

const row = (key: ScrapePriceKey, service: string, unit: string, base: ScrapeBaseService | null): ScrapePriceRow => {
  const baseCredits = base ? SCRAPE_BASE_SERVICES[base].credits : 0;
  return { key, service, unit, base, baseCredits, credits: scraplingPrice(baseCredits) };
};

/** Tabela completa (mostrada na página de preços, no cartão do chat e no painel Monitores). */
export const SCRAPE_PRICE_TABLE: readonly ScrapePriceRow[] = [
  row("scrape_fetch", "scrape_page — HTTP simples (sem navegador)", "por página", "chat_action"),
  row("scrape_dynamic", "scrape_page — dinâmico (Chromium, JavaScript)", "por página", "cloud_build"),
  row("scrape_stealth", "scrape_page — stealth (navegador com impressão digital real)", "por página", "browser_form_submit"),
  row("crawl_fetch", "crawl_site — HTTP simples", "por página visitada", "navigator_minute"),
  row("crawl_dynamic", "crawl_site — dinâmico", "por página visitada", "cloud_build"),
  row("monitor_fetch", "monitor_page — verificação HTTP simples", "por verificação", "navigator_minute"),
  row("monitor_dynamic", "monitor_page — verificação dinâmica", "por verificação", "cloud_build"),
  row("monitor_stealth", "monitor_page — verificação stealth", "por verificação", "browser_form_submit"),
  row("monitor_create", "monitor_page — criar, pausar, excluir", "por ação", null),
  row("monitor_alert", "Alerta de mudança no chat", "por alerta", null),
];

export function scrapePrice(key: ScrapePriceKey): number {
  return SCRAPE_PRICE_TABLE.find((r) => r.key === key)?.credits ?? 0;
}

export function pagePriceKey(tool: "scrape" | "crawl" | "monitor", mode: ScrapeMode): ScrapePriceKey {
  if (tool === "crawl") return mode === "fetch" ? "crawl_fetch" : "crawl_dynamic";
  return `${tool}_${mode}` as ScrapePriceKey;
}

/** Custo máximo antes de rodar (checagem de saldo) e custo real depois (só páginas obtidas). */
export function scrapeCost(tool: "scrape" | "crawl" | "monitor", mode: ScrapeMode, pages: number): number {
  return scrapePrice(pagePriceKey(tool, mode)) * Math.max(0, Math.floor(pages));
}

// ─── Limites ─────────────────────────────────────────────────────────────

export const SCRAPE_LIMITS = {
  maxUrlsPerScrape: 5,
  maxSelectors: 10,
  maxSelectorChars: 300,
  maxItemsPerSelector: 50,
  maxValueChars: 500,
  maxTextChars: 4_000,
  /** Páginas por tarefa de crawl (teto duro). */
  maxPagesPerTask: 25,
  defaultCrawlPages: 10,
  maxDepth: 3,
  defaultDepth: 1,
  /** Rate limit por usuário (todas as rotas de coleta): páginas e tarefas por 10 min. */
  userPagesPer10Min: 60,
  userTasksPer10Min: 20,
  /** Rate limit por domínio (todas as contas): páginas por minuto. */
  domainPagesPerMinute: 20,
  /** Intervalo mínimo entre duas páginas do MESMO domínio dentro de uma tarefa (navd). */
  domainMinIntervalMs: 1_500,
  /** Crawl-delay do robots.txt acima disso: a tarefa recusa o domínio. */
  maxCrawlDelaySeconds: 10,
  maxMonitorsPerUser: 20,
  monitorFrequencies: [60, 180, 360, 720, 1440] as readonly number[],
  maxMonitorValueChars: 2_000,
  maxMonitorsPerCron: 25,
  /** Tempo máximo de uma tarefa no sandbox. */
  taskTimeoutMs: 100_000,
  maxBodyBytes: 32_000,
  /** Sandboxes de coleta simultâneos (todas as contas). Sobrescrito por SCRAPE_MAX_SANDBOXES. */
  maxConcurrentSandboxes: 2,
  robotsCacheMs: 60 * 60_000,
  robotsTimeoutMs: 5_000,
  maxRobotsBytes: 500_000,
} as const;

/** User-Agent honesto em todas as requisições (identifica o robô e respeita robots.txt). */
export const SCRAPE_USER_AGENT = "VertalBot/1.0 (+https://vertal.dev/docs/scrapling; Scrapling)";
/** Token usado para casar grupos do robots.txt. */
export const SCRAPE_ROBOTS_AGENT = "vertalbot";

// ─── Rate limit (janela deslizante, relógio injetável) ───────────────────

export interface WindowLimiter {
  /** Consome `n` unidades se couberem na janela; senão não consome nada. */
  take(key: string, n?: number, now?: number): boolean;
  remaining(key: string, now?: number): number;
}

export function createWindowLimiter(limit: number, windowMs: number, maxKeys = 5_000): WindowLimiter {
  const hits = new Map<string, number[]>();
  const recent = (key: string, now: number) => (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  return {
    take(key, n = 1, now = Date.now()) {
      const list = recent(key, now);
      if (n <= 0) return true;
      if (list.length + n > limit) {
        hits.set(key, list);
        return false;
      }
      for (let i = 0; i < n; i++) list.push(now);
      hits.delete(key);
      hits.set(key, list);
      if (hits.size > maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      return true;
    },
    remaining(key, now = Date.now()) {
      return Math.max(0, limit - recent(key, now).length);
    },
  };
}

/**
 * Decisão de rate limit com as contagens do banco (vale entre isolates): páginas do
 * usuário nos últimos 10 min e páginas do domínio no último minuto.
 */
export function rateLimitDecision(input: { userPages10m: number; userTasks10m: number; domainPages1m: Record<string, number>; wantPages: number; hosts: string[] }):
  { ok: true } | { ok: false; reason: "user_pages" | "user_tasks" | "domain"; host?: string } {
  if (input.userTasks10m + 1 > SCRAPE_LIMITS.userTasksPer10Min) return { ok: false, reason: "user_tasks" };
  if (input.userPages10m + input.wantPages > SCRAPE_LIMITS.userPagesPer10Min) return { ok: false, reason: "user_pages" };
  for (const host of input.hosts) {
    if ((input.domainPages1m[host] ?? 0) + 1 > SCRAPE_LIMITS.domainPagesPerMinute) return { ok: false, reason: "domain", host };
  }
  return { ok: true };
}

// ─── robots.txt ──────────────────────────────────────────────────────────

interface RobotsRule { allow: boolean; pattern: string }
interface RobotsGroup { agents: string[]; rules: RobotsRule[]; crawlDelay?: number }
export interface RobotsPolicy { groups: RobotsGroup[]; disallowAll?: boolean }

/** Lê um robots.txt (RFC 9309 + Crawl-delay). */
export function parseRobots(text: string): RobotsPolicy {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const rawLine of String(text ?? "").slice(0, SCRAPE_LIMITS.maxRobotsBytes).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow" || key === "disallow") {
      if (key === "disallow" && value === "") continue; // "Disallow:" vazio = tudo liberado
      current.rules.push({ allow: key === "allow", pattern: value });
    } else if (key === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
    }
  }
  return { groups };
}

/** Grupo que vale para o robô: o mais específico que casa com o token; senão "*". */
function groupFor(policy: RobotsPolicy, agent: string): RobotsGroup | null {
  const token = agent.toLowerCase();
  const specific = policy.groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  if (specific.length) {
    return { agents: [token], rules: specific.flatMap((g) => g.rules), crawlDelay: specific.find((g) => g.crawlDelay !== undefined)?.crawlDelay };
  }
  const star = policy.groups.filter((g) => g.agents.includes("*"));
  if (!star.length) return null;
  return { agents: ["*"], rules: star.flatMap((g) => g.rules), crawlDelay: star.find((g) => g.crawlDelay !== undefined)?.crawlDelay };
}

function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp("^" + body.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : ""));
  return re.test(path);
}

/** Caminho liberado? Regra mais longa vence; empate favorece Allow. /robots.txt sempre liberado. */
export function isAllowedByRobots(policy: RobotsPolicy | null, pathWithQuery: string, agent = SCRAPE_ROBOTS_AGENT): boolean {
  if (!policy) return true;
  if (policy.disallowAll) return false;
  const path = pathWithQuery || "/";
  if (path === "/robots.txt") return true;
  const group = groupFor(policy, agent);
  if (!group) return true;
  let best: RobotsRule | null = null;
  for (const rule of group.rules) {
    if (!patternMatches(rule.pattern, path)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)) best = rule;
  }
  return best ? best.allow : true;
}

export function robotsCrawlDelay(policy: RobotsPolicy | null, agent = SCRAPE_ROBOTS_AGENT): number {
  return policy ? groupFor(policy, agent)?.crawlDelay ?? 0 : 0;
}

/**
 * Política a partir da resposta HTTP do robots.txt (convenção do Google, conservadora):
 * 2xx = regras; 4xx = sem restrição; 5xx/erro de rede = tudo bloqueado.
 */
export function robotsFromResponse(status: number | null, body: string): RobotsPolicy {
  if (status === null || status >= 500) return { groups: [], disallowAll: true };
  if (status >= 400) return { groups: [] };
  return parseRobots(body);
}

// ─── Validação dos pedidos ───────────────────────────────────────────────

export interface ScrapeSelector {
  name: string;
  css?: string;
  xpath?: string;
  /** Atributo a ler (href, src, content…). Vazio = texto. */
  attr?: string;
  /** true = todos os elementos (até maxItemsPerSelector); false = o primeiro. */
  all?: boolean;
}

export interface ScrapeRequest {
  urls: string[];
  mode: ScrapeMode;
  selectors: ScrapeSelector[];
  /** Extração adaptativa: se o seletor não achar nada, relocaliza pelo "fingerprint" salvo. */
  adaptive: boolean;
  /** Fingerprints salvos (monitores), por nome do seletor. */
  fingerprints?: Record<string, unknown>;
  /** Texto da página junto (resumo). */
  includeText: boolean;
}

export interface CrawlRequest extends Omit<ScrapeRequest, "urls"> {
  url: string;
  maxPages: number;
  maxDepth: number;
  /** Só URLs cujo caminho contenha este trecho (opcional). */
  pathPrefix?: string;
}

export type ScrapeParse<T> = { ok: true; data: T } | { ok: false; status: "bad_request" | "blocked_url" | "personal_data"; detail?: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function normalizeScrapeUrl(raw: unknown): string | null {
  return normalizeFormUrl(raw);
}

export function parseMode(raw: unknown, fallback: ScrapeMode = "fetch"): ScrapeMode | null {
  if (raw === undefined || raw === null || raw === "") return fallback;
  return (SCRAPE_MODES as readonly string[]).includes(String(raw)) ? (raw as ScrapeMode) : null;
}

/** Seletores que miram contato pessoal em massa (mailto:, tel:, e-mail, CPF, telefone). */
const PERSONAL_SELECTOR_RE = /(mailto:|tel:|\bcpf\b|\be-?mail\b|telefone|celular|whatsapp|\bphone\b|\brg\b)/i;

export function parseSelectors(raw: unknown): { ok: true; selectors: ScrapeSelector[]; detail?: undefined; personal?: undefined } | { ok: false; detail: string; personal?: boolean; selectors?: undefined } {
  if (raw === undefined || raw === null) return { ok: true, selectors: [] };
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [{ name: "valor", css: raw }] : null;
  if (!list) return { ok: false, detail: "selectors" };
  if (list.length > SCRAPE_LIMITS.maxSelectors) return { ok: false, detail: "too_many_selectors" };
  const out: ScrapeSelector[] = [];
  for (const [i, item] of list.entries()) {
    const s = typeof item === "string" ? { css: item } : item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    if (!s) return { ok: false, detail: "selector" };
    const css = str(s.css, SCRAPE_LIMITS.maxSelectorChars);
    const xpath = str(s.xpath, SCRAPE_LIMITS.maxSelectorChars);
    if (!css && !xpath) return { ok: false, detail: "selector_empty" };
    const name = str(s.name, 40).replace(/[^\p{L}\p{N} _.-]/gu, "") || `campo${i + 1}`;
    const attr = str(s.attr, 40).replace(/[^a-zA-Z0-9_:-]/g, "");
    if (PERSONAL_SELECTOR_RE.test(`${name} ${css} ${xpath} ${attr}`)) return { ok: false, detail: "personal_data", personal: true };
    out.push({ name, ...(css ? { css } : {}), ...(xpath ? { xpath } : {}), ...(attr ? { attr } : {}), all: s.all === true });
  }
  return { ok: true, selectors: out };
}

export function parseScrapeBody(body: Record<string, unknown>): ScrapeParse<ScrapeRequest> {
  const rawUrls = Array.isArray(body.urls) ? body.urls : body.url !== undefined ? [body.url] : [];
  if (!rawUrls.length || rawUrls.length > SCRAPE_LIMITS.maxUrlsPerScrape) return { ok: false, status: "bad_request", detail: "urls" };
  const urls: string[] = [];
  for (const u of rawUrls) {
    const n = normalizeScrapeUrl(u);
    if (!n) return { ok: false, status: "blocked_url" };
    if (!urls.includes(n)) urls.push(n);
  }
  const mode = parseMode(body.mode);
  if (!mode) return { ok: false, status: "bad_request", detail: "mode" };
  const sel = parseSelectors(body.selectors ?? body.selector);
  if (!sel.ok) return { ok: false, status: sel.personal ? "personal_data" : "bad_request", detail: sel.detail };
  return {
    ok: true,
    data: { urls, mode, selectors: sel.selectors, adaptive: body.adaptive !== false, includeText: body.includeText !== false || sel.selectors.length === 0 },
  };
}

export function parseCrawlBody(body: Record<string, unknown>): ScrapeParse<CrawlRequest> {
  const url = normalizeScrapeUrl(body.url);
  if (!url) return { ok: false, status: "blocked_url" };
  const mode = parseMode(body.mode);
  if (!mode) return { ok: false, status: "bad_request", detail: "mode" };
  // Crawl em modo stealth não existe: varrer um site inteiro com evasão de impressão digital é agressivo demais.
  if (mode === "stealth") return { ok: false, status: "bad_request", detail: "crawl_stealth" };
  const sel = parseSelectors(body.selectors ?? body.selector);
  if (!sel.ok) return { ok: false, status: sel.personal ? "personal_data" : "bad_request", detail: sel.detail };
  const intIn = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : def;
  };
  const pathPrefix = str(body.pathPrefix, 200);
  return {
    ok: true,
    data: {
      url, mode, selectors: sel.selectors, adaptive: body.adaptive !== false, includeText: body.includeText === true || sel.selectors.length === 0,
      maxPages: intIn(body.maxPages, SCRAPE_LIMITS.defaultCrawlPages, 1, SCRAPE_LIMITS.maxPagesPerTask),
      maxDepth: intIn(body.maxDepth, SCRAPE_LIMITS.defaultDepth, 0, SCRAPE_LIMITS.maxDepth),
      ...(pathPrefix.startsWith("/") ? { pathPrefix } : {}),
    },
  };
}

export interface MonitorInput {
  name: string;
  url: string;
  selector: ScrapeSelector;
  mode: ScrapeMode;
  frequencyMinutes: number;
}

export function parseMonitorBody(body: Record<string, unknown>): ScrapeParse<MonitorInput> {
  const url = normalizeScrapeUrl(body.url);
  if (!url) return { ok: false, status: "blocked_url" };
  const mode = parseMode(body.mode);
  if (!mode) return { ok: false, status: "bad_request", detail: "mode" };
  const rawSel = body.selector && typeof body.selector === "object"
    ? body.selector
    : { name: "valor", [body.selectorType === "xpath" ? "xpath" : "css"]: body.selector };
  const sel = parseSelectors([rawSel]);
  if (!sel.ok) return { ok: false, status: sel.personal ? "personal_data" : "bad_request", detail: sel.detail };
  const freq = Number(body.frequencyMinutes ?? 1440);
  if (!SCRAPE_LIMITS.monitorFrequencies.includes(freq)) return { ok: false, status: "bad_request", detail: "frequency" };
  let name = str(body.name, 80);
  if (!name) {
    try {
      name = new URL(url).hostname;
    } catch {
      name = "Monitor";
    }
  }
  return { ok: true, data: { name, url, selector: { ...sel.selectors[0], all: false }, mode, frequencyMinutes: freq } };
}

// ─── Dados pessoais ──────────────────────────────────────────────────────

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const PHONE_RE = /(?:\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g;

/** Mascara e-mails, CPFs e telefones em tudo que a coleta devolve (sem coleta de dados pessoais em massa). */
export function redactPersonalData(text: string): string {
  return String(text ?? "")
    .replace(EMAIL_RE, "[e-mail oculto]")
    .replace(CPF_RE, "[CPF oculto]")
    .replace(PHONE_RE, "[telefone oculto]");
}

// ─── Captcha / desafio anti-bot (detectar e PAUSAR; nunca resolver) ──────

/** Espelhado em navd.py (CAPTCHA_MARKERS). Minúsculas. */
export const CAPTCHA_MARKERS = [
  "g-recaptcha", "recaptcha/api", "hcaptcha.com", "h-captcha", "challenges.cloudflare.com", "cf-turnstile",
  "cf-chl-", "/cdn-cgi/challenge-platform", "verify you are human", "verifique que voce e humano",
  "i'm not a robot", "nao sou um robo", "attention required! | cloudflare", "just a moment...",
  "px-captcha", "datadome", "arkoselabs", "funcaptcha",
];

export function detectCaptcha(html: string, title = ""): string | null {
  const hay = `${title}\n${String(html ?? "").slice(0, 400_000)}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return CAPTCHA_MARKERS.find((m) => hay.includes(m)) ?? null;
}

// ─── Resultado e diff dos monitores ──────────────────────────────────────

export type ScrapeBlock = "robots" | "captcha" | "login" | "paywall" | "http_error" | "not_public" | "crawl_delay" | "timeout" | "error";

export interface ScrapePage {
  url: string;
  finalUrl?: string;
  status?: number;
  title?: string;
  blocked?: ScrapeBlock;
  items: Record<string, string[]>;
  relocated?: string[];
  text?: string;
  fingerprints?: Record<string, unknown>;
  depth?: number;
}

/** Limpa e limita o que veio do navd antes de devolver ao cliente (mascara dados pessoais). */
export function sanitizePages(raw: unknown, max: number): ScrapePage[] {
  if (!Array.isArray(raw)) return [];
  const blocks: ScrapeBlock[] = ["robots", "captcha", "login", "paywall", "http_error", "not_public", "crawl_delay", "timeout", "error"];
  return raw.slice(0, max).flatMap((p): ScrapePage[] => {
    if (!p || typeof p !== "object") return [];
    const r = p as Record<string, unknown>;
    const url = normalizeScrapeUrl(r.url);
    if (!url) return [];
    const items: Record<string, string[]> = {};
    if (r.items && typeof r.items === "object") {
      for (const [k, v] of Object.entries(r.items as Record<string, unknown>).slice(0, SCRAPE_LIMITS.maxSelectors)) {
        if (!Array.isArray(v)) continue;
        items[k.slice(0, 40)] = v.slice(0, SCRAPE_LIMITS.maxItemsPerSelector).map((x) => redactPersonalData(String(x ?? "")).slice(0, SCRAPE_LIMITS.maxValueChars));
      }
    }
    const blocked = blocks.includes(r.blocked as ScrapeBlock) ? (r.blocked as ScrapeBlock) : undefined;
    return [{
      url,
      ...(typeof r.finalUrl === "string" && normalizeScrapeUrl(r.finalUrl) ? { finalUrl: normalizeScrapeUrl(r.finalUrl)! } : {}),
      ...(typeof r.status === "number" ? { status: r.status } : {}),
      ...(typeof r.title === "string" ? { title: redactPersonalData(r.title).slice(0, 200) } : {}),
      ...(blocked ? { blocked } : {}),
      items,
      ...(Array.isArray(r.relocated) ? { relocated: r.relocated.filter((x) => typeof x === "string").slice(0, 10) as string[] } : {}),
      ...(typeof r.text === "string" ? { text: redactPersonalData(r.text).slice(0, SCRAPE_LIMITS.maxTextChars) } : {}),
      ...(r.fingerprints && typeof r.fingerprints === "object" && JSON.stringify(r.fingerprints).length < 8_000 ? { fingerprints: r.fingerprints as Record<string, unknown> } : {}),
      ...(typeof r.depth === "number" ? { depth: r.depth } : {}),
    }];
  });
}

/** Páginas cobradas: obtidas de verdade (sem bloqueio). */
export function billablePages(pages: ScrapePage[]): number {
  return pages.filter((p) => !p.blocked).length;
}

/** URLs que pararam num captcha: a tarefa pausa e o usuário resolve na tela ao vivo (Navigator). */
export function captchaUrls(pages: ScrapePage[]): string[] {
  return pages.filter((p) => p.blocked === "captcha").map((p) => p.url);
}

/** Número de um texto de preço/quantidade (R$ 1.234,56 · $1,234.56 · 1234). */
export function parseNumber(text: string): number | null {
  const m = /-?\d[\d.,\s]*/.exec(String(text ?? ""));
  if (!m) return null;
  let s = m[0].replace(/\s/g, "").replace(/[.,]+$/, "");
  const lc = s.lastIndexOf(",");
  const ld = s.lastIndexOf(".");
  if (lc >= 0 && ld >= 0) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lc >= 0) s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (ld >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // 1.234 = mil (padrão BR)
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function normalizeMonitorValue(v: string): string {
  return redactPersonalData(String(v ?? "")).replace(/\s+/g, " ").trim().slice(0, SCRAPE_LIMITS.maxMonitorValueChars);
}

export interface MonitorDiff {
  changed: boolean;
  before: string | null;
  after: string;
  numericBefore?: number;
  numericAfter?: number;
  deltaPct?: number;
  added: string[];
  removed: string[];
}

export function diffMonitorValue(before: string | null, afterRaw: string): MonitorDiff {
  const after = normalizeMonitorValue(afterRaw);
  const prev = before === null ? null : normalizeMonitorValue(before);
  const changed = prev !== null && prev !== after;
  const out: MonitorDiff = { changed, before: prev, after, added: [], removed: [] };
  if (!changed || prev === null) return out;
  const a = parseNumber(prev);
  const b = parseNumber(after);
  if (a !== null && b !== null) {
    out.numericBefore = a;
    out.numericAfter = b;
    if (a !== 0) out.deltaPct = Math.round(((b - a) / Math.abs(a)) * 10_000) / 100;
  }
  const words = (s: string) => new Set(s.split(/\s*[|\n]\s*|\s{2,}/).filter(Boolean));
  const wa = words(prev);
  const wb = words(after);
  out.added = [...wb].filter((w) => !wa.has(w)).slice(0, 10);
  out.removed = [...wa].filter((w) => !wb.has(w)).slice(0, 10);
  return out;
}

export function describeMonitorDiff(name: string, d: MonitorDiff): string {
  if (!d.changed) return `${name}: sem mudança.`;
  if (d.numericBefore !== undefined && d.numericAfter !== undefined) {
    const dir = d.numericAfter > d.numericBefore ? "subiu" : d.numericAfter < d.numericBefore ? "caiu" : "mudou";
    return `${name}: ${dir} de "${d.before}" para "${d.after}"${d.deltaPct !== undefined ? ` (${d.deltaPct > 0 ? "+" : ""}${d.deltaPct}%)` : ""}.`;
  }
  return `${name}: mudou de "${(d.before ?? "").slice(0, 120)}" para "${d.after.slice(0, 120)}".`;
}

/** Próxima verificação: agora + frequência (o cron roda a cada 15 min). */
export function nextCheckAt(now: number, frequencyMinutes: number): string {
  return new Date(now + frequencyMinutes * 60_000).toISOString();
}

export const SCRAPE_MESSAGES = {
  bad_request: "Pedido de coleta inválido.",
  blocked_url: "Esse endereço não pode ser coletado (só sites públicos em http/https).",
  personal_data: "Não coleto contatos ou dados pessoais em massa (e-mails, telefones, CPF).",
  robots: "O robots.txt do site não permite a coleta desta página. Respeito por padrão.",
  rate_limited: "Muitas coletas em pouco tempo (limite por usuário ou por site). Aguarde alguns minutos.",
  insufficient_credits: "Créditos insuficientes para esta coleta.",
  capacity: "A coleta na nuvem está ocupada agora. Tente em alguns minutos.",
  consent_required: "Antes do primeiro uso, leia e assine o termo de uso da coleta web.",
  prohibited: "Esse pedido não pode ser feito (quebrar captcha, burlar paywall/login ou acesso não autorizado é proibido).",
  not_configured: "A coleta web ainda não está configurada no servidor.",
  unauthorized: "Sua sessão expirou. Entre novamente.",
  monitor_limit: `Limite de ${SCRAPE_LIMITS.maxMonitorsPerUser} monitores por conta.`,
  not_found: "Monitor não encontrado.",
  sandbox_error: "O coletor na nuvem não respondeu. Tente de novo.",
  error: "Não consegui coletar agora.",
} as const;
export type ScrapeStatus = keyof typeof SCRAPE_MESSAGES | "ok";

// ─── Quando oferecer as ferramentas ao agente ────────────────────────────

const SCRAPE_TOPIC_RE = /(scrap|raspar|raspagem|coletar|coleta|extrair dados|extraia|crawl|varrer|monitor(ar|e|amento)|acompanhar (o )?pre[çc]o|pre[çc]os? d[oae]s? concorrent|concorr[êe]ncia|disponibilidade|estoque|avalia[çc][õo]es|reviews?|mudan[çc]as? (na|da|em) p[áa]gina|scrape_page|crawl_site|monitor_page)/i;

export function wantsScrape(messages: Array<{ content?: unknown; summary?: unknown }>): boolean {
  return messages.some((m) => SCRAPE_TOPIC_RE.test(String(m.content ?? m.summary ?? "")));
}

// ─── Navigator: Scrapling antes de abrir o Chromium ──────────────────────

const INTERACTIVE_TASK_RE = /(login|logar|entrar|entre (na|no|em)|minha conta|minhas? |meus? |senha|clic|preench|enviar|envie|comprar|compre|pagar|pague|cadastr|baixar|download|postar|publicar|navegador|2fa|c[oó]digo|assinar|responder|curtir|seguir)/i;
const READ_TASK_RE = /(\bler\b|\bleia\b|\bver\b|\bveja\b|quanto|\bqual\b|quais|pre[çc]o|resum|extra(ir|ia)|list(ar|e)|o que diz|t[íi]tulo|conte[uú]do|dispon[íi]vel|estoque|avalia[çc])/i;

/**
 * Tarefa do Navigator que só LÊ uma página pública (com URL): dá para tentar o Scrapling
 * (HTTP simples) antes de abrir o navegador na nuvem. Qualquer indício de interação,
 * login ou conta do usuário → vai direto para o navegador.
 */
export function scrapeFirstCandidate(task: string, url?: string): boolean {
  return !!url && READ_TASK_RE.test(task) && !INTERACTIVE_TASK_RE.test(task);
}
