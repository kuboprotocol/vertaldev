// VERTAL Code AI · Equipe Vertal: 3 núcleos + 5 papéis (lógica pura: sem Deno, sem rede).
//
//   Núcleo PENSA     → Gerente (entende o pedido, define escopo e divide em tarefas)
//                      Encarregado (coordena: dá a cada Engenheiro arquivos separados, acompanha o progresso)
//   Núcleo CONSTRÓI  → Engenheiros (escrevem o código; vários em paralelo, cada um nos SEUS arquivos)
//   Núcleo ENTREGA   → Revisor/QA (revisa o diff, roda verificação/typecheck e teste no sandbox se houver;
//                      reprova e devolve ao Engenheiro dono do arquivo)
//                      Entregador (pacote final, resumo para o usuário e o que vale lembrar)
//
// Papéis de coordenação (Gerente, Revisor, Entregador) usam a cadeia barata/própria; Engenheiros usam a
// cadeia mais forte (a opção que o usuário escolheu). O roteamento continua o de sempre (própria primeiro,
// grátis, pago só com VERTAL_CODE_AI_ALLOW_PAID) — este arquivo só recebe as funções de chamada prontas.
// O Encarregado é determinístico (não gasta chamada de modelo).
//
// Orçamento por execução (VcaBudgetGuard): máximo de chamadas, de tokens e de tempo. Estourou: o que já
// estava pronto é entregue, marcado como não verificado.
//
// Desligado por padrão: VERTAL_CODE_AI_TEAM_ENABLED + VERTAL_CODE_AI_TEAM_USER_IDS (ver isVcaTeamEnabled).

import { repairAgentJson } from "../chatOrchestrator.ts";
import { isSafePath } from "../vibeAgentCore.ts";
import {
  diffStats,
  type FileChange,
  formatFiles,
  indexFile,
  type IndexedFile,
  type ModelReply,
  rankRelevantFiles,
  repoMap,
  runVertalCodeAi,
  type SyntaxChecker,
  unifiedDiff,
  type VcaEvent,
  type VcaPlan,
  verifyChanges,
  type VerifyIssue,
} from "./core.ts";
import { estimateTokens, isVcaUserAllowed, type VcaChatMessage, type VcaEffort, type VcaEnv, type VcaMode } from "./router.ts";
import { formatMemoryContext, mergeProjectSummary, type RetrievedMemory, sanitizeDrafts, type VcaMemoryDraft } from "./memory.ts";
import { choiceOf, type DecideFn, type DecisionQuestions, type DecisionResult, type DecisionTier, scoreOf, yesNo } from "./decide.ts";

// ───────────────────────────── Interruptor (desligado por padrão) ─────────────────────────────

const truthy = (v: string | undefined) => /^(1|true|yes|on|sim)$/i.test((v ?? "").trim());

/**
 * O projeto Supabase está no limite de segredos: as chaves VERTAL_CODE_AI_TEAM_* também podem vir dentro do
 * JSON que já existe (VERTAL_GPU_CONFIG), assim como as do Vertal Decide (VERTAL_DECIDE_*). Segredo avulso com o
 * mesmo nome vence. Só essas chaves (nunca liga/desliga geral, lista de liberação ou chaves de provedores).
 */
const TEAM_KEY = /^VERTAL_(CODE_AI_TEAM_[A-Z0-9_]+|DECIDE_[A-Z0-9_]+)$/;
export function expandTeamEnv(env: VcaEnv): VcaEnv {
  const raw = (env.VERTAL_GPU_CONFIG ?? "").trim();
  if (!raw) return env;
  let cfg: unknown;
  try {
    cfg = JSON.parse(raw);
  } catch {
    return env;
  }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return env;
  const out: VcaEnv = { ...env };
  for (const [k, v] of Object.entries(cfg as Record<string, unknown>)) {
    if (!TEAM_KEY.test(k) || (out[k] ?? "").trim()) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = String(v);
  }
  return out;
}

/** Lista própria da Equipe. Vazia/ausente = NINGUÉM (diferente da lista geral, que vazia libera todos). */
export function vcaTeamUserIds(env: VcaEnv): string[] {
  return (env.VERTAL_CODE_AI_TEAM_USER_IDS ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Equipe liberada para este usuário? Exige: o VERTAL Code AI já liberado para ele (regra de sempre, sem mudança)
 * + VERTAL_CODE_AI_TEAM_ENABLED=true + o id em VERTAL_CODE_AI_TEAM_USER_IDS.
 */
export function isVcaTeamEnabled(env: VcaEnv, userId: string | null | undefined): boolean {
  if (!truthy(env.VERTAL_CODE_AI_TEAM_ENABLED)) return false;
  if (!userId || !isVcaUserAllowed(env, userId)) return false;
  return vcaTeamUserIds(env).includes(userId.trim().toLowerCase());
}

/** Memória expansiva (precisa da migração aplicada). Padrão: ligada junto com a Equipe; "false" desliga. */
export function isVcaTeamMemoryEnabled(env: VcaEnv): boolean {
  return !/^(0|false|no|off|nao|não)$/i.test((env.VERTAL_CODE_AI_TEAM_MEMORY ?? "").trim());
}

/** Teste no sandbox (E2B) só com VERTAL_CODE_AI_TEAM_E2B=true e E2B_API_KEY. */
export function isVcaTeamSandboxEnabled(env: VcaEnv): boolean {
  return truthy(env.VERTAL_CODE_AI_TEAM_E2B) && !!(env.E2B_API_KEY ?? "").trim();
}

// ───────────────────────────── Papéis e núcleos (rótulos pt-BR) ─────────────────────────────

export type VcaTeamRole = "gerente" | "encarregado" | "engenheiro" | "revisor" | "entregador";
export type VcaCore = "pensa" | "constroi" | "entrega";
export const VCA_TEAM_ROLES: VcaTeamRole[] = ["gerente", "encarregado", "engenheiro", "revisor", "entregador"];
export const VCA_ROLE_LABEL: Record<VcaTeamRole, string> = {
  gerente: "Gerente",
  encarregado: "Encarregado",
  engenheiro: "Engenheiro",
  revisor: "Revisor/QA",
  entregador: "Entregador",
};
export const VCA_CORE_LABEL: Record<VcaCore, string> = { pensa: "Pensa", constroi: "Constrói", entrega: "Entrega" };
export const VCA_ROLE_CORE: Record<VcaTeamRole, VcaCore> = {
  gerente: "pensa",
  encarregado: "pensa",
  engenheiro: "constroi",
  revisor: "entrega",
  entregador: "entrega",
};

export type VcaRoleState = "working" | "done" | "failed" | "skipped" | "rejected";

export type VcaTeamEvent =
  | VcaEvent
  | { kind: "core"; core: VcaCore; label: string; state: "start" | "done" }
  | { kind: "role"; role: VcaTeamRole; label: string; core: VcaCore; state: VcaRoleState; detail?: string; agent?: number }
  | { kind: "memory"; available: boolean; used: number; saved?: number; embeddings?: boolean }
  | { kind: "decision"; role: VcaTeamRole; key: string; label: string; value: string; confidence: number; tier: DecisionTier; source: string }
  | { kind: "budget"; decisions: number; calls: number; maxCalls: number; tokens: number; maxTokens: number; ms: number; maxMs: number; stopped: boolean }
  | {
    kind: "package";
    files: Array<{ path: string; added: number; removed: number; isNew: boolean; isDelete: boolean }>;
    verified: boolean;
    checks: { static: "ok" | "issues" | "skipped"; sandbox: "ok" | "failed" | "not_available"; review: "approved" | "rejected" | "skipped" };
    tasks: Array<{ title: string; files: string[]; state: "done" | "failed" | "partial" }>;
    /** Entregador: pronto para publicar? (Vertal Decide; null = sem decisão) */
    readyToShip: boolean | null;
    /** Revisão humana recomendada (Gerente/Vertal Decide). */
    humanReview: boolean;
    /** Perguntas para o usuário (decisões com confiança baixa). */
    questions: string[];
  };

// ───────────────────────────── Orçamento por execução ─────────────────────────────

export interface VcaTeamBudget {
  /** Decisões rápidas (Vertal Decide) contam à parte: são baratas, mas têm teto. */
  maxDecisions?: number;
  maxCalls: number;
  maxTokens: number;
  maxMs: number;
}

const num = (v: string | undefined, d: number) => (Number(v) > 0 ? Number(v) : d);

export function teamBudgetFromEnv(env: VcaEnv, deadlineMs: number): VcaTeamBudget {
  return {
    maxCalls: Math.min(60, num(env.VERTAL_CODE_AI_TEAM_MAX_CALLS, 16)),
    maxDecisions: Math.min(40, num(env.VERTAL_CODE_AI_TEAM_MAX_DECISIONS, 8)),
    maxTokens: Math.min(2_000_000, num(env.VERTAL_CODE_AI_TEAM_MAX_TOKENS, 200_000)),
    maxMs: Math.min(deadlineMs, num(env.VERTAL_CODE_AI_TEAM_MAX_MS, deadlineMs)),
  };
}

export class VcaBudgetError extends Error {
  constructor(public reason: "calls" | "tokens" | "time") {
    super(`vca_budget_${reason}`);
    this.name = "VcaBudgetError";
  }
}

/** Conta chamadas, tokens (entrada estimada + saída) e tempo. Recusa antes de estourar. */
export class VcaBudgetGuard {
  calls = 0;
  decisions = 0;
  tokens = 0;
  stopped = false;
  readonly start: number;
  constructor(readonly budget: VcaTeamBudget, private readonly now: () => number = Date.now) {
    this.start = now();
  }
  elapsed(): number {
    return this.now() - this.start;
  }
  left(): number {
    return this.budget.maxMs - this.elapsed();
  }
  /** Antes de cada chamada. minLeftMs = tempo que precisa sobrar (reserva para quem vem depois). */
  check(messages: VcaChatMessage[], minLeftMs: number): void {
    if (this.calls >= this.budget.maxCalls) this.stop("calls");
    if (this.tokens + estimateTokens(messages) > this.budget.maxTokens) this.stop("tokens");
    if (this.left() < minLeftMs) this.stop("time");
    this.calls++;
    this.tokens += estimateTokens(messages);
  }
  /** Antes de cada decisão rápida. false = sem orçamento (quem chamou segue com o padrão seguro). */
  tryDecision(stateChars: number): boolean {
    if (this.decisions >= (this.budget.maxDecisions ?? 8) || this.left() < 10_000) return false;
    if (this.tokens + Math.ceil(stateChars / 3.5) > this.budget.maxTokens) return false;
    this.decisions++;
    this.tokens += Math.ceil(stateChars / 3.5);
    return true;
  }
  record(reply: ModelReply): void {
    this.tokens += Math.ceil((reply.content?.length ?? 0) / 3.5);
  }
  private stop(reason: "calls" | "tokens" | "time"): never {
    this.stopped = true;
    throw new VcaBudgetError(reason);
  }
  snapshot() {
    return { decisions: this.decisions, calls: this.calls, maxCalls: this.budget.maxCalls, tokens: this.tokens, maxTokens: this.budget.maxTokens, ms: this.elapsed(), maxMs: this.budget.maxMs, stopped: this.stopped };
  }
}

// ───────────────────────────── Gerente: tarefas ─────────────────────────────

export interface VcaTeamTask {
  title: string;
  detail: string;
  files: string[];
}

export interface GerentePlan {
  goal: string;
  summary: string;
  tasks: VcaTeamTask[];
  risks: string[];
  questions: string[];
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const strList = (v: unknown, n: number, max: number) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, max)).slice(0, n) : [];

/** Lê a resposta do Gerente. null = ilegível (o Encarregado usa uma tarefa única). */
export function parseGerente(raw: string): GerentePlan | null {
  const fixed = repairAgentJson(raw ?? "");
  if (!fixed) return null;
  const d = fixed.value;
  const tasks = (Array.isArray(d.tasks) ? d.tasks : Array.isArray(d.steps) ? d.steps : [])
    .map((t: unknown): VcaTeamTask | null => {
      if (typeof t === "string") return t.trim() ? { title: t.trim().slice(0, 300), detail: "", files: [] } : null;
      if (!t || typeof t !== "object") return null;
      const o = t as Record<string, unknown>;
      const title = str(o.title, 300).trim();
      if (!title) return null;
      return { title, detail: str(o.detail, 1_500), files: strList(o.files, 12, 300).filter(isSafePath) };
    })
    .filter((t: VcaTeamTask | null): t is VcaTeamTask => !!t)
    .slice(0, 8);
  if (!tasks.length) return null;
  return {
    goal: str(d.goal, 600) || str(d.summary, 600),
    summary: str(d.summary, 600),
    tasks,
    risks: strList(d.risks, 8, 400),
    questions: strList(d.questions, 6, 400),
  };
}

// ───────────────────────────── Encarregado: distribuição sem conflito ─────────────────────────────

export interface VcaAssignment {
  agent: number;
  title: string;
  detail: string;
  /** Arquivos deste Engenheiro (nenhum outro edita). */
  files: string[];
}

/**
 * Divide as tarefas entre até maxEngineers Engenheiros, sem dois mexendo no mesmo arquivo:
 * tarefas que dividem arquivo viram uma só; tarefas sem arquivo vão juntas; se ainda sobrar,
 * junta as menores até caber. Determinístico (não gasta chamada de modelo).
 */
export function assignTasks(tasks: VcaTeamTask[], maxEngineers: number): VcaAssignment[] {
  const n = tasks.length;
  if (!n) return [];
  const parent = tasks.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const owner = new Map<string, number>();
  let noFiles = -1;
  tasks.forEach((t, i) => {
    if (!t.files.length) {
      if (noFiles === -1) noFiles = i;
      else union(noFiles, i);
    }
    for (const f of t.files) {
      const o = owner.get(f);
      if (o === undefined) owner.set(f, i);
      else union(o, i);
    }
  });
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  }
  let merged = [...groups.values()].map((idx) => ({
    title: idx.map((i) => tasks[i].title).join(" + ").slice(0, 300),
    detail: idx.map((i) => tasks[i].detail).filter(Boolean).join("\n").slice(0, 3_000),
    files: [...new Set(idx.flatMap((i) => tasks[i].files))],
    weight: idx.length,
  }));
  const cap = Math.max(1, Math.floor(maxEngineers));
  while (merged.length > cap) {
    merged.sort((a, b) => a.weight - b.weight || a.files.length - b.files.length);
    const [a, b, ...rest] = merged;
    merged = [
      { title: `${a.title} + ${b.title}`.slice(0, 300), detail: [a.detail, b.detail].filter(Boolean).join("\n").slice(0, 3_000), files: [...new Set([...a.files, ...b.files])], weight: a.weight + b.weight },
      ...rest,
    ];
  }
  return merged.map((m, i) => ({ agent: i + 1, title: m.title, detail: m.detail, files: m.files }));
}

// ───────────────────────────── Revisor e Entregador: respostas ─────────────────────────────

export interface RevisorVerdict {
  approved: boolean;
  issues: VerifyIssue[];
  notes: string;
}

export function parseRevisor(raw: string, changedPaths: Set<string>): RevisorVerdict | null {
  const fixed = repairAgentJson(raw ?? "");
  if (!fixed) return null;
  const d = fixed.value;
  const issues = (Array.isArray(d.issues) ? d.issues : [])
    .map((x: unknown) => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const path = str(o.path, 300).trim();
      const problem = str(o.problem, 500).trim();
      // Só vale problema em arquivo que mudou (o Revisor não reprova o que não foi tocado).
      return path && problem && changedPaths.has(path) ? { path, problem } : null;
    })
    .filter((x: VerifyIssue | null): x is VerifyIssue => !!x)
    .slice(0, 12);
  const approved = typeof d.approved === "boolean" ? d.approved && issues.length === 0 : issues.length === 0;
  return { approved, issues, notes: str(d.notes, 600) };
}

export interface EntregadorOutput {
  summary: string;
  memory: VcaMemoryDraft[];
  projectSummary: string;
}

export function parseEntregador(raw: string): EntregadorOutput | null {
  const fixed = repairAgentJson(raw ?? "");
  if (!fixed) return null;
  const d = fixed.value;
  const summary = str(d.summary, 1_500).trim();
  if (!summary) return null;
  return { summary, memory: sanitizeDrafts(d.memory), projectSummary: str(d.projectSummary, 600).trim() };
}

// ───────────────────────────── Prompts (pt-BR, próprios da Equipe) ─────────────────────────────

const ONLY_JSON = "Responda SOMENTE com um objeto JSON válido, sem texto fora dele. Responda em português do Brasil.";

export function gerenteSystem(maxEngineers: number): string {
  return [
    "Você é o GERENTE da Equipe Vertal (VERTAL Code AI). Entenda o pedido do dev, defina o escopo e divida o trabalho.",
    `Divida em no máximo ${maxEngineers} tarefas que possam ser feitas EM PARALELO por Engenheiros diferentes, cada uma em arquivos DIFERENTES.`,
    "Liste os arquivos (caminhos do projeto) que cada tarefa cria ou edita. Pedido pequeno = 1 tarefa.",
    "Não escreva código. Stack preferida: React + TypeScript + Vite + Tailwind + shadcn/ui; Supabase (Postgres + Edge Functions em Deno).",
    'Formato: {"summary":"...","goal":"...","tasks":[{"title":"...","detail":"o que fazer, critérios de pronto","files":["src/..."]}],"risks":["..."],"questions":["..."]}',
    ONLY_JSON,
  ].join("\n");
}

export function gerenteUser(input: { prompt: string; memory: string; repoMap: string; relevant: Array<{ path: string; content: string }>; plan?: VcaPlan | null }): string {
  const parts = [`Pedido do dev:\n${input.prompt.slice(0, 12_000)}`];
  if (input.plan) parts.push(`Plano já aprovado pelo dev:\n${input.plan.steps.map((s, i) => `${i + 1}. ${s.title}${s.files.length ? ` (${s.files.join(", ")})` : ""}`).join("\n")}`);
  if (input.memory) parts.push(input.memory);
  if (input.repoMap) parts.push(`Mapa do projeto (caminho :: símbolos):\n${input.repoMap}`);
  if (input.relevant.length) {
    parts.push(formatFiles(input.relevant.map((f) => ({ path: f.path, content: f.content.slice(0, 4_000) })), "Arquivos provavelmente relevantes (trechos)"));
  }
  return parts.join("\n\n");
}

export function engineerPrompt(input: { prompt: string; goal: string; task: VcaAssignment; others: VcaAssignment[]; memory: string }): string {
  const { task } = input;
  const lines = [
    `Você é o ENGENHEIRO ${task.agent} da Equipe Vertal. Faça SÓ a sua tarefa.`,
    `Objetivo geral: ${input.goal || input.prompt.slice(0, 600)}`,
    `Sua tarefa: ${task.title}`,
  ];
  if (task.detail) lines.push(`Detalhes: ${task.detail}`);
  if (task.files.length) lines.push(`Seus arquivos (só você edita): ${task.files.join(", ")}`);
  const otherFiles = input.others.flatMap((o) => o.files);
  if (otherFiles.length) lines.push(`NÃO edite (outros Engenheiros cuidam): ${otherFiles.join(", ")}. Pode importar deles se a tarefa deles criar o que você precisa.`);
  lines.push(`Pedido original do dev:\n${input.prompt.slice(0, 6_000)}`);
  if (input.memory) lines.push(input.memory);
  return lines.join("\n");
}

export const REVISOR_SYSTEM = [
  "Você é o REVISOR/QA da Equipe Vertal. Revise o diff contra o pedido: bugs, lógica errada, partes faltando,",
  "imports quebrados, tipos errados, segurança (segredos, injeção, RLS), e se o pedido foi atendido.",
  "Só reprove por problema REAL e concreto; estilo não reprova.",
  'Formato: {"approved":true|false,"issues":[{"path":"arquivo do diff","problem":"o que está errado e como corrigir"}],"notes":"..."}',
  ONLY_JSON,
].join("\n");

export const ENTREGADOR_SYSTEM = [
  "Você é o ENTREGADOR da Equipe Vertal. Escreva o resumo final para o dev (curto, claro, em português do Brasil):",
  "o que foi feito, arquivos principais, o que foi verificado e o que falta (se faltar). Não invente nada que não está nos dados.",
  "Também diga o que vale LEMBRAR para os próximos pedidos (decisões, preferências do dev, fatos do código). Nunca guarde segredos, senhas ou chaves.",
  'Formato: {"summary":"...","projectSummary":"1-2 frases do estado do projeto depois deste pedido","memory":[{"kind":"decision|preference|code_fact|note","scope":"project|user","content":"...","importance":1-5}]}',
  ONLY_JSON,
].join("\n");

function diffDigest(changes: FileChange[], maxChars = 14_000): string {
  let out = "";
  for (const c of changes) {
    const d = unifiedDiff(c.path, c.before, c.after, 2);
    if (out.length + d.length > maxChars) {
      out += `\n(diff de ${c.path} omitido: limite)`;
      continue;
    }
    out += `\n${d}`;
  }
  return out.trim();
}

// ───────────────────────────── Orquestração ─────────────────────────────

export interface TeamRunInput {
  mode: VcaMode;
  effort: VcaEffort;
  prompt: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  images?: string[];
  attachments?: Array<{ path: string; content: string }>;
  plan?: VcaPlan | null;
  persona?: boolean;
  runId: string;
  maxEngineers?: number;
  /** Rodadas de "reprovado → volta ao Engenheiro" (padrão 1). */
  maxReviewRounds?: number;
}

export interface SandboxResult {
  ran: boolean;
  ok: boolean;
  issues: VerifyIssue[];
  output?: string;
}

export interface TeamDeps {
  /** Cadeia barata/própria (Gerente, Revisor, Entregador). */
  callCoordinator: (messages: VcaChatMessage[], opts: { json: boolean; maxTokens: number }) => Promise<ModelReply>;
  /** Cadeia forte (Engenheiros). */
  callEngineer: (messages: VcaChatMessage[], opts: { json: boolean; maxTokens: number }) => Promise<ModelReply>;
  listPaths: () => Promise<string[]>;
  readFile: (path: string) => Promise<string | undefined>;
  indexSource?: () => Promise<Array<{ path: string; content: string }>>;
  checkSyntax?: SyntaxChecker;
  /** Teste real em sandbox (E2B), opcional. */
  sandboxTest?: (changes: FileChange[]) => Promise<SandboxResult>;
  memory?: {
    retrieve: (query: string) => Promise<RetrievedMemory>;
    remember: (drafts: VcaMemoryDraft[], projectSummary: string | null) => Promise<number>;
  };
  emit: (e: VcaTeamEvent) => void;
  budget: VcaBudgetGuard;
  /** Vertal Decide (decisões rápidas tipadas). Sem ele, a Equipe usa as chamadas de LLM de sempre. */
  decide?: DecideFn;
}

export interface TeamRunResult {
  summary: string;
  plan?: VcaPlan;
  changes: FileChange[];
  verified: boolean;
  issues: VerifyIssue[];
  assignments: VcaAssignment[];
}

/** Reservas de tempo (ms) que cada papel deixa para quem vem depois. */
export const TEAM_RESERVE = { gerente: 60_000, engenheiro: 30_000, revisor: 22_000, entregador: 8_000 } as const;

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function runVertalTeam(input: TeamRunInput, deps: TeamDeps): Promise<TeamRunResult> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("empty_prompt");
  const maxEngineers = Math.min(4, Math.max(1, input.maxEngineers ?? 3));
  const maxReviewRounds = Math.min(2, Math.max(0, input.maxReviewRounds ?? 1));
  const { budget } = deps;
  const role = (r: VcaTeamRole, state: VcaRoleState, detail?: string, agent?: number) =>
    deps.emit({ kind: "role", role: r, label: agent ? `${VCA_ROLE_LABEL[r]} ${agent}` : VCA_ROLE_LABEL[r], core: VCA_ROLE_CORE[r], state, detail, agent });
  const core = (c: VcaCore, state: "start" | "done") => deps.emit({ kind: "core", core: c, label: VCA_CORE_LABEL[c], state });
  const guarded = (call: TeamDeps["callCoordinator"], minLeft: number) => async (messages: VcaChatMessage[], opts: { json: boolean; maxTokens: number }) => {
    budget.check(messages, minLeft);
    const r = await call(messages, opts);
    budget.record(r);
    return r;
  };
  // ── Vertal Decide: bifurcações simples sem LLM inteira. ALTA age, MÉDIA sobe para modelo maior, BAIXA pergunta. ──
  const userQuestions: string[] = [];
  let humanReview = false;
  const decide = async (r: VcaTeamRole, state: Record<string, unknown>, questions: DecisionQuestions, labels: Record<string, string>): Promise<DecisionResult | null> => {
    if (!deps.decide) return null;
    if (!budget.tryDecision(JSON.stringify(state).length)) return null;
    const res = await deps.decide(state, questions).catch(() => null);
    if (!res || res.source === "none") return null;
    for (const [key, a] of Object.entries(res.answers)) {
      const value = a.type === "noul" ? (a.value ? "sim" : "não") : a.type === "score" ? String(a.value) : String(a.value);
      deps.emit({ kind: "decision", role: r, key, label: labels[key] ?? key, value, confidence: Math.round(a.confidence * 100) / 100, tier: a.tier, source: res.source });
    }
    return res;
  };
  const modelNote = (r: Pick<ModelReply, "label" | "cost" | "fellBack">) => `${r.label}${r.cost === "paid" ? " (pago)" : r.cost === "self_hosted" ? " (servidor Vertal)" : " (grátis)"}${r.fellBack ? " · troca automática" : ""}`;

  // ── Projeto (lido uma vez, compartilhado pelos papéis) ──
  const attached = new Map((input.attachments ?? []).filter((a) => isSafePath(a.path)).map((a) => [a.path, a.content]));
  let sourceP: Promise<Array<{ path: string; content: string }>> | null = null;
  const indexSource = () => (sourceP ??= deps.indexSource ? deps.indexSource().catch(() => []) : Promise.resolve([]));
  const cache = new Map<string, string | undefined>(attached);
  const read = async (p: string) => {
    if (!cache.has(p)) cache.set(p, await deps.readFile(p).catch(() => undefined));
    return cache.get(p);
  };
  const paths = new Set<string>([...(await deps.listPaths().catch(() => [])), ...attached.keys()]);

  // ═════════════════════ Núcleo PENSA ═════════════════════
  core("pensa", "start");
  let memoryText = "";
  let prevProjectSummary: string | null = null;
  if (deps.memory) {
    const mem = await deps.memory.retrieve(prompt).catch(() => null);
    if (mem) {
      prevProjectSummary = mem.projectSummary;
      memoryText = formatMemoryContext(mem.memories, mem.projectSummary);
      deps.emit({ kind: "memory", available: mem.available, used: mem.memories.length + (mem.projectSummary ? 1 : 0), embeddings: mem.usedEmbeddings });
    }
  }

  role("gerente", "working", "Entendendo o pedido e definindo o escopo");
  const source = await indexSource();
  for (const s of source) if (!cache.has(s.path)) cache.set(s.path, s.content);
  const index: IndexedFile[] = source.length
    ? source.slice(0, 2_000).map((s) => indexFile(s.path, s.content))
    : [...paths].slice(0, 2_000).map((p) => ({ path: p, size: 0, symbols: [], imports: [] }));
  for (const [p, c] of attached) if (!index.some((i) => i.path === p)) index.push(indexFile(p, c));
  const relevantPaths = [...new Set([...attached.keys(), ...rankRelevantFiles(index, prompt, 4)])].slice(0, 5);
  const relevant = (await Promise.all(relevantPaths.map(async (p) => ({ path: p, content: (await read(p)) ?? "" })))).filter((f) => f.content);

  // Bifurcação do Gerente: tamanho, força do modelo dos Engenheiros, precisa de sandbox, precisa de revisão humana.
  const fork = await decide(
    "gerente",
    { pedido: prompt.slice(0, 4_000), arquivos_no_projeto: paths.size, anexos: [...attached.keys()], arquivos_relevantes: relevantPaths, plano_aprovado: !!input.plan, modo: input.mode },
    {
      size: { type: "score", instructions: "Qual o tamanho do trabalho de código pedido?", criteria: ["Trivial: 1 arquivo, mudança pequena", "Pequeno: 2-3 arquivos", "Médio: várias partes do app", "Grande: muitos arquivos ou arquitetura nova"] },
      engineer_tier: { type: "choice", instructions: "Que modelo os Engenheiros precisam?", criteria: { padrao: "Mudança simples e direta: um modelo rápido/próprio resolve", forte: "Lógica difícil, vários arquivos interligados ou bug sutil: precisa do modelo mais forte" } },
      needs_sandbox: { type: "noul", instructions: "Vale rodar testes/typecheck num sandbox antes de entregar?", criteria: { true: "Muda lógica, tipos, build ou dependências", false: "Só texto, estilo ou conteúdo estático" } },
      needs_human_review: { type: "noul", instructions: "Esta mudança precisa de revisão humana antes de ir para produção?", criteria: { true: "Mexe com pagamentos, autenticação, dados pessoais, permissões, banco ou é irreversível", false: "Mudança comum e reversível" } },
    },
    { size: "Tamanho", engineer_tier: "Modelo dos Engenheiros", needs_sandbox: "Teste no sandbox", needs_human_review: "Revisão humana" },
  );
  const size = fork ? scoreOf(fork, "size") : null;
  const tierChoice = fork ? choiceOf(fork, "engineer_tier") : null;
  const sandboxFork = fork ? yesNo(fork, "needs_sandbox") : null;
  const reviewFork = fork ? yesNo(fork, "needs_human_review") : null;
  if (reviewFork?.yes && reviewFork.tier !== "ask") humanReview = true;
  if (reviewFork && reviewFork.tier === "ask") userQuestions.push("Essa mudança precisa de revisão humana antes de publicar?");
  // Trivial com confiança alta (e sem plano para seguir): pula a chamada do Gerente — uma tarefa com os arquivos relevantes.
  const skipGerente = input.mode === "build" && !input.plan && !!size && size.level === 0 && size.tier === "act";
  // Modelo rápido nos Engenheiros só com "padrão" confiante; dúvida = sobe para o forte (regra "média sobe").
  const cheapEngineers = !!tierChoice && tierChoice.value === "padrao" && tierChoice.tier === "act";
  const skipSandbox = !!sandboxFork && !sandboxFork.yes && sandboxFork.tier === "act";

  let gerente: GerentePlan | null = null;
  if (skipGerente) {
    gerente = { goal: prompt.slice(0, 300), summary: "", tasks: [{ title: "Implementar o pedido", detail: "", files: relevantPaths.slice(0, 3) }], risks: [], questions: [] };
    role("gerente", "done", "Pedido trivial (Vertal Decide): 1 tarefa, sem chamada extra");
  } else {
    try {
    const reply = await guarded(deps.callCoordinator, TEAM_RESERVE.gerente)(
      [
        { role: "system", content: gerenteSystem(maxEngineers) },
        ...(input.history ?? []).slice(-4).map((h) => ({ role: h.role, content: h.content.slice(0, 2_000) })),
        { role: "user", content: gerenteUser({ prompt, memory: memoryText, repoMap: repoMap(index, 6_000), relevant, plan: input.plan }) },
      ],
      { json: true, maxTokens: 1_500 },
    );
    gerente = parseGerente(reply.content);
    role("gerente", gerente ? "done" : "failed", gerente ? `${gerente.tasks.length} tarefa(s) · ${modelNote(reply)}` : "Resposta ilegível; seguindo com uma tarefa única");
  } catch (err) {
    role("gerente", "failed", err instanceof VcaBudgetError ? "Orçamento da execução atingido" : "Sem resposta dos modelos; seguindo com uma tarefa única");
    }
  }
  // Plano aprovado pelo dev vence; sem Gerente, uma tarefa única com os arquivos mais relevantes.
  const fallbackTasks: VcaTeamTask[] = input.plan?.steps.length
    ? input.plan.steps.map((s) => ({ title: s.title, detail: s.detail ?? "", files: s.files.filter(isSafePath) }))
    : [{ title: "Implementar o pedido", detail: "", files: [] }];
  const tasks = gerente?.tasks.length ? gerente.tasks : fallbackTasks;
  const goal = gerente?.goal || input.plan?.goal || "";

  role("encarregado", "working", "Distribuindo tarefas sem conflito de arquivos");
  const assignments = assignTasks(tasks, input.mode === "plan" ? 99 : maxEngineers);
  role(
    "encarregado",
    "done",
    input.mode === "plan" ? `${assignments.length} frente(s) de trabalho` : `${assignments.length} Engenheiro(s) em paralelo`,
  );
  core("pensa", "done");

  // Modo Planejar: o plano é o produto. Entrega sem gastar chamada.
  if (input.mode === "plan") {
    core("entrega", "start");
    const plan: VcaPlan = {
      goal: goal || prompt.slice(0, 300),
      steps: tasks.map((t) => ({ title: t.title, detail: t.detail || undefined, files: t.files })),
      risks: gerente?.risks ?? [],
      questions: gerente?.questions ?? [],
    };
    role("revisor", "skipped", "Nada para revisar no modo Planejar");
    role("entregador", "working", "Montando o plano");
    const summary = gerente?.summary || `Plano em ${plan.steps.length} passo(s).`;
    let saved = 0;
    if (deps.memory && gerente) {
      saved = await deps.memory.remember([{ scope: "project", kind: "run_summary", content: `Plano: ${plan.goal}`.slice(0, 600), importance: 2 }], null).catch(() => 0);
    }
    if (deps.memory) deps.emit({ kind: "memory", available: true, used: 0, saved });
    deps.emit({ kind: "plan", plan, summary });
    role("entregador", "done", "Plano pronto");
    core("entrega", "done");
    deps.emit({ kind: "budget", ...budget.snapshot() });
    deps.emit({ kind: "reply", text: summary });
    deps.emit({ kind: "done", files: 0, verified: false });
    return { summary, plan, changes: [], verified: false, issues: [], assignments };
  }

  // ═════════════════════ Núcleo CONSTRÓI ═════════════════════
  core("constroi", "start");
  const ownerOf = new Map<string, number>();
  for (const a of assignments) for (const f of a.files) ownerOf.set(f, a.agent);
  const engineerCall = guarded(cheapEngineers ? deps.callCoordinator : deps.callEngineer, TEAM_RESERVE.engenheiro);
  if (cheapEngineers) role("encarregado", "done", "Engenheiros no modelo rápido (decisão confiante)");

  /** Roda um Engenheiro com o loop de sempre (ler → editar → verificar → auto-corrigir), só nos arquivos dele. */
  const runEngineer = async (a: VcaAssignment, prompt2: string, overrides: Map<string, string | undefined>, extraAttachments: Array<{ path: string; content: string }> = []) => {
    role("engenheiro", "working", a.title, a.agent);
    let lastModel = "";
    try {
      const res = await runVertalCodeAi(
        {
          mode: "build",
          effort: input.effort,
          prompt: prompt2,
          images: input.images,
          attachments: [...(input.attachments ?? []), ...extraAttachments],
          persona: input.persona,
        },
        {
          callModel: engineerCall,
          listPaths: async () => [...paths],
          readFile: async (p) => (overrides.has(p) ? overrides.get(p) : read(p)),
          indexSource,
          checkSyntax: deps.checkSyntax,
          emit: (e) => {
            if (e.kind === "model") {
              const note = modelNote(e);
              if (note !== lastModel) role("engenheiro", "working", `Modelo: ${note}`, a.agent);
              lastModel = note;
            } else if (e.kind === "verify") {
              role("engenheiro", "working", e.ok ? "Verificação própria passou" : `Corrigindo ${e.issues.length} problema(s)`, a.agent);
            }
          },
        },
      );
      // Dono do arquivo: edição em arquivo de outro Engenheiro é descartada (sem conflito).
      const kept: FileChange[] = [];
      const dropped: string[] = [];
      for (const c of res.changes) {
        const o = ownerOf.get(c.path);
        if (o !== undefined && o !== a.agent) dropped.push(c.path);
        else kept.push(c);
      }
      role(
        "engenheiro",
        kept.length ? "done" : "failed",
        kept.length
          ? `${kept.length} arquivo(s)${res.verified ? " · verificado" : ""}${dropped.length ? ` · ${dropped.length} fora da tarefa descartado(s)` : ""}`
          : "Nenhuma mudança",
        a.agent,
      );
      return { agent: a.agent, changes: kept, ok: kept.length > 0 };
    } catch (err) {
      role("engenheiro", "failed", err instanceof VcaBudgetError ? "Orçamento da execução atingido" : "Os modelos não responderam", a.agent);
      return { agent: a.agent, changes: [] as FileChange[], ok: false };
    }
  };

  const results = await pool(assignments, maxEngineers, (a) =>
    runEngineer(a, engineerPrompt({ prompt, goal, task: a, others: assignments.filter((o) => o.agent !== a.agent), memory: memoryText }), new Map()),
  );
  // Junta os resultados (o primeiro a mexer num arquivo sem dono fica com ele).
  const merged = new Map<string, FileChange>();
  const changeOwner = new Map<string, number>();
  for (const r of results) {
    for (const c of r.changes) {
      if (merged.has(c.path)) continue;
      merged.set(c.path, c);
      changeOwner.set(c.path, r.agent);
    }
  }
  core("constroi", "done");

  // ═════════════════════ Núcleo ENTREGA ═════════════════════
  core("entrega", "start");
  let staticIssues: VerifyIssue[] = [];
  let sandbox: SandboxResult = { ran: false, ok: false, issues: [] };
  let review = null as RevisorVerdict | null;
  let reviewRound = 0;

  const qa = async (withModel: boolean) => {
    const list = [...merged.values()];
    staticIssues = await verifyChanges(list, paths, deps.checkSyntax);
    if (deps.sandboxTest && list.length && !skipSandbox) {
      role("revisor", "working", "Testando no sandbox");
      sandbox = await deps.sandboxTest(list).catch(() => ({ ran: false, ok: false, issues: [] }));
    }
    // Vertal Decide: aprovado com confiança alta e sem problema automático → não gasta a revisão por LLM.
    if (withModel && list.length && !staticIssues.length && !sandbox.issues.length) {
      const d = await decide(
        "revisor",
        { pedido: prompt.slice(0, 3_000), objetivo: goal, diff: diffDigest(list, 10_000) },
        { passes: { type: "noul", instructions: "O diff atende ao pedido, sem bugs, partes faltando ou falhas de segurança evidentes?", criteria: { true: "Correto e completo para o pedido", false: "Tem bug, falta algo, ou risco de segurança" } } },
        { passes: "Aprovado" },
      );
      const pass = d ? yesNo(d, "passes") : null;
      if (pass && pass.yes && pass.tier === "act") {
        review = { approved: true, issues: [], notes: `Aprovado pelo Vertal Decide (confiança ${Math.round(pass.confidence * 100)}%)` };
        return;
      }
      if (pass && pass.tier === "ask") userQuestions.push("A revisão ficou em dúvida: confira o diff com atenção antes de aplicar.");
    }
    if (withModel && list.length) {
      try {
        const reply = await guarded(deps.callCoordinator, TEAM_RESERVE.revisor)(
          [
            { role: "system", content: REVISOR_SYSTEM },
            {
              role: "user",
              content: [
                `Pedido do dev:\n${prompt.slice(0, 4_000)}`,
                goal ? `Objetivo: ${goal}` : "",
                staticIssues.length ? `Verificador automático achou:\n${staticIssues.map((i) => `- ${i.path}: ${i.problem}`).join("\n")}` : "Verificador automático: sem problemas.",
                `Diff:\n${diffDigest(list)}`,
              ].filter(Boolean).join("\n\n"),
            },
          ],
          { json: true, maxTokens: 1_200 },
        );
        review = parseRevisor(reply.content, new Set(list.map((c) => c.path)));
      } catch {
        review = null;
      }
    }
  };

  if (merged.size) {
    role("revisor", "working", "Revisando o diff e rodando a verificação");
    await qa(true);
    for (;;) {
      const blocking = [...staticIssues, ...sandbox.issues, ...(review?.approved === false ? review.issues : [])];
      if (!blocking.length) break;
      role("revisor", "rejected", `${blocking.length} problema(s): ${blocking.slice(0, 2).map((i) => `${i.path}: ${i.problem}`).join(" · ")}`);
      if (reviewRound >= maxReviewRounds || budget.left() < TEAM_RESERVE.engenheiro + TEAM_RESERVE.revisor) break;
      reviewRound++;
      // Devolve a cada Engenheiro dono do arquivo, com o estado atual dos arquivos dele.
      const byAgent = new Map<number, VerifyIssue[]>();
      for (const i of blocking) {
        const a = changeOwner.get(i.path) ?? ownerOf.get(i.path) ?? assignments[0].agent;
        byAgent.set(a, [...(byAgent.get(a) ?? []), i]);
      }
      const fixes = await pool([...byAgent.entries()], maxEngineers, async ([agent, issues]) => {
        const a = assignments.find((x) => x.agent === agent) ?? assignments[0];
        const mine = [...merged.values()].filter((c) => (changeOwner.get(c.path) ?? agent) === agent);
        const overrides = new Map<string, string | undefined>(mine.map((c) => [c.path, c.after ?? undefined]));
        const fixPromptText = [
          `Você é o ENGENHEIRO ${a.agent}. O Revisor/QA reprovou partes da sua entrega. Corrija só isto:`,
          ...issues.map((i) => `- ${i.path}: ${i.problem}`),
          `Sua tarefa era: ${a.title}`,
          `Pedido original:\n${prompt.slice(0, 4_000)}`,
        ].join("\n");
        return runEngineer(
          { ...a, files: [...new Set([...a.files, ...mine.map((c) => c.path)])] },
          fixPromptText,
          overrides,
          mine.filter((c) => c.after !== null).map((c) => ({ path: c.path, content: c.after as string })),
        );
      });
      for (const f of fixes) {
        for (const c of f.changes) {
          const prev = merged.get(c.path);
          merged.set(c.path, { path: c.path, before: prev ? prev.before : c.before, after: c.after });
          if (!changeOwner.has(c.path)) changeOwner.set(c.path, f.agent);
        }
      }
      // Nova checagem: estática + sandbox; o modelo revisa de novo só se ainda sobrar orçamento.
      const reReview = budget.left() > TEAM_RESERVE.revisor + TEAM_RESERVE.entregador + 10_000 && budget.calls < budget.budget.maxCalls - 1;
      // Sem orçamento para revisar de novo: a correção passa só pela checagem automática (revisão = "não feita").
      if (!reReview) review = null;
      await qa(reReview);
    }
  } else {
    role("revisor", "skipped", "Nenhuma mudança para revisar");
  }

  const changes = [...merged.values()].filter((c) => c.after !== c.before);
  const finalReview = review;
  const reviewState: "approved" | "rejected" | "skipped" = !finalReview ? "skipped" : finalReview.approved ? "approved" : "rejected";
  const remaining = [...staticIssues, ...sandbox.issues, ...(finalReview && !finalReview.approved ? finalReview.issues : [])];
  // Verificado = tudo que foi pedido saiu (nenhum Engenheiro falhou, orçamento não estourou) e passou nas checagens.
  const allTasksDone = results.every((r) => r.ok);
  const verified = changes.length > 0 && allTasksDone && !budget.stopped && staticIssues.length === 0 && (!sandbox.ran || sandbox.ok) && reviewState !== "rejected";
  if (merged.size) {
    role(
      "revisor",
      verified ? "done" : "failed",
      verified
        ? `Aprovado${reviewState === "skipped" ? " na verificação automática" : ""}${sandbox.ran ? " · sandbox ok" : ""}`
        : `${remaining.length} problema(s) ficaram`,
    );
  }

  // Entregador
  role("entregador", "working", "Montando o pacote e o resumo");
  const taskStates = assignments.map((a) => {
    const r = results.find((x) => x.agent === a.agent);
    return { title: a.title, files: a.files, state: (r?.ok ? "done" : changes.some((c) => changeOwner.get(c.path) === a.agent) ? "partial" : "failed") as "done" | "partial" | "failed" };
  });
  const fileList = changes.map((c) => ({ path: c.path, ...diffStats(c.before, c.after), isNew: !c.before, isDelete: c.after === null }));
  let readyToShip: boolean | null = null;
  if (changes.length) {
    const d = await decide(
      "entregador",
      { arquivos: fileList, verificado: verified, problemas: remaining.slice(0, 6), revisor: reviewState, sandbox: sandbox.ran ? (sandbox.ok ? "ok" : "falhou") : "não rodou", revisao_humana: humanReview },
      { ready_to_ship: { type: "noul", instructions: "O pacote está pronto para o dev aplicar e publicar?", criteria: { true: "Verificado, sem problemas pendentes", false: "Tem problema pendente, falta verificação ou precisa de revisão" } } },
      { ready_to_ship: "Pronto para entregar" },
    );
    const ship = d ? yesNo(d, "ready_to_ship") : null;
    // Nunca "pronto" com problema pendente, mesmo que o modelo de decisão diga sim.
    if (ship && ship.tier === "act") readyToShip = ship.yes && verified;
    else if (ship && ship.tier === "escalate") readyToShip = verified && reviewState === "approved" ? true : null;
    else if (ship) userQuestions.push("Não tenho certeza se está pronto para publicar: quer revisar antes?");
  }
  let entrega: EntregadorOutput | null = null;
  try {
    const reply = await guarded(deps.callCoordinator, TEAM_RESERVE.entregador)(
      [
        { role: "system", content: ENTREGADOR_SYSTEM },
        {
          role: "user",
          content: JSON.stringify({
            pedido: prompt.slice(0, 3_000),
            objetivo: goal,
            tarefas: taskStates,
            arquivos: fileList,
            verificado: verified,
            checagens: { estatica: staticIssues.length ? "problemas" : "ok", sandbox: sandbox.ran ? (sandbox.ok ? "ok" : "falhou") : "não disponível", revisor: reviewState },
            problemas: remaining.slice(0, 8),
          }),
        },
      ],
      { json: true, maxTokens: 1_200 },
    );
    entrega = parseEntregador(reply.content);
  } catch {
    entrega = null;
  }
  const summary = entrega?.summary
    || (changes.length
      ? `${changes.length} arquivo(s) prontos para revisão${verified ? ", verificados pela equipe" : " (não totalmente verificados)"}.`
      : "Não consegui concluir o pedido.");

  // Memória: o que o Entregador sugeriu + resumo desta execução + resumo rolante do projeto.
  if (deps.memory) {
    const drafts: VcaMemoryDraft[] = [...(entrega?.memory ?? [])];
    if (changes.length) {
      drafts.push({ scope: "project", kind: "run_summary", content: `${goal || prompt.slice(0, 200)} → ${changes.map((c) => c.path).slice(0, 8).join(", ")}${verified ? " (verificado)" : ""}`.slice(0, 600), importance: 2 });
    }
    const nextSummary = entrega?.projectSummary ? mergeProjectSummary(prevProjectSummary, entrega.projectSummary) : null;
    const saved = await deps.memory.remember(sanitizeDrafts(drafts, 10), nextSummary).catch(() => 0);
    deps.emit({ kind: "memory", available: true, used: 0, saved });
  }

  for (const c of changes) {
    const st = diffStats(c.before, c.after);
    deps.emit({ kind: "diff", path: c.path, diff: unifiedDiff(c.path, c.before, c.after), added: st.added, removed: st.removed, isNew: !c.before, isDelete: c.after === null, after: c.after });
  }
  deps.emit({
    kind: "package",
    files: fileList,
    verified,
    checks: { static: !changes.length ? "skipped" : staticIssues.length ? "issues" : "ok", sandbox: sandbox.ran ? (sandbox.ok ? "ok" : "failed") : "not_available", review: reviewState },
    tasks: taskStates,
    readyToShip,
    humanReview,
    questions: [...new Set([...userQuestions, ...(gerente?.questions ?? [])])].slice(0, 6),
  });
  role("entregador", "done", changes.length ? `${changes.length} arquivo(s) no pacote` : "Sem mudanças");
  core("entrega", "done");
  deps.emit({ kind: "budget", ...budget.snapshot() });
  deps.emit({ kind: "reply", text: summary });
  deps.emit({ kind: "done", files: changes.length, verified });
  return { summary, changes, verified, issues: remaining, assignments };
}
