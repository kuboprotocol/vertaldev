// Núcleo do Vibe Code Agent: lógica pura (sem Deno, sem rede) para que o
// loop do agente seja testável com vitest e reutilizável no front-end.
//
//  - parseAgentTurn: lê a resposta JSON do modelo a cada volta do loop
//  - isSafePath / lintGeneratedFile: barreiras antes de gravar qualquer arquivo
//  - sanitizeMemories / looksLikeSecret: o que pode (e não pode) virar memória
//  - buildHistory / formatObservations: contexto da conversa e das leituras

import type { ExtractedMemory, MemoryKind, MemoryScope } from "./primeMemory.ts";

export type AgentActionType = "read_file" | "edit_file" | "message" | "ask_user";

export interface AgentAction {
  type: AgentActionType;
  path?: string;
  reason?: string;
  content?: string;
}

export interface AgentTurn {
  thought?: string;
  summary: string;
  actions: AgentAction[];
  requirements: unknown;
  memories: unknown;
  conversationSummary?: string;
  title?: string;
  /** true quando o modelo não precisa ler mais nada antes de entregar. */
  final: boolean;
}

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

const ACTION_TYPES: AgentActionType[] = ["read_file", "edit_file", "message", "ask_user"];

const asString = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);

/** Lê uma volta do agente. Tolera cercas ```json e texto antes/depois do objeto. */
export function parseAgentTurn(raw: string): AgentTurn {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("plan_parse_failed");
  text = text.slice(start, end + 1);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("plan_parse_failed");
  }

  const actions: AgentAction[] = (Array.isArray(data.actions) ? data.actions : [])
    .map((raw: unknown): AgentAction | null => {
      if (!raw || typeof raw !== "object") return null;
      const a = raw as Record<string, unknown>;
      if (!ACTION_TYPES.includes(a.type as AgentActionType)) return null;
      const action: AgentAction = { type: a.type as AgentActionType };
      const path = asString(a.path, 500);
      if (path) action.path = path;
      const reason = asString(a.reason, 500);
      if (reason) action.reason = reason;
      if (typeof a.content === "string") action.content = a.content;
      return action;
    })
    .filter((a): a is AgentAction => a !== null)
    .slice(0, 30);

  const needsMoreReading = actions.some((a) => a.type === "read_file");
  return {
    thought: asString(data.thought, 400),
    summary: asString(data.summary, 300) ?? "",
    actions,
    requirements: data.requirements,
    memories: data.memories,
    conversationSummary: asString(data.conversation_summary, 1500),
    title: asString(data.title, 80),
    final: typeof data.final === "boolean" ? data.final : !needsMoreReading,
  };
}

// ---------------------------------------------------------------------------
// Segurança de arquivos
// ---------------------------------------------------------------------------

const BLOCKED_SEGMENTS = new Set([".git", "node_modules", ".github/workflows"]);
const BLOCKED_NAME_RE = /(^|\/)(\.env(\..*)?|id_rsa|id_ed25519|.*\.pem|.*\.key|\.npmrc|\.netrc)$/i;

/** Caminho relativo, sem `..`, sem segredos nem pastas internas. */
export function isSafePath(path: string): boolean {
  if (!path || path.length > 300) return false;
  if (path.startsWith("/") || path.startsWith("\\") || /^[a-zA-Z]:/.test(path)) return false;
  if (path.includes("\0") || path.includes("\\")) return false;
  const parts = path.split("/");
  if (parts.some((p) => p === ".." || p === "." || p === "")) return false;
  if (parts.some((p) => BLOCKED_SEGMENTS.has(p))) return false;
  if (BLOCKED_SEGMENTS.has(parts.slice(0, 2).join("/"))) return false;
  if (BLOCKED_NAME_RE.test(path)) return false;
  return true;
}

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/,
  /\bwhsec_[A-Za-z0-9]{16,}/,
  /\bghp_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /\bsk-[A-Za-z0-9]{24,}/,
  /(?:api[_-]?key|secret|token|password|senha)["']?\s*[:=]\s*["'][A-Za-z0-9_\-./+=]{20,}["']/i,
];

export function looksLikeSecret(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

// ---------------------------------------------------------------------------
// Auto-revisão do código gerado (vira o "auto-reparo" do loop)
// ---------------------------------------------------------------------------

const PLACEHOLDER_RES: RegExp[] = [
  /\/\/\s*\.\.\.\s*$/m,
  /\/\*\s*\.\.\.\s*\*\//,
  /\.\.\.\s*(?:rest of|resto d|existing|remaining|c[óo]digo existente|o restante)/i,
  /\/\/\s*(?:rest of|resto d|existing code|c[óo]digo existente|o restante)/i,
  /\/\/\s*TODO\b/,
  /\bTODO:/,
];

/** Delimitadores desbalanceados (ignora strings e comentários). */
function delimiterProblem(code: string): string | null {
  const stack: string[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    const next = code[i + 1];
    if (c === "/" && next === "/") {
      const nl = code.indexOf("\n", i);
      i = nl === -1 ? code.length : nl + 1;
      continue;
    }
    if (c === "/" && next === "*") {
      const close = code.indexOf("*/", i + 2);
      i = close === -1 ? code.length : close + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < code.length && code[j] !== c) {
        if (code[j] === "\\") j++;
        else if (c !== "`" && code[j] === "\n") break;
        j++;
      }
      i = j + 1;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") stack.push(c);
    else if (c === ")" || c === "]" || c === "}") {
      if (stack.pop() !== pairs[c]) return `delimitador "${c}" sem par`;
    }
    i++;
  }
  return stack.length ? `${stack.length} delimitador(es) aberto(s) sem fechar` : null;
}

const CODE_EXT_RE = /\.(?:[cm]?[jt]sx?)$/i;

/** Problemas que tornam um arquivo gerado inaceitável. Lista vazia = ok. */
export function lintGeneratedFile(path: string, content: string): string[] {
  const problems: string[] = [];
  if (!isSafePath(path)) problems.push(`caminho não permitido: ${path}`);
  if (!content.trim()) problems.push("conteúdo vazio");
  if (PLACEHOLDER_RES.some((re) => re.test(content))) {
    problems.push("contém placeholder/TODO ou trecho omitido; entregue o arquivo COMPLETO");
  }
  if (looksLikeSecret(content)) {
    problems.push("parece conter um segredo escrito no código; use variável de ambiente");
  }
  if (/\.json$/i.test(path) && content.trim()) {
    try {
      JSON.parse(content);
    } catch {
      problems.push("JSON inválido");
    }
  }
  if (CODE_EXT_RE.test(path) && content.trim()) {
    const issue = delimiterProblem(content);
    if (issue) problems.push(`sintaxe: ${issue}`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Memória
// ---------------------------------------------------------------------------

const MEMORY_KINDS: MemoryKind[] = [
  "preference", "constraint", "architecture", "design", "integration", "decision", "note",
];

/** Memórias propostas pelo modelo: validadas, sem segredos, no máximo 3. */
export function sanitizeMemories(raw: unknown, hasProject: boolean): ExtractedMemory[] {
  if (!Array.isArray(raw)) return [];
  const out: ExtractedMemory[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const content = typeof m.content === "string" ? m.content.replace(/\s+/g, " ").trim().slice(0, 300) : "";
    if (content.length < 8 || looksLikeSecret(content)) continue;
    const kind = MEMORY_KINDS.includes(m.kind as MemoryKind) ? (m.kind as MemoryKind) : "note";
    const scope: MemoryScope = m.scope === "project" && hasProject ? "project" : "user";
    const key = content.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ scope, kind, content });
    if (out.length === 3) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------------

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  steps?: Array<{ kind?: string; title?: string; path?: string }>;
}

/** Histórico recente da conversa, compacto, para o modelo lembrar o que já foi feito. */
export function buildHistory(messages: StoredMessage[], limit = 12): ChatMsg[] {
  return messages.slice(-limit).flatMap((m): ChatMsg[] => {
    if (m.role === "user") {
      return m.content.trim() ? [{ role: "user", content: m.content.slice(0, 1500) }] : [];
    }
    const steps = m.steps ?? [];
    const plan = steps.find((s) => s.kind === "plan")?.title;
    const files = [...new Set(steps.filter((s) => (s.kind === "commit" || s.kind === "diff") && s.path).map((s) => s.path!))];
    const asked = steps.find((s) => s.kind === "question")?.title;
    const parts = [m.content.trim(), plan ? `Plano: ${plan}` : "", files.length ? `Arquivos: ${files.slice(0, 12).join(", ")}` : "", asked ? `Pergunta feita: ${asked}` : ""]
      .filter(Boolean);
    return parts.length ? [{ role: "assistant", content: parts.join("\n").slice(0, 900) }] : [];
  });
}

const IGNORED_TREE_RE = /(^|\/)(node_modules|dist|build|coverage|\.next|\.git|\.cache)\//;
const LOCKFILE_RE = /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|\.png|\.jpe?g|\.gif|\.webp|\.ico|\.woff2?|\.mp[34]|\.zip|\.pdf)$/i;

/** Lista enxuta de arquivos para o modelo saber onde mexer. */
export function filterRepoTree(paths: string[], max = 150): string[] {
  return paths.filter((p) => !IGNORED_TREE_RE.test(p) && !LOCKFILE_RE.test(p)).slice(0, max);
}

export interface Observation {
  path: string;
  found: boolean;
  content: string;
}

/** Resultado das leituras, devolvido ao modelo na volta seguinte. */
export function formatObservations(files: Observation[], maxEach = 12000, maxTotal = 36000): string {
  let used = 0;
  const blocks: string[] = [];
  for (const f of files) {
    if (!f.found) {
      blocks.push(`### ${f.path}\n(arquivo não existe — crie com edit_file se for necessário)`);
      continue;
    }
    const room = Math.max(0, Math.min(maxEach, maxTotal - used));
    const body = f.content.slice(0, room);
    used += body.length;
    const cut = f.content.length > body.length ? `\n... (cortado: ${f.content.length - body.length} caracteres)` : "";
    blocks.push(`### ${f.path}\n${body}${cut}`);
  }
  return `Resultado das leituras:\n\n${blocks.join("\n\n")}\n\nContinue: se já tem o que precisa, entregue as edições com "final": true.`;
}

export function titleFromPrompt(prompt: string): string {
  const first = prompt.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? "";
  const clean = first.replace(/^[-•*#>\s]+/, "");
  if (!clean) return "Nova conversa";
  return clean.length > 60 ? `${clean.slice(0, 57).trimEnd()}...` : clean;
}
