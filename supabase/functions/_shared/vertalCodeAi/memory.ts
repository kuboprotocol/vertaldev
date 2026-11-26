// VERTAL Code AI · memória expansiva (por usuário e por projeto). Lógica pura: sem Deno, sem rede.
//
//   • O que guarda: decisões, preferências, fatos do código, resumos de execuções e o resumo rolante do projeto.
//   • Busca: semelhança por embeddings (pgvector, 384 dimensões) + palavras do pedido + importância + recência.
//   • Degrada sem quebrar: se a tabela não existe (migração ainda não aplicada) ou o banco falha,
//     a memória fica desligada nesta chamada e o resto do pedido segue normal.
//   • Privacidade: nada que pareça segredo é gravado; o usuário vê e apaga (RLS só do dono).
//
// Tabela: public.vertal_code_ai_memories (migração 20261126120000_vertal_code_ai_memory.sql).

import { looksLikeSecret } from "../vibeAgentCore.ts";

export const VCA_MEMORY_TABLE = "vertal_code_ai_memories";
export const VCA_MEMORY_MATCH_RPC = "match_vertal_code_ai_memories";
export const VCA_EMBED_DIM = 384;

export type VcaMemoryKind = "decision" | "preference" | "code_fact" | "run_summary" | "project_summary" | "note";
export const VCA_MEMORY_KINDS: VcaMemoryKind[] = ["decision", "preference", "code_fact", "run_summary", "project_summary", "note"];
/** user = vale em todos os projetos do usuário; project = só no projeto (project_id nulo = cofre pessoal). */
export type VcaMemoryScope = "user" | "project";

export interface VcaMemory {
  id: string;
  scope: VcaMemoryScope;
  kind: VcaMemoryKind;
  content: string;
  importance: number;
  project_id: string | null;
  created_at?: string;
  updated_at?: string;
  /** Semelhança calculada na busca (0–1). */
  score?: number;
}

export interface VcaMemoryDraft {
  scope: VcaMemoryScope;
  kind: VcaMemoryKind;
  content: string;
  importance?: number;
}

/** Cliente mínimo do supabase-js usado aqui (permite fakes nos testes). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseDb = any;

export const VCA_MEMORY_LIMITS = {
  maxContentChars: 600,
  maxProjectSummaryChars: 2_000,
  maxItemsPerRun: 8,
  candidateRows: 300,
  retrieveK: 8,
  contextChars: 3_500,
} as const;

// ───────────────────────────── Tabela ausente / erro de banco ─────────────────────────────

/** Erro de "tabela/função não existe" (migração não aplicada) → memória desligada, sem quebrar. */
export function isMissingRelation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code && ["42P01", "42883", "PGRST202", "PGRST205", "PGRST204"].includes(e.code)) return true;
  return /does not exist|could not find the (table|function)|schema cache/i.test(e.message ?? "");
}

// ───────────────────────────── Texto e embeddings ─────────────────────────────

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);

/** pgvector volta do PostgREST como texto "[0.1,0.2,…]"; aceita também array. */
export function parseEmbedding(v: unknown): number[] | null {
  if (Array.isArray(v)) return v.every((x) => typeof x === "number") ? (v as number[]) : null;
  if (typeof v !== "string" || !v.startsWith("[")) return null;
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) && arr.every((x) => typeof x === "number") ? arr : null;
  } catch {
    return null;
  }
}

export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Sobreposição de palavras (0–1) entre o pedido e a memória. */
export function keywordOverlap(query: string, content: string): number {
  const q = new Set(tokenize(query));
  if (!q.size) return 0;
  const c = new Set(tokenize(content));
  let hit = 0;
  for (const t of q) if (c.has(t)) hit++;
  return hit / q.size;
}

export const toPgVector = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? Number(x.toFixed(6)) : 0)).join(",")}]`;

/** Pontuação final: semelhança (embedding ou palavras) + importância + recência. */
export function scoreMemory(
  row: { content: string; importance?: number; updated_at?: string; created_at?: string; embedding?: unknown; kind?: string },
  query: string,
  queryEmbedding: number[] | null,
  now = Date.now(),
): number {
  const emb = queryEmbedding ? parseEmbedding(row.embedding) : null;
  const sim = emb && queryEmbedding ? Math.max(0, cosine(queryEmbedding, emb)) : 0;
  const kw = keywordOverlap(query, row.content);
  const rel = emb ? 0.75 * sim + 0.25 * kw : kw;
  const imp = Math.min(5, Math.max(1, row.importance ?? 3)) / 5;
  const t = Date.parse(row.updated_at ?? row.created_at ?? "");
  const ageDays = Number.isFinite(t) ? Math.max(0, (now - t) / 86_400_000) : 30;
  const recency = Math.exp(-ageDays / 45);
  // Preferências e decisões valem sempre um pouco, mesmo sem palavra em comum.
  const kindBoost = row.kind === "preference" || row.kind === "decision" ? 0.08 : 0;
  return rel * 0.7 + imp * 0.15 + recency * 0.07 + kindBoost;
}

// ───────────────────────────── Limpeza do que vai para a memória ─────────────────────────────

/** Barreira extra (além da do Vibe Code): chaves com prefixo conhecido, JWT, chave privada, "senha: …" e tokens longos. */
const SECRETISH =
  /\b(sk-[A-Za-z0-9_-]{16,}|sk_(live|test)_[A-Za-z0-9]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[abposr]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,})|-----BEGIN [A-Z ]*PRIVATE KEY|(api[_-]?key|token|senha|password|secret)\s*[:=]\s*\S{6,}|[A-Za-z0-9_\-]{40,}/i;

const clampImportance = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 3;
};

/** Normaliza o que o Entregador sugeriu lembrar: tipos válidos, sem segredos, sem duplicatas, limites. */
export function sanitizeDrafts(raw: unknown, max: number = VCA_MEMORY_LIMITS.maxItemsPerRun): VcaMemoryDraft[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: VcaMemoryDraft[] = [];
  const seen = new Set<string>();
  for (const it of list) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const content = typeof o.content === "string" ? o.content.replace(/\s+/g, " ").trim().slice(0, VCA_MEMORY_LIMITS.maxContentChars) : "";
    if (content.length < 8) continue;
    if (looksLikeSecret(content) || SECRETISH.test(content)) continue;
    const kind = VCA_MEMORY_KINDS.includes(o.kind as VcaMemoryKind) && o.kind !== "project_summary" ? (o.kind as VcaMemoryKind) : "note";
    // Preferência vale para o usuário em todos os projetos; o resto é do projeto.
    const scope: VcaMemoryScope = o.scope === "user" || kind === "preference" ? "user" : "project";
    const key = `${scope}:${content.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ scope, kind, content, importance: clampImportance(o.importance) });
    if (out.length >= max) break;
  }
  return out;
}

/** Bloco de contexto para os prompts (curto: só o que é relevante). */
export function formatMemoryContext(mems: VcaMemory[], projectSummary: string | null, maxChars: number = VCA_MEMORY_LIMITS.contextChars): string {
  if (!mems.length && !projectSummary) return "";
  const label: Record<VcaMemoryKind, string> = {
    decision: "decisão",
    preference: "preferência",
    code_fact: "fato do código",
    run_summary: "execução anterior",
    project_summary: "resumo do projeto",
    note: "nota",
  };
  const lines: string[] = [];
  let total = 0;
  if (projectSummary) {
    const s = projectSummary.slice(0, 1_200);
    lines.push(`Resumo do projeto: ${s}`);
    total += s.length;
  }
  for (const m of mems) {
    const line = `- (${label[m.kind] ?? m.kind}) ${m.content}`;
    if (total + line.length > maxChars) break;
    lines.push(line);
    total += line.length;
  }
  return `Memória Vertal (use só se ajudar; o pedido atual vence):\n${lines.join("\n")}`;
}

/** Junta o resumo rolante do projeto com o resumo desta execução (o mais novo no fim, corta o começo). */
export function mergeProjectSummary(previous: string | null, next: string, max: number = VCA_MEMORY_LIMITS.maxProjectSummaryChars): string {
  const n = next.replace(/\s+/g, " ").trim();
  if (!n) return (previous ?? "").slice(-max);
  const merged = previous ? `${previous.trim()} | ${n}` : n;
  return merged.length > max ? merged.slice(merged.length - max).replace(/^[^|]*\|\s*/, "") : merged;
}

// ───────────────────────────── Armazenamento (supabase-js injetado) ─────────────────────────────

export type VcaEmbed = (text: string) => Promise<number[] | null>;

export interface MemoryStoreDeps {
  /** Cliente com service role (grava e busca sempre filtrando por user_id). */
  admin: LooseDb;
  /** Cliente do usuário (RLS: só o dono vê e apaga) — usado em listar/apagar. */
  userClient?: LooseDb;
  userId: string;
  projectId: string | null;
  embed?: VcaEmbed;
  warn?: (m: string) => void;
}

/** Tabela ausente em um isolate: não tenta de novo por 10 min (evita 1 erro por chamada). */
let missingUntil = 0;
export function resetMemoryAvailability(): void {
  missingUntil = 0;
}
function markMissing(err: unknown, warn?: (m: string) => void): boolean {
  if (isMissingRelation(err)) {
    missingUntil = Date.now() + 600_000;
    warn?.("[vertal-code-ai] memória desligada: tabela/função ausente (migração não aplicada)");
    return true;
  }
  return false;
}
export const memoryLooksAvailable = () => Date.now() >= missingUntil;

async function safeEmbed(embed: VcaEmbed | undefined, text: string): Promise<number[] | null> {
  if (!embed) return null;
  try {
    const v = await embed(text.slice(0, 2_000));
    return Array.isArray(v) && v.length === VCA_EMBED_DIM ? v : null;
  } catch {
    return null;
  }
}

/** Filtro de escopo: memórias do usuário + as do projeto atual (cofre pessoal = project_id nulo). */
function scopeFilter(projectId: string | null): string {
  return projectId
    ? `scope.eq.user,and(scope.eq.project,project_id.eq.${projectId})`
    : `scope.eq.user,and(scope.eq.project,project_id.is.null)`;
}

export interface RetrievedMemory {
  available: boolean;
  memories: VcaMemory[];
  projectSummary: string | null;
  usedEmbeddings: boolean;
}

/**
 * Busca as memórias mais úteis para o pedido. 1º tenta a função SQL (índice HNSW); se ela não existir,
 * lê as últimas linhas do usuário e ordena aqui (mesma pontuação). Nunca lança.
 */
export async function retrieveMemories(deps: MemoryStoreDeps, query: string, k: number = VCA_MEMORY_LIMITS.retrieveK): Promise<RetrievedMemory> {
  const empty: RetrievedMemory = { available: false, memories: [], projectSummary: null, usedEmbeddings: false };
  if (!memoryLooksAvailable()) return empty;
  const qEmb = await safeEmbed(deps.embed, query);
  try {
    // Resumo rolante do projeto (1 linha por usuário+projeto).
    let sq = deps.admin.from(VCA_MEMORY_TABLE).select("content").eq("user_id", deps.userId).eq("kind", "project_summary").eq("scope", "project");
    sq = deps.projectId ? sq.eq("project_id", deps.projectId) : sq.is("project_id", null);
    const { data: sumRows, error: sumErr } = await sq.limit(1);
    if (sumErr) {
      if (markMissing(sumErr, deps.warn)) return empty;
      throw sumErr;
    }
    const projectSummary = (sumRows?.[0]?.content as string | undefined) ?? null;

    let rows: Array<Record<string, unknown>> | null = null;
    if (qEmb) {
      const { data, error } = await deps.admin.rpc(VCA_MEMORY_MATCH_RPC, {
        p_user_id: deps.userId,
        p_project_id: deps.projectId,
        p_query_embedding: toPgVector(qEmb),
        p_limit: 40,
      });
      if (!error && Array.isArray(data)) rows = data;
      else if (error && !isMissingRelation(error)) deps.warn?.(`[vertal-code-ai] busca por embedding falhou: ${error.message ?? error}`);
    }
    if (!rows) {
      const { data, error } = await deps.admin
        .from(VCA_MEMORY_TABLE)
        .select("id, scope, kind, content, importance, project_id, created_at, updated_at, embedding")
        .eq("user_id", deps.userId)
        .neq("kind", "project_summary")
        .or(scopeFilter(deps.projectId))
        .order("updated_at", { ascending: false })
        .limit(VCA_MEMORY_LIMITS.candidateRows);
      if (error) {
        if (markMissing(error, deps.warn)) return empty;
        throw error;
      }
      rows = data ?? [];
    }
    const now = Date.now();
    const scored = (rows ?? [])
      .filter((r) => r && typeof r.content === "string" && r.kind !== "project_summary")
      .map((r) => {
        const score = scoreMemory(r as { content: string }, query, qEmb, now);
        return {
          id: String(r.id),
          scope: (r.scope === "user" ? "user" : "project") as VcaMemoryScope,
          kind: (VCA_MEMORY_KINDS.includes(r.kind as VcaMemoryKind) ? r.kind : "note") as VcaMemoryKind,
          content: String(r.content),
          importance: clampImportance(r.importance),
          project_id: (r.project_id as string | null) ?? null,
          updated_at: r.updated_at as string | undefined,
          score: Math.round(score * 1000) / 1000,
        };
      })
      .filter((m) => m.score >= 0.12)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, k);
    // Marca o uso (melhor esforço; não espera).
    if (scored.length) {
      Promise.resolve(
        deps.admin.from(VCA_MEMORY_TABLE).update({ last_used_at: new Date(now).toISOString() }).in("id", scored.map((m) => m.id)).eq("user_id", deps.userId),
      ).catch(() => {});
    }
    return { available: true, memories: scored, projectSummary, usedEmbeddings: !!qEmb };
  } catch (err) {
    deps.warn?.(`[vertal-code-ai] memória indisponível: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
    return empty;
  }
}

/** Grava o que a execução aprendeu + atualiza o resumo do projeto. Nunca lança; devolve quantas gravou. */
export async function rememberRun(
  deps: MemoryStoreDeps,
  drafts: VcaMemoryDraft[],
  projectSummary: string | null,
  meta: { runId: string },
): Promise<number> {
  if (!memoryLooksAvailable()) return 0;
  try {
    const rows = [];
    for (const d of drafts) {
      const emb = await safeEmbed(deps.embed, d.content);
      rows.push({
        user_id: deps.userId,
        project_id: d.scope === "project" ? deps.projectId : null,
        scope: d.scope,
        kind: d.kind,
        content: d.content.slice(0, VCA_MEMORY_LIMITS.maxContentChars),
        importance: clampImportance(d.importance),
        source: "team_run",
        source_run_id: meta.runId.slice(0, 64),
        ...(emb ? { embedding: toPgVector(emb) } : {}),
      });
    }
    let saved = 0;
    if (rows.length) {
      const { error } = await deps.admin.from(VCA_MEMORY_TABLE).insert(rows);
      if (error) {
        if (markMissing(error, deps.warn)) return 0;
        throw error;
      }
      saved = rows.length;
    }
    if (projectSummary && projectSummary.trim()) {
      let q = deps.admin.from(VCA_MEMORY_TABLE).select("id").eq("user_id", deps.userId).eq("kind", "project_summary").eq("scope", "project");
      q = deps.projectId ? q.eq("project_id", deps.projectId) : q.is("project_id", null);
      const { data: cur, error: curErr } = await q.limit(1);
      if (curErr) {
        if (markMissing(curErr, deps.warn)) return saved;
        throw curErr;
      }
      const content = projectSummary.slice(0, VCA_MEMORY_LIMITS.maxProjectSummaryChars);
      const emb = await safeEmbed(deps.embed, content);
      const patch = { content, updated_at: new Date().toISOString(), source_run_id: meta.runId.slice(0, 64), ...(emb ? { embedding: toPgVector(emb) } : {}) };
      const { error } = cur?.[0]?.id
        ? await deps.admin.from(VCA_MEMORY_TABLE).update(patch).eq("id", cur[0].id).eq("user_id", deps.userId)
        : await deps.admin.from(VCA_MEMORY_TABLE).insert({
          user_id: deps.userId,
          project_id: deps.projectId,
          scope: "project",
          kind: "project_summary",
          importance: 4,
          source: "team_run",
          ...patch,
        });
      if (error) throw error;
    }
    return saved;
  } catch (err) {
    deps.warn?.(`[vertal-code-ai] não gravou memória: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
    return 0;
  }
}

/** Lista para a tela "Memória" (RLS do usuário). Tabela ausente → available:false. */
export async function listMemories(
  deps: MemoryStoreDeps,
  opts: { allProjects?: boolean; limit?: number } = {},
): Promise<{ available: boolean; items: VcaMemory[] }> {
  const db = deps.userClient ?? deps.admin;
  try {
    let q = db
      .from(VCA_MEMORY_TABLE)
      .select("id, scope, kind, content, importance, project_id, created_at, updated_at")
      .eq("user_id", deps.userId);
    if (!opts.allProjects) q = q.or(scopeFilter(deps.projectId));
    const { data, error } = await q.order("updated_at", { ascending: false }).limit(Math.min(500, opts.limit ?? 200));
    if (error) {
      if (isMissingRelation(error)) return { available: false, items: [] };
      throw error;
    }
    return { available: true, items: (data ?? []) as VcaMemory[] };
  } catch (err) {
    deps.warn?.(`[vertal-code-ai] listar memória falhou: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
    return { available: false, items: [] };
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Apaga memórias do usuário: ids específicos, ou tudo do escopo atual (clear), ou tudo (clearAll).
 * Sempre com user_id no filtro (além do RLS).
 */
export async function deleteMemories(
  deps: MemoryStoreDeps,
  req: { ids?: unknown; clear?: boolean; clearAll?: boolean },
): Promise<{ available: boolean; deleted: number }> {
  const db = deps.userClient ?? deps.admin;
  try {
    let q = db.from(VCA_MEMORY_TABLE).delete({ count: "exact" }).eq("user_id", deps.userId);
    if (Array.isArray(req.ids)) {
      const ids = req.ids.filter((i): i is string => typeof i === "string" && UUID_RE.test(i)).slice(0, 200);
      if (!ids.length) return { available: true, deleted: 0 };
      q = q.in("id", ids);
    } else if (req.clear) {
      q = deps.projectId ? q.eq("project_id", deps.projectId) : q.is("project_id", null).eq("scope", "project");
    } else if (!req.clearAll) {
      return { available: true, deleted: 0 };
    }
    const { error, count } = await q;
    if (error) {
      if (isMissingRelation(error)) return { available: false, deleted: 0 };
      throw error;
    }
    return { available: true, deleted: count ?? 0 };
  } catch (err) {
    deps.warn?.(`[vertal-code-ai] apagar memória falhou: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
    return { available: false, deleted: 0 };
  }
}
