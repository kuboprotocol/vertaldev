// Vibe Code: busca de documentação na web (parte com rede, Deno).
//
// Reaproveita o caminho grátis do Vertal Chat: busca na página HTML do DuckDuckGo lida
// pelo Jina Reader e leitura das páginas também pelo Jina Reader (funções puras de
// chatWeb.ts). Não usa Firecrawl (sem gasto de créditos) e não toca no motor do chat.
//
// Flag desligada (padrão) ou usuário fora da allowlist → devolve vazio SEM rede e SEM
// passos no chat: o Vibe Code fica idêntico ao comportamento atual.
// Qualquer falha ou demora → fallback silencioso (passo "skipped", geração segue normal).

import { validatePublicUrl } from "./security.ts";
import { ddgHtmlUrl, jinaReaderUrl, normalizeWebUrl, parseDdgMarkdown, parseJinaReader, type WebPage, type WebResult } from "./chatWeb.ts";
import {
  buildDocQueries,
  detectDocTopics,
  formatDocsBlock,
  formatDocSources,
  loadVibeWebConfig,
  pickDocPages,
  VIBE_WEB_DONE_TITLE,
  VIBE_WEB_LIMITS,
  VIBE_WEB_STEP_TITLE,
  vibeWebAllowed,
} from "./vibeWebDocs.ts";

type Env = Record<string, string | undefined>;
type Step = { kind: "thinking"; status: "running" | "success" | "skipped"; title: string; detail?: string };

export interface VibeWebDocsResult {
  block: string;
  sources: Array<{ title: string; url: string }>;
}

const EMPTY: VibeWebDocsResult = { block: "", sources: [] };

/** Jina Reader (sem chave; JINA_API_KEY opcional dá limite maior). Null em qualquer falha. */
async function jina(url: string, timeoutMs: number, env: Env): Promise<unknown | null> {
  try {
    const headers: Record<string, string> = { Accept: "application/json", "X-Return-Format": "markdown" };
    const key = (env.JINA_API_KEY ?? "").trim();
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(jinaReaderUrl(url), { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Só URLs públicas (sem IP interno, sem credenciais) e fora do próprio Supabase. */
function safeTarget(raw: unknown, env: Env): string | null {
  const url = normalizeWebUrl(raw);
  if (!url) return null;
  try {
    const target = validatePublicUrl(url);
    const ownHost = new URL(env.SUPABASE_URL ?? "https://invalid.local").host;
    if (target.host === ownHost || /(^|\.)supabase\.(co|in)$/i.test(target.hostname)) return null;
    return target.toString();
  } catch {
    return null;
  }
}

function whenNow(): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short" }).format(new Date()) + " (America/Sao_Paulo)";
  } catch {
    return new Date().toISOString();
  }
}

async function searchDocs(query: string, env: Env): Promise<WebResult[]> {
  const raw = await jina(ddgHtmlUrl(query, null, "us-en"), VIBE_WEB_LIMITS.searchTimeoutMs, env);
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>).data : null;
  const content = data && typeof data === "object" ? (data as Record<string, unknown>).content : null;
  return typeof content === "string" && content ? parseDdgMarkdown(content, VIBE_WEB_LIMITS.resultsPerQuery) : [];
}

async function gather(prompt: string, topics: string[], env: Env): Promise<VibeWebDocsResult> {
  const queries = buildDocQueries(topics);
  const perQuery = await Promise.all(queries.map(async (q, i) => ({ topic: topics[i], results: await searchDocs(q, env) })));
  const picks = pickDocPages(perQuery);
  const pages = (await Promise.all(picks.map(async ({ result }) => {
    const target = safeTarget(result.url, env);
    if (!target) return null;
    return parseJinaReader(await jina(target, VIBE_WEB_LIMITS.readTimeoutMs, env), target, VIBE_WEB_LIMITS.perPageChars);
  }))).filter((p): p is WebPage => !!p);
  const block = formatDocsBlock(pages, whenNow());
  return block ? { block, sources: pages.map((p) => ({ title: p.title, url: p.url })) } : EMPTY;
}

/**
 * Antes de gerar código: se a flag está ligada para o usuário e o pedido cita API/biblioteca/serviço,
 * pesquisa a documentação e devolve o bloco de DADOS para o prompt. Nunca lança.
 */
export async function vibeWebDocsForRequest(
  env: Env,
  input: { userId: string | null | undefined; prompt: string; send?: (step: Step) => void },
): Promise<VibeWebDocsResult> {
  try {
    if (!vibeWebAllowed(loadVibeWebConfig(env), input.userId)) return EMPTY;
    const topics = detectDocTopics(input.prompt);
    if (!topics.length) return EMPTY;
    input.send?.({ kind: "thinking", status: "running", title: VIBE_WEB_STEP_TITLE, detail: topics.join(", ") });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<VibeWebDocsResult>((resolve) => {
      timer = setTimeout(() => resolve(EMPTY), VIBE_WEB_LIMITS.totalBudgetMs);
    });
    const result = await Promise.race([gather(input.prompt, topics, env).catch(() => EMPTY), timeout]);
    if (timer) clearTimeout(timer);
    if (result.block) {
      input.send?.({ kind: "thinking", status: "success", title: VIBE_WEB_DONE_TITLE, detail: formatDocSources(result.sources) });
    } else {
      input.send?.({ kind: "thinking", status: "skipped", title: VIBE_WEB_STEP_TITLE, detail: "Seguindo sem documentação externa." });
    }
    return result;
  } catch {
    return EMPTY;
  }
}
