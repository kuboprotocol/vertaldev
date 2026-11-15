// Vibe Review Engine — núcleo puro (sem Deno, sem rede) do revisor de código
// do Vibe Code, inspirado no PR-Agent (https://github.com/The-PR-Agent/pr-agent,
// MIT, Copyright (c) 2026 The PR Agent). A estrutura (findings com arquivo,
// linhas, existing_code → improved_code; sugestões com autorreflexão e nota de
// 0 a 10; código numerado no formato "__new hunk__"; reindentação da
// substituição) foi portada de pr_agent/algo/{findings,code_replacement,
// git_patch_processing}.py e reescrita em TypeScript. Ver THIRD_PARTY_NOTICES.md.
//
// Usado em dois lugares:
//  - edge function vibe-code-agent (valida a saída JSON do modelo e confere
//    se cada correção se aplica ao arquivo real antes de mostrar ao Dev)
//  - front-end (aplica a correção no arquivo, mostra o diff e alimenta a fila)

import { lintGeneratedFile } from "./vibeAgentCore.ts";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type ReviewCommand = "review" | "improve" | "describe" | "ask" | "fix_errors" | "adjust";
export type Severity = "critical" | "high" | "medium" | "low";
export type FindingSource = "review" | "improve" | "error";

export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Médio",
  low: "Baixo",
};

export interface ReviewFinding {
  /** Impressão digital estável (arquivo + título + trecho): evita sugerir de novo o que o Dev pulou. */
  id: string;
  source: FindingSource;
  path: string;
  title: string;
  severity: Severity;
  label?: string;
  /** Explicação em português simples: o problema, por que importa e quando acontece. */
  explanation: string;
  startLine?: number;
  endLine?: number;
  existingCode?: string;
  improvedCode?: string;
  /** Nota da autorreflexão (0-10), só em /improve. */
  score?: number;
  why?: string;
  /** Erro de build/runtime que originou este item (fila de erros). */
  errorRef?: string;
  /** true quando existing_code foi encontrado no arquivo e a troca não quebra a sintaxe. */
  applicable: boolean;
  /** Por que não dá para aplicar automaticamente (o Dev pode pedir um ajuste). */
  problem?: string;
}

export interface DescribeResult {
  title: string;
  type: string[];
  description: string;
  files: Array<{ path: string; summary: string; label?: string }>;
}

export interface ReviewPayload {
  command: ReviewCommand;
  findings: ReviewFinding[];
  /** Conteúdo atual dos arquivos citados nos findings (só no stream ao vivo, não é guardado). */
  files?: Record<string, string>;
  summary?: string;
  riskLevel?: "low" | "medium" | "high";
  securityConcerns?: string;
  describe?: DescribeResult;
  /** Quantos itens a validação ou a autorreflexão descartou. */
  dropped?: number;
}

export interface FixDecision {
  title: string;
  path: string;
  decision: "applied" | "skipped" | "adjusted";
  comment?: string;
}

export interface DevContext {
  recentErrors?: string[];
  openedPath?: string | null;
  decisions?: FixDecision[];
  /** Arquivos que o agente tocou nesta conversa (o "PR" do Vibe Code). */
  conversationFiles?: string[];
}

export class ReviewParseError extends Error {
  constructor(message = "review_parse_failed") {
    super(message);
    this.name = "ReviewParseError";
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const code = (v: unknown, max = 8000): string | undefined => {
  if (typeof v !== "string") return undefined;
  const trimmed = v.replace(/^\n+/, "").replace(/\s+$/, "");
  return trimmed ? trimmed.slice(0, max) : undefined;
};
const lineNo = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number.parseInt(v, 10) : typeof v === "number" ? Math.trunc(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** djb2 em base36: barato, estável e igual no Deno e no navegador. */
export function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function fingerprintFinding(f: Pick<ReviewFinding, "path" | "title" | "existingCode">): string {
  const snippet = (f.existingCode ?? "").replace(/\s+/g, " ").trim();
  return `f_${hashText(`${f.path}|${f.title.toLowerCase()}|${snippet}`)}`;
}

/** Lê o objeto JSON da resposta do modelo. Tolera cercas ```json e texto em volta. */
export function extractJsonObject(raw: string): Record<string, unknown> {
  const text = (raw ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new ReviewParseError();
  try {
    const data = JSON.parse(text.slice(start, end + 1));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new ReviewParseError();
    return data as Record<string, unknown>;
  } catch (e) {
    if (e instanceof ReviewParseError) throw e;
    throw new ReviewParseError();
  }
}

export function normalizeSeverity(raw: unknown, hint = ""): Severity {
  const v = `${typeof raw === "string" ? raw : ""}`.toLowerCase().trim();
  const map: Record<string, Severity> = {
    critical: "critical", critico: "critical", "crítico": "critical", blocker: "critical",
    high: "high", alto: "high", alta: "high", major: "high",
    medium: "medium", medio: "medium", "médio": "medium", media: "medium", "média": "medium", moderate: "medium",
    low: "low", baixo: "low", baixa: "low", minor: "low", info: "low",
  };
  if (map[v]) return map[v];
  const h = hint.toLowerCase();
  if (/secur|segur|inje[cç]|xss|vazamento|leak|secret|segredo/.test(h)) return "high";
  if (/bug|crash|erro|error|quebra/.test(h)) return "medium";
  return "low";
}

/** Nota da autorreflexão → gravidade (new_score_mechanism do PR-Agent: ≥9 alto, ≥7 médio). */
export function severityFromScore(score: number): Severity {
  if (score >= 9) return "high";
  if (score >= 7) return "medium";
  return "low";
}

export function sortFindings(findings: ReviewFinding[]): ReviewFinding[] {
  const rank = (s: Severity) => SEVERITIES.indexOf(s);
  return [...findings].sort((a, b) => rank(a.severity) - rank(b.severity) || (b.score ?? 0) - (a.score ?? 0));
}

// ---------------------------------------------------------------------------
// Parsing e validação da saída do modelo
// ---------------------------------------------------------------------------

const ISSUE_LIST_KEYS = ["key_issues_to_review", "key_issues", "findings", "issues"];

function issueList(data: Record<string, unknown>): unknown[] {
  const review = data.review && typeof data.review === "object" ? (data.review as Record<string, unknown>) : data;
  for (const key of ISSUE_LIST_KEYS) {
    if (Array.isArray(review[key])) return review[key] as unknown[];
    if (Array.isArray(data[key])) return data[key] as unknown[];
  }
  return [];
}

/** Um item de /review ou da fila de erros. null = inválido (sem arquivo ou sem explicação). */
export function normalizeIssue(raw: unknown, source: FindingSource): ReviewFinding | null {
  if (!raw || typeof raw !== "object") return null;
  const it = raw as Record<string, unknown>;
  const path = str(it.relevant_file ?? it.path ?? it.file, 300).replace(/^\.?\//, "");
  const explanation = str(it.issue_content ?? it.explanation ?? it.body ?? it.suggestion_content, 1500);
  if (!path || !explanation) return null;
  let title = str(it.issue_header ?? it.title ?? it.one_sentence_summary, 120) || "Ponto de atenção";
  if (title.toLowerCase() === "possible bug") title = "Possível problema";
  const startLine = lineNo(it.start_line ?? it.line);
  const endLine = startLine !== undefined ? Math.max(startLine, lineNo(it.end_line) ?? startLine) : undefined;
  const existingCode = code(it.existing_code);
  const improvedCode = existingCode !== undefined ? code(it.improved_code) ?? "" : undefined;
  const finding: ReviewFinding = {
    id: "",
    source,
    path,
    title,
    severity: normalizeSeverity(it.severity, `${title} ${explanation}`),
    label: str(it.label, 40) || undefined,
    explanation,
    startLine,
    endLine,
    existingCode,
    improvedCode: existingCode !== undefined ? improvedCode : undefined,
    errorRef: str(it.error_ref ?? it.error, 500) || undefined,
    applicable: false,
  };
  finding.id = fingerprintFinding(finding);
  return finding;
}

export interface ParsedReview {
  findings: ReviewFinding[];
  summary?: string;
  riskLevel?: "low" | "medium" | "high";
  securityConcerns?: string;
  dropped: number;
}

export function parseReviewOutput(raw: string, source: FindingSource = "review", maxFindings = 10): ParsedReview {
  const data = extractJsonObject(raw);
  const review = data.review && typeof data.review === "object" ? (data.review as Record<string, unknown>) : data;
  const list = issueList(data);
  const seen = new Set<string>();
  const findings: ReviewFinding[] = [];
  let dropped = 0;
  for (const item of list) {
    const f = normalizeIssue(item, source);
    if (!f || seen.has(f.id)) {
      dropped++;
      continue;
    }
    seen.add(f.id);
    findings.push(f);
  }
  const risk = str(review.risk_level, 10).toLowerCase();
  const security = str(review.security_concerns, 1200);
  return {
    findings: findings.slice(0, maxFindings),
    summary: str(review.summary ?? data.summary, 800) || undefined,
    riskLevel: risk === "low" || risk === "medium" || risk === "high" ? risk : undefined,
    securityConcerns: security && !/^(no|não|nao)\.?$/i.test(security) ? security : undefined,
    dropped: dropped + Math.max(0, findings.length - maxFindings),
  };
}

export interface CodeSuggestion {
  path: string;
  language?: string;
  existingCode: string;
  improvedCode: string;
  content: string;
  summary: string;
  label: string;
}

/** Saída de /improve (pr_code_suggestions_prompts do PR-Agent). */
export function parseCodeSuggestions(raw: string, max = 8): CodeSuggestion[] {
  const data = extractJsonObject(raw);
  const list = Array.isArray(data.code_suggestions) ? data.code_suggestions : Array.isArray(data.suggestions) ? data.suggestions : [];
  const out: CodeSuggestion[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const path = str(s.relevant_file ?? s.path, 300).replace(/^\.?\//, "");
    const existingCode = code(s.existing_code);
    const improvedCode = code(s.improved_code) ?? "";
    const content = str(s.suggestion_content ?? s.explanation, 1500);
    if (!path || !existingCode || !content) continue;
    out.push({
      path,
      language: str(s.language, 30) || undefined,
      existingCode,
      improvedCode,
      content,
      summary: str(s.one_sentence_summary ?? s.title, 120) || "Sugestão de melhoria",
      label: str(s.label, 40) || "enhancement",
    });
    if (out.length >= max) break;
  }
  return out;
}

export interface ReflectionFeedback {
  score: number;
  why: string;
  startLine?: number;
  endLine?: number;
}

/** Saída da autorreflexão (pr_code_suggestions_reflect_prompts do PR-Agent), na ordem das sugestões. */
export function parseReflection(raw: string): ReflectionFeedback[] {
  const data = extractJsonObject(raw);
  const list = Array.isArray(data.code_suggestions) ? data.code_suggestions : [];
  return list.map((item: unknown) => {
    const s = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const n = typeof s.suggestion_score === "number" ? s.suggestion_score : Number.parseInt(String(s.suggestion_score ?? ""), 10);
    return {
      score: Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : 0,
      why: str(s.why, 500),
      startLine: lineNo(s.relevant_lines_start),
      endLine: lineNo(s.relevant_lines_end),
    };
  });
}

export interface ReflectionOptions {
  /** Abaixo disto a sugestão cai (padrão 5). */
  threshold?: number;
  /** Nota quando a reflexão falha ou não traz a sugestão (score_on_reflection_failure do PR-Agent = 7). */
  scoreOnFailure?: number;
}

/**
 * Junta sugestões e notas da autorreflexão: descarta as fracas (nota abaixo do
 * limite, ou 0 = errada) e transforma o resto em findings ordenáveis.
 */
export function applyReflection(
  suggestions: CodeSuggestion[],
  feedback: ReflectionFeedback[] | null,
  opts: ReflectionOptions = {},
): { findings: ReviewFinding[]; dropped: number } {
  const threshold = Math.max(1, opts.threshold ?? 5);
  const onFailure = opts.scoreOnFailure ?? 7;
  const findings: ReviewFinding[] = [];
  let dropped = 0;
  suggestions.forEach((s, i) => {
    const fb = feedback?.[i];
    const score = fb ? fb.score : onFailure;
    if (score < threshold) {
      dropped++;
      return;
    }
    // Sugestão que não muda nada não vale um item na fila.
    if (s.existingCode.trim() === s.improvedCode.trim()) {
      dropped++;
      return;
    }
    const f: ReviewFinding = {
      id: "",
      source: "improve",
      path: s.path,
      title: s.summary,
      severity: severityFromScore(score),
      label: s.label,
      explanation: s.content,
      startLine: fb?.startLine,
      endLine: fb?.startLine !== undefined ? Math.max(fb.startLine, fb.endLine ?? fb.startLine) : undefined,
      existingCode: s.existingCode,
      improvedCode: s.improvedCode,
      score,
      why: fb?.why || undefined,
      applicable: false,
    };
    f.id = fingerprintFinding(f);
    findings.push(f);
  });
  return { findings, dropped };
}

export function parseDescribe(raw: string): DescribeResult {
  const data = extractJsonObject(raw);
  const type = (Array.isArray(data.type) ? data.type : typeof data.type === "string" ? [data.type] : [])
    .map((t: unknown) => str(t, 40))
    .filter(Boolean)
    .slice(0, 4);
  const files = (Array.isArray(data.pr_files) ? data.pr_files : Array.isArray(data.files) ? data.files : [])
    .map((f: unknown) => {
      const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
      return {
        path: str(o.filename ?? o.path, 300),
        summary: str(o.changes_summary ?? o.changes_title ?? o.summary, 400),
        label: str(o.label, 40) || undefined,
      };
    })
    .filter((f: { path: string; summary: string }) => f.path && f.summary)
    .slice(0, 20);
  const description = str(data.description, 3000);
  const title = str(data.title, 120);
  if (!description && !title) throw new ReviewParseError();
  return { title: title || "Resumo das mudanças", type, description, files };
}

export function parseAnswer(raw: string): string {
  try {
    const data = extractJsonObject(raw);
    const answer = str(data.answer ?? data.reply ?? data.response, 6000);
    if (answer) return answer;
  } catch {
    /* resposta em texto puro: aceita como está */
  }
  const text = (raw ?? "").trim();
  if (!text) throw new ReviewParseError();
  return text.slice(0, 6000);
}

/** Resposta de "Ajustar": a correção revista com o comentário do Dev. */
export function parseAdjustOutput(raw: string, base: ReviewFinding): { finding: ReviewFinding; reply: string } {
  const data = extractJsonObject(raw);
  const inner = data.finding && typeof data.finding === "object" ? data.finding : data;
  const normalized = normalizeIssue(
    { relevant_file: base.path, issue_header: base.title, severity: base.severity, issue_content: base.explanation, ...(inner as object) },
    base.source,
  );
  if (!normalized || normalized.existingCode === undefined) throw new ReviewParseError();
  return {
    finding: { ...normalized, path: base.path, source: base.source, errorRef: base.errorRef, score: base.score },
    reply: str(data.reply ?? data.explanation, 1500),
  };
}

// ---------------------------------------------------------------------------
// Código numerado (formato "__new hunk__" do PR-Agent) e diff de linhas
// ---------------------------------------------------------------------------

/** Linhas alteradas em `current` comparado a `previous` (LCS; índices 0-based). */
export function changedLines(previous: string, current: string, maxCells = 4_000_000): Set<number> {
  const a = previous.split("\n");
  const b = current.split("\n");
  const changed = new Set<number>();
  if (a.length * b.length > maxCells) {
    // Arquivo grande demais para LCS: marca por comparação direta.
    const before = new Set(a);
    b.forEach((line, i) => !before.has(line) && changed.add(i));
    return changed;
  }
  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (j < m) {
    if (i < n && a[i] === b[j]) {
      i++;
      j++;
    } else if (i < n && dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      changed.add(j);
      j++;
    }
  }
  return changed;
}

/**
 * Arquivo com números de linha, no formato que o PR-Agent usa para o modelo
 * citar linhas exatas. Linhas novas/alteradas desde a versão anterior levam "+".
 */
export function formatFileForReview(path: string, content: string, previous?: string | null, maxChars = 12000): string {
  const lines = content.split("\n");
  const marks = previous != null ? changedLines(previous, content) : null;
  const width = String(lines.length).length;
  const out: string[] = [];
  let used = 0;
  let cut = 0;
  for (let i = 0; i < lines.length; i++) {
    const mark = marks ? (marks.has(i) ? "+" : " ") : " ";
    const row = `${String(i + 1).padStart(width, " ")} ${mark} ${lines[i]}`;
    if (used + row.length > maxChars) {
      cut = lines.length - i;
      break;
    }
    used += row.length + 1;
    out.push(row);
  }
  const header = previous == null
    ? `## Arquivo: '${path}' (arquivo inteiro)`
    : marks && marks.size
      ? `## Arquivo: '${path}' (${marks.size} linha(s) nova(s)/alterada(s) marcadas com +)`
      : `## Arquivo: '${path}' (sem mudanças desde a versão anterior)`;
  return `${header}\n__new hunk__\n${out.join("\n")}${cut ? `\n... (${cut} linha(s) cortadas por tamanho)` : ""}`;
}

/** Diff legível de um finding, para o chat ("- " linha antiga, "+ " linha nova). */
export function findingDiff(f: Pick<ReviewFinding, "existingCode" | "improvedCode">): Array<{ type: "del" | "add"; text: string }> {
  if (f.existingCode === undefined) return [];
  const del = f.existingCode.split("\n").map((text) => ({ type: "del" as const, text }));
  const add = (f.improvedCode ?? "").length ? (f.improvedCode ?? "").split("\n").map((text) => ({ type: "add" as const, text })) : [];
  return [...del, ...add];
}

// ---------------------------------------------------------------------------
// Aplicação da correção (portado de code_replacement.py)
// ---------------------------------------------------------------------------

const leading = (line: string) => line.length - line.replace(/^[ \t]+/, "").length;

/** Desloca a indentação de um trecho (shift_code_indentation). */
export function shiftIndentation(snippet: string, delta: number): string {
  if (delta === 0) return snippet;
  return snippet
    .split("\n")
    .map((line) => {
      if (!line.trim()) return "";
      if (delta > 0) return " ".repeat(delta) + line;
      return line.slice(Math.min(-delta, leading(line)));
    })
    .join("\n");
}

/** Reindenta o trecho para a primeira linha casar com a linha que ele substitui (reindent_to_line). */
export function reindentToLine(snippet: string, originalFirstLine: string): string {
  const firstSuggested = snippet.split("\n").find((l) => l.trim()) ?? "";
  const origIndent = originalFirstLine.slice(0, leading(originalFirstLine));
  if (origIndent.startsWith("\t")) {
    const sugIndent = leading(firstSuggested);
    return snippet
      .split("\n")
      .map((l) => (l.trim() ? origIndent + l.slice(Math.min(sugIndent, leading(l))) : ""))
      .join("\n");
  }
  return shiftIndentation(snippet, leading(originalFirstLine) - leading(firstSuggested));
}

const norm = (l: string) => l.trim().replace(/\s+/g, " ");

/**
 * Localiza `snippet` no arquivo (1-based, inclusivo). Primeiro exato, depois
 * ignorando indentação/espaços. Com várias ocorrências, fica a mais perto da
 * linha sugerida pelo modelo.
 */
export function locateSnippet(content: string, snippet: string, hintLine?: number): { start: number; end: number } | null {
  const lines = content.split("\n");
  const target = snippet.split("\n");
  while (target.length && !target[0].trim()) target.shift();
  while (target.length && !target[target.length - 1].trim()) target.pop();
  if (!target.length) return null;
  if (target.some((l) => /^\s*(\.\.\.|…)\s*$/.test(l))) return null; // trecho com reticências não é aplicável

  const matchesAt = (cmp: (a: string, b: string) => boolean) => {
    const hits: number[] = [];
    for (let i = 0; i + target.length <= lines.length; i++) {
      let ok = true;
      for (let k = 0; k < target.length; k++) {
        if (!cmp(lines[i + k], target[k])) {
          ok = false;
          break;
        }
      }
      if (ok) hits.push(i);
    }
    return hits;
  };
  let hits = matchesAt((a, b) => a.replace(/\s+$/, "") === b.replace(/\s+$/, ""));
  if (!hits.length) hits = matchesAt((a, b) => norm(a) === norm(b));
  if (!hits.length) return null;
  const pick = hintLine
    ? hits.reduce((best, h) => (Math.abs(h + 1 - hintLine) < Math.abs(best + 1 - hintLine) ? h : best), hits[0])
    : hits[0];
  return { start: pick + 1, end: pick + target.length };
}

export type ApplyResult =
  | { ok: true; content: string; start: number; end: number }
  | { ok: false; reason: string };

/** Troca existing_code por improved_code (reindentado) no arquivo. */
export function applyReplacement(content: string, existingCode: string, improvedCode: string, hintLine?: number): ApplyResult {
  const loc = locateSnippet(content, existingCode, hintLine);
  if (!loc) return { ok: false, reason: "o trecho original não foi encontrado no arquivo atual" };
  const lines = content.split("\n");
  const original = lines[loc.start - 1];
  const replacement = improvedCode.trim() ? reindentToLine(improvedCode.replace(/^\n+/, "").replace(/\s+$/, ""), original).split("\n") : [];
  const next = [...lines.slice(0, loc.start - 1), ...replacement, ...lines.slice(loc.end)];
  return { ok: true, content: next.join("\n"), start: loc.start, end: loc.end };
}

/**
 * Confere um finding contra o arquivo real: o trecho existe? A troca deixa a
 * sintaxe pior do que estava? (equivalente ao python_replacement_compiles do PR-Agent.)
 */
export function validateFinding(f: ReviewFinding, fileContent: string | undefined): ReviewFinding {
  if (fileContent === undefined) return { ...f, applicable: false, problem: "arquivo não encontrado no projeto" };
  if (f.existingCode === undefined) return { ...f, applicable: false, problem: "sem correção automática; peça um ajuste ou corrija à mão" };
  const res = applyReplacement(fileContent, f.existingCode, f.improvedCode ?? "", f.startLine);
  if ("reason" in res) return { ...f, applicable: false, problem: res.reason };
  const before = lintGeneratedFile(f.path, fileContent);
  const after = lintGeneratedFile(f.path, res.content);
  const introduced = after.filter((p) => !before.includes(p));
  if (introduced.length) return { ...f, applicable: false, problem: `a troca introduz: ${introduced.join("; ")}` };
  return { ...f, applicable: true, problem: undefined, startLine: res.start, endLine: res.end };
}

// ---------------------------------------------------------------------------
// Contexto do projeto e do Dev
// ---------------------------------------------------------------------------

const REVIEWABLE_RE = /\.(?:tsx?|jsx?|mjs|cjs|css|html|vue|svelte|sql|json)$/i;
const SKIP_RE = /(^|\/)(?:node_modules|dist|build|coverage|\.next)\/|\.(?:test|spec)\.[jt]sx?$|(?:package-lock|pnpm-lock|tsconfig[^/]*|components\.json)\.json$|\.d\.ts$/i;

/** Arquivos para revisar quando a conversa ainda não tocou em nada: o "miolo" do app primeiro. */
export function pickReviewFiles(tree: string[], preferred: string[] = [], max = 8): string[] {
  const set = new Set(tree);
  const chosen: string[] = [];
  for (const p of preferred) if (set.has(p) && !chosen.includes(p) && REVIEWABLE_RE.test(p)) chosen.push(p);
  const score = (p: string) =>
    (/^src\/(App|main)\.[jt]sx?$/.test(p) ? 0 : /^src\/pages\//.test(p) ? 1 : /^src\/components\//.test(p) ? 2 : /^src\//.test(p) ? 3 : /^supabase\/functions\//.test(p) ? 4 : 6) +
    (/\/ui\//.test(p) ? 3 : 0);
  const rest = tree.filter((p) => REVIEWABLE_RE.test(p) && !SKIP_RE.test(p) && !chosen.includes(p) && !/\.json$/i.test(p));
  rest.sort((a, b) => score(a) - score(b) || a.localeCompare(b));
  for (const p of rest) {
    if (chosen.length >= max) break;
    chosen.push(p);
  }
  return chosen.slice(0, max);
}

/** Caminhos do projeto citados em mensagens de erro (stack trace, Vite, tsc). */
export function pathsFromErrors(errors: string[], tree: string[], max = 6): string[] {
  const found: string[] = [];
  const text = errors.join("\n");
  for (const p of tree) {
    if (found.length >= max) break;
    const base = p.split("/").pop() ?? p;
    if (text.includes(p) || (base.length > 4 && new RegExp(`(^|[\\s/("'\`])${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[:\\s)"'\`?]|$)`, "m").test(text))) {
      found.push(p);
    }
  }
  return found;
}

const SECRETISH = /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}|\bghp_[A-Za-z0-9]{20,}|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

export function sanitizeErrorText(text: string, max = 1500): string {
  return text.replace(SECRETISH, "[segredo removido]").replace(/\r/g, "").trim().slice(0, max);
}

/** Bloco de contexto do Dev que entra no prompt do agente e do revisor. */
export function formatDevContext(ctx: DevContext | null | undefined): string {
  if (!ctx || typeof ctx !== "object") return "";
  const parts: string[] = [];
  const errors = (Array.isArray(ctx.recentErrors) ? ctx.recentErrors : [])
    .filter((e): e is string => typeof e === "string" && !!e.trim())
    .slice(0, 5)
    .map((e) => `- ${sanitizeErrorText(e, 400).replace(/\n+/g, " ⏎ ")}`);
  if (errors.length) parts.push(`Erros recentes vistos no preview/build:\n${errors.join("\n")}`);
  if (typeof ctx.openedPath === "string" && ctx.openedPath.trim()) parts.push(`Arquivo aberto pelo Dev agora: ${ctx.openedPath.trim().slice(0, 300)}`);
  const files = (Array.isArray(ctx.conversationFiles) ? ctx.conversationFiles : []).filter((p) => typeof p === "string").slice(0, 20);
  if (files.length) parts.push(`Arquivos que você já tocou nesta conversa: ${files.join(", ")}`);
  const decisions = (Array.isArray(ctx.decisions) ? ctx.decisions : [])
    .filter((d) => d && typeof d === "object" && typeof d.title === "string")
    .slice(-12)
    .map((d) => {
      const verb = d.decision === "applied" ? "aplicou" : d.decision === "adjusted" ? "pediu ajuste em" : "pulou";
      const note = typeof d.comment === "string" && d.comment.trim() ? ` (comentário: "${d.comment.trim().slice(0, 200)}")` : "";
      return `- O Dev ${verb} "${d.title.slice(0, 120)}" em ${String(d.path).slice(0, 200)}${note}`;
    });
  if (decisions.length) {
    parts.push(`Decisões do Dev nas revisões desta conversa (respeite: não sugira de novo o que ele pulou, a menos que seja crítico):\n${decisions.join("\n")}`);
  }
  return parts.length ? `\n\nContexto do Dev:\n${parts.join("\n\n")}` : "";
}

/** Resumo em pt-BR de uma revisão, para o balão do chat. */
export function composeReviewReply(payload: ReviewPayload): string {
  const { findings, command } = payload;
  if (command === "describe" && payload.describe) {
    const d = payload.describe;
    const files = d.files.slice(0, 8).map((f) => `- \`${f.path}\`: ${f.summary}`).join("\n");
    return [`**${d.title}**${d.type.length ? ` (${d.type.join(", ")})` : ""}`, d.description, files].filter(Boolean).join("\n\n");
  }
  if (!findings.length) {
    const base = command === "improve"
      ? "Não achei melhorias que valham a pena: as sugestões que surgiram não passaram na minha autorrevisão."
      : command === "fix_errors"
        ? "Não consegui relacionar esses erros a um trecho do código. Me mande o erro completo (com o arquivo e a linha) que eu olho de novo."
        : "Revisei e não encontrei problemas relevantes. Bom trabalho!";
    return payload.summary ? `${payload.summary}\n\n${base}` : base;
  }
  const counts = SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${SEVERITY_LABEL[s].toLowerCase()}`)
    .join(", ");
  const what = command === "improve" ? "sugestão(ões) de melhoria" : command === "fix_errors" ? "correção(ões) para os erros" : "ponto(s) para corrigir";
  const lines = [
    payload.summary ?? "",
    `Encontrei ${findings.length} ${what} (${counts}).${payload.dropped ? ` Descartei ${payload.dropped} sugestão(ões) fraca(s) na autorrevisão.` : ""}`,
    payload.securityConcerns ? `Atenção à segurança: ${payload.securityConcerns}` : "",
    `Vamos resolver um de cada vez: começo pelo item 1/${findings.length}. Para cada um você escolhe Aplicar, Pular ou Ajustar, e pode me perguntar qualquer coisa no meio do caminho.`,
  ];
  return lines.filter(Boolean).join("\n\n");
}
