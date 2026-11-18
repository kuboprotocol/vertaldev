// Executor no estilo Plandex para o Vibe Code: níveis de autonomia, pacotes de
// modelos, sandbox de mudanças "staged", diff/rebase com checagem de hash,
// trava de escritor único, mapa do repositório em cache e o contexto
// compartilhado que alimenta os três motores (plano, executor e revisor).
//
// Ideias e fluxo portados do Plandex (MIT, Copyright (c) 2025 PlandexAI Inc. —
// https://github.com/plandex-ai/plandex): níveis de autonomia (none/basic/
// plus/semi/full, ver app/shared/plan_config.go), pacotes de modelos por papel
// (app/shared/ai_models_packs.go), mudanças pendentes revisadas antes de
// aplicar, rewind e auto-debug com limite de tentativas. Reescrito em
// TypeScript para rodar dentro da edge function vibe-code-agent (o servidor Go
// não roda aqui). Ver THIRD_PARTY_NOTICES.md.
//
// Puro (sem Deno/DOM): os mesmos cálculos rodam no servidor e no navegador.

import { hashText } from "./vibeReviewEngine.ts";
import { formatTaskGraphForPrompt, type PlanTask, type TaskGraph } from "./vibeTaskGraph.ts";

export type ModelTier = "flash" | "pro";

// ---------------------------------------------------------------------------
// Autonomia
// ---------------------------------------------------------------------------

export type AutonomyLevel = "none" | "basic" | "plus" | "semi" | "full";
export const AUTONOMY_LEVELS: AutonomyLevel[] = ["none", "basic", "plus", "semi", "full"];

export interface AutonomyConfig {
  level: AutonomyLevel;
  label: string;
  description: string;
  /** O executor escolhe e carrega sozinho os arquivos de contexto. */
  autoContext: boolean;
  /** O revisor (PR-Agent) roda sozinho no diff staged antes de aplicar. */
  autoReview: boolean;
  /** Aplica sem perguntar (só quando a revisão não achou nada crítico/alto). */
  autoApply: boolean;
  /** Depois de aplicar, segue para a próxima tarefa sem esperar um clique. */
  autoContinue: boolean;
  /** Erros de build/preview disparam o auto-debug sozinhos (com limite). */
  autoDebug: boolean;
}

export const AUTONOMY: Record<AutonomyLevel, AutonomyConfig> = {
  none: {
    level: "none",
    label: "Manual",
    description: "Passo a passo: você escolhe os arquivos, roda a revisão e aplica cada mudança.",
    autoContext: false,
    autoReview: false,
    autoApply: false,
    autoContinue: false,
    autoDebug: false,
  },
  basic: {
    level: "basic",
    label: "Básico",
    description: "Carrega contexto pelo plano, mas você aplica e avança cada tarefa.",
    autoContext: true,
    autoReview: false,
    autoApply: false,
    autoContinue: false,
    autoDebug: false,
  },
  plus: {
    level: "plus",
    label: "Básico+",
    description: "Contexto inteligente e revisão automática do diff; você aplica e avança.",
    autoContext: true,
    autoReview: true,
    autoApply: false,
    autoContinue: false,
    autoDebug: false,
  },
  semi: {
    level: "semi",
    label: "Semi-autônomo",
    description: "Executa, revisa e pergunta antes de aplicar; depois de aplicar segue para a próxima.",
    autoContext: true,
    autoReview: true,
    autoApply: false,
    autoContinue: true,
    autoDebug: false,
  },
  full: {
    level: "full",
    label: "Autônomo",
    description: "Executa, revisa, aplica sozinho quando a revisão não acha nada grave e depura erros (com limite).",
    autoContext: true,
    autoReview: true,
    autoApply: true,
    autoContinue: true,
    autoDebug: true,
  },
};

export function normalizeAutonomy(v: unknown, fallback: AutonomyLevel = "semi"): AutonomyLevel {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  const alias: Record<string, AutonomyLevel> = {
    manual: "none",
    nenhum: "none",
    nenhuma: "none",
    basico: "basic",
    "básico": "basic",
    "basic+": "plus",
    "basico+": "plus",
    "básico+": "plus",
    semiautonomo: "semi",
    "semi-autonomo": "semi",
    "semi-autônomo": "semi",
    auto: "full",
    autonomo: "full",
    "autônomo": "full",
    total: "full",
  };
  if ((AUTONOMY_LEVELS as string[]).includes(s)) return s as AutonomyLevel;
  return alias[s] ?? fallback;
}

// ---------------------------------------------------------------------------
// Pacotes de modelos → roteador existente (tiers flash/pro)
// ---------------------------------------------------------------------------

export type ModelPack = "cheap" | "balanced" | "strong";
export const MODEL_PACKS: ModelPack[] = ["cheap", "balanced", "strong"];
export type ModelRole = "planner" | "coder" | "reviewer" | "debugger" | "expander";

export const MODEL_PACK_LABEL: Record<ModelPack, { label: string; description: string }> = {
  cheap: { label: "Econômico", description: "Tudo no modelo rápido; só sobe para o forte em nova tentativa." },
  balanced: { label: "Equilibrado", description: "Rápido para planejar e revisar; forte só para código complexo ou nova tentativa." },
  strong: { label: "Forte", description: "Modelo forte para planejar e programar; revisão continua no rápido." },
};

export function normalizeModelPack(v: unknown, fallback: ModelPack = "balanced"): ModelPack {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  const alias: Record<string, ModelPack> = { barato: "cheap", economico: "cheap", "econômico": "cheap", equilibrado: "balanced", forte: "strong", daily: "balanced" };
  if ((MODEL_PACKS as string[]).includes(s)) return s as ModelPack;
  return alias[s] ?? fallback;
}

export interface TierInput {
  /** 1-10 (vibeTaskGraph.analyzeComplexity). */
  complexity?: number;
  /** 1 = primeira tentativa; 2+ = nova tentativa / auto-debug. */
  attempt?: number;
  /** Tier do planejador vindo de VIBE_PLAN_TIER. */
  planTier?: ModelTier;
  /** Nota a partir da qual o pacote equilibrado usa o modelo forte. */
  proComplexity?: number;
}

/**
 * Tier por papel. Regra de economia: começa no flash e só sobe para o pro em
 * nova tentativa (attempt ≥ 2) ou complexidade alta; a revisão fica no flash.
 */
export function tierFor(role: ModelRole, pack: ModelPack, input: TierInput = {}): ModelTier {
  const attempt = input.attempt ?? 1;
  const complex = (input.complexity ?? 0) >= (input.proComplexity ?? 8);
  const retry = attempt >= 2;
  if (role === "reviewer") return pack === "strong" && retry ? "pro" : "flash";
  if (role === "planner" || role === "expander") {
    if (pack === "strong") return "pro";
    return input.planTier === "pro" || retry ? "pro" : "flash";
  }
  // coder / debugger
  if (pack === "strong") return "pro";
  if (pack === "cheap") return retry ? "pro" : "flash";
  return retry || complex ? "pro" : "flash";
}

// ---------------------------------------------------------------------------
// Botões de custo (env) com padrões
// ---------------------------------------------------------------------------

export interface PlanKnobs {
  /** VIBE_PLAN_TIER: tier do planejador (padrão flash). */
  planTier: ModelTier;
  /** VIBE_AUTODEBUG_MAX: tentativas de auto-debug por tarefa (padrão 3). */
  autodebugMax: number;
  /** VIBE_AUTONOMY_DEFAULT (padrão semi). */
  autonomyDefault: AutonomyLevel;
  /** VIBE_MODEL_PACK_DEFAULT (padrão balanced). */
  modelPackDefault: ModelPack;
  /** VIBE_PLAN_CREDIT_COST: créditos por planejar/executar/depurar (padrão 0; aplicar cobra pelo caminho normal). */
  planCreditCost: number;
  /** VIBE_CONTEXT_TOKEN_BUDGET: orçamento de contexto do executor, em tokens (padrão 24000). */
  contextTokenBudget: number;
  /** VIBE_TINY_DIFF_LINES: até quantas linhas alteradas um diff é "minúsculo" (padrão 12). */
  tinyDiffLines: number;
  /** VIBE_LOCK_TTL_SECONDS: validade da trava de escritor (padrão 180). */
  lockTtlSeconds: number;
  /** VIBE_PLAN_MAX_TASKS (padrão 12). */
  maxTasks: number;
  /** VIBE_EXPAND_THRESHOLD: nota de complexidade que sugere dividir (padrão 7). */
  expandThreshold: number;
  /** VIBE_PRO_COMPLEXITY: nota a partir da qual o pacote equilibrado usa pro (padrão 8). */
  proComplexity: number;
}

export const DEFAULT_KNOBS: PlanKnobs = {
  planTier: "flash",
  autodebugMax: 3,
  autonomyDefault: "semi",
  modelPackDefault: "balanced",
  planCreditCost: 0,
  contextTokenBudget: 24000,
  tinyDiffLines: 12,
  lockTtlSeconds: 180,
  maxTasks: 12,
  expandThreshold: 7,
  proComplexity: 8,
};

export function readKnobs(get: (key: string) => string | undefined): PlanKnobs {
  const int = (key: string, def: number, min: number, max: number) => {
    const n = Number.parseInt(get(key) ?? "", 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  return {
    planTier: get("VIBE_PLAN_TIER") === "pro" ? "pro" : "flash",
    autodebugMax: int("VIBE_AUTODEBUG_MAX", DEFAULT_KNOBS.autodebugMax, 0, 10),
    autonomyDefault: normalizeAutonomy(get("VIBE_AUTONOMY_DEFAULT"), DEFAULT_KNOBS.autonomyDefault),
    modelPackDefault: normalizeModelPack(get("VIBE_MODEL_PACK_DEFAULT"), DEFAULT_KNOBS.modelPackDefault),
    planCreditCost: int("VIBE_PLAN_CREDIT_COST", 0, 0, 100),
    contextTokenBudget: int("VIBE_CONTEXT_TOKEN_BUDGET", DEFAULT_KNOBS.contextTokenBudget, 2000, 120000),
    tinyDiffLines: int("VIBE_TINY_DIFF_LINES", DEFAULT_KNOBS.tinyDiffLines, 0, 500),
    lockTtlSeconds: int("VIBE_LOCK_TTL_SECONDS", DEFAULT_KNOBS.lockTtlSeconds, 30, 900),
    maxTasks: int("VIBE_PLAN_MAX_TASKS", DEFAULT_KNOBS.maxTasks, 1, 30),
    expandThreshold: int("VIBE_EXPAND_THRESHOLD", DEFAULT_KNOBS.expandThreshold, 1, 11),
    proComplexity: int("VIBE_PRO_COMPLEXITY", DEFAULT_KNOBS.proComplexity, 1, 11),
  };
}

// ---------------------------------------------------------------------------
// Diff de linhas, diff unificado e rebase
// ---------------------------------------------------------------------------

export type DiffOp = { type: "eq" | "del" | "add"; line: string };

const MAX_LCS_CELLS = 4_000_000;

/** Diff de linhas (LCS) com corte de prefixo/sufixo comuns. */
export function diffLines(oldText: string, newText: string): DiffOp[] {
  const a = oldText === "" ? [] : oldText.split("\n");
  const b = newText === "" ? [] : newText.split("\n");
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const am = a.slice(pre, a.length - suf);
  const bm = b.slice(pre, b.length - suf);
  const ops: DiffOp[] = a.slice(0, pre).map((line) => ({ type: "eq" as const, line }));
  if (am.length * bm.length > MAX_LCS_CELLS) {
    for (const line of am) ops.push({ type: "del", line });
    for (const line of bm) ops.push({ type: "add", line });
  } else {
    const n = am.length;
    const m = bm.length;
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = am[i] === bm[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && am[i] === bm[j]) {
        ops.push({ type: "eq", line: am[i++] });
        j++;
      } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) ops.push({ type: "add", line: bm[j++] });
      else ops.push({ type: "del", line: am[i++] });
    }
  }
  for (const line of a.slice(a.length - suf)) ops.push({ type: "eq", line });
  return ops;
}

export function diffStats(oldText: string, newText: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const op of diffLines(oldText, newText)) {
    if (op.type === "add") added++;
    else if (op.type === "del") removed++;
  }
  return { added, removed };
}

export interface Hunk {
  /** Índice 0-based da primeira linha antiga coberta. */
  oldStart: number;
  oldLines: string[];
  newLines: string[];
  before: string[];
  after: string[];
}

export function computeHunks(oldText: string, newText: string, context = 3): Hunk[] {
  const ops = diffLines(oldText, newText);
  const hunks: Hunk[] = [];
  let oldIdx = 0;
  let k = 0;
  while (k < ops.length) {
    if (ops[k].type === "eq") {
      oldIdx++;
      k++;
      continue;
    }
    const start = oldIdx;
    const oldLines: string[] = [];
    const newLines: string[] = [];
    while (k < ops.length && ops[k].type !== "eq") {
      if (ops[k].type === "del") {
        oldLines.push(ops[k].line);
        oldIdx++;
      } else newLines.push(ops[k].line);
      k++;
    }
    hunks.push({ oldStart: start, oldLines, newLines, before: [], after: [] });
  }
  const a = oldText === "" ? [] : oldText.split("\n");
  for (const h of hunks) {
    h.before = a.slice(Math.max(0, h.oldStart - context), h.oldStart);
    h.after = a.slice(h.oldStart + h.oldLines.length, h.oldStart + h.oldLines.length + context);
  }
  return hunks;
}

/** Diff unificado com cabeçalhos @@ (para a tela de revisão das mudanças staged). */
export function unifiedDiff(path: string, oldText: string, newText: string, context = 3): string {
  const ops = diffLines(oldText, newText);
  const out: string[] = [`--- ${oldText === "" ? "/dev/null" : `a/${path}`}`, `+++ b/${path}`];
  const changed = ops.map((o) => o.type !== "eq");
  let i = 0;
  let oldLine = 1;
  let newLine = 1;
  const pos: Array<{ o: number; n: number }> = ops.map((op) => {
    const p = { o: oldLine, n: newLine };
    if (op.type !== "add") oldLine++;
    if (op.type !== "del") newLine++;
    return p;
  });
  while (i < ops.length) {
    if (!changed[i]) {
      i++;
      continue;
    }
    const start = Math.max(0, i - context);
    let end = i;
    // Junta mudanças próximas num mesmo hunk.
    while (end < ops.length) {
      if (changed[end]) {
        end++;
        continue;
      }
      let nextChange = end;
      while (nextChange < ops.length && !changed[nextChange]) nextChange++;
      if (nextChange < ops.length && nextChange - end <= context * 2) end = nextChange;
      else break;
    }
    const stop = Math.min(ops.length, end + context);
    const slice = ops.slice(start, stop);
    const oldCount = slice.filter((o) => o.type !== "add").length;
    const newCount = slice.filter((o) => o.type !== "del").length;
    out.push(`@@ -${oldCount ? pos[start].o : pos[start].o - 1},${oldCount} +${newCount ? pos[start].n : pos[start].n - 1},${newCount} @@`);
    for (const op of slice) out.push(`${op.type === "eq" ? " " : op.type === "del" ? "-" : "+"}${op.line}`);
    i = stop;
  }
  return out.join("\n");
}

function findUnique(lines: string[], needle: string[], from: number): number {
  if (!needle.length) return -1;
  let found = -1;
  for (let i = from; i + needle.length <= lines.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (lines[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      if (found >= 0) return -2; // ambíguo
      found = i;
    }
  }
  return found;
}

export type RebaseResult = { ok: true; content: string } | { ok: false; reason: string };

/**
 * Reaplica as mudanças (base → proposta) em cima do arquivo atual, que mudou
 * por baixo. Cada trecho é localizado pelo texto antigo + linhas vizinhas; se
 * algum não for encontrado de forma única, desiste (o Dev regenera a tarefa).
 */
export function rebaseContent(base: string, proposed: string, current: string): RebaseResult {
  if (current === base) return { ok: true, content: proposed };
  const hunks = computeHunks(base, proposed, 3);
  if (!hunks.length) return { ok: true, content: current };
  const lines = current === "" ? [] : current.split("\n");
  // Aplica de trás para frente para não deslocar os índices dos anteriores.
  const placed: Array<{ at: number; len: number; insert: string[] }> = [];
  let cursor = 0;
  for (const h of hunks) {
    let at = -1;
    for (const ctx of [3, 1, 0]) {
      const before = h.before.slice(Math.max(0, h.before.length - ctx));
      const after = h.after.slice(0, ctx);
      const needle = [...before, ...h.oldLines, ...after];
      if (!needle.length) break;
      const idx = findUnique(lines, needle, cursor);
      if (idx === -2) continue;
      if (idx >= 0) {
        at = idx + before.length;
        break;
      }
    }
    if (at < 0) {
      // Inserção pura sem âncora: só dá para aplicar se o arquivo estava vazio.
      if (!h.oldLines.length && !h.before.length && !h.after.length) at = 0;
      else return { ok: false, reason: `o trecho perto da linha ${h.oldStart + 1} mudou e não consegui encaixar a alteração` };
    }
    placed.push({ at, len: h.oldLines.length, insert: h.newLines });
    cursor = at + h.oldLines.length;
  }
  for (const p of [...placed].reverse()) lines.splice(p.at, p.len, ...p.insert);
  return { ok: true, content: lines.join("\n") };
}

// ---------------------------------------------------------------------------
// Mudanças staged (sandbox: nada vai para o projeto até o Dev aprovar)
// ---------------------------------------------------------------------------

export interface StagedChange {
  path: string;
  /** Hash do arquivo no projeto quando a mudança foi gerada ("" = arquivo novo). */
  baseHash: string;
  baseContent: string;
  content: string;
  reason?: string;
  taskId?: number;
  /** "debug" quando veio do auto-debug. */
  origin: "task" | "debug" | "manual";
  status: "pending" | "stale";
  added: number;
  removed: number;
  createdAt: string;
}

export function stageChange(input: { path: string; baseContent: string; content: string; reason?: string; taskId?: number; origin?: StagedChange["origin"]; now?: string }): StagedChange {
  const stats = diffStats(input.baseContent, input.content);
  return {
    path: input.path,
    baseHash: input.baseContent === "" ? "" : hashText(input.baseContent),
    baseContent: input.baseContent,
    content: input.content,
    ...(input.reason ? { reason: input.reason.slice(0, 500) } : {}),
    ...(typeof input.taskId === "number" ? { taskId: input.taskId } : {}),
    origin: input.origin ?? "task",
    status: "pending",
    added: stats.added,
    removed: stats.removed,
    createdAt: input.now ?? new Date().toISOString(),
  };
}

/** Junta uma mudança nova com a lista (uma por arquivo; a mais nova vence, mantendo a base original). */
export function upsertStaged(list: StagedChange[], change: StagedChange): StagedChange[] {
  const existing = list.find((s) => s.path === change.path);
  if (!existing) return [...list, change];
  const merged = stageChange({
    path: change.path,
    baseContent: existing.baseContent,
    content: change.content,
    reason: change.reason ?? existing.reason,
    taskId: change.taskId ?? existing.taskId,
    origin: change.origin,
    now: change.createdAt,
  });
  return list.map((s) => (s.path === change.path ? { ...merged, baseHash: existing.baseHash } : s));
}

export function stagedDiff(change: StagedChange): string {
  return unifiedDiff(change.path, change.baseContent, change.content);
}

export function totalChangedLines(changes: StagedChange[]): number {
  return changes.reduce((n, c) => n + c.added + c.removed, 0);
}

export function isTinyDiff(changes: StagedChange[], tinyDiffLines: number): boolean {
  const n = totalChangedLines(changes);
  return n > 0 && n <= tinyDiffLines;
}

export type FreshnessCheck =
  | { state: "fresh"; content: string }
  | { state: "rebased"; content: string }
  | { state: "stale"; reason: string };

/**
 * Antes de aplicar: o arquivo mudou por baixo (outra correção, edição manual,
 * rewind)? Hash igual → aplica como está. Diferente → tenta rebase; se não
 * encaixar → "stale" (a mudança é invalidada e a tarefa precisa ser refeita).
 */
export function checkFreshness(change: StagedChange, currentContent: string): FreshnessCheck {
  const currentHash = currentContent === "" ? "" : hashText(currentContent);
  if (currentHash === change.baseHash) return { state: "fresh", content: change.content };
  if (change.baseHash === "" && currentContent !== "") {
    return { state: "stale", reason: `${change.path} foi criado por outra ação depois que esta mudança foi gerada` };
  }
  const rebased = rebaseContent(change.baseContent, change.content, currentContent);
  // `in` estreita o tipo também com strict: false (tsconfig.app.json), onde `ok` não discrimina.
  if ("reason" in rebased) return { state: "stale", reason: `${change.path} mudou depois que esta mudança foi gerada: ${rebased.reason}` };
  return { state: "rebased", content: rebased.content };
}

// ---------------------------------------------------------------------------
// Trava de escritor único por conversa
// ---------------------------------------------------------------------------

export type WriterKind = "executor" | "fix_queue" | "manual" | "debug" | "rewind";

export const WRITER_LABEL: Record<WriterKind, string> = {
  executor: "o executor do plano",
  fix_queue: "a fila de correções",
  manual: "uma aplicação manual",
  debug: "o auto-debug",
  rewind: "o rewind",
};

export interface WriterLockState {
  owner: string;
  kind: WriterKind;
  /** epoch ms */
  until: number;
}

export function lockBusyMessage(held: Pick<WriterLockState, "kind">): string {
  return `Agora ${WRITER_LABEL[held.kind]} está gravando nesta conversa. Uma escrita por vez: espere terminar e tente de novo.`;
}

export function decideLock(current: WriterLockState | null, request: { owner: string; kind: WriterKind }, now: number): { ok: true } | { ok: false; held: WriterLockState; message: string } {
  if (!current || current.until <= now || current.owner === request.owner) return { ok: true };
  return { ok: false, held: current, message: lockBusyMessage(current) };
}

export function parseLockOwner(raw: string | null | undefined): { kind: WriterKind; id: string } | null {
  if (!raw) return null;
  const [kind, id] = raw.split(":");
  if (!["executor", "fix_queue", "manual", "debug", "rewind"].includes(kind)) return null;
  return { kind: kind as WriterKind, id: id ?? "" };
}

// ---------------------------------------------------------------------------
// Mapa do repositório (em cache por conversa) e escolha de contexto
// ---------------------------------------------------------------------------

export interface RepoMap {
  treeHash: string;
  tree: string[];
  /** Símbolos exportados dos arquivos já lidos (path → { hash, symbols }). */
  symbols: Record<string, { hash: string; symbols: string[] }>;
  builtAt: string;
}

const MAX_MAP_SYMBOLS = 120;

export function extractSymbols(content: string, max = 12): string[] {
  const out: string[] = [];
  const re = /export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) && out.length < max) if (!out.includes(m[1])) out.push(m[1]);
  if (/export\s+default\s+/.test(content) && !out.length) out.push("default");
  return out;
}

/** Reaproveita o mapa em cache quando a árvore não mudou (zero leituras extras). */
export function buildRepoMap(tree: string[], previous: RepoMap | null | undefined, now = new Date().toISOString()): { map: RepoMap; reused: boolean } {
  const sorted = [...tree].sort();
  const treeHash = hashText(sorted.join("\n"));
  if (previous && previous.treeHash === treeHash) return { map: previous, reused: true };
  const keep = new Set(sorted);
  const symbols: RepoMap["symbols"] = {};
  for (const [p, s] of Object.entries(previous?.symbols ?? {})) if (keep.has(p)) symbols[p] = s;
  return { map: { treeHash, tree: sorted, symbols, builtAt: now }, reused: false };
}

export function noteFileInMap(map: RepoMap, path: string, content: string): RepoMap {
  const hash = hashText(content);
  if (map.symbols[path]?.hash === hash) return map;
  const symbols = { ...map.symbols, [path]: { hash, symbols: extractSymbols(content) } };
  const keys = Object.keys(symbols);
  if (keys.length > MAX_MAP_SYMBOLS) for (const k of keys.slice(0, keys.length - MAX_MAP_SYMBOLS)) delete symbols[k];
  return { ...map, symbols };
}

export function formatRepoMap(map: RepoMap | null | undefined, maxChars = 6000): string {
  if (!map?.tree.length) return "O projeto ainda não tem arquivos.";
  let out = "";
  for (const p of map.tree) {
    const sym = map.symbols[p]?.symbols;
    const line = sym?.length ? `${p} — ${sym.join(", ")}` : p;
    if (out.length + line.length + 1 > maxChars) {
      out += `… (+${map.tree.length - out.split("\n").length + 1} arquivos)`;
      break;
    }
    out += `${line}\n`;
  }
  return out.trimEnd();
}

export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const STOP = new Set(["the", "and", "para", "com", "uma", "que", "dos", "das", "add", "new", "file", "arquivo", "criar", "tela", "page", "src", "componente", "component", "index", "ts", "tsx"]);

function keywords(text: string): string[] {
  return [...new Set(text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)))];
}

/**
 * Arquivos candidatos para uma tarefa, em ordem (sem chamar modelo): os que o
 * plano citou, os staged, depois os cujo caminho bate com palavras da tarefa.
 */
export function selectContextFiles(input: { tree: string[]; task: Pick<PlanTask, "title" | "description" | "details" | "files">; extra?: string[]; max?: number }): string[] {
  const set = new Set(input.tree);
  const out: string[] = [];
  const push = (p: string) => {
    if (!out.includes(p)) out.push(p);
  };
  for (const p of input.task.files) if (set.has(p)) push(p);
  for (const p of input.extra ?? []) if (set.has(p)) push(p);
  const words = keywords(`${input.task.title} ${input.task.description} ${input.task.details}`);
  if (words.length) {
    const scored = input.tree
      .filter((p) => !out.includes(p) && /\.(tsx?|jsx?|css|sql|html)$/.test(p) && !/\.(test|spec)\./.test(p))
      .map((p) => ({ p, s: words.filter((w) => p.toLowerCase().includes(w)).length }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.p.length - b.p.length);
    for (const x of scored.slice(0, 6)) push(x.p);
  }
  return out.slice(0, input.max ?? 12);
}

/** Imports relativos/"@/" de um arquivo que existem na árvore (1 nível, para completar o contexto). */
export function resolveImports(fromPath: string, content: string, tree: string[]): string[] {
  const set = new Set(tree);
  const dir = fromPath.split("/").slice(0, -1);
  const found: string[] = [];
  const re = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const spec = m[1] ?? m[2];
    let base: string[] | null = null;
    if (spec.startsWith("@/")) base = ["src", ...spec.slice(2).split("/")];
    else if (spec.startsWith(".")) {
      base = [...dir];
      for (const part of spec.split("/")) {
        if (part === "." || part === "") continue;
        if (part === "..") base.pop();
        else base.push(part);
      }
    }
    if (!base) continue;
    const stem = base.join("/");
    for (const cand of [stem, `${stem}.ts`, `${stem}.tsx`, `${stem}.js`, `${stem}.jsx`, `${stem}/index.ts`, `${stem}/index.tsx`]) {
      if (set.has(cand)) {
        if (!found.includes(cand)) found.push(cand);
        break;
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Estado do agente por conversa (vibe_conversations.agent_state)
// ---------------------------------------------------------------------------

export interface AppliedEntry {
  taskId?: number;
  checkpointId?: string;
  commitSha?: string;
  /** Commit/versão de cada arquivo gravado (o rewind desfaz arquivo por arquivo). */
  fileShas?: Record<string, string>;
  files: string[];
  at: string;
}

export interface VibeAgentState {
  version: 1;
  graph: TaskGraph | null;
  staged: StagedChange[];
  autonomy: AutonomyLevel;
  modelPack: ModelPack;
  repoMap: RepoMap | null;
  /** Auto-debug da tarefa atual. */
  debug: { taskId: number | null; attempts: number } | null;
  /** Pilha do que o executor aplicou (para /voltar). */
  applied: AppliedEntry[];
  /** Passagem de bastão Chat ↔ Vibe Code (opcional; sem migração, vive no agent_state). */
  handoff?: VibeHandoff;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Handoff (Chat ↔ Vibe Code)
// ---------------------------------------------------------------------------

export const HANDOFF_STATUSES = ["open", "running", "waiting_user", "done", "failed"] as const;
export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];
export const HANDOFF_ORIGINS = ["vertal_chat", "vibe_code"] as const;
export type HandoffOrigin = (typeof HANDOFF_ORIGINS)[number];

export interface VibeHandoff {
  chatConversationId?: string;
  goal?: string;
  status?: HandoffStatus;
  lastSummary?: string;
  origin?: HandoffOrigin;
  updatedAt?: string;
}

const HANDOFF_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDOFF_MAX_GOAL = 600;
const HANDOFF_MAX_SUMMARY = 1500;

const handoffText = (v: unknown, max: number) => {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : undefined;
};

/** Lê o handoff guardado de forma defensiva; campos inválidos somem, nada lança. Vazio = undefined. */
export function normalizeHandoff(raw: unknown): VibeHandoff | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: VibeHandoff = {};
  if (typeof r.chatConversationId === "string" && HANDOFF_UUID_RE.test(r.chatConversationId)) out.chatConversationId = r.chatConversationId.toLowerCase();
  const goal = handoffText(r.goal, HANDOFF_MAX_GOAL);
  if (goal) out.goal = goal;
  if ((HANDOFF_STATUSES as readonly unknown[]).includes(r.status)) out.status = r.status as HandoffStatus;
  const lastSummary = handoffText(r.lastSummary, HANDOFF_MAX_SUMMARY);
  if (lastSummary) out.lastSummary = lastSummary;
  if ((HANDOFF_ORIGINS as readonly unknown[]).includes(r.origin)) out.origin = r.origin as HandoffOrigin;
  if (typeof r.updatedAt === "string" && !Number.isNaN(Date.parse(r.updatedAt))) out.updatedAt = r.updatedAt;
  return Object.keys(out).length ? out : undefined;
}

/** Junta um patch (já validado) ao handoff atual; campos ausentes no patch ficam como estavam. */
export function mergeHandoff(prev: VibeHandoff | undefined, patch: VibeHandoff, now = new Date().toISOString()): VibeHandoff {
  const clean = normalizeHandoff(patch) ?? {};
  return { ...(prev ?? {}), ...clean, updatedAt: now };
}

/**
 * Corpo `handoff` do vibe-code-agent: {action:"note", chatConversationId?, goal?, status?, lastSummary?, origin?}.
 * Devolve o patch validado, ou null quando a ação é desconhecida ou não sobra nenhum campo.
 */
export function parseHandoffNote(raw: unknown): VibeHandoff | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.action !== "note") return null;
  const { action: _action, updatedAt: _updatedAt, ...rest } = r;
  return normalizeHandoff(rest) ?? null;
}

const MAX_STATE_STAGED_CHARS = 400_000;
const MAX_APPLIED = 30;

export function emptyAgentState(knobs: Pick<PlanKnobs, "autonomyDefault" | "modelPackDefault"> = DEFAULT_KNOBS, now = new Date().toISOString()): VibeAgentState {
  return { version: 1, graph: null, staged: [], autonomy: knobs.autonomyDefault, modelPack: knobs.modelPackDefault, repoMap: null, debug: null, applied: [], updatedAt: now };
}

/** Lê o JSON guardado de forma defensiva (colunas antigas, campos faltando). */
export function normalizeAgentState(raw: unknown, knobs: Pick<PlanKnobs, "autonomyDefault" | "modelPackDefault"> = DEFAULT_KNOBS): VibeAgentState {
  const base = emptyAgentState(knobs);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const graph = r.graph && typeof r.graph === "object" && Array.isArray((r.graph as TaskGraph).tasks) ? (r.graph as TaskGraph) : null;
  const staged = (Array.isArray(r.staged) ? r.staged : []).filter(
    (s): s is StagedChange => !!s && typeof s === "object" && typeof (s as StagedChange).path === "string" && typeof (s as StagedChange).content === "string" && typeof (s as StagedChange).baseContent === "string",
  );
  const handoff = normalizeHandoff(r.handoff);
  return {
    version: 1,
    graph,
    staged,
    autonomy: normalizeAutonomy(r.autonomy, knobs.autonomyDefault),
    modelPack: normalizeModelPack(r.modelPack, knobs.modelPackDefault),
    repoMap: r.repoMap && typeof r.repoMap === "object" && Array.isArray((r.repoMap as RepoMap).tree) ? (r.repoMap as RepoMap) : null,
    debug: r.debug && typeof r.debug === "object" ? { taskId: typeof (r.debug as { taskId?: unknown }).taskId === "number" ? (r.debug as { taskId: number }).taskId : null, attempts: Number((r.debug as { attempts?: unknown }).attempts) || 0 } : null,
    applied: (Array.isArray(r.applied) ? r.applied : []).filter((a): a is AppliedEntry => !!a && typeof a === "object" && Array.isArray((a as AppliedEntry).files)).slice(-MAX_APPLIED),
    ...(handoff ? { handoff } : {}),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : base.updatedAt,
  };
}

/** Corta o que for grande demais antes de gravar (o mapa perde símbolos primeiro). */
export function compactAgentState(state: VibeAgentState): VibeAgentState {
  const size = state.staged.reduce((n, s) => n + s.content.length + s.baseContent.length, 0);
  if (size > MAX_STATE_STAGED_CHARS) throw new Error("staged_too_large");
  return { ...state, applied: state.applied.slice(-MAX_APPLIED) };
}

/** Versão para o navegador: sem a cópia da base (o diff já vai calculado). */
export interface ClientStagedChange extends Omit<StagedChange, "baseContent"> {
  diff: string;
}
export interface ClientAgentState extends Omit<VibeAgentState, "staged" | "repoMap"> {
  staged: ClientStagedChange[];
  repoFiles: number;
}

export function toClientState(state: VibeAgentState): ClientAgentState {
  const { repoMap, staged, ...rest } = state;
  return {
    ...rest,
    staged: staged.map(({ baseContent, ...s }) => ({ ...s, diff: unifiedDiff(s.path, baseContent, s.content) })),
    repoFiles: repoMap?.tree.length ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Contexto compartilhado (um objeto alimenta planejador, executor e revisor)
// ---------------------------------------------------------------------------

export interface SharedConversationContext {
  /** Memória do Prime já formatada. */
  memories: string;
  /** Contexto do Dev (erros, arquivo aberto, decisões da fila) já formatado. */
  dev: string;
  conversationSummary?: string | null;
  graph: TaskGraph | null;
  currentTaskId?: number;
  staged: Array<Pick<StagedChange, "path" | "added" | "removed" | "status">>;
}

export function formatSharedContext(ctx: SharedConversationContext, role: "planner" | "coder" | "reviewer"): string {
  const parts: string[] = [];
  if (ctx.memories) parts.push(ctx.memories.trim());
  if (ctx.dev) parts.push(ctx.dev.trim());
  if (ctx.conversationSummary) parts.push(`Resumo da conversa até aqui:\n${ctx.conversationSummary.slice(0, 1200)}`);
  const plan = formatTaskGraphForPrompt(ctx.graph, ctx.currentTaskId, role === "reviewer" ? 1200 : 3000);
  if (plan) parts.push(plan);
  if (ctx.staged.length && role !== "reviewer") {
    parts.push(`Mudanças staged (geradas, ainda NÃO aplicadas ao projeto):\n${ctx.staged.map((s) => `- ${s.path} (+${s.added}/-${s.removed}${s.status === "stale" ? ", desatualizada" : ""})`).join("\n")}`);
  }
  return parts.length ? `\n\n${parts.join("\n\n")}` : "";
}

// ---------------------------------------------------------------------------
// Estimativa de chamadas ao modelo por tarefa (transparência de custo)
// ---------------------------------------------------------------------------

export interface CallEstimate {
  role: ModelRole;
  tier: ModelTier;
  when: string;
}

export function expectedCallsPerTask(input: { autonomy: AutonomyLevel; pack: ModelPack; complexity?: number; knobs?: PlanKnobs }): { typical: CallEstimate[]; worstCase: number; notes: string[] } {
  const knobs = input.knobs ?? DEFAULT_KNOBS;
  const cfg = AUTONOMY[input.autonomy];
  const typical: CallEstimate[] = [
    { role: "coder", tier: tierFor("coder", input.pack, { complexity: input.complexity, proComplexity: knobs.proComplexity }), when: "gerar as mudanças staged da tarefa" },
  ];
  if (cfg.autoReview) typical.push({ role: "reviewer", tier: tierFor("reviewer", input.pack), when: "revisar só o diff staged (sem autorreflexão)" });
  const repair = 1; // auto-reparo quando a checagem estática barra um arquivo
  const debug = cfg.autoDebug ? knobs.autodebugMax * (cfg.autoReview ? 2 : 1) : 0;
  return {
    typical,
    worstCase: typical.length + repair + debug,
    notes: [
      "Contexto: 0 chamadas (arquivos citados no plano + imports + mapa do repositório em cache).",
      "Planejar o pedido: 1 chamada por plano (não por tarefa).",
      cfg.autoDebug ? `Auto-debug: até ${knobs.autodebugMax} tentativa(s), sobe para o modelo forte a partir da 2ª.` : "Auto-debug: só quando você pede (/debug), com o mesmo limite.",
    ],
  };
}
