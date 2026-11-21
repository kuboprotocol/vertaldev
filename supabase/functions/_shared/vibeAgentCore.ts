// Núcleo do Vibe Code Agent: lógica pura (sem Deno, sem rede) para que o
// loop do agente seja testável com vitest e reutilizável no front-end.
//
//  - parseAgentTurn: lê a resposta JSON do modelo a cada volta do loop
//  - isSafePath / lintGeneratedFile: barreiras antes de gravar qualquer arquivo
//  - sanitizeMemories / looksLikeSecret: o que pode (e não pode) virar memória
//  - buildHistory / formatObservations: contexto da conversa e das leituras

import type { ExtractedMemory, MemoryKind, MemoryScope } from "./primeMemory.ts";
import { type JsonRepair, repairAgentJson } from "./chatOrchestrator.ts";

/** ask_chat: pergunta de pesquisa/imagem ao Vertal Chat (ponte Vibe → Chat, profundidade 1). */
/** use_browser (fase 4 do Navigator): tarefa para o navegador na nuvem, executada no chat do usuário. */
export type AgentActionType = "read_file" | "edit_file" | "message" | "ask_user" | "ask_chat" | "use_browser";

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
  /** Como o JSON foi lido: ok, consertado, cortado (fechado à força) ou sem conserto. */
  parse?: JsonRepair | "failed";
  /** Nada aproveitável (JSON ilegível ou cortado sem nenhuma ação): pedir de novo ao modelo. */
  retry?: boolean;
}

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

const ACTION_TYPES: AgentActionType[] = ["read_file", "edit_file", "message", "ask_user", "ask_chat", "use_browser"];

const asString = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);

/**
 * O último item do array "actions" ficou aberto no texto cru? (saída cortada
 * no limite de tokens). Respeita strings e escapes.
 */
function lastActionWasCut(raw: string): boolean {
  const key = /"actions"\s*:\s*\[/.exec(raw);
  if (!key) return false;
  let depth = 0; // profundidade dentro do array de ações
  let inString = false;
  let escaped = false;
  let lastClosed = true;
  for (let i = key.index + key[0].length; i < raw.length; i++) {
    const c = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") {
      if (depth === 0) lastClosed = false;
      depth++;
    } else if (c === "}" || c === "]") {
      if (depth === 0) return false; // o array fechou: nada cortado
      depth--;
      if (depth === 0) lastClosed = true;
    }
  }
  return !lastClosed;
}

const EMPTY_TURN = (): AgentTurn => ({
  summary: "",
  actions: [],
  requirements: undefined,
  memories: undefined,
  final: false,
  parse: "failed",
  retry: true,
});

/**
 * Lê uma volta do agente. Tolera cercas ```json, texto antes/depois do objeto,
 * vírgula sobrando e saída cortada (via repairAgentJson). Nunca lança: quando
 * nada se aproveita devolve `retry: true` para o loop pedir de novo.
 */
export function parseAgentTurn(raw: string): AgentTurn {
  const fixed = repairAgentJson(raw ?? "");
  if (!fixed) return EMPTY_TURN();
  const data = fixed.value;

  // Saída cortada: um edit_file aberto no fim tem conteúdo pela metade. Nunca gravar.
  let rawActions: unknown[] = Array.isArray(data.actions) ? [...data.actions] : [];
  let droppedCutEdit = false;
  if (fixed.repair === "truncated" && rawActions.length && lastActionWasCut(raw)) {
    const last = rawActions[rawActions.length - 1] as Record<string, unknown> | null;
    if (last && typeof last === "object" && last.type === "edit_file") {
      rawActions = rawActions.slice(0, -1);
      droppedCutEdit = true;
    }
  }

  const actions: AgentAction[] = rawActions
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

  // ask_chat também espera resposta (do Vertal Chat) antes de entregar.
  const needsMoreReading = actions.some((a) => a.type === "read_file" || a.type === "ask_chat");
  return {
    thought: asString(data.thought, 400),
    summary: asString(data.summary, 300) ?? "",
    actions,
    requirements: data.requirements,
    memories: data.memories,
    conversationSummary: asString(data.conversation_summary, 1500),
    title: asString(data.title, 80),
    // Cortado e sem o edit_file final: não dá para tratar como entrega completa.
    final: droppedCutEdit ? false : typeof data.final === "boolean" ? data.final : !needsMoreReading,
    parse: fixed.repair,
    retry: fixed.repair === "truncated" && actions.length === 0,
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

// ---------------------------------------------------------------------------
// Resposta conversacional
// ---------------------------------------------------------------------------

export interface ReplyInput {
  summary?: string;
  notes: string[];
  questions: string[];
  files: Array<{ path: string; reason?: string }>;
  mode: "preview" | "apply";
  rejected: string[];
  pendingRequirements: PendingForReply[];
}

export interface PendingForReply {
  label: string;
  secrets: string[];
  kind?: string;
  connectPath?: string;
  keyUrl?: string;
  siteUrl?: string;
  linkSource?: "catalog" | "agent";
}

/** Uma instrução por item que falta: conector → Conectar; API → conta, chave, campo, cofre. */
export function requirementInstruction(r: PendingForReply): string {
  const check = r.linkSource === "agent" ? " (link sugerido por mim; confira se é o site oficial)" : "";
  if (r.connectPath) {
    const key = r.keyUrl ? ` Se ele pedir uma chave, você gera em ${r.keyUrl}${check}.` : "";
    return `- ${r.label}: toque em "Conectar" logo abaixo para ligar o conector.${key}`;
  }
  const keys = r.secrets.map((s) => `\`${s}\``).join(", ");
  const signup = r.siteUrl ? `crie sua conta em ${r.siteUrl}, ` : "";
  const where = r.keyUrl ? `gere a chave em ${r.keyUrl}${check}` : "gere a chave no painel do serviço";
  return keys
    ? `- ${r.label}: ${signup}${where} e cole em ${keys} no campo logo abaixo. Eu guardo no Cofre de segredos para você.`
    : `- ${r.label}: ${signup}${where} e me diga quando estiver pronto.`;
}

const MAX_REPLY = 4000;

function listPaths(paths: string[], max = 6): string {
  const shown = paths.slice(0, max).map((p) => `\`${p}\``);
  const rest = paths.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} e mais ${rest}` : shown.join(", ");
}

/**
 * Texto que o agente "fala" no chat ao fim de um ciclo: o que entendeu, o que
 * fez, o que ficou de fora, o que falta conectar e o que precisa perguntar.
 * É o que fica guardado na conversa (vibe_messages.content) e reaparece no histórico.
 */
export function composeAgentReply(input: ReplyInput): string {
  const parts: string[] = [];
  const summary = input.summary?.trim();
  if (summary) parts.push(summary);

  const seen = new Set(summary ? [summary.toLowerCase()] : []);
  for (const raw of input.notes) {
    const note = raw.trim();
    if (!note || seen.has(note.toLowerCase())) continue;
    seen.add(note.toLowerCase());
    parts.push(note);
  }

  const paths = [...new Set(input.files.map((f) => f.path))];
  if (paths.length) {
    parts.push(
      input.mode === "preview"
        ? `Preparei ${paths.length} arquivo(s) para você revisar: ${listPaths(paths)}. Toque numa caixinha de código para abrir o arquivo; quando estiver bom, aplique as alterações.`
        : `Commitei ${paths.length} arquivo(s): ${listPaths(paths)}. Toque numa caixinha de código para ver onde ficou.`,
    );
  }

  if (input.rejected.length) {
    parts.push(
      `${input.rejected.length} arquivo(s) ficaram de fora porque não passaram na auto-revisão. Peça de novo com mais detalhes se precisar deles.`,
    );
  }

  if (input.pendingRequirements.length) {
    const n = input.pendingRequirements.length;
    parts.push(
      `Para a aplicação funcionar, ${n === 1 ? "falta só uma coisa" : `faltam ${n} coisas`}:\n` +
        input.pendingRequirements.map(requirementInstruction).join("\n"),
    );
  }

  const questions = input.questions.map((q) => q.trim()).filter(Boolean);
  if (questions.length === 1) parts.push(`Antes de seguir, preciso saber: ${questions[0]}`);
  else if (questions.length > 1) parts.push(`Antes de seguir, preciso saber:\n${questions.map((q) => `- ${q}`).join("\n")}`);

  const text = parts.length ? parts.join("\n\n") : "Pronto. Me diga o próximo passo.";
  return text.length > MAX_REPLY ? `${text.slice(0, MAX_REPLY - 1).trimEnd()}…` : text;
}

// ---------------------------------------------------------------------------
// Origem do pedido (ponte Chat → Vibe Code)
// ---------------------------------------------------------------------------

/** Quem chamou o agente. "vertal_chat" = delegado pelo Vertal Chat (profundidade 1). */
export const VIBE_ORIGINS = ["vibe_code", "vertal_chat"] as const;
export type VibeOrigin = (typeof VIBE_ORIGINS)[number];

/**
 * Lê `origin` do corpo e aplica o limite de delegação: um pedido que já veio
 * do Vertal Chat não pode delegar de novo (nem pedir outra delegação, nem
 * gravar/reverter direto — o chat só usa preview e perguntas).
 */
export function checkVibeOrigin(body: Record<string, unknown>): { ok: true; origin: VibeOrigin } | { ok: false; error: string } {
  const raw = body.origin;
  if (raw === undefined || raw === null || raw === "") return { ok: true, origin: "vibe_code" };
  if (typeof raw !== "string" || !(VIBE_ORIGINS as readonly string[]).includes(raw)) return { ok: false, error: "invalid_origin" };
  const origin = raw as VibeOrigin;
  if (origin !== "vertal_chat") return { ok: true, origin };
  const depth = body.delegationDepth;
  if (body.delegate !== undefined || (depth !== undefined && depth !== 1)) return { ok: false, error: "delegation_depth_exceeded" };
  if (body.mode === "apply" || body.apply !== undefined || body.revertSha !== undefined || body.revertCheckpointId !== undefined || body.plan !== undefined) {
    return { ok: false, error: "delegation_preview_only" };
  }
  return { ok: true, origin };
}

// ---------------------------------------------------------------------------
// Ponte Vibe Code → Vertal Chat (ação ask_chat)
// ---------------------------------------------------------------------------

/** Perguntas ao Vertal Chat por pedido (cada uma custa rodadas do chat). */
export const MAX_CHAT_DELEGATIONS = 1;

/** Linha da ação no protocolo do agente (vai dentro do array "actions" do SYSTEM). */
export const ASK_CHAT_ACTION_LINE =
  '{"type":"ask_chat","reason":"pergunta objetiva de pesquisa (documentação, versão de lib, API, preço) ou pedido de imagem ao Vertal Chat"}';

/** Regra do prompt: quando e como usar ask_chat. */
export const ASK_CHAT_RULE =
  `Você não acessa a internet diretamente. Para pesquisar (documentação, versões, endpoints de API) ou gerar uma imagem, use UMA ação ask_chat (no máximo ${MAX_CHAT_DELEGATIONS} por pedido) com "final": false; o Vertal Chat responde e você continua na volta seguinte. Não use ask_chat para o que está no código (use read_file).`;

/**
 * Pedido vindo do Vertal Chat (origin "vertal_chat") não pode perguntar ao chat
 * de volta (profundidade 1). Também respeita o limite por pedido.
 */
export function canAskChat(origin: VibeOrigin, used: number): { ok: true } | { ok: false; reason: string } {
  if (origin === "vertal_chat") return { ok: false, reason: "delegation_depth_exceeded" };
  if (used >= MAX_CHAT_DELEGATIONS) return { ok: false, reason: "chat_delegation_limit" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ponte Vibe Code → Vertal Navigator (ação use_browser, fase 4)
// ---------------------------------------------------------------------------

/** Tarefas de navegador por pedido (cada uma abre/usa o navegador na nuvem, cobrado por minuto). */
export const MAX_BROWSER_REQUESTS = 1;

export const USE_BROWSER_ACTION_LINE =
  '{"type":"use_browser","reason":"tarefa objetiva para o navegador na nuvem (ex.: entrar no painel da Cloudflare e configurar o DNS de meu-app.com)","path":"https://url-inicial (opcional)"}';

export const USE_BROWSER_RULE =
  `Quando a tarefa exigir operar um site/painel (Cloudflare, Supabase, Vercel, Hostinger, registro de domínio, ver um erro no painel), use UMA ação use_browser (no máximo ${MAX_BROWSER_REQUESTS} por pedido) com "final": true e diga em "summary" que vai abrir o navegador: ele roda no chat, ao vivo, com login do cofre, 2FA e aprovação do usuário para qualquer pagamento. Não use para pesquisa (use ask_chat) nem para o que está no código.`;

export interface BrowserRequest {
  task: string;
  url?: string;
}

/** Lê a ação use_browser: tarefa (3–2000 caracteres) e URL inicial só https/http públicas (a guarda SSRF final é no Worker). */
export function parseBrowserRequest(action: AgentAction): BrowserRequest | null {
  if (action.type !== "use_browser") return null;
  const task = (action.reason ?? action.content ?? "").replace(/\s+/g, " ").trim().slice(0, 2_000);
  if (task.length < 3) return null;
  const rawUrl = (action.path ?? "").trim();
  const url = /^https?:\/\/[^\s<>"']{3,500}$/i.test(rawUrl) ? rawUrl : undefined;
  return url ? { task, url } : { task };
}

/** Pedido do Vertal Chat não abre navegador pelo Vibe Code (o chat já tem o Navigator); respeita o limite. */
export function canUseBrowser(origin: VibeOrigin, used: number): { ok: true } | { ok: false; reason: string } {
  if (origin === "vertal_chat") return { ok: false, reason: "delegation_depth_exceeded" };
  if (used >= MAX_BROWSER_REQUESTS) return { ok: false, reason: "browser_request_limit" };
  return { ok: true };
}
