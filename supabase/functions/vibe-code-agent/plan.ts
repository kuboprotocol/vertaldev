// Orquestrador do Vibe Code: grafo de tarefas + executor estilo Plandex +
// Vibe Reviewer (PR-Agent), num pipeline único e sem conflitos.
//
//   grafo de tarefas (o QUE e em que ordem; conceito à la Task Master, código próprio)
//     └─► executor (Plandex, MIT): UMA tarefa por vez ─► contexto só com os
//         arquivos relevantes (orçamento de tokens, mapa do repo em cache)
//         ─► "tell" gera mudanças STAGED (nada toca o projeto)
//         ─► checagem estática + 1 auto-reparo
//     └─► revisor (PR-Agent, MIT): roda SÓ no diff staged; nunca edita,
//         só propõe ─► fila de correções 1 a 1 do chat (alvo "staged")
//     └─► Dev aprova (conforme a autonomia) ─► caminho de "apply" existente
//         (créditos + commit + checkpoint) com checagem de hash/rebase
//     └─► tarefa feita ─► próxima.
//
// Regras: um escritor por vez (a trava fica no index.ts, por conversa);
// mudança staged cujo arquivo mudou por baixo é rebaseada ou invalidada;
// um contexto compartilhado alimenta os três motores.
//
// Sem Deno/DOM: tudo entra por `PlanDeps`, o que permite testar o pipeline
// inteiro com um modelo simulado (src/test/vibe-plan-orchestrator.test.ts).

import { type ChatMsg, filterRepoTree, isSafePath } from "../_shared/vibeAgentCore.ts";
import {
  extractJsonObject,
  formatFileForReview,
  pathsFromErrors,
  type ReviewPayload,
  sanitizeErrorText,
} from "../_shared/vibeReviewEngine.ts";
import {
  analyzeComplexity,
  expandTask,
  getTask,
  graphProgress,
  nextTask,
  parseSubtasks,
  parseTaskGraph,
  type PlanTask,
  PRIORITY_LABEL,
  repairTaskGraph,
  setSubtaskStatus,
  setTaskStatus,
  STATUS_LABEL,
  TASK_STATUSES,
  type TaskGraph,
  TaskGraphError,
  type TaskStatus,
  unmetDependencies,
  validateTaskGraph,
} from "../_shared/vibeTaskGraph.ts";
import {
  AUTONOMY,
  type AppliedEntry,
  type AutonomyLevel,
  buildRepoMap,
  checkFreshness,
  estimateTokens,
  expectedCallsPerTask,
  formatRepoMap,
  formatSharedContext,
  isTinyDiff,
  MODEL_PACK_LABEL,
  type ModelPack,
  type ModelRole,
  type ModelTier,
  normalizeAutonomy,
  normalizeModelPack,
  noteFileInMap,
  type PlanKnobs,
  resolveImports,
  selectContextFiles,
  type SharedConversationContext,
  type StagedChange,
  stageChange,
  tierFor,
  toClientState,
  upsertStaged,
  type VibeAgentState,
} from "../_shared/vibePlandexEngine.ts";
import { buildExpandMessages, buildPlannerMessages, buildRepairMessages, buildTellMessages } from "../_shared/vibePlanPrompts.ts";
import { runReviewCommand } from "./review.ts";

export type PlanActionName =
  | "create"
  | "next"
  | "apply"
  | "reject"
  | "stage_edit"
  | "debug"
  | "status"
  | "config"
  | "expand"
  | "rewind"
  | "state"
  | "validate";

export const PLAN_ACTIONS: PlanActionName[] = ["create", "next", "apply", "reject", "stage_edit", "debug", "status", "config", "expand", "rewind", "state", "validate"];

/** Ações que não gravam no projeto nem no estado: não pegam a trava. */
export const READ_ONLY_PLAN_ACTIONS = new Set<PlanActionName>(["state"]);

/** Ações que podem escrever arquivos do projeto (além do estado do plano). */
export const PROJECT_WRITING_ACTIONS = new Set<PlanActionName>(["apply", "rewind", "next", "debug"]);

export interface PlanRequestBody {
  action: PlanActionName;
  prompt?: string;
  taskId?: number;
  subtaskId?: number;
  status?: TaskStatus;
  paths?: string[];
  path?: string;
  content?: string;
  errors?: string[];
  autonomy?: AutonomyLevel;
  modelPack?: ModelPack;
}

export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanError";
  }
}

export function parsePlanRequest(raw: unknown): PlanRequestBody | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const action = r.action as PlanActionName;
  if (!PLAN_ACTIONS.includes(action)) return null;
  const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 && v < 10000 ? v : undefined);
  const paths = (Array.isArray(r.paths) ? r.paths : []).filter((p): p is string => typeof p === "string" && isSafePath(p)).slice(0, 50);
  return {
    action,
    prompt: typeof r.prompt === "string" ? r.prompt.trim().slice(0, 12000) || undefined : undefined,
    taskId: int(r.taskId),
    subtaskId: int(r.subtaskId),
    status: TASK_STATUSES.includes(r.status as TaskStatus) ? (r.status as TaskStatus) : undefined,
    paths: paths.length ? paths : undefined,
    path: typeof r.path === "string" && isSafePath(r.path) ? r.path : undefined,
    content: typeof r.content === "string" ? r.content.slice(0, 300000) : undefined,
    errors: (Array.isArray(r.errors) ? r.errors : []).filter((e): e is string => typeof e === "string" && !!e.trim()).slice(0, 8).map((e) => sanitizeErrorText(e)),
    autonomy: typeof r.autonomy === "string" ? normalizeAutonomy(r.autonomy) : undefined,
    modelPack: typeof r.modelPack === "string" ? normalizeModelPack(r.modelPack) : undefined,
  };
}

export interface ApplyResult {
  checkpointId?: string;
  commitSha?: string;
  fileShas?: Record<string, string>;
  files: string[];
}

export interface PlanDeps {
  knobs: PlanKnobs;
  /** Estado carregado de vibe_conversations.agent_state (já normalizado). */
  state: VibeAgentState;
  list(): Promise<string[]>;
  read(path: string): Promise<{ content: string }>;
  callModel(messages: ChatMsg[], opts: { tier: ModelTier; role: ModelRole; maxTokens: number; label: string }): Promise<string>;
  /** O caminho de "apply" existente: checagem estática, créditos, commit e checkpoint. */
  applyFiles(files: Array<{ path: string; content: string }>, meta: { summary: string; taskId?: number }): Promise<ApplyResult>;
  /** Reverte um checkpoint/commit aplicado pelo executor (rewind). */
  revert(entry: AppliedEntry): Promise<string[]>;
  /** Checagem estática de um arquivo gerado (lintGeneratedFile). */
  lint(path: string, content: string): string[];
  send(event: Record<string, unknown>): void;
  /** Memória + contexto do Dev + resumo da conversa (o resto vem do estado). */
  shared: Pick<SharedConversationContext, "memories" | "dev" | "conversationSummary">;
  saveState(state: VibeAgentState): Promise<void>;
  /** Créditos de planejamento (VIBE_PLAN_CREDIT_COST; 0 = grátis). */
  chargeCredits?(amount: number, reason: string): Promise<void>;
  now?(): string;
}

export interface PlanResult {
  reply: string;
  state: VibeAgentState;
  /** O cliente deve seguir sozinho para a próxima tarefa (autonomia semi/full). */
  continueNext: boolean;
}

const MAX_TELL_TOKENS = 8000;
const MAX_FILE_CHARS = 16000;

const mdList = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

/** Uma chamada JSON com uma segunda chance quando o modelo sai do formato. */
async function askJson<T>(deps: PlanDeps, messages: ChatMsg[], parse: (raw: string) => T, opts: { tier: ModelTier; role: ModelRole; maxTokens: number; label: string }): Promise<{ value: T; raw: string }> {
  const raw = await deps.callModel(messages, opts);
  try {
    return { value: parse(raw), raw };
  } catch {
    const retry = await deps.callModel(
      [
        ...messages,
        { role: "assistant", content: raw.slice(0, 4000) },
        { role: "user", content: "Sua resposta não estava no formato JSON pedido. Responda de novo SOMENTE com o objeto JSON, sem texto fora dele." },
      ],
      { ...opts, label: `${opts.label} (nova tentativa)` },
    );
    return { value: parse(retry), raw: retry };
  }
}

export interface TellOutput {
  summary: string;
  thought: string;
  files: Array<{ path: string; content: string; reason?: string }>;
  subtasksDone: number[];
}

export function parseTellOutput(raw: string): TellOutput {
  const obj = extractJsonObject(raw);
  const files: TellOutput["files"] = [];
  const list = Array.isArray(obj.files) ? obj.files : Array.isArray(obj.edits) ? obj.edits : [];
  for (const f of list) {
    if (!f || typeof f !== "object") continue;
    const r = f as Record<string, unknown>;
    if (typeof r.path !== "string" || typeof r.content !== "string") continue;
    const path = r.path.trim().replace(/^\.\//, "");
    if (!files.some((x) => x.path === path)) files.push({ path, content: r.content, reason: typeof r.reason === "string" ? r.reason.slice(0, 400) : undefined });
  }
  return {
    summary: typeof obj.summary === "string" ? obj.summary.trim().slice(0, 1500) : "",
    thought: typeof obj.thought === "string" ? obj.thought.trim().slice(0, 400) : "",
    files,
    subtasksDone: (Array.isArray(obj.subtasks_done) ? obj.subtasks_done : []).filter((n): n is number => typeof n === "number" && Number.isInteger(n)),
  };
}

function describeTask(t: PlanTask): string {
  const deps = t.dependencies.length ? ` · depende de ${t.dependencies.map((d) => `#${d}`).join(", ")}` : "";
  return `#${t.id} ${t.title} (${PRIORITY_LABEL[t.priority].toLowerCase()}${deps})`;
}

function requireGraph(state: VibeAgentState): TaskGraph {
  if (!state.graph?.tasks.length) throw new PlanError("Esta conversa ainda não tem plano. Use /plano seguido do que você quer construir.");
  return state.graph;
}

/** Contexto compartilhado (o mesmo objeto para planejador, executor e revisor). */
function sharedContext(deps: PlanDeps, state: VibeAgentState, currentTaskId?: number): SharedConversationContext {
  return {
    ...deps.shared,
    graph: state.graph,
    currentTaskId,
    staged: state.staged.map((s) => ({ path: s.path, added: s.added, removed: s.removed, status: s.status })),
  };
}

async function loadTree(deps: PlanDeps, state: VibeAgentState): Promise<{ state: VibeAgentState; tree: string[] }> {
  const raw = await deps.list().catch(() => [] as string[]);
  const tree = filterRepoTree(raw, 400);
  const { map, reused } = buildRepoMap(tree, state.repoMap, deps.now?.());
  if (reused) deps.send({ kind: "memory", status: "success", title: "Mapa do projeto em cache (sem releitura)" });
  return { state: { ...state, repoMap: map }, tree };
}

/** Lê os arquivos de contexto dentro do orçamento de tokens. */
async function loadContext(deps: PlanDeps, state: VibeAgentState, tree: string[], task: PlanTask, extra: string[]): Promise<{ state: VibeAgentState; contents: Record<string, string>; block: string }> {
  const cfg = AUTONOMY[state.autonomy];
  const treeSet = new Set(tree);
  const candidates = cfg.autoContext
    ? selectContextFiles({ tree, task, extra })
    : [...new Set([...task.files, ...extra])].filter((p) => treeSet.has(p));
  const budget = deps.knobs.contextTokenBudget;
  const contents: Record<string, string> = {};
  const blocks: string[] = [];
  let used = 0;
  let map = state.repoMap!;
  const queue = [...candidates];
  const seen = new Set<string>();
  while (queue.length) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const file = await deps.read(path).catch(() => ({ content: "" }));
    if (!file.content) continue;
    const block = formatFileForReview(path, file.content, null, MAX_FILE_CHARS);
    const cost = estimateTokens(block);
    if (used + cost > budget) {
      deps.send({ kind: "read_file", status: "skipped", title: `Fora do orçamento de contexto: ${path}`, path, detail: `~${cost} tokens` });
      continue;
    }
    used += cost;
    contents[path] = file.content;
    blocks.push(block);
    map = noteFileInMap(map, path, file.content);
    deps.send({ kind: "read_file", status: "success", title: `Contexto: ${path}`, path, detail: `~${cost} tokens` });
    // Um nível de imports dos arquivos que o plano citou (só no modo automático).
    if (cfg.autoContext && (task.files.includes(path) || extra.includes(path))) {
      for (const imp of resolveImports(path, file.content, tree)) if (!seen.has(imp)) queue.push(imp);
    }
  }
  deps.send({ kind: "estimate", status: "success", title: `Contexto: ${Object.keys(contents).length} arquivo(s), ~${used} de ${budget} tokens` });
  return { state: { ...state, repoMap: map }, contents, block: blocks.join("\n\n") };
}

interface ExecuteOptions {
  errors?: string[];
  attempt: number;
  origin: "task" | "debug";
}

/** Executor: contexto ─► tell ─► checagem estática (+1 reparo) ─► mudanças staged. */
async function executeTask(deps: PlanDeps, input: { state: VibeAgentState; task: PlanTask; tree: string[] }, opts: ExecuteOptions) {
  let state = input.state;
  const task = input.task;
  const extra = opts.errors?.length ? pathsFromErrors(opts.errors, input.tree) : [];
  const loaded = await loadContext(deps, state, input.tree, task, extra);
  state = loaded.state;
  const complexity = analyzeComplexity(task, deps.knobs.expandThreshold).score;
  const role: ModelRole = opts.origin === "debug" ? "debugger" : "coder";
  const tier = tierFor(role, state.modelPack, { complexity, attempt: opts.attempt, proComplexity: deps.knobs.proComplexity });
  deps.send({ kind: "estimate", status: "success", title: `Executor (${MODEL_PACK_LABEL[state.modelPack].label}) · modelo ${tier}`, tier, detail: `complexidade ${complexity}/10 · tentativa ${opts.attempt}` });

  const messages = buildTellMessages({
    task,
    files: loaded.block,
    repoMap: formatRepoMap(state.repoMap, 4000),
    context: formatSharedContext(sharedContext(deps, state, task.id), "coder"),
    errors: opts.errors,
    attempt: opts.attempt,
  });
  const callOpts = { tier, role, maxTokens: MAX_TELL_TOKENS, label: opts.origin === "debug" ? `auto-debug #${task.id}` : `tarefa #${task.id}` };
  let { value: out, raw } = await askJson(deps, messages, parseTellOutput, callOpts);
  out = { ...out, files: out.files.filter((f) => isSafePath(f.path)) };

  // Checagem estática; uma rodada de auto-reparo (conta como "build" barato).
  const problemsOf = (files: TellOutput["files"]) => {
    const problems: Record<string, string[]> = {};
    for (const f of files) {
      const p = deps.lint(f.path, f.content).filter((x) => !x.startsWith("sintaxe"));
      if (p.length) problems[f.path] = p;
    }
    return problems;
  };
  let problems = problemsOf(out.files);
  if (Object.keys(problems).length) {
    const list = Object.entries(problems).map(([p, pr]) => `- ${p}: ${pr.join("; ")}`).join("\n");
    deps.send({ kind: "review", status: "running", title: `Checagem estática barrou ${Object.keys(problems).length} arquivo(s); corrigindo`, detail: list });
    const repaired = await askJson(deps, [...messages, { role: "assistant", content: raw.slice(0, 12000) }, buildRepairMessages(list)], parseTellOutput, { ...callOpts, label: `${callOpts.label} (auto-reparo)` }).catch(() => null);
    if (repaired) out = { ...repaired.value, files: repaired.value.files.filter((f) => isSafePath(f.path)) };
    problems = problemsOf(out.files);
  }
  const rejected = Object.entries(problems).map(([p, pr]) => `${p}: ${pr.join("; ")}`);
  const files = out.files.filter((f) => !problems[f.path]);

  // Mudanças staged: base = conteúdo atual do projeto (para checar hash ao aplicar).
  const stagedNow: StagedChange[] = [];
  for (const f of files) {
    const base = loaded.contents[f.path] ?? (await deps.read(f.path).catch(() => ({ content: "" }))).content;
    if (base === f.content) continue;
    const change = stageChange({ path: f.path, baseContent: base, content: f.content, reason: f.reason, taskId: task.id, origin: opts.origin, now: deps.now?.() });
    stagedNow.push(change);
    state = { ...state, staged: upsertStaged(state.staged, change) };
    deps.send({ kind: "staged", status: "success", title: `Staged ${f.path} (+${change.added}/-${change.removed})`, path: f.path, detail: f.reason });
  }
  if (out.subtasksDone.length && state.graph) {
    let g = state.graph;
    for (const sid of out.subtasksDone) {
      try {
        g = setSubtaskStatus(g, task.id, sid, "done", deps.now?.());
      } catch {
        /* id de subtarefa inventado: ignora */
      }
    }
    state = { ...state, graph: g };
  }
  return { state, stagedNow, summary: out.summary, rejected, tier };
}

/** Revisor (PR-Agent) SÓ no diff staged; não edita nada, só propõe. */
async function reviewStaged(deps: PlanDeps, state: VibeAgentState, changes: StagedChange[], task: PlanTask): Promise<ReviewPayload | null> {
  const byPath = new Map(changes.map((c) => [c.path, c]));
  let payload: ReviewPayload | null = null;
  const tier = tierFor("reviewer", state.modelPack);
  try {
    await runReviewCommand(
      { command: "review", paths: [...byPath.keys()], focus: `mudanças staged da tarefa #${task.id}: ${task.title}` },
      {
        list: () => Promise.resolve([...byPath.keys()]),
        read: (path) => Promise.resolve({ content: byPath.get(path)?.content ?? "" }),
        readPrevious: (path) => {
          const c = byPath.get(path);
          return Promise.resolve(c && c.baseContent !== "" ? c.baseContent : null);
        },
        callModel: (messages, { maxTokens, label }) => deps.callModel(messages, { tier, role: "reviewer", maxTokens, label: `revisão do diff: ${label}` }),
        send: (event) => {
          if (event.kind === "review_findings" && event.review && typeof event.review === "object") {
            payload = { ...(event.review as ReviewPayload), target: "staged", taskId: task.id };
            deps.send({ ...event, review: payload });
          } else if (event.kind !== "read_file") deps.send(event);
        },
        context: formatSharedContext(sharedContext(deps, state, task.id), "reviewer"),
        diffOnly: true,
        tinyDiffLines: deps.knobs.tinyDiffLines,
      },
    );
  } catch (e) {
    deps.send({ kind: "review", status: "failed", title: "Revisão do diff indisponível; siga revisando o diff você mesmo", detail: e instanceof Error ? e.message : String(e) });
  }
  return payload;
}

const BLOCKING = new Set(["critical", "high"]);

function hasBlockingFindings(payload: ReviewPayload | null): boolean {
  return !!payload?.findings.some((f) => BLOCKING.has(f.severity));
}

/** Aplica mudanças staged pelo caminho de apply existente, com checagem de hash/rebase. */
async function applyStaged(deps: PlanDeps, state: VibeAgentState, paths?: string[]): Promise<{ state: VibeAgentState; reply: string; appliedTaskDone: boolean }> {
  const chosen = state.staged.filter((s) => !paths?.length || paths.includes(s.path));
  if (!chosen.length) throw new PlanError(paths?.length ? `Não há mudança staged para ${paths.join(", ")}.` : "Não há mudanças staged para aplicar.");

  const toApply: Array<{ path: string; content: string; change: StagedChange }> = [];
  const invalidated: string[] = [];
  const rebased: string[] = [];
  for (const change of chosen) {
    const current = (await deps.read(change.path).catch(() => ({ content: "" }))).content;
    const fresh = checkFreshness(change, current);
    if (fresh.state === "stale") {
      invalidated.push(fresh.reason);
      continue;
    }
    if (fresh.state === "rebased") rebased.push(change.path);
    toApply.push({ path: change.path, content: fresh.content, change });
  }
  // Mudanças invalidadas saem do sandbox; a tarefa volta a "em andamento" para ser refeita.
  const invalidPaths = new Set(chosen.filter((c) => !toApply.some((t) => t.path === c.path)).map((c) => c.path));
  let next: VibeAgentState = { ...state, staged: state.staged.filter((s) => !invalidPaths.has(s.path)) };
  for (const r of invalidated) deps.send({ kind: "staged", status: "failed", title: "Mudança invalidada: o arquivo mudou por baixo", detail: r });
  for (const p of rebased) deps.send({ kind: "staged", status: "success", title: `Rebase automático de ${p} (o arquivo tinha mudado)`, path: p });

  const parts: string[] = [];
  let appliedTaskDone = false;
  if (toApply.length) {
    const taskIds = [...new Set(toApply.map((t) => t.change.taskId).filter((n): n is number => typeof n === "number"))];
    const task = taskIds.length === 1 ? getTask(next.graph, taskIds[0]) : undefined;
    const summary = task ? `Tarefa #${task.id}: ${task.title}` : `Mudanças staged: ${toApply.map((t) => t.path).join(", ")}`;
    const result = await deps.applyFiles(toApply.map(({ path, content }) => ({ path, content })), { summary, taskId: task?.id });
    const appliedPaths = new Set(toApply.map((t) => t.path));
    next = {
      ...next,
      staged: next.staged.filter((s) => !appliedPaths.has(s.path)),
      applied: [...next.applied, { taskId: task?.id, checkpointId: result.checkpointId, commitSha: result.commitSha, fileShas: result.fileShas, files: result.files, at: deps.now?.() ?? new Date().toISOString() }],
    };
    parts.push(`Apliquei ${toApply.length} arquivo(s): ${toApply.map((t) => `\`${t.path}\``).join(", ")}.`);
    if (rebased.length) parts.push(`${rebased.length} arquivo(s) tinham mudado e foram rebaseados automaticamente.`);

    // Tarefa feita quando todas as mudanças dela saíram do sandbox.
    for (const id of taskIds) {
      const t = getTask(next.graph, id);
      if (!t || next.staged.some((s) => s.taskId === id)) continue;
      const origin = toApply.find((x) => x.change.taskId === id)?.change.origin;
      if (t.status === "in-progress" && origin === "task") {
        next = { ...next, graph: setTaskStatus(next.graph!, id, "done", { checkpointId: result.checkpointId, commitSha: result.commitSha, appliedAt: deps.now?.() ?? new Date().toISOString(), note: undefined }, deps.now?.()), debug: { taskId: id, attempts: 0 } };
        appliedTaskDone = true;
        parts.push(`Tarefa #${id} concluída.`);
      } else if (origin === "debug") {
        parts.push(`Correção do auto-debug da tarefa #${id} aplicada.`);
      }
    }
  }
  if (invalidated.length) {
    parts.push(`Invalidei ${invalidated.length} mudança(s) porque o arquivo mudou depois que foram geradas e não deu para encaixar: ${invalidated.join("; ")}. Rode /proxima para gerar de novo em cima da versão atual.`);
  }
  return { state: next, reply: parts.join(" "), appliedTaskDone };
}

function nextHint(state: VibeAgentState): string {
  const g = state.graph;
  if (!g) return "";
  const p = graphProgress(g);
  if (p.total && p.done + p.deferred === p.total) return `Plano concluído: ${p.done}/${p.total} tarefa(s) feitas.`;
  const n = nextTask(g);
  if (n) return `Próxima: ${describeTask(n)}. Use /proxima ou "Executar próxima".`;
  const blocked = g.tasks.filter((t) => t.status === "pending" || t.status === "blocked");
  if (blocked.length) return `Nenhuma tarefa liberada: ${blocked.map((t) => `#${t.id} espera ${unmetDependencies(g, t.id).map((d) => `#${d}`).join(", ") || "desbloqueio"}`).join("; ")}.`;
  return "";
}

/** Executa UMA ação do plano. O chamador segura a trava de escritor da conversa. */
export async function runPlanAction(req: PlanRequestBody, deps: PlanDeps): Promise<PlanResult> {
  let state = deps.state;
  const cfg = () => AUTONOMY[state.autonomy];
  let reply = "";
  let continueNext = false;
  const now = () => deps.now?.() ?? new Date().toISOString();
  const charge = async (reason: string) => {
    if (deps.knobs.planCreditCost > 0 && deps.chargeCredits) await deps.chargeCredits(deps.knobs.planCreditCost, reason);
  };

  switch (req.action) {
    // ------------------------------------------------------------------ estado
    case "state": {
      deps.send({ kind: "plan_state", status: "success", title: "Plano carregado", planState: toClientState(state) });
      const g = state.graph;
      reply = g ? `Plano com ${g.tasks.length} tarefa(s), ${graphProgress(g).percent}% feito. ${nextHint(state)}` : "Ainda não há plano nesta conversa.";
      return { reply, state, continueNext };
    }

    // ------------------------------------------------------------------ configuração
    case "config": {
      if (!req.autonomy && !req.modelPack) throw new PlanError("Diga o nível de autonomia (manual, basico, basico+, semi, autonomo) ou o pacote de modelos (economico, equilibrado, forte).");
      state = { ...state, ...(req.autonomy ? { autonomy: req.autonomy } : {}), ...(req.modelPack ? { modelPack: req.modelPack } : {}), updatedAt: now() };
      const a = AUTONOMY[state.autonomy];
      const est = expectedCallsPerTask({ autonomy: state.autonomy, pack: state.modelPack, knobs: deps.knobs });
      reply = `Autonomia: ${a.label} — ${a.description} Pacote: ${MODEL_PACK_LABEL[state.modelPack].label} — ${MODEL_PACK_LABEL[state.modelPack].description} Por tarefa: ${est.typical.length} chamada(s) típicas (${est.typical.map((c) => `${c.role}/${c.tier}`).join(", ")}), no pior caso ${est.worstCase}.`;
      break;
    }

    // ------------------------------------------------------------------ criar plano
    case "create": {
      if (!req.prompt) throw new PlanError("Escreva o que você quer construir depois de /plano.");
      if (state.staged.length) throw new PlanError("Há mudanças staged esperando você. Aplique (/aplicar) ou rejeite (/rejeitar) antes de criar um plano novo.");
      await charge("vibe_code_agent:plan");
      const loaded = await loadTree(deps, state);
      state = loaded.state;
      const tier = tierFor("planner", state.modelPack, { planTier: deps.knobs.planTier });
      deps.send({ kind: "thinking", status: "running", title: `Planejando (modelo ${tier})` });
      const { value: parsed } = await askJson(
        deps,
        buildPlannerMessages({
          request: req.prompt,
          repoMap: formatRepoMap(state.repoMap),
          context: formatSharedContext({ ...sharedContext(deps, state), graph: null }, "planner"),
          maxTasks: deps.knobs.maxTasks,
        }),
        (raw) => parseTaskGraph(raw, { goal: req.prompt!.slice(0, 600), maxTasks: deps.knobs.maxTasks, now: now() }),
        { tier, role: "planner", maxTokens: 5000, label: "plano" },
      );
      const repaired = repairTaskGraph(parsed.graph);
      const fixes = [...parsed.fixes, ...repaired.fixes];
      const graph: TaskGraph = {
        ...repaired.graph,
        tasks: repaired.graph.tasks.map((t) => ({ ...t, complexity: analyzeComplexity(t, deps.knobs.expandThreshold).score })),
      };
      const replaced = state.graph && state.graph.tasks.some((t) => t.status !== "done") ? " O plano anterior desta conversa foi substituído." : "";
      state = { ...state, graph, debug: null, updatedAt: now() };
      const toExpand = graph.tasks.map((t) => analyzeComplexity(t, deps.knobs.expandThreshold)).filter((r) => r.shouldExpand);
      deps.send({ kind: "plan", status: "success", title: `Plano com ${graph.tasks.length} tarefa(s)`, detail: graph.tasks.map(describeTask).join("\n") });
      if (fixes.length) deps.send({ kind: "plan", status: "success", title: `Grafo validado: ${fixes.length} correção(ões)`, detail: fixes.join("\n") });
      const est = expectedCallsPerTask({ autonomy: state.autonomy, pack: state.modelPack, knobs: deps.knobs });
      reply = [
        parsed.reply || `Dividi o pedido em ${graph.tasks.length} tarefa(s).`,
        mdList(graph.tasks.map(describeTask)),
        fixes.length ? `Arrumei o grafo: ${fixes.join(" ")}` : "",
        toExpand.length ? `Tarefas complexas que valem dividir em subtarefas: ${toExpand.map((r) => `#${r.taskId} (nota ${r.score})`).join(", ")}.` : "",
        `Custo esperado por tarefa: ${est.typical.length} chamada(s) ao modelo (${est.typical.map((c) => `${c.role}/${c.tier}`).join(", ")}), no pior caso ${est.worstCase}.${replaced}`,
        nextHint(state),
      ].filter(Boolean).join("\n\n");
      break;
    }

    // ------------------------------------------------------------------ validar
    case "validate": {
      const graph = requireGraph(state);
      const { issues } = validateTaskGraph(graph);
      if (!issues.length) {
        reply = "O grafo de tarefas está válido: sem ciclos e sem dependências inexistentes.";
        break;
      }
      const repaired = repairTaskGraph(graph);
      state = { ...state, graph: { ...repaired.graph, updatedAt: now() } };
      reply = `Encontrei ${issues.length} problema(s) no grafo e corrigi:\n${mdList(issues.map((i) => `${i.detail} → ${i.fix}`))}`;
      break;
    }

    // ------------------------------------------------------------------ status manual
    case "status": {
      const graph = requireGraph(state);
      if (!req.taskId || !req.status) throw new PlanError("Diga a tarefa e o novo status.");
      if (req.status === "pending" && state.staged.some((s) => s.taskId === req.taskId)) throw new PlanError(`A tarefa #${req.taskId} tem mudanças staged. Rejeite-as antes.`);
      state = { ...state, graph: req.subtaskId ? setSubtaskStatus(graph, req.taskId, req.subtaskId, req.status, now()) : setTaskStatus(graph, req.taskId, req.status, {}, now()) };
      reply = `Tarefa #${req.taskId}${req.subtaskId ? `.${req.subtaskId}` : ""}: ${STATUS_LABEL[req.status]}. ${nextHint(state)}`;
      break;
    }

    // ------------------------------------------------------------------ dividir tarefa
    case "expand": {
      const graph = requireGraph(state);
      const task = req.taskId ? getTask(graph, req.taskId) : nextTask(graph);
      if (!task) throw new PlanError("Não achei a tarefa para dividir.");
      await charge("vibe_code_agent:plan_expand");
      const report = analyzeComplexity(task, deps.knobs.expandThreshold);
      const count = Math.max(2, report.recommendedSubtasks || 3);
      const tier = tierFor("expander", state.modelPack, { planTier: deps.knobs.planTier });
      const { value: subtasks } = await askJson(
        deps,
        buildExpandMessages(task, count, formatSharedContext(sharedContext(deps, state, task.id), "planner")),
        (raw) => {
          const subs = parseSubtasks(extractJsonObject(raw).subtasks);
          if (!subs.length) throw new TaskGraphError("sem_subtarefas");
          return subs;
        },
        { tier, role: "expander", maxTokens: 2500, label: `dividir #${task.id}` },
      );
      state = { ...state, graph: expandTask(graph, task.id, subtasks, now()) };
      reply = `Dividi a tarefa #${task.id} em ${subtasks.length} subtarefa(s):\n${mdList(subtasks.map((s) => `${task.id}.${s.id} ${s.title}`))}`;
      break;
    }

    // ------------------------------------------------------------------ executar próxima
    case "next": {
      const graph = requireGraph(state);
      if (state.staged.length) {
        const ids = [...new Set(state.staged.map((s) => s.taskId).filter(Boolean))];
        throw new PlanError(`Ainda há ${state.staged.length} mudança(s) staged${ids.length ? ` da tarefa ${ids.map((i) => `#${i}`).join(", ")}` : ""} esperando você. Aplique (/aplicar) ou rejeite (/rejeitar) antes da próxima.`);
      }
      let task = req.taskId ? getTask(graph, req.taskId) : nextTask(graph);
      if (!task) {
        reply = nextHint(state) || "Não há tarefa pendente.";
        break;
      }
      if (task.status === "done") throw new PlanError(`A tarefa #${task.id} já está feita. Use /voltar para desfazer, ou marque como pendente.`);
      if (task.status !== "in-progress") {
        state = { ...state, graph: setTaskStatus(graph, task.id, "in-progress", { note: undefined }, now()) };
        task = getTask(state.graph, task.id)!;
      }
      await charge("vibe_code_agent:plan_task");
      deps.send({ kind: "plan", status: "running", title: `Executando ${describeTask(task)}` });
      const loaded = await loadTree(deps, state);
      const exec = await executeTask(deps, { state: loaded.state, task, tree: loaded.tree }, { attempt: 1, origin: "task" });
      state = exec.state;

      if (!exec.stagedNow.length) {
        if (exec.rejected.length) {
          state = { ...state, graph: setTaskStatus(state.graph!, task.id, "blocked", { note: "checagem estática barrou a entrega" }, now()) };
          reply = `Não consegui gerar mudanças válidas para a tarefa #${task.id}: ${exec.rejected.join("; ")}. Marquei como bloqueada; ajuste o pedido ou rode /proxima de novo.`;
        } else {
          state = { ...state, graph: setTaskStatus(state.graph!, task.id, "done", { note: "já estava feita no código" }, now()) };
          reply = `${exec.summary || "Nada a mudar."} A tarefa #${task.id} já estava atendida pelo código; marquei como feita. ${nextHint(state)}`;
          continueNext = cfg().autoContinue;
        }
        break;
      }

      const payload = cfg().autoReview ? await reviewStaged(deps, state, exec.stagedNow, task) : null;
      const blocking = hasBlockingFindings(payload);
      const stats = exec.stagedNow.reduce((acc, c) => ({ a: acc.a + c.added, r: acc.r + c.removed }), { a: 0, r: 0 });
      const parts = [
        exec.summary,
        `Tarefa #${task.id}: ${exec.stagedNow.length} arquivo(s) staged (+${stats.a}/-${stats.r}). Nada foi gravado no projeto ainda.`,
        exec.rejected.length ? `Barrados pela checagem estática: ${exec.rejected.join("; ")}.` : "",
        payload ? (payload.findings.length ? `A revisão do diff achou ${payload.findings.length} item(ns); estão na fila de correções (aplicam nas mudanças staged).` : "A revisão do diff não achou problemas.") : "",
      ];
      if (cfg().autoApply && !blocking) {
        const applied = await applyStaged(deps, state, exec.stagedNow.map((s) => s.path));
        state = applied.state;
        parts.push(`Autonomia ${cfg().label}: ${applied.reply}`);
        continueNext = applied.appliedTaskDone && cfg().autoContinue;
      } else {
        if (cfg().autoApply && blocking) parts.push("Não apliquei sozinho porque a revisão achou item crítico/alto. Resolva a fila e aplique.");
        else parts.push("Revise o diff e escolha Aplicar ou Rejeitar (por arquivo ou tudo).");
      }
      reply = parts.filter(Boolean).join(" ");
      break;
    }

    // ------------------------------------------------------------------ aplicar
    case "apply": {
      const applied = await applyStaged(deps, state, req.paths);
      state = applied.state;
      continueNext = applied.appliedTaskDone && cfg().autoContinue && !!nextTask(state.graph);
      reply = [applied.reply, nextHint(state)].filter(Boolean).join(" ");
      break;
    }

    // ------------------------------------------------------------------ rejeitar
    case "reject": {
      const chosen = state.staged.filter((s) => !req.paths?.length || req.paths.includes(s.path));
      if (!chosen.length) throw new PlanError("Não há mudanças staged para rejeitar.");
      const drop = new Set(chosen.map((c) => c.path));
      state = { ...state, staged: state.staged.filter((s) => !drop.has(s.path)) };
      const taskIds = [...new Set(chosen.map((c) => c.taskId).filter((n): n is number => typeof n === "number"))];
      for (const id of taskIds) {
        const t = getTask(state.graph, id);
        if (t?.status === "in-progress" && !state.staged.some((s) => s.taskId === id)) {
          state = { ...state, graph: setTaskStatus(state.graph!, id, "pending", { note: "mudanças rejeitadas pelo Dev" }, now()) };
        }
      }
      reply = `Rejeitei ${chosen.length} mudança(s): ${chosen.map((c) => `\`${c.path}\``).join(", ")}. Nada foi gravado no projeto.${taskIds.length ? ` A tarefa ${taskIds.map((i) => `#${i}`).join(", ")} voltou para pendente.` : ""}`;
      break;
    }

    // ------------------------------------------------------------------ fila de correções nas mudanças staged
    case "stage_edit": {
      if (!req.path || typeof req.content !== "string") throw new PlanError("Faltou o arquivo e o conteúdo.");
      const existing = state.staged.find((s) => s.path === req.path);
      if (!existing) throw new PlanError(`${req.path} não tem mudança staged; a correção deve ir para o projeto.`);
      const problems = deps.lint(req.path, req.content).filter((p) => !p.startsWith("sintaxe"));
      if (problems.length) throw new PlanError(`A correção deixaria ${req.path} inválido: ${problems.join("; ")}`);
      state = { ...state, staged: upsertStaged(state.staged, stageChange({ path: req.path, baseContent: existing.baseContent, content: req.content, reason: existing.reason, taskId: existing.taskId, origin: existing.origin, now: now() })) };
      reply = `Correção aplicada na mudança staged de \`${req.path}\` (o projeto continua intacto até você aplicar).`;
      break;
    }

    // ------------------------------------------------------------------ auto-debug
    case "debug": {
      const graph = requireGraph(state);
      if (!req.errors?.length) throw new PlanError("Não recebi nenhum erro para depurar. Cole o erro depois de /debug.");
      if (state.staged.length) throw new PlanError("Há mudanças staged pendentes. Aplique ou rejeite antes do auto-debug.");
      const lastApplied = [...state.applied].reverse().find((a) => typeof a.taskId === "number");
      const taskId = state.debug?.taskId ?? lastApplied?.taskId ?? graph.tasks.find((t) => t.status === "in-progress")?.id;
      const task = typeof taskId === "number" ? getTask(graph, taskId) : undefined;
      if (!task) throw new PlanError("Não sei de qual tarefa são esses erros. Use /fix para corrigir erros fora do plano.");
      const attempts = (state.debug?.taskId === task.id ? state.debug.attempts : 0) + 1;
      if (attempts > deps.knobs.autodebugMax) {
        reply = `Já tentei ${deps.knobs.autodebugMax} vez(es) depurar a tarefa #${task.id} e o erro continua. Parei para não gastar à toa: use /voltar para desfazer a tarefa, /fix para corrigir um a um com você, ou descreva o que esperava.`;
        state = { ...state, graph: task.status === "done" ? state.graph : setTaskStatus(graph, task.id, "blocked", { note: "auto-debug esgotou as tentativas" }, now()) };
        break;
      }
      await charge("vibe_code_agent:plan_debug");
      deps.send({ kind: "plan", status: "running", title: `Auto-debug da tarefa #${task.id} (tentativa ${attempts}/${deps.knobs.autodebugMax})` });
      const loaded = await loadTree(deps, state);
      const exec = await executeTask(deps, { state: loaded.state, task, tree: loaded.tree }, { errors: req.errors, attempt: attempts, origin: "debug" });
      state = { ...exec.state, debug: { taskId: task.id, attempts } };
      if (!exec.stagedNow.length) {
        reply = `${exec.summary || "Não achei uma correção segura nos arquivos carregados."} (tentativa ${attempts}/${deps.knobs.autodebugMax})`;
        break;
      }
      const tiny = isTinyDiff(exec.stagedNow, deps.knobs.tinyDiffLines);
      const payload = cfg().autoReview && !tiny ? await reviewStaged(deps, state, exec.stagedNow, task) : null;
      if (tiny) deps.send({ kind: "review", status: "skipped", title: "Correção pequena: revisão pulada para economizar" });
      const parts = [exec.summary, `Correção staged em ${exec.stagedNow.length} arquivo(s) (tentativa ${attempts}/${deps.knobs.autodebugMax}, modelo ${exec.tier}).`];
      if (cfg().autoApply && !hasBlockingFindings(payload)) {
        const applied = await applyStaged(deps, state, exec.stagedNow.map((s) => s.path));
        state = { ...applied.state, debug: { taskId: task.id, attempts } };
        parts.push(applied.reply, "Se o erro continuar, o auto-debug tenta de novo até o limite.");
      } else parts.push("Revise e aplique; se o erro continuar, rode /debug de novo.");
      reply = parts.filter(Boolean).join(" ");
      break;
    }

    // ------------------------------------------------------------------ rewind
    case "rewind": {
      if (state.staged.length) throw new PlanError("Há mudanças staged pendentes. Aplique ou rejeite antes de voltar.");
      const last = state.applied[state.applied.length - 1];
      if (!last) throw new PlanError("Nada do plano foi aplicado ainda; não há o que desfazer.");
      const files = await deps.revert(last);
      state = { ...state, applied: state.applied.slice(0, -1), debug: null };
      const task = typeof last.taskId === "number" ? getTask(state.graph, last.taskId) : undefined;
      if (task?.status === "done" && (!task.checkpointId || task.checkpointId === last.checkpointId)) {
        state = { ...state, graph: setTaskStatus(state.graph!, task.id, "pending", { note: "desfeita com /voltar" }, now()) };
      }
      reply = `Voltei ${files.length} arquivo(s) ao estado anterior${task ? ` e a tarefa #${task.id} voltou para pendente` : ""}: ${files.map((f) => `\`${f}\``).join(", ")}. ${nextHint(state)}`;
      break;
    }
  }

  state = { ...state, updatedAt: now() };
  await deps.saveState(state);
  deps.send({ kind: "plan_state", status: "success", title: "Plano atualizado", planState: toClientState(state), continueNext });
  return { reply, state, continueNext };
}
