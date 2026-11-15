// Fila de correções do Vibe Reviewer: "arrume os erros um a um conversando com o Dev".
//
// Máquina de estados pura (reducer): cada item da revisão passa por
//   pending ─► applying ─► applied
//      │          └──────► failed ─► (tentar de novo | ajustar | pular)
//      ├──► skipped
//      └──► adjusting ─► pending (correção refeita com o comentário do Dev)
// Só um item fica "na vez" (index). Aplicar/pular avança para o próximo
// pendente. A cópia de trabalho dos arquivos (files) acompanha cada correção
// aplicada, para que a próxima correção no mesmo arquivo case com o texto novo.

import {
  applyReplacement,
  type FixDecision,
  type ReviewCommand,
  type ReviewFinding,
  type ReviewPayload,
  validateFinding,
} from "./engine";

export type FixItemStatus = "pending" | "applying" | "applied" | "skipped" | "adjusting" | "failed";

export interface FixItem {
  finding: ReviewFinding;
  status: FixItemStatus;
  /** Último comentário do Dev em "Ajustar". */
  comment?: string;
  /** Último erro ao aplicar ou ajustar. */
  error?: string;
}

export interface FixQueueState {
  command: ReviewCommand | null;
  items: FixItem[];
  /** Item da vez; igual a items.length quando a fila terminou. */
  index: number;
  /** Cópia de trabalho dos arquivos citados na fila. */
  files: Record<string, string>;
  /** Decisões do Dev na conversa (sobrevivem entre filas; vão no contexto do agente). */
  decisions: FixDecision[];
  /** Itens que o Dev pulou nesta conversa: não voltam numa próxima revisão. */
  skippedIds: string[];
}

export const emptyFixQueue: FixQueueState = { command: null, items: [], index: 0, files: {}, decisions: [], skippedIds: [] };

export type FixQueueAction =
  | { type: "start"; payload: ReviewPayload }
  | { type: "apply_start" }
  | { type: "apply_success"; content: string }
  | { type: "apply_failed"; error: string }
  | { type: "skip" }
  | { type: "adjust_start"; comment: string }
  | { type: "adjust_result"; finding: ReviewFinding; fileContent?: string }
  | { type: "adjust_failed"; error: string }
  | { type: "close" };

const MAX_DECISIONS = 30;

function nextPending(items: FixItem[], from: number): number {
  for (let i = from + 1; i < items.length; i++) if (items[i].status === "pending") return i;
  for (let i = 0; i <= from && i < items.length; i++) if (items[i].status === "pending") return i;
  return items.length;
}

function withItem(state: FixQueueState, patch: Partial<FixItem>): FixItem[] {
  return state.items.map((it, i) => (i === state.index ? { ...it, ...patch } : it));
}

function decide(state: FixQueueState, item: FixItem, decision: FixDecision["decision"], comment?: string): FixDecision[] {
  const d: FixDecision = { title: item.finding.title, path: item.finding.path, decision, ...(comment ? { comment } : {}) };
  return [...state.decisions, d].slice(-MAX_DECISIONS);
}

export function fixQueueReducer(state: FixQueueState, action: FixQueueAction): FixQueueState {
  const current = state.items[state.index];
  switch (action.type) {
    case "start": {
      const { payload } = action;
      if (payload.command === "adjust" || payload.command === "describe" || payload.command === "ask") return state;
      // O que o Dev já pulou nesta conversa não volta para a fila.
      const skipped = new Set(state.skippedIds);
      const items = payload.findings
        .filter((f) => !skipped.has(f.id))
        .map((finding): FixItem => ({ finding, status: "pending" }));
      return {
        command: payload.command,
        items,
        index: 0,
        files: { ...(payload.files ?? {}) },
        decisions: state.decisions,
        skippedIds: state.skippedIds,
      };
    }
    case "apply_start": {
      if (!current || (current.status !== "pending" && current.status !== "failed")) return state;
      return { ...state, items: withItem(state, { status: "applying", error: undefined }) };
    }
    case "apply_success": {
      if (!current || current.status !== "applying") return state;
      const path = current.finding.path;
      const files = { ...state.files, [path]: action.content };
      // As próximas correções no mesmo arquivo são conferidas de novo contra o texto novo.
      const items = state.items.map((it, i) => {
        if (i === state.index) return { ...it, status: "applied" as const };
        if (it.status === "pending" && it.finding.path === path) return { ...it, finding: validateFinding(it.finding, action.content) };
        return it;
      });
      return { ...state, items, files, index: nextPending(items, state.index), decisions: decide(state, current, "applied", current.comment) };
    }
    case "apply_failed": {
      if (!current || current.status !== "applying") return state;
      return { ...state, items: withItem(state, { status: "failed", error: action.error }) };
    }
    case "skip": {
      if (!current || current.status === "applying" || current.status === "adjusting") return state;
      const items = withItem(state, { status: "skipped" });
      return {
        ...state,
        items,
        index: nextPending(items, state.index),
        decisions: decide(state, current, "skipped", current.comment),
        skippedIds: [...state.skippedIds, current.finding.id].slice(-100),
      };
    }
    case "adjust_start": {
      if (!current || current.status === "applying" || current.status === "adjusting" || current.status === "applied" || current.status === "skipped") return state;
      const comment = action.comment.trim();
      if (!comment) return state;
      return { ...state, items: withItem(state, { status: "adjusting", comment, error: undefined }) };
    }
    case "adjust_result": {
      if (!current || current.status !== "adjusting") return state;
      const files = action.fileContent !== undefined ? { ...state.files, [current.finding.path]: action.fileContent } : state.files;
      // Mantém a identidade do item original (o Dev está ajustando ESTE item).
      const finding: ReviewFinding = { ...action.finding, id: current.finding.id, path: current.finding.path, source: current.finding.source };
      return {
        ...state,
        files,
        items: withItem(state, { status: "pending", finding }),
        decisions: decide(state, current, "adjusted", current.comment),
      };
    }
    case "adjust_failed": {
      if (!current || current.status !== "adjusting") return state;
      return { ...state, items: withItem(state, { status: "pending", error: action.error }) };
    }
    case "close":
      return { ...emptyFixQueue, decisions: state.decisions, skippedIds: state.skippedIds };
    default:
      return state;
  }
}

export function currentFixItem(state: FixQueueState): FixItem | null {
  return state.items[state.index] ?? null;
}

export function isQueueActive(state: FixQueueState): boolean {
  return state.items.length > 0 && state.index < state.items.length;
}

export interface QueueProgress {
  /** Posição do item da vez (1-based), ou total quando terminou. */
  position: number;
  total: number;
  applied: number;
  skipped: number;
  done: boolean;
  /** 0-100, itens resolvidos (aplicados + pulados) sobre o total. */
  percent: number;
}

export function queueProgress(state: FixQueueState): QueueProgress {
  const total = state.items.length;
  const applied = state.items.filter((i) => i.status === "applied").length;
  const skipped = state.items.filter((i) => i.status === "skipped").length;
  const done = total > 0 && state.index >= total;
  return {
    position: done ? total : Math.min(state.index + 1, total),
    total,
    applied,
    skipped,
    done,
    percent: total ? Math.round(((applied + skipped) / total) * 100) : 0,
  };
}

export type PreparedApply = { ok: true; path: string; content: string } | { ok: false; reason: string };

/** Conteúdo final do arquivo com a correção da vez aplicada na cópia de trabalho. */
export function prepareApply(state: FixQueueState): PreparedApply {
  const item = currentFixItem(state);
  if (!item) return { ok: false, reason: "nenhum item na vez" };
  const f = item.finding;
  if (f.existingCode === undefined) return { ok: false, reason: "este item não tem correção automática; use Ajustar ou Pular" };
  const content = state.files[f.path];
  if (content === undefined) return { ok: false, reason: `não tenho o conteúdo atual de ${f.path}` };
  const res = applyReplacement(content, f.existingCode, f.improvedCode ?? "", f.startLine);
  if ("reason" in res) return { ok: false, reason: res.reason };
  if (res.content === content) return { ok: false, reason: "a correção não muda nada no arquivo" };
  return { ok: true, path: f.path, content: res.content };
}
