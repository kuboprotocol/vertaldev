// Vertal Chat: "cérebro" do lado do servidor (Deno).
//
// Tudo o que deixa o chat mais esperto e precisa de banco ou de rede fica aqui,
// chamado pela edge function `creative-router` (o projeto está no teto de edge
// functions, então nada de função nova):
//   • memória entre conversas (vertal_chat_memories) — recuperação por relevância
//     antes do turno e gravação do campo "memory" que o modelo devolve no mesmo JSON;
//   • resumo rolante das conversas longas (vertal_chat_summaries), atualizado em
//     segundo plano, e recordação de conversas anteriores parecidas;
//   • modo plano (motor do Vibe Code) e revisão crítica da resposta final;
//   • operações do navegador ("agent_op"): busca e leitura na web (Firecrawl) e
//     a lista/esquecimento/liga-desliga da memória.
// A parte pura (testada no Vitest) está em chatWeb.ts, chatMemory.ts e chatPlan.ts.

import { enforceRateLimit, sanitizeError, supaAdmin } from "./creative.ts";
import { runGateway } from "./aiGateway.ts";
import { validatePublicUrl } from "./security.ts";
import type { AgentTurn, ToolResult } from "./chatAgent.ts";
import {
  buildFirecrawlScrapeBody,
  buildFirecrawlSearchBody,
  ddgHtmlUrl,
  formatReadResult,
  jinaReaderUrl,
  parseDdgMarkdown,
  parseJinaReader,
  formatSearchResults,
  normalizeWebUrl,
  parseFirecrawlScrape,
  parseFirecrawlSearch,
  WEB_LIMITS,
  WEB_RECENCY,
  type WebRecency,
} from "./chatWeb.ts";
import {
  buildSummaryMessages,
  forgetRequestFrom,
  formatMemoriesForPrompt,
  formatRecallForPrompt,
  isSensitive,
  MEMORY_KINDS,
  MEMORY_LIMITS,
  parseSummaryOutput,
  planConversationWindow,
  type MemoryKind,
  type SummaryMsg,
} from "./chatMemory.ts";
import { buildReviewMessages, parsePlanState, parseReviewOutput, planPromptBlock, type ChatPlanState } from "./chatPlan.ts";

type Admin = ReturnType<typeof supaAdmin>;

const FIRECRAWL_URL = "https://api.firecrawl.dev/v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Roda depois da resposta (EdgeRuntime.waitUntil); sem ele, segue solto. Nunca lança. */
function background(task: Promise<unknown>): void {
  const guarded = task.catch((e) => console.error("[chatBrain] tarefa em segundo plano falhou:", sanitizeError(e)));
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  rt?.waitUntil?.(guarded);
}

// ─── Antes do turno ──────────────────────────────────────────────────────

export interface ChatBrain {
  userId: string;
  /** Só preenchido quando a conversa é do usuário. */
  conversationId?: string;
  firstRound: boolean;
  /** null = tabelas indisponíveis (migração ainda não rodou). */
  memoryEnabled: boolean | null;
  memories: string;
  usedMemoryIds: string[];
  recall: string;
  summary: string;
  window: SummaryMsg[];
  pendingSummary?: { previous: string; messages: SummaryMsg[]; coverUpTo: number };
  planState?: ChatPlanState;
  planBlock?: string;
  planPhase?: "execute" | "final";
}

export async function loadChatBrain(input: {
  userId: string;
  conversationId?: string;
  messages: SummaryMsg[];
  /** Mensagens do começo que o navegador mandou mas ficaram fora de `messages`. */
  offset?: number;
  maxMessages: number;
  firstRound: boolean;
  plan?: unknown;
}): Promise<ChatBrain> {
  const admin = supaAdmin();
  const offset = Math.max(0, input.offset ?? 0);
  const lastUser = [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const prevUser = [...input.messages].reverse().filter((m) => m.role === "user")[1]?.content ?? "";
  const query = `${lastUser} ${prevUser}`.slice(0, 500);

  const brain: ChatBrain = {
    userId: input.userId,
    firstRound: input.firstRound,
    memoryEnabled: null,
    memories: "",
    usedMemoryIds: [],
    recall: "",
    summary: "",
    window: input.messages.slice(-input.maxMessages),
  };

  const planState = input.plan ? parsePlanState(input.plan) : null;
  if (planState) {
    brain.planState = planState;
    brain.planPhase = planState.phase;
    brain.planBlock = planPromptBlock(planState);
  }

  // Posse da conversa (o id vem do navegador).
  if (input.conversationId && UUID_RE.test(input.conversationId)) {
    const { data } = await admin.from("creative_conversations").select("id").eq("id", input.conversationId).eq("user_id", input.userId).maybeSingle();
    if (data?.id) brain.conversationId = data.id as string;
  }

  const [settings, memories, recall, summary] = await Promise.all([
    admin.from("vertal_chat_memory_settings").select("enabled").eq("user_id", input.userId).maybeSingle(),
    admin.rpc("vertal_chat_recall", { p_user_id: input.userId, p_query: query, p_limit: 30 }),
    input.firstRound && query.trim()
      ? admin.rpc("vertal_chat_recall_conversations", { p_user_id: input.userId, p_query: lastUser.slice(0, 500), p_exclude: brain.conversationId ?? null, p_limit: 2 })
      : Promise.resolve({ data: [], error: null }),
    brain.conversationId
      ? admin.from("vertal_chat_summaries").select("summary,covered_messages").eq("conversation_id", brain.conversationId).eq("user_id", input.userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (settings.error || memories.error) {
    console.error("[chatBrain] memória indisponível:", settings.error?.message ?? memories.error?.message);
    brain.memoryEnabled = null;
  } else {
    brain.memoryEnabled = settings.data ? settings.data.enabled !== false : true;
  }

  if (brain.memoryEnabled) {
    const rows = (memories.data ?? []) as Array<{ id: string; kind: MemoryKind; content: string; importance: number; updated_at?: string }>;
    brain.memories = formatMemoriesForPrompt(rows);
    brain.usedMemoryIds = rows.filter((r) => brain.memories.includes(r.content.trim())).map((r) => r.id).slice(0, 40);
    if (!recall.error) {
      brain.recall = formatRecallForPrompt((recall.data ?? []) as Array<{ title: string; summary: string; updated_at?: string }>);
    }
  }

  // Resumo rolante: a parte antiga da conversa vira resumo; as recentes vão inteiras.
  const stored = summary.error ? null : (summary.data as { summary?: string; covered_messages?: number } | null);
  const covered = Math.max(0, (stored?.covered_messages ?? 0) - offset);
  const plan = planConversationWindow(input.messages, stored?.summary ? covered : 0, input.maxMessages);
  brain.window = plan.recent.length ? plan.recent : brain.window;
  if (plan.useSummary && stored?.summary) brain.summary = stored.summary;
  if (brain.conversationId && input.firstRound && plan.toSummarize.length > 0 && !summary.error) {
    brain.pendingSummary = {
      previous: stored?.summary ?? "",
      messages: plan.toSummarize,
      coverUpTo: plan.coverUpTo + offset,
    };
  }
  return brain;
}

// ─── Depois do turno ─────────────────────────────────────────────────────

export interface BrainAfter {
  reply: string;
  memory?: { saved: number; forgotten: number };
  reviewed: boolean;
}

export async function saveChatBrain(
  brain: ChatBrain,
  input: { userId: string; turn: AgentTurn; results: ToolResult[]; lastUserText: string },
): Promise<BrainAfter> {
  const admin = supaAdmin();
  const out: BrainAfter = { reply: input.turn.reply, reviewed: false };

  // 1) Memória: o que o modelo pediu no campo "memory" (já validado e sem dados sensíveis).
  if (brain.memoryEnabled) {
    const ops = input.turn.memory ?? { save: [], forget: [] };
    const forget = [...ops.forget];
    if (brain.firstRound && forget.length === 0) {
      const fallback = forgetRequestFrom(input.lastUserText);
      if (fallback) forget.push(fallback);
    }
    const [saved, forgotten] = await Promise.all([
      Promise.all(ops.save.map((m) =>
        admin.rpc("vertal_chat_memory_upsert", {
          p_user_id: input.userId, p_kind: m.kind, p_content: m.content, p_importance: m.importance,
          p_conversation_id: brain.conversationId ?? null, p_max: MEMORY_LIMITS.maxPerUser,
        }).then(({ data, error }) => (error ? 0 : data === "skipped" ? 0 : 1))
      )),
      Promise.all(forget.map((q) =>
        admin.rpc("vertal_chat_memory_forget", { p_user_id: input.userId, p_query: q })
          .then(({ data, error }) => (error ? 0 : Array.isArray(data) ? data.length : 0))
      )),
    ]);
    const s = saved.reduce((a, b) => a + b, 0);
    const f = forgotten.reduce((a, b) => a + b, 0);
    if (s || f) out.memory = { saved: s, forgotten: f };
    if (brain.usedMemoryIds.length) {
      background(Promise.resolve(admin.from("vertal_chat_memories").update({ last_used_at: new Date().toISOString() }).in("id", brain.usedMemoryIds).eq("user_id", input.userId)));
    }
  }

  // 2) Revisão crítica da resposta final do modo plano (mesma chamada HTTP: não conta outra conversa).
  if (brain.planPhase === "final" && out.reply.length >= 120) {
    try {
      const evidence = [
        ...(brain.planState?.tasks ?? []).filter((t) => t.result).map((t) => `Tarefa #${t.id} ${t.title}: ${t.result}`),
        ...input.results.map((r) => `${r.tool} (${r.ok ? "ok" : "falhou"}): ${r.summary.slice(0, 1_500)}`),
      ].join("\n");
      const request = brain.planState?.goal ? `${brain.planState.goal}\n\n${input.lastUserText}` : input.lastUserText;
      const gw = await runGateway({
        messages: buildReviewMessages({ request, draft: out.reply, evidence }),
        kind: "chat", tier: "flash", json: true, temperature: 0.1, maxTokens: 3000, noCache: true,
      });
      const verdict = parseReviewOutput(gw.content);
      if (!verdict.ok && verdict.revised) {
        out.reply = verdict.revised;
        out.reviewed = true;
      }
    } catch (e) {
      console.error("[chatBrain] revisão falhou (segue o rascunho):", sanitizeError(e));
    }
  }

  // 3) Resumo rolante em segundo plano (não atrasa a resposta).
  if (brain.pendingSummary && brain.conversationId) {
    const { previous, messages, coverUpTo } = brain.pendingSummary;
    const conversationId = brain.conversationId;
    background((async () => {
      const gw = await runGateway({
        messages: buildSummaryMessages(previous, messages),
        kind: "chat", tier: "flash", json: true, temperature: 0.2, maxTokens: 1_200, noCache: true,
      });
      const summary = parseSummaryOutput(gw.content);
      if (!summary) return;
      const { error } = await admin.from("vertal_chat_summaries").upsert({
        conversation_id: conversationId, user_id: input.userId, summary, covered_messages: coverUpTo, updated_at: new Date().toISOString(),
      }, { onConflict: "conversation_id" });
      if (error) console.error("[chatBrain] resumo não salvo:", error.message);
    })());
  }
  return out;
}

// ─── Operações chamadas pelo navegador (tool "agent_op") ────────────────

type OpResult = [number, Record<string, unknown>];

function whenText(timezone: unknown): string {
  const tz = typeof timezone === "string" && timezone.length <= 64 ? timezone : "America/Sao_Paulo";
  const format = (zone: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: zone, dateStyle: "long", timeStyle: "short" }).format(new Date());
  try {
    return `${format(tz)} (${tz})`;
  } catch {
    return `${format("UTC")} (UTC)`;
  }
}

export async function handleChatBrainOp(user: { id: string; email?: string | null }, raw: unknown): Promise<OpResult> {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const op = input.op;
  try {
    if (op === "web_search" || op === "web_read") {
      for (const [bucket, max, windowSeconds] of [["chat_web", 15, 60], ["chat_web_day", 300, 86_400]] as const) {
        const limit = await enforceRateLimit(user.id, bucket, { max, windowSeconds, userEmail: user.email ?? null });
        if (!limit.ok) return [429, { error: limit.error }];
      }
      return op === "web_search" ? await webSearch(input) : await webRead(input);
    }
    if (op === "memory_list" || op === "memory_forget" || op === "memory_settings") {
      const limit = await enforceRateLimit(user.id, "chat_memory", { max: 40, windowSeconds: 60, userEmail: user.email ?? null });
      if (!limit.ok) return [429, { error: limit.error }];
      return await memoryOp(user.id, op, input);
    }
    return [400, { error: "invalid_input" }];
  } catch (e) {
    console.error("[chatBrain] agent_op falhou:", sanitizeError(e));
    return [500, { error: sanitizeError(e) }];
  }
}

/** Jina Reader (sem chave): devolve o JSON da página lida, ou null. JINA_API_KEY é opcional (limite maior). */
async function jina(url: string, timeoutMs: number): Promise<unknown | null> {
  try {
    const headers: Record<string, string> = { Accept: "application/json", "X-Return-Format": "markdown" };
    const jinaKey = Deno.env.get("JINA_API_KEY");
    if (jinaKey) headers.Authorization = `Bearer ${jinaKey}`;
    const res = await fetch(jinaReaderUrl(url), { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      console.error(`[chatBrain] jina HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error("[chatBrain] jina falhou:", sanitizeError(e));
    return null;
  }
}

/** Busca sem chave: página HTML do DuckDuckGo lida pelo Jina Reader, e as primeiras páginas lidas também. */
async function keylessSearch(query: string, max: number | undefined, recency: WebRecency | undefined, when: string): Promise<OpResult> {
  const raw = await jina(ddgHtmlUrl(query, recency), 20_000);
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>).data : null;
  const content = data && typeof data === "object" ? (data as Record<string, unknown>).content : null;
  const md = typeof content === "string" ? content : "";
  const results = md ? parseDdgMarkdown(md, max) : [];
  if (!md) {
    return [200, { ok: false, error: "web_search_failed", summary: `A busca por "${query}" falhou agora (serviço de busca indisponível). Diga isso ao usuário; não invente resultados.` }];
  }
  const top = Math.max(0, Math.min(3, Number(Deno.env.get("CHAT_WEB_SCRAPE_TOP") ?? 2) || 0));
  await Promise.all(results.slice(0, top).map(async (r) => {
    const target = safeTarget(r.url);
    if (!target) return;
    const page = parseJinaReader(await jina(target, 15_000), target, WEB_LIMITS.scrapeSnippetChars);
    if (page) {
      r.content = page.markdown;
      if (!r.published && page.published) r.published = page.published;
    }
  }));
  return [200, {
    ok: true,
    query,
    provider: "duckduckgo+jina",
    results: results.map((r) => ({ title: r.title, url: r.url, ...(r.published ? { published: r.published } : {}) })),
    summary: formatSearchResults(query, results, when),
  }];
}

/** Chave do Firecrawl: o nome canônico ou os nomes já cadastrados no Supabase. */
function firecrawlKey(): string | undefined {
  for (const name of ["FIRECRAWL_API_KEY", "API_key_Fireclawl", "API_KEY_FIRECRAWL", "FIRECRAWL_KEY"]) {
    const v = Deno.env.get(name)?.trim();
    if (v) return v;
  }
  return undefined;
}

async function firecrawl(path: "search" | "scrape", body: Record<string, unknown>, key: string, timeoutMs: number): Promise<unknown | null> {
  try {
    const res = await fetch(`${FIRECRAWL_URL}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.error(`[chatBrain] firecrawl ${path} HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error(`[chatBrain] firecrawl ${path} falhou:`, sanitizeError(e));
    return null;
  }
}

/** URL que o Firecrawl pode abrir: pública (sem IP interno), http(s) e fora do próprio Supabase. */
function safeTarget(raw: unknown): string | null {
  const url = normalizeWebUrl(raw);
  if (!url) return null;
  try {
    const target = validatePublicUrl(url);
    const ownHost = new URL(Deno.env.get("SUPABASE_URL") ?? "https://invalid.local").host;
    if (target.host === ownHost || /(^|\.)supabase\.(co|in)$/i.test(target.hostname)) return null;
    return target.toString();
  } catch {
    return null;
  }
}

async function webSearch(input: Record<string, unknown>): Promise<OpResult> {
  const query = typeof input.query === "string" ? input.query.trim().slice(0, WEB_LIMITS.queryChars) : "";
  if (query.length < 2) return [400, { error: "invalid_input" }];
  const when = whenText(input.timezone);
  const recency = WEB_RECENCY.includes(input.recency as WebRecency) ? input.recency as WebRecency : undefined;
  const max = Number(input.max) || undefined;
  // Principal: DuckDuckGo + Jina Reader (grátis). Firecrawl é o reserva: só entra
  // quando a busca grátis falha ou volta vazia, para não gastar créditos à toa.
  const primary = await keylessSearch(query, max, recency, when);
  const body = primary[1] as { ok?: boolean; results?: unknown[] };
  if (body.ok && Array.isArray(body.results) && body.results.length > 0) return primary;
  const key = firecrawlKey();
  if (!key) return primary;
  return (await firecrawlSearch(query, max, recency, when, key)) ?? primary;
}

async function firecrawlSearch(
  query: string, max: number | undefined, recency: WebRecency | undefined, when: string, key: string,
): Promise<OpResult | null> {
  const data = await firecrawl("search", buildFirecrawlSearchBody({ query, max, recency }), key, 20_000);
  if (!data) return null;
  const results = parseFirecrawlSearch(data);
  if (results.length === 0) return null;
  const top = Math.max(0, Math.min(3, Number(Deno.env.get("CHAT_WEB_SCRAPE_TOP") ?? 2) || 0));
  await Promise.all(results.slice(0, top).map(async (r) => {
    const target = safeTarget(r.url);
    if (!target) return;
    const page = parseFirecrawlScrape(await firecrawl("scrape", buildFirecrawlScrapeBody(target), key, 15_000), target, WEB_LIMITS.scrapeSnippetChars);
    if (page) {
      r.content = page.markdown;
      if (!r.published && page.published) r.published = page.published;
    }
  }));
  return [200, {
    ok: true,
    query,
    provider: "firecrawl",
    results: results.map((r) => ({ title: r.title, url: r.url, ...(r.published ? { published: r.published } : {}) })),
    summary: formatSearchResults(query, results, when),
  }];
}

async function webRead(input: Record<string, unknown>): Promise<OpResult> {
  const target = safeTarget(input.url);
  if (!target) return [400, { error: "url_not_allowed" }];
  // Principal: Jina Reader (grátis). Reserva: Firecrawl, se houver chave.
  const key = firecrawlKey();
  const page = parseJinaReader(await jina(target, 25_000), target)
    ?? (key ? parseFirecrawlScrape(await firecrawl("scrape", buildFirecrawlScrapeBody(target), key, 25_000), target) : null);
  if (!page) {
    return [200, { ok: false, error: "web_read_failed", summary: `Não consegui ler ${target} (página fora do ar, bloqueada ou sem texto). Diga isso ao usuário; não invente o conteúdo.` }];
  }
  return [200, { ok: true, url: page.url, title: page.title, summary: formatReadResult(page, whenText(input.timezone)) }];
}

async function memoryOp(userId: string, op: "memory_list" | "memory_forget" | "memory_settings", input: Record<string, unknown>): Promise<OpResult> {
  const admin: Admin = supaAdmin();
  if (op === "memory_settings") {
    if (typeof input.enabled !== "boolean") return [400, { error: "invalid_input" }];
    const { error } = await admin.from("vertal_chat_memory_settings").upsert({ user_id: userId, enabled: input.enabled, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return [503, { error: "memory_unavailable" }];
    return [200, { ok: true, enabled: input.enabled }];
  }
  if (op === "memory_forget") {
    if (input.all === true) {
      const [{ error }, sum] = await Promise.all([
        admin.from("vertal_chat_memories").delete().eq("user_id", userId),
        admin.from("vertal_chat_summaries").delete().eq("user_id", userId),
      ]);
      if (error || sum.error) return [503, { error: "memory_unavailable" }];
      return [200, { ok: true, all: true }];
    }
    if (typeof input.id === "string" && UUID_RE.test(input.id)) {
      const { data, error } = await admin.from("vertal_chat_memories").delete().eq("user_id", userId).eq("id", input.id).select("id");
      if (error) return [503, { error: "memory_unavailable" }];
      return [200, { ok: true, forgotten: (data ?? []).length }];
    }
    const query = typeof input.query === "string" ? input.query.trim().slice(0, 200) : "";
    if (query.length < 2) return [400, { error: "invalid_input" }];
    const { data, error } = await admin.rpc("vertal_chat_memory_forget", { p_user_id: userId, p_query: query });
    if (error) return [503, { error: "memory_unavailable" }];
    const rows = (data ?? []) as Array<{ content: string }>;
    return [200, { ok: true, forgotten: rows.length, items: rows.map((r) => r.content) }];
  }
  // memory_list
  const [{ data, error }, settings] = await Promise.all([
    admin.from("vertal_chat_memories").select("id,kind,content,importance,created_at,updated_at")
      .eq("user_id", userId).order("importance", { ascending: false }).order("updated_at", { ascending: false }).limit(MEMORY_LIMITS.maxPerUser),
    admin.from("vertal_chat_memory_settings").select("enabled").eq("user_id", userId).maybeSingle(),
  ]);
  if (error) return [503, { error: "memory_unavailable" }];
  const items = ((data ?? []) as Array<{ id: string; kind: string; content: string; importance: number; created_at: string; updated_at: string }>)
    .filter((m) => (MEMORY_KINDS as readonly string[]).includes(m.kind) && !isSensitive(m.content));
  return [200, { ok: true, enabled: settings.data ? settings.data.enabled !== false : true, items }];
}
