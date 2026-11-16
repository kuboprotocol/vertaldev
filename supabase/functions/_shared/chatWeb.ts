// Vertal Chat: busca e leitura na web (Firecrawl), parte pura.
//
// Módulo puro (sem Deno nem DOM): a edge function `creative-router` faz as
// chamadas HTTP e usa estas funções para montar os pedidos e transformar as
// respostas em texto curto para o modelo; o Vitest testa exatamente isto.
//
// Princípios: o resultado vai para o modelo como DADO (nunca instrução), sempre
// com URL e data da consulta, para ele citar fontes em markdown e não inventar.

export const WEB_LIMITS = {
  /** Resultados por busca. */
  maxResults: 8,
  defaultResults: 5,
  /** Quantos dos primeiros resultados têm a página lida (markdown) na busca. */
  defaultScrapeTop: 2,
  /** Trecho de cada página lida dentro de uma busca. */
  scrapeSnippetChars: 1_400,
  /** Texto total devolvido ao modelo por busca/leitura (cabe no maxToolResultChars). */
  maxSummaryChars: 5_800,
  /** Página inteira lida com web_read. */
  readChars: 5_200,
  queryChars: 300,
  urlChars: 2_000,
} as const;

export type WebRecency = "dia" | "semana" | "mes" | "ano";
export const WEB_RECENCY: readonly WebRecency[] = ["dia", "semana", "mes", "ano"];

/** Recência → parâmetro `tbs` do Firecrawl (mesmo formato do Google). */
export function recencyToTbs(recency?: WebRecency | null): string | undefined {
  switch (recency) {
    case "dia": return "qdr:d";
    case "semana": return "qdr:w";
    case "mes": return "qdr:m";
    case "ano": return "qdr:y";
    default: return undefined;
  }
}

export interface WebSearchRequest {
  query: string;
  max?: number;
  recency?: WebRecency;
  /** Idioma preferido (ex.: "pt"). */
  lang?: string;
}

/** Corpo do POST https://api.firecrawl.dev/v1/search (sem scrape: as páginas são lidas à parte). */
export function buildFirecrawlSearchBody(req: WebSearchRequest): Record<string, unknown> {
  const limit = clampInt(req.max, 1, WEB_LIMITS.maxResults, WEB_LIMITS.defaultResults);
  const body: Record<string, unknown> = { query: req.query.trim().slice(0, WEB_LIMITS.queryChars), limit };
  const tbs = recencyToTbs(req.recency);
  if (tbs) body.tbs = tbs;
  if (req.lang && /^[a-z]{2}$/.test(req.lang)) body.lang = req.lang;
  return body;
}

/** Corpo do POST https://api.firecrawl.dev/v1/scrape: só o conteúdo principal em markdown. */
export function buildFirecrawlScrapeBody(url: string): Record<string, unknown> {
  return { url, formats: ["markdown"], onlyMainContent: true, removeBase64Images: true, blockAds: true, timeout: 20_000 };
}

export interface WebResult {
  title: string;
  url: string;
  description: string;
  /** Data de publicação, quando a página informa. */
  published?: string;
  /** Trecho da página lida (markdown limpo), quando houver. */
  content?: string;
}

/** Lê a resposta do /v1/search. Descarta itens sem URL http(s) e repetidos. */
export function parseFirecrawlSearch(raw: unknown): WebResult[] {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>).data : null;
  // v1 devolve { data: [...] }; versões novas podem devolver { data: { web: [...] } }.
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).web)
    ? (data as Record<string, unknown>).web as unknown[]
    : [];
  const seen = new Set<string>();
  const out: WebResult[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const meta = (r.metadata && typeof r.metadata === "object" ? r.metadata : {}) as Record<string, unknown>;
    const url = text(r.url ?? meta.sourceURL ?? meta.url, WEB_LIMITS.urlChars);
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    const published = text(meta.publishedTime ?? meta["article:published_time"] ?? meta.datePublished ?? r.date, 40);
    const markdown = typeof r.markdown === "string" ? cleanMarkdown(r.markdown, WEB_LIMITS.scrapeSnippetChars) : "";
    out.push({
      title: oneLine(text(r.title ?? meta.title, 200)) || hostOf(url),
      url,
      description: oneLine(text(r.description ?? r.snippet ?? meta.description, 400)),
      ...(published ? { published } : {}),
      ...(markdown ? { content: markdown } : {}),
    });
  }
  return out;
}

export interface WebPage {
  url: string;
  title: string;
  markdown: string;
  published?: string;
}

/** Lê a resposta do /v1/scrape. */
export function parseFirecrawlScrape(raw: unknown, fallbackUrl: string, maxChars: number = WEB_LIMITS.readChars): WebPage | null {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>).data : null;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const meta = (d.metadata && typeof d.metadata === "object" ? d.metadata : {}) as Record<string, unknown>;
  const markdown = typeof d.markdown === "string" ? cleanMarkdown(d.markdown, maxChars) : "";
  if (!markdown) return null;
  const url = text(meta.sourceURL ?? meta.url, WEB_LIMITS.urlChars) || fallbackUrl;
  const published = text(meta.publishedTime ?? meta["article:published_time"] ?? meta.datePublished, 40);
  return { url, title: oneLine(text(meta.title, 200)) || hostOf(url), markdown, ...(published ? { published } : {}) };
}

/**
 * Limpa markdown para caber no prompt: tira imagens, links vazios, linhas de
 * navegação repetidas e espaços; corta em `max` caracteres numa quebra natural.
 */
export function cleanMarkdown(md: string, max: number): string {
  let out = md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // imagens
    .replace(/\[\s*\]\([^)]*\)/g, "") // links sem texto
    .replace(/\[([^\]]{1,200})\]\((?:[^()\s]|\([^()]*\))+\)/g, "$1") // links viram só o texto (as URLs vão à parte)
    .replace(/<[^>]{1,200}>/g, "") // restos de HTML
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Linhas muito curtas e repetidas (menus) só atrapalham.
  const seen = new Set<string>();
  out = out
    .split("\n")
    .filter((line) => {
      const key = line.trim().toLowerCase();
      if (key.length > 0 && key.length < 40) {
        if (seen.has(key)) return false;
        seen.add(key);
      }
      return true;
    })
    .join("\n");
  if (out.length <= max) return out;
  const cut = out.slice(0, max);
  const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "));
  return `${(lastBreak > max * 0.6 ? cut.slice(0, lastBreak + 1) : cut).trimEnd()} …`;
}

/** Texto que volta ao modelo depois de uma busca. */
export function formatSearchResults(query: string, results: WebResult[], when: string): string {
  if (results.length === 0) {
    return `Busca na web por "${query}" (consultada em ${when}): nenhum resultado. Diga isso ao usuário; não invente.`;
  }
  const head = `Busca na web por "${query}" — consultada em ${when}. ${results.length} resultado(s). Cite as fontes como links markdown [título](url).`;
  const parts: string[] = [head];
  let size = head.length;
  results.forEach((r, i) => {
    const date = r.published ? ` · publicado ${r.published}` : "";
    const lines = [`[${i + 1}] ${r.title}${date}`, `URL: ${r.url}`];
    if (r.description) lines.push(`Resumo: ${r.description}`);
    if (r.content) lines.push(`Trecho da página:\n${r.content}`);
    let block = lines.join("\n");
    const room = WEB_LIMITS.maxSummaryChars - size - 2;
    if (room <= 80) return;
    if (block.length > room) block = `${block.slice(0, room - 2)} …`;
    parts.push(block);
    size += block.length + 2;
  });
  return parts.join("\n\n");
}

/** Texto que volta ao modelo depois de ler uma página. */
export function formatReadResult(page: WebPage, when: string): string {
  const date = page.published ? ` · publicado ${page.published}` : "";
  const head = `Página lida em ${when}: ${page.title}${date}\nURL: ${page.url}\nCite como [${page.title}](${page.url}).`;
  const room = Math.max(200, WEB_LIMITS.maxSummaryChars - head.length - 4);
  const body = page.markdown.length > room ? `${page.markdown.slice(0, room - 2)} …` : page.markdown;
  return `${head}\n\n${body}`;
}

/** Normaliza a URL pedida pelo modelo: aceita "site.com/x" e devolve https. Null se não for web. */
export function normalizeWebUrl(raw: unknown): string | null {
  const value = text(raw, WEB_LIMITS.urlChars);
  if (!value || /\s/.test(value)) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(value) ? `https://${value}` : "";
  if (!withScheme) return null;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

// ─── utilitários ─────────────────────────────────────────────────────────

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function oneLine(v: string): string {
  return v.replace(/\s+/g, " ").trim();
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 80);
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback;
}

// ─── Principal: DuckDuckGo HTML + Jina Reader (Firecrawl é reserva) ────────────────────────────
//
// Caminho principal (grátis): a busca usa a página HTML do DuckDuckGo lida pelo
// Jina Reader (r.jina.ai, sem chave), e a leitura de páginas também passa pelo
// Jina Reader. O Firecrawl fica de reserva: só entra quando este caminho falha
// ou volta vazio, para economizar créditos.

export const JINA_READER = "https://r.jina.ai/";

/** URL do Jina Reader para uma página pública. */
export function jinaReaderUrl(url: string): string {
  return `${JINA_READER}${url}`;
}

/** Página de resultados do DuckDuckGo (HTML, região Brasil por padrão). */
export function ddgHtmlUrl(query: string, recency?: WebRecency | null, region = "br-pt"): string {
  const params = new URLSearchParams({ q: query.trim().slice(0, WEB_LIMITS.queryChars), kl: region });
  const df = recency === "dia" ? "d" : recency === "semana" ? "w" : recency === "mes" ? "m" : recency === "ano" ? "y" : "";
  if (df) params.set("df", df);
  return `https://html.duckduckgo.com/html/?${params.toString()}`;
}

/** Tira o redirecionamento do DuckDuckGo (/l/?uddg=URL) e devolve o destino real. */
export function unwrapDdgUrl(raw: string): string | null {
  try {
    const u = new URL(raw.replace(/&amp;/g, "&"), "https://duckduckgo.com");
    if (/duckduckgo\.com$/i.test(u.hostname) && u.pathname.startsWith("/l/")) {
      const target = u.searchParams.get("uddg");
      return target && /^https?:\/\//i.test(target) ? target : null;
    }
    if (/duckduckgo\.com$/i.test(u.hostname)) return null;
    return /^https?:$/.test(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

const stripMd = (s: string) => oneLine(s.replace(/\*\*|__|`/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"));

/** Lê o markdown que o Jina Reader devolve da página HTML do DuckDuckGo. */
export function parseDdgMarkdown(md: string, max: number = WEB_LIMITS.defaultResults): WebResult[] {
  const limit = clampInt(max, 1, WEB_LIMITS.maxResults, WEB_LIMITS.defaultResults);
  const out: WebResult[] = [];
  const seen = new Set<string>();
  const blocks = md.split(/\n(?=##\s+\[)/);
  for (const block of blocks) {
    const head = block.match(/^##\s+\[([\s\S]*?)\]\((\S+?)\)/);
    if (!head) continue;
    const url = unwrapDdgUrl(head[2]);
    if (!url || seen.has(url)) continue;
    // Anúncios do DuckDuckGo passam por y.js / ad_domain.
    if (/duckduckgo\.com\/y\.js|ad_domain=/i.test(head[2])) continue;
    seen.add(url);
    let description = "";
    for (const m of block.slice(head[0].length).matchAll(/\[([^\]]{25,})\]\(/g)) {
      const t = stripMd(m[1]);
      if (t.length >= 25) { description = t.slice(0, 400); break; }
    }
    out.push({ title: stripMd(head[1]).slice(0, 200) || hostOf(url), url, description });
    if (out.length >= limit) break;
  }
  return out;
}

/** Lê a resposta JSON do Jina Reader ({ data: { title, url, content, publishedTime } }). */
export function parseJinaReader(raw: unknown, fallbackUrl: string, maxChars: number = WEB_LIMITS.readChars): WebPage | null {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>).data : null;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const markdown = typeof d.content === "string" ? cleanMarkdown(d.content, maxChars) : "";
  if (!markdown) return null;
  const url = text(d.url, WEB_LIMITS.urlChars) || fallbackUrl;
  const published = text(d.publishedTime, 40);
  return { url, title: oneLine(text(d.title, 200)) || hostOf(url), markdown, ...(published ? { published } : {}) };
}
