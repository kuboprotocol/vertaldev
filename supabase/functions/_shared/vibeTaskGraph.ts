// Grafo de tarefas do Vibe Code ("o QUE fazer e em que ordem").
//
// Implementação própria (clean-room) do CONCEITO popularizado pelo Task Master
// (https://github.com/eyaltoledano/claude-task-master). Este arquivo NÃO contém
// código, prompts nem texto do Task Master: a licença dele é MIT + Commons
// Clause, que proíbe vender o software ou um serviço cujo valor venha
// substancialmente dele, e o Vertal Dev é pago (créditos). Ver
// THIRD_PARTY_NOTICES.md.
//
// Puro (sem Deno/DOM): roda na edge function vibe-code-agent e no navegador.
//
//   pedido/PRD ─► modelo (JSON) ─► parseTaskGraph (normaliza ids, prioridade,
//   status, dependências, subtarefas) ─► validateTaskGraph (ciclos, ids
//   inexistentes, autodependência) ─► repairTaskGraph (correções sugeridas
//   aplicadas) ─► nextTask (maior prioridade pendente com dependências feitas)
//   ─► setTaskStatus (transições válidas) ─► analyzeComplexity (sugere dividir).

export type TaskStatus = "pending" | "in-progress" | "done" | "deferred" | "blocked";
export type TaskPriority = "high" | "medium" | "low";

export const TASK_STATUSES: TaskStatus[] = ["pending", "in-progress", "done", "deferred", "blocked"];
export const TASK_PRIORITIES: TaskPriority[] = ["high", "medium", "low"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pendente",
  "in-progress": "Em andamento",
  done: "Feita",
  deferred: "Adiada",
  blocked: "Bloqueada",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = { high: "Alta", medium: "Média", low: "Baixa" };

export interface PlanSubtask {
  /** Id local à tarefa-mãe (1, 2, 3…); exibido como "<mãe>.<id>". */
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  /** Ids de subtarefas irmãs. */
  dependencies: number[];
}

export interface PlanTask {
  id: number;
  title: string;
  description: string;
  /** Como implementar: arquivos, abordagem, cuidados. */
  details: string;
  /** Como saber que ficou certo (teste, verificação manual, critério de aceite). */
  testStrategy: string;
  priority: TaskPriority;
  status: TaskStatus;
  dependencies: number[];
  subtasks: PlanSubtask[];
  /** Arquivos que a tarefa deve ler/criar/alterar (dica para carregar contexto). */
  files: string[];
  /** 1-10, do modelo ou da heurística. */
  complexity?: number;
  /** Execução: checkpoint/commit gerados ao aplicar esta tarefa. */
  checkpointId?: string;
  commitSha?: string;
  appliedAt?: string;
  /** Observação curta do executor (ex.: motivo do bloqueio). */
  note?: string;
}

export interface TaskGraph {
  version: 1;
  /** Pedido/PRD de origem, resumido. */
  goal: string;
  tasks: PlanTask[];
  createdAt: string;
  updatedAt: string;
}

export type GraphIssueType = "cycle" | "dangling" | "self" | "duplicate" | "subtask_dangling" | "subtask_cycle";

export interface GraphIssue {
  type: GraphIssueType;
  taskId: number;
  /** Explicação em pt-BR. */
  detail: string;
  /** Correção sugerida em pt-BR (o repairTaskGraph aplica exatamente esta). */
  fix: string;
}

export class TaskGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskGraphError";
  }
}

const MAX_TITLE = 160;
const MAX_TEXT = 2000;
const MAX_FILES_PER_TASK = 12;
const MAX_SUBTASKS = 10;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+$/g, "").trim().slice(0, max) : "");

function toInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const m = v.trim().match(/^#?(\d+)(?:\.\d+)?$/);
    if (m) return Number.parseInt(m[1], 10);
  }
  return null;
}

export function normalizeStatus(v: unknown): TaskStatus {
  const s = typeof v === "string" ? v.trim().toLowerCase().replace(/[\s_]+/g, "-") : "";
  if (s === "in-progress" || s === "doing" || s === "em-andamento" || s === "running") return "in-progress";
  if (s === "done" || s === "completed" || s === "complete" || s === "feita" || s === "concluida" || s === "concluída") return "done";
  if (s === "deferred" || s === "adiada" || s === "later") return "deferred";
  if (s === "blocked" || s === "bloqueada") return "blocked";
  return "pending";
}

export function normalizePriority(v: unknown): TaskPriority {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "high" || s === "alta" || s === "critical" || s === "urgent" || s === "p0" || s === "p1") return "high";
  if (s === "low" || s === "baixa" || s === "p3") return "low";
  return "medium";
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

function safeFile(p: unknown): string | null {
  if (typeof p !== "string") return null;
  const t = p.trim().replace(/^`|`$/g, "").replace(/^\.\//, "");
  if (!t || t.length > 300 || t.startsWith("/") || t.includes("..") || t.includes("\\") || t.includes("\0")) return null;
  return t;
}

function extractObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string") throw new TaskGraphError("plano_invalido");
  const text = raw.replace(/^\uFEFF/, "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new TaskGraphError("plano_invalido");
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new TaskGraphError("plano_invalido");
  }
}

export interface ParseResult {
  graph: TaskGraph;
  /** Correções feitas durante a normalização (ids renumerados, deps descartadas…). */
  fixes: string[];
  /** Texto conversacional do modelo, se houver. */
  reply: string;
}

/**
 * Lê a saída do modelo ({ tasks: [...] }) e normaliza: ids viram 1..n na ordem
 * dada, dependências são remapeadas para os novos ids; ids que não existem são
 * descartados e anotados em `fixes`.
 */
export function parseTaskGraph(raw: unknown, opts: { goal?: string; maxTasks?: number; now?: string } = {}): ParseResult {
  const obj = extractObject(raw);
  const list = Array.isArray(obj.tasks) ? obj.tasks : Array.isArray(obj.tarefas) ? obj.tarefas : null;
  if (!list) throw new TaskGraphError("plano_sem_tarefas");
  const maxTasks = Math.max(1, opts.maxTasks ?? 15);
  const fixes: string[] = [];
  const items = list.filter((t): t is Record<string, unknown> => !!t && typeof t === "object" && !!str((t as Record<string, unknown>).title, MAX_TITLE));
  if (!items.length) throw new TaskGraphError("plano_sem_tarefas");
  if (items.length > maxTasks) fixes.push(`O plano tinha ${items.length} tarefas; fiquei com as ${maxTasks} primeiras.`);
  const kept = items.slice(0, maxTasks);

  // id original → novo id (1..n). Ids duplicados ficam com a primeira ocorrência.
  const idMap = new Map<number, number>();
  kept.forEach((t, i) => {
    const orig = toInt(t.id);
    if (orig !== null && !idMap.has(orig)) idMap.set(orig, i + 1);
    else if (orig !== null) fixes.push(`Id ${orig} repetido: a tarefa "${str(t.title, 60)}" virou #${i + 1}.`);
  });

  const tasks: PlanTask[] = kept.map((t, i) => {
    const id = i + 1;
    const deps: number[] = [];
    for (const d of Array.isArray(t.dependencies) ? t.dependencies : Array.isArray(t.deps) ? t.deps : []) {
      const orig = toInt(d);
      const mapped = orig !== null ? idMap.get(orig) : undefined;
      if (mapped === undefined) {
        fixes.push(`Tarefa #${id}: dependência "${String(d)}" não existe; removida.`);
        continue;
      }
      if (mapped === id) {
        fixes.push(`Tarefa #${id} dependia dela mesma; removida.`);
        continue;
      }
      if (!deps.includes(mapped)) deps.push(mapped);
    }
    const files = [...new Set((Array.isArray(t.files) ? t.files : Array.isArray(t.arquivos) ? t.arquivos : []).map(safeFile).filter((p): p is string => !!p))]
      .slice(0, MAX_FILES_PER_TASK);
    const complexity = toInt(t.complexity);
    return {
      id,
      title: str(t.title, MAX_TITLE),
      description: str(t.description, MAX_TEXT),
      details: str(t.details, MAX_TEXT * 2),
      testStrategy: str(t.testStrategy ?? t.test_strategy, MAX_TEXT),
      priority: normalizePriority(t.priority),
      // Tarefas novas sempre começam pendentes (o modelo não decide o que já foi feito).
      status: "pending",
      dependencies: deps,
      subtasks: parseSubtasks(t.subtasks),
      files,
      ...(complexity !== null ? { complexity: Math.min(10, Math.max(1, complexity)) } : {}),
    };
  });

  const now = opts.now ?? new Date().toISOString();
  return {
    graph: { version: 1, goal: str(opts.goal ?? obj.goal, 600), tasks, createdAt: now, updatedAt: now },
    fixes,
    reply: str(obj.reply ?? obj.summary, 1200),
  };
}

export function parseSubtasks(raw: unknown): PlanSubtask[] {
  if (!Array.isArray(raw)) return [];
  const items = raw.filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && !!str((s as Record<string, unknown>).title, MAX_TITLE)).slice(0, MAX_SUBTASKS);
  const idMap = new Map<number, number>();
  items.forEach((s, i) => {
    const orig = toInt(s.id);
    if (orig !== null && !idMap.has(orig)) idMap.set(orig, i + 1);
  });
  return items.map((s, i) => {
    const id = i + 1;
    const deps = (Array.isArray(s.dependencies) ? s.dependencies : [])
      .map((d) => {
        // "3.2" → 2 (subtarefa irmã)
        const text = typeof d === "string" ? d.trim() : d;
        const sub = typeof text === "string" && /^\d+\.\d+$/.test(text) ? Number.parseInt(text.split(".")[1], 10) : toInt(text);
        return sub !== null ? idMap.get(sub) : undefined;
      })
      .filter((d): d is number => d !== undefined && d !== id);
    return { id, title: str(s.title, MAX_TITLE), description: str(s.description, MAX_TEXT), status: "pending" as TaskStatus, dependencies: [...new Set(deps)] };
  });
}

// ---------------------------------------------------------------------------
// Validação do grafo
// ---------------------------------------------------------------------------

/** Ciclos de dependência (cada ciclo como lista de ids, fechando no primeiro). */
export function findCycles(nodes: Array<{ id: number; dependencies: number[] }>): number[][] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const color = new Map<number, 0 | 1 | 2>();
  const stack: number[] = [];
  const cycles: number[][] = [];
  const seen = new Set<string>();
  const visit = (id: number) => {
    color.set(id, 1);
    stack.push(id);
    for (const dep of byId.get(id)?.dependencies ?? []) {
      if (!byId.has(dep)) continue;
      const c = color.get(dep) ?? 0;
      if (c === 0) visit(dep);
      else if (c === 1) {
        const cycle = [...stack.slice(stack.indexOf(dep)), dep];
        const key = [...new Set(cycle)].sort((a, b) => a - b).join(",");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(cycle);
        }
      }
    }
    stack.pop();
    color.set(id, 2);
  };
  for (const n of nodes) if ((color.get(n.id) ?? 0) === 0) visit(n.id);
  return cycles;
}

export function validateTaskGraph(graph: TaskGraph): { ok: boolean; issues: GraphIssue[] } {
  const issues: GraphIssue[] = [];
  const ids = new Set<number>();
  for (const t of graph.tasks) {
    if (ids.has(t.id)) issues.push({ type: "duplicate", taskId: t.id, detail: `Há mais de uma tarefa com o id #${t.id}.`, fix: `Renumerar a tarefa repetida "${t.title}".` });
    ids.add(t.id);
  }
  for (const t of graph.tasks) {
    for (const d of t.dependencies) {
      if (d === t.id) issues.push({ type: "self", taskId: t.id, detail: `#${t.id} depende dela mesma.`, fix: `Remover #${t.id} das dependências de #${t.id}.` });
      else if (!ids.has(d)) issues.push({ type: "dangling", taskId: t.id, detail: `#${t.id} depende de #${d}, que não existe.`, fix: `Remover #${d} das dependências de #${t.id}.` });
    }
    const subIds = new Set(t.subtasks.map((s) => s.id));
    for (const s of t.subtasks) {
      for (const d of s.dependencies) {
        if (d === s.id || !subIds.has(d)) {
          issues.push({ type: "subtask_dangling", taskId: t.id, detail: `Subtarefa ${t.id}.${s.id} depende de ${t.id}.${d}, que não existe.`, fix: `Remover ${t.id}.${d} das dependências de ${t.id}.${s.id}.` });
        }
      }
    }
    for (const cycle of findCycles(t.subtasks)) {
      const [from, to] = cycleBreakEdge(cycle);
      issues.push({
        type: "subtask_cycle",
        taskId: t.id,
        detail: `Ciclo entre subtarefas de #${t.id}: ${cycle.map((c) => `${t.id}.${c}`).join(" → ")}.`,
        fix: `Remover ${t.id}.${to} das dependências de ${t.id}.${from}.`,
      });
    }
  }
  for (const cycle of findCycles(graph.tasks)) {
    const [from, to] = cycleBreakEdge(cycle);
    issues.push({
      type: "cycle",
      taskId: from,
      detail: `Ciclo de dependências: ${cycle.map((c) => `#${c}`).join(" → ")}.`,
      fix: `Remover #${to} das dependências de #${from}.`,
    });
  }
  return { ok: issues.length === 0, issues };
}

/**
 * Aresta a cortar num ciclo [a, b, c, a] (a depende de b, b de c, c de a): a
 * dependência que aponta para a tarefa de MAIOR id — uma tarefa depender de uma
 * posterior é o elo mais provavelmente errado. Devolve [quem depende, de quem].
 */
function cycleBreakEdge(cycle: number[]): [number, number] {
  let best: [number, number] = [cycle[0], cycle[1]];
  for (let i = 0; i < cycle.length - 1; i++) {
    const edge: [number, number] = [cycle[i], cycle[i + 1]];
    if (edge[1] > best[1] || (edge[1] === best[1] && edge[0] < best[0])) best = edge;
  }
  return best;
}

/** Aplica as correções sugeridas até o grafo ficar válido. Devolve o grafo novo e o que mudou. */
export function repairTaskGraph(graph: TaskGraph): { graph: TaskGraph; fixes: string[] } {
  const fixes: string[] = [];
  let tasks = graph.tasks.map((t) => ({ ...t, dependencies: [...t.dependencies], subtasks: t.subtasks.map((s) => ({ ...s, dependencies: [...s.dependencies] })) }));
  // Ids duplicados: renumera os repetidos para depois do maior id.
  const seen = new Set<number>();
  let maxId = tasks.reduce((m, t) => Math.max(m, t.id), 0);
  for (const t of tasks) {
    if (seen.has(t.id)) {
      const old = t.id;
      t.id = ++maxId;
      fixes.push(`Tarefa repetida #${old} ("${t.title}") virou #${t.id}.`);
    }
    seen.add(t.id);
  }
  const ids = new Set(tasks.map((t) => t.id));
  for (const t of tasks) {
    const before = t.dependencies.length;
    t.dependencies = [...new Set(t.dependencies.filter((d) => d !== t.id && ids.has(d)))];
    if (t.dependencies.length !== before) fixes.push(`#${t.id}: removidas dependências inválidas.`);
    const subIds = new Set(t.subtasks.map((s) => s.id));
    for (const s of t.subtasks) {
      const b = s.dependencies.length;
      s.dependencies = [...new Set(s.dependencies.filter((d) => d !== s.id && subIds.has(d)))];
      if (s.dependencies.length !== b) fixes.push(`${t.id}.${s.id}: removidas dependências inválidas.`);
    }
    for (let guard = 0; guard < 50; guard++) {
      const cycle = findCycles(t.subtasks)[0];
      if (!cycle) break;
      const [from, to] = cycleBreakEdge(cycle);
      const sub = t.subtasks.find((s) => s.id === from)!;
      sub.dependencies = sub.dependencies.filter((d) => d !== to);
      fixes.push(`Ciclo entre subtarefas de #${t.id} quebrado: ${t.id}.${from} não depende mais de ${t.id}.${to}.`);
    }
  }
  for (let guard = 0; guard < 100; guard++) {
    const cycle = findCycles(tasks)[0];
    if (!cycle) break;
    const [from, to] = cycleBreakEdge(cycle);
    tasks = tasks.map((t) => (t.id === from ? { ...t, dependencies: t.dependencies.filter((d) => d !== to) } : t));
    fixes.push(`Ciclo quebrado: #${from} não depende mais de #${to}.`);
  }
  return { graph: { ...graph, tasks }, fixes };
}

// ---------------------------------------------------------------------------
// Próxima tarefa e transições de status
// ---------------------------------------------------------------------------

export function getTask(graph: TaskGraph | null | undefined, id: number): PlanTask | undefined {
  return graph?.tasks.find((t) => t.id === id);
}

/** Dependências ainda não feitas de uma tarefa. */
export function unmetDependencies(graph: TaskGraph, id: number): number[] {
  const task = getTask(graph, id);
  if (!task) return [];
  return task.dependencies.filter((d) => getTask(graph, d)?.status !== "done");
}

/**
 * Próxima tarefa: a que já está em andamento (retomar) ou, entre as pendentes
 * cujas dependências estão todas feitas, a de maior prioridade; empate → mais
 * tarefas destravadas por ela, depois o menor id.
 */
export function nextTask(graph: TaskGraph | null | undefined): PlanTask | null {
  if (!graph) return null;
  const inProgress = graph.tasks.find((t) => t.status === "in-progress");
  if (inProgress) return inProgress;
  const unlocks = (id: number) => graph.tasks.filter((t) => t.dependencies.includes(id)).length;
  const ready = graph.tasks.filter((t) => t.status === "pending" && unmetDependencies(graph, t.id).length === 0);
  ready.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || unlocks(b.id) - unlocks(a.id) || a.id - b.id);
  return ready[0] ?? null;
}

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ["in-progress", "done", "deferred", "blocked"],
  "in-progress": ["done", "pending", "blocked", "deferred"],
  blocked: ["pending", "deferred", "in-progress"],
  deferred: ["pending"],
  done: ["pending"],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

/**
 * Muda o status de uma tarefa respeitando as regras:
 * - só entra "em andamento" com as dependências feitas;
 * - "feita" marca as subtarefas como feitas;
 * - voltar uma tarefa feita para "pendente" (rewind) devolve para "pendente"
 *   as dependentes que estavam em andamento.
 */
export function setTaskStatus(graph: TaskGraph, id: number, status: TaskStatus, patch: Partial<PlanTask> = {}, now = new Date().toISOString()): TaskGraph {
  const task = getTask(graph, id);
  if (!task) throw new TaskGraphError(`A tarefa #${id} não existe neste plano.`);
  if (!canTransition(task.status, status)) {
    throw new TaskGraphError(`Não dá para mudar a tarefa #${id} de "${STATUS_LABEL[task.status]}" para "${STATUS_LABEL[status]}".`);
  }
  if (status === "in-progress") {
    const unmet = unmetDependencies(graph, id);
    if (unmet.length) throw new TaskGraphError(`A tarefa #${id} ainda depende de ${unmet.map((d) => `#${d}`).join(", ")}. Termine essas antes.`);
    const other = graph.tasks.find((t) => t.status === "in-progress" && t.id !== id);
    if (other) throw new TaskGraphError(`A tarefa #${other.id} já está em andamento. Uma tarefa por vez.`);
  }
  const tasks = graph.tasks.map((t) => {
    if (t.id === id) {
      const subtasks = status === "done" ? t.subtasks.map((s) => ({ ...s, status: "done" as TaskStatus })) : status === "pending" && t.status === "done" ? t.subtasks.map((s) => ({ ...s, status: "pending" as TaskStatus })) : t.subtasks;
      const next: PlanTask = { ...t, ...patch, status, subtasks };
      if (status === "pending" && t.status === "done") {
        delete next.checkpointId;
        delete next.commitSha;
        delete next.appliedAt;
      }
      return next;
    }
    if (status === "pending" && task.status === "done" && t.status === "in-progress" && t.dependencies.includes(id)) {
      return { ...t, status: "pending" as TaskStatus, note: `Voltou para pendente: #${id} foi desfeita.` };
    }
    return t;
  });
  return { ...graph, tasks, updatedAt: now };
}

export function setSubtaskStatus(graph: TaskGraph, taskId: number, subId: number, status: TaskStatus, now = new Date().toISOString()): TaskGraph {
  const task = getTask(graph, taskId);
  const sub = task?.subtasks.find((s) => s.id === subId);
  if (!task || !sub) throw new TaskGraphError(`A subtarefa ${taskId}.${subId} não existe.`);
  return { ...graph, updatedAt: now, tasks: graph.tasks.map((t) => (t.id === taskId ? { ...t, subtasks: t.subtasks.map((s) => (s.id === subId ? { ...s, status } : s)) } : t)) };
}

export interface GraphProgress {
  total: number;
  done: number;
  pending: number;
  inProgress: number;
  blocked: number;
  deferred: number;
  percent: number;
}

export function graphProgress(graph: TaskGraph | null | undefined): GraphProgress {
  const tasks = graph?.tasks ?? [];
  const count = (s: TaskStatus) => tasks.filter((t) => t.status === s).length;
  const done = count("done");
  const deferred = count("deferred");
  const countable = tasks.length - deferred;
  return {
    total: tasks.length,
    done,
    pending: count("pending"),
    inProgress: count("in-progress"),
    blocked: count("blocked"),
    deferred,
    percent: countable > 0 ? Math.round((done / countable) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Complexidade e divisão em subtarefas
// ---------------------------------------------------------------------------

const HEAVY_RE = /\b(auth|login|oauth|pagamento|payment|stripe|checkout|migra(?:ção|cao|tion)|database|banco de dados|schema|realtime|websocket|tempo real|segurança|security|criptografia|crypto|upload|integra(?:ção|cao|tion)|webhook|refator|refactor|multi-?tenant|permiss(?:ão|ao|ões|oes)|rls|cache|fila|queue|offline|i18n)\b/gi;

export interface ComplexityReport {
  taskId: number;
  /** 1-10 */
  score: number;
  reasons: string[];
  /** Quantas subtarefas valeria a pena criar (0 = não divida). */
  recommendedSubtasks: number;
  shouldExpand: boolean;
}

/**
 * Nota de complexidade 1-10 sem chamar modelo: tamanho do texto, arquivos
 * tocados, temas pesados (auth, pagamento, migração…) e dependências. Quando o
 * modelo também deu uma nota, usa a maior das duas.
 */
export function analyzeComplexity(task: PlanTask, threshold = 7): ComplexityReport {
  const reasons: string[] = [];
  const text = `${task.title} ${task.description} ${task.details}`;
  let score = 1;
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 40) {
    score += 1;
    reasons.push("descrição longa");
  }
  if (words > 120) score += 1;
  if (task.files.length >= 3) {
    score += 1;
    reasons.push(`${task.files.length} arquivos`);
  }
  if (task.files.length >= 6) score += 2;
  const heavy = [...new Set((text.match(HEAVY_RE) ?? []).map((m) => m.toLowerCase()))];
  if (heavy.length) {
    score += Math.min(4, heavy.length * 2);
    reasons.push(`tema sensível: ${heavy.slice(0, 3).join(", ")}`);
  }
  if (task.dependencies.length >= 3) {
    score += 1;
    reasons.push(`${task.dependencies.length} dependências`);
  }
  if (typeof task.complexity === "number" && task.complexity > score) {
    score = task.complexity;
    reasons.push("nota do planejador");
  }
  score = Math.max(1, Math.min(10, score));
  const shouldExpand = score >= threshold && task.subtasks.length === 0;
  return {
    taskId: task.id,
    score,
    reasons,
    recommendedSubtasks: shouldExpand ? Math.min(6, Math.max(2, score - 4)) : 0,
    shouldExpand,
  };
}

export function analyzeGraphComplexity(graph: TaskGraph, threshold = 7): ComplexityReport[] {
  return graph.tasks.map((t) => analyzeComplexity(t, threshold));
}

/** Coloca subtarefas numa tarefa (substitui as existentes que ainda não começaram). */
export function expandTask(graph: TaskGraph, id: number, subtasks: PlanSubtask[], now = new Date().toISOString()): TaskGraph {
  const task = getTask(graph, id);
  if (!task) throw new TaskGraphError(`A tarefa #${id} não existe neste plano.`);
  if (task.status === "done") throw new TaskGraphError(`A tarefa #${id} já foi feita; não dá para dividir.`);
  const clean = repairTaskGraph({ ...graph, tasks: [{ ...task, subtasks: subtasks.slice(0, MAX_SUBTASKS) }] }).graph.tasks[0].subtasks;
  return { ...graph, updatedAt: now, tasks: graph.tasks.map((t) => (t.id === id ? { ...t, subtasks: clean } : t)) };
}

/** Resumo compacto do plano para os prompts (planejador, executor e revisor). */
export function formatTaskGraphForPrompt(graph: TaskGraph | null | undefined, currentId?: number, maxChars = 3000): string {
  if (!graph?.tasks.length) return "";
  const lines = graph.tasks.map((t) => {
    const deps = t.dependencies.length ? ` (depende de ${t.dependencies.map((d) => `#${d}`).join(", ")})` : "";
    const mark = t.id === currentId ? " ◄ TAREFA ATUAL" : "";
    return `#${t.id} [${STATUS_LABEL[t.status]}] [${PRIORITY_LABEL[t.priority]}] ${t.title}${deps}${mark}`;
  });
  let out = `Plano da conversa${graph.goal ? ` — objetivo: ${graph.goal}` : ""}:\n`;
  for (const l of lines) {
    if (out.length + l.length > maxChars) {
      out += "…\n";
      break;
    }
    out += `${l}\n`;
  }
  return out.trimEnd();
}
