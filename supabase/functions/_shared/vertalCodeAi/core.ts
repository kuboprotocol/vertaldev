// VERTAL Code AI · núcleo do agente (lógica pura: sem Deno, sem rede).
//
//   Planejar ─► Construir ─► Verificar ─► Auto-corrigir (até N rodadas) ─► Revisão do dev
//
//  - Modo Planejar: devolve um plano em passos (nada é gravado).
//  - Modo Construir: o modelo lê arquivos e propõe edições (arquivo inteiro ou busca/troca).
//  - Verificar: checagens estáticas + checador de sintaxe injetado (TypeScript na edge function).
//  - Auto-corrigir: os problemas voltam ao modelo, que corrige antes de entregar.
//  - Nada é gravado no projeto aqui: o resultado são diffs por arquivo para o dev aprovar.
//
// 100% aditivo: só LÊ utilitários existentes (repairAgentJson, isSafePath, lintGeneratedFile)
// sem alterar nada do Vibe Code.

import { repairAgentJson } from "../chatOrchestrator.ts";
import { isSafePath, lintGeneratedFile, looksLikeSecret } from "../vibeAgentCore.ts";
import type { VcaChatMessage, VcaEffort, VcaMode } from "./router.ts";

export const VCA_LIMITS = {
  maxTurns: 6,
  maxFixRounds: 2,
  maxReadsPerTurn: 8,
  maxEditsPerTurn: 20,
  maxFileChars: 60_000,
  maxObservationChars: 40_000,
  maxIndexFiles: 2_000,
  maxPromptChars: 12_000,
} as const;

// ---------------------------------------------------------------------------
// Ações do modelo
// ---------------------------------------------------------------------------

export type VcaAction =
  | { type: "read_file"; path: string }
  | { type: "write_file"; path: string; content: string }
  | { type: "patch_file"; path: string; search: string; replace: string }
  | { type: "delete_file"; path: string };

export interface VcaTurn {
  summary: string;
  actions: VcaAction[];
  final: boolean;
  /** Plano (modo Planejar). */
  plan?: VcaPlan;
  /** Saída ilegível: pedir de novo. */
  retry: boolean;
}

export interface VcaPlanStep {
  title: string;
  detail?: string;
  files: string[];
}
export interface VcaPlan {
  goal: string;
  steps: VcaPlanStep[];
  risks: string[];
  questions: string[];
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

function parsePlan(v: unknown): VcaPlan | undefined {
  if (!v || typeof v !== "object") return undefined;
  const p = v as Record<string, unknown>;
  const steps = (Array.isArray(p.steps) ? p.steps : [])
    .map((s): VcaPlanStep | null => {
      if (typeof s === "string") return { title: s.slice(0, 300), files: [] };
      if (!s || typeof s !== "object") return null;
      const o = s as Record<string, unknown>;
      const title = str(o.title, 300).trim();
      if (!title) return null;
      const files = (Array.isArray(o.files) ? o.files : []).filter((f): f is string => typeof f === "string").slice(0, 20);
      return { title, detail: str(o.detail, 1200) || undefined, files };
    })
    .filter((s): s is VcaPlanStep => !!s)
    .slice(0, 20);
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === "string").map((i) => i.slice(0, 400)).slice(0, 10) : []);
  if (!steps.length) return undefined;
  return { goal: str(p.goal, 600), steps, risks: list(p.risks), questions: list(p.questions) };
}

/** Lê a resposta do modelo. Nunca lança. */
export function parseVcaTurn(raw: string): VcaTurn {
  const fixed = repairAgentJson(raw ?? "");
  if (!fixed) return { summary: "", actions: [], final: false, retry: true };
  const d = fixed.value;
  const actions: VcaAction[] = [];
  let droppedCut = false;
  const rawActions = Array.isArray(d.actions) ? d.actions : [];
  rawActions.forEach((a: unknown, i: number) => {
    if (!a || typeof a !== "object") return;
    const o = a as Record<string, unknown>;
    const path = str(o.path, 300).trim();
    if (!path) return;
    // Saída cortada: a última edição pode estar pela metade. Nunca aproveitar.
    const isLast = i === rawActions.length - 1;
    if (fixed.repair === "truncated" && isLast && o.type !== "read_file") {
      droppedCut = true;
      return;
    }
    switch (o.type) {
      case "read_file":
        actions.push({ type: "read_file", path });
        break;
      case "write_file":
      case "edit_file":
        if (typeof o.content === "string") actions.push({ type: "write_file", path, content: o.content });
        break;
      case "patch_file":
        if (typeof o.search === "string" && typeof o.replace === "string" && o.search.length > 0) {
          actions.push({ type: "patch_file", path, search: o.search, replace: o.replace });
        }
        break;
      case "delete_file":
        actions.push({ type: "delete_file", path });
        break;
    }
  });
  const plan = parsePlan(d.plan);
  const hasReads = actions.some((a) => a.type === "read_file");
  return {
    summary: str(d.summary, 600),
    actions: actions.slice(0, VCA_LIMITS.maxEditsPerTurn + VCA_LIMITS.maxReadsPerTurn),
    final: droppedCut ? false : typeof d.final === "boolean" ? d.final && !hasReads : !hasReads,
    plan,
    retry: actions.length === 0 && !plan && !str(d.summary, 10),
  };
}

// ---------------------------------------------------------------------------
// Índice do repositório (contexto do projeto inteiro sem mandar tudo ao modelo)
// ---------------------------------------------------------------------------

export interface IndexedFile {
  path: string;
  size: number;
  symbols: string[];
  imports: string[];
}

const EXPORT_RE = /export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

export function indexFile(path: string, content: string): IndexedFile {
  const symbols = new Set<string>();
  const imports = new Set<string>();
  if (/\.(?:[cm]?[jt]sx?)$/i.test(path)) {
    for (const m of content.matchAll(EXPORT_RE)) symbols.add(m[1]);
    for (const m of content.matchAll(IMPORT_RE)) imports.add(m[1] ?? m[2]);
  }
  return { path, size: content.length, symbols: [...symbols].slice(0, 40), imports: [...imports].slice(0, 40) };
}

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);

function splitIdent(s: string): string[] {
  return tokenize(s.replace(/([a-z0-9])([A-Z])/g, "$1 $2"));
}

/** Resolve um import relativo para um caminho do índice (ou null). */
export function resolveImport(from: string, spec: string, paths: Set<string>): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) {
    const dir = from.split("/").slice(0, -1);
    for (const part of spec.split("/")) {
      if (part === "." || part === "") continue;
      if (part === "..") dir.pop();
      else dir.push(part);
    }
    base = dir.join("/");
  } else return null;
  const candidates = [base, ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".css"].map((e) => base + e), ...["/index.ts", "/index.tsx", "/index.js"].map((e) => base + e)];
  return candidates.find((c) => paths.has(c)) ?? null;
}

/**
 * Arquivos mais relevantes para o pedido: nome/caminho + símbolos exportados,
 * mais os vizinhos de import dos melhores (contexto de várias pastas).
 */
export function rankRelevantFiles(index: IndexedFile[], prompt: string, k = 8): string[] {
  const q = new Set(tokenize(prompt));
  if (!q.size) return [];
  const paths = new Set(index.map((f) => f.path));
  const scored = index
    .map((f) => {
      let score = 0;
      for (const t of splitIdent(f.path)) if (q.has(t)) score += 3;
      for (const s of f.symbols) for (const t of splitIdent(s)) if (q.has(t)) score += 2;
      if (/(^|\/)(node_modules|dist|build)\//.test(f.path)) score = 0;
      if (/\.(test|spec)\./.test(f.path)) score *= 0.5;
      return { path: f.path, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const out: string[] = [];
  for (const { path } of scored) {
    if (out.length >= k) break;
    if (!out.includes(path)) out.push(path);
    const f = index.find((i) => i.path === path);
    for (const spec of f?.imports ?? []) {
      if (out.length >= k) break;
      const r = resolveImport(path, spec, paths);
      if (r && !out.includes(r)) out.push(r);
    }
  }
  return out;
}

/** Mapa compacto do repositório para o prompt (caminho + símbolos). */
export function repoMap(index: IndexedFile[], maxChars = 12_000): string {
  const lines: string[] = [];
  let total = 0;
  for (const f of [...index].sort((a, b) => a.path.localeCompare(b.path))) {
    const line = f.symbols.length ? `${f.path} :: ${f.symbols.slice(0, 8).join(", ")}` : f.path;
    if (total + line.length > maxChars) {
      lines.push(`… (+${index.length - lines.length} arquivos)`);
      break;
    }
    lines.push(line);
    total += line.length + 1;
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Edições, diffs e verificação
// ---------------------------------------------------------------------------

export interface FileChange {
  path: string;
  before: string; // "" = arquivo novo
  after: string | null; // null = apagar
}

export interface EditResult {
  changes: Map<string, FileChange>;
  errors: string[];
}

/**
 * Aplica as ações sobre o estado atual (em memória). Busca/troca exige que o
 * trecho exista exatamente uma vez — senão vira erro para o modelo corrigir.
 */
export function applyActions(
  actions: VcaAction[],
  original: (path: string) => string | undefined,
  pending: Map<string, FileChange> = new Map(),
): EditResult {
  const changes = new Map(pending);
  const errors: string[] = [];
  const current = (path: string) => {
    const c = changes.get(path);
    if (c) return c.after ?? undefined;
    return original(path);
  };
  for (const a of actions) {
    if (a.type === "read_file") continue;
    if (!isSafePath(a.path)) {
      errors.push(`${a.path}: caminho não permitido`);
      continue;
    }
    const before = changes.get(a.path)?.before ?? original(a.path) ?? "";
    if (a.type === "write_file") {
      if (a.content.length > VCA_LIMITS.maxFileChars) {
        errors.push(`${a.path}: arquivo grande demais (${a.content.length} caracteres)`);
        continue;
      }
      changes.set(a.path, { path: a.path, before, after: a.content });
    } else if (a.type === "delete_file") {
      if (current(a.path) === undefined) {
        errors.push(`${a.path}: não existe para apagar`);
        continue;
      }
      changes.set(a.path, { path: a.path, before, after: null });
    } else {
      const cur = current(a.path);
      if (cur === undefined) {
        errors.push(`${a.path}: patch_file em arquivo que não existe (use write_file)`);
        continue;
      }
      const first = cur.indexOf(a.search);
      if (first === -1) {
        errors.push(`${a.path}: o trecho "search" não foi encontrado exatamente; leia o arquivo e copie o trecho igual`);
        continue;
      }
      if (cur.indexOf(a.search, first + 1) !== -1) {
        errors.push(`${a.path}: o trecho "search" aparece mais de uma vez; inclua mais linhas para ficar único`);
        continue;
      }
      changes.set(a.path, { path: a.path, before, after: cur.slice(0, first) + a.replace + cur.slice(first + a.search.length) });
    }
  }
  return { changes, errors };
}

/** Diff unificado simples (LCS por linhas), suficiente para revisão no celular. */
export function unifiedDiff(path: string, before: string, after: string | null, context = 3): string {
  const a = before ? before.split("\n") : [];
  const b = after === null ? [] : after.split("\n");
  const n = a.length;
  const m = b.length;
  if (n * m > 4_000_000) {
    return `--- a/${path}\n+++ b/${path}\n@@ arquivo grande: ${n} → ${m} linhas (diff resumido) @@`;
  }
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: Array<{ t: " " | "-" | "+"; s: string; ai: number; bi: number }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) ops.push({ t: " ", s: a[i], ai: i++, bi: j++ });
    else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ t: "-", s: a[i], ai: i++, bi: j });
    else ops.push({ t: "+", s: b[j], ai: i, bi: j++ });
  }
  while (i < n) ops.push({ t: "-", s: a[i], ai: i++, bi: j });
  while (j < m) ops.push({ t: "+", s: b[j], ai: i, bi: j++ });

  const out = [`--- ${before ? `a/${path}` : "/dev/null"}`, `+++ ${after === null ? "/dev/null" : `b/${path}`}`];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].t === " ") {
      k++;
      continue;
    }
    const start = Math.max(0, k - context);
    let end = k;
    while (end < ops.length) {
      if (ops[end].t !== " ") {
        end++;
        continue;
      }
      let run = 0;
      while (end + run < ops.length && ops[end + run].t === " ") run++;
      if (end + run >= ops.length || run > context * 2) {
        end = Math.min(ops.length, end + context);
        break;
      }
      end += run;
    }
    const hunk = ops.slice(start, end);
    const aStart = hunk[0].ai + 1;
    const bStart = hunk[0].bi + 1;
    const aLen = hunk.filter((o) => o.t !== "+").length;
    const bLen = hunk.filter((o) => o.t !== "-").length;
    out.push(`@@ -${aStart},${aLen} +${bStart},${bLen} @@`);
    for (const o of hunk) out.push(`${o.t}${o.s}`);
    k = end;
  }
  return out.join("\n");
}

export function diffStats(before: string, after: string | null): { added: number; removed: number } {
  const d = unifiedDiff("x", before, after, 0).split("\n").slice(2);
  return {
    added: d.filter((l) => l.startsWith("+")).length,
    removed: d.filter((l) => l.startsWith("-")).length,
  };
}

/** Checador de sintaxe opcional (a edge function injeta o compilador TypeScript). */
export type SyntaxChecker = (path: string, content: string) => Promise<string[]> | string[];

export interface VerifyIssue {
  path: string;
  problem: string;
}

/**
 * Verificação ("testes") das mudanças propostas:
 *  - regras do Vibe Code (placeholder, segredo, JSON, delimitadores) — só os problemas NOVOS
 *  - sintaxe real via checador injetado
 *  - imports relativos para arquivos que não existem no projeto
 *  - marcadores de conflito de merge
 */
export async function verifyChanges(
  changes: Iterable<FileChange>,
  allPaths: Set<string>,
  checkSyntax?: SyntaxChecker,
): Promise<VerifyIssue[]> {
  const list = [...changes];
  const finalPaths = new Set(allPaths);
  for (const c of list) {
    if (c.after === null) finalPaths.delete(c.path);
    else finalPaths.add(c.path);
  }
  const issues: VerifyIssue[] = [];
  for (const c of list) {
    if (c.after === null) continue;
    const old = new Set(c.before ? lintGeneratedFile(c.path, c.before) : []);
    for (const p of lintGeneratedFile(c.path, c.after)) if (!old.has(p)) issues.push({ path: c.path, problem: p });
    if (/^(<<<<<<<|=======|>>>>>>>)( |$)/m.test(c.after)) issues.push({ path: c.path, problem: "marcadores de conflito de merge no arquivo" });
    if (checkSyntax && /\.(?:[cm]?[jt]sx?)$/i.test(c.path)) {
      try {
        for (const p of await checkSyntax(c.path, c.after)) issues.push({ path: c.path, problem: `sintaxe: ${p}` });
      } catch {
        /* checador indisponível: segue com as checagens estáticas */
      }
    }
    if (allPaths.size) {
      for (const spec of indexFile(c.path, c.after).imports) {
        if (!(spec.startsWith(".") || spec.startsWith("@/"))) continue;
        if (!resolveImport(c.path, spec, finalPaths)) issues.push({ path: c.path, problem: `import "${spec}" aponta para arquivo que não existe` });
      }
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Prompts (pt-BR). Próprios do VERTAL Code AI: não tocam nos prompts do Vibe Code.
// ---------------------------------------------------------------------------

const EFFORT_HINT: Record<VcaEffort, string> = {
  auto: "Escolha a profundidade certa para o pedido.",
  low: "Seja rápido e direto: mudança mínima que resolve.",
  high: "Pense com cuidado nos efeitos em outros arquivos antes de editar.",
  max: "Análise profunda: considere arquitetura, casos de borda e testes antes de editar.",
};

export function systemPrompt(mode: VcaMode, effort: VcaEffort): string {
  const common = [
    "Você é o VERTAL Code AI, agente de programação da Vertal. Responda em português do Brasil.",
    "Stack preferida: React + TypeScript + Vite + Tailwind + shadcn/ui; Supabase (Postgres + Edge Functions em Deno).",
    "Nunca escreva segredos no código: use variáveis de ambiente. Nunca edite .env, .git, node_modules ou .github/workflows.",
    EFFORT_HINT[effort],
    "Responda SOMENTE com um objeto JSON válido, sem texto fora dele.",
  ];
  if (mode === "plan") {
    return [
      ...common,
      "MODO PLANEJAR: não edite nada. Leia o que precisar e devolva um plano.",
      'Formato: {"summary":"...","actions":[{"type":"read_file","path":"..."}],"plan":{"goal":"...","steps":[{"title":"...","detail":"...","files":["..."]}],"risks":["..."],"questions":["..."]},"final":true|false}',
      'Se precisar ler arquivos antes, mande só ações read_file com "final":false. Quando tiver o plano, "final":true e "actions":[].',
    ].join("\n");
  }
  return [
    ...common,
    "MODO CONSTRUIR: implemente o pedido com edições em vários arquivos se preciso.",
    "Ações possíveis:",
    '- {"type":"read_file","path":"..."} para ler antes de editar (o conteúdo volta para você).',
    '- {"type":"patch_file","path":"...","search":"trecho EXATO que existe hoje","replace":"novo trecho"} para mudanças pontuais (preferido em arquivos grandes).',
    '- {"type":"write_file","path":"...","content":"arquivo COMPLETO"} para arquivos novos ou reescritos. Nunca use "..." ou "resto do código".',
    '- {"type":"delete_file","path":"..."}',
    'Formato: {"summary":"o que fez, em 1-3 frases","actions":[...],"final":true|false}',
    "Leia antes de usar patch_file. Depois das edições, um verificador roda as checagens e devolve problemas para você corrigir.",
  ].join("\n");
}

export function userPrompt(input: {
  prompt: string;
  repoMap?: string;
  relevant?: Array<{ path: string; content: string }>;
  plan?: VcaPlan | null;
}): string {
  const parts = [`Pedido do dev:\n${input.prompt.slice(0, VCA_LIMITS.maxPromptChars)}`];
  if (input.plan) {
    parts.push(`Plano aprovado:\n${input.plan.steps.map((s, i) => `${i + 1}. ${s.title}${s.files.length ? ` (${s.files.join(", ")})` : ""}`).join("\n")}`);
  }
  if (input.repoMap) parts.push(`Mapa do projeto (caminho :: símbolos exportados):\n${input.repoMap}`);
  if (input.relevant?.length) parts.push(formatFiles(input.relevant, "Arquivos provavelmente relevantes"));
  return parts.join("\n\n");
}

export function formatFiles(files: Array<{ path: string; content: string }>, title = "Arquivos lidos"): string {
  let total = 0;
  const blocks: string[] = [];
  for (const f of files) {
    const body = f.content ? f.content.slice(0, 15_000) : "(arquivo não existe ou está vazio)";
    if (total + body.length > VCA_LIMITS.maxObservationChars) {
      blocks.push(`### ${f.path}\n(omitido: limite de contexto; peça com read_file se precisar)`);
      continue;
    }
    total += body.length;
    blocks.push(`### ${f.path}\n\`\`\`\n${body}\n\`\`\``);
  }
  return `${title}:\n${blocks.join("\n\n")}`;
}

export function fixPrompt(issues: VerifyIssue[], editErrors: string[]): string {
  const lines = [...editErrors.map((e) => `- ${e}`), ...issues.map((i) => `- ${i.path}: ${i.problem}`)];
  return `O verificador encontrou problemas nas suas mudanças. Corrija com novas ações (patch_file/write_file) e responda no mesmo formato JSON:\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Loop do agente (dependências injetadas → testável sem rede)
// ---------------------------------------------------------------------------

export type VcaEvent =
  | { kind: "status"; title: string }
  | { kind: "model"; label: string; cost: string; fellBack: boolean }
  | { kind: "read"; paths: string[] }
  | { kind: "plan"; plan: VcaPlan; summary: string }
  | { kind: "diff"; path: string; diff: string; added: number; removed: number; isNew: boolean; isDelete: boolean; after: string | null }
  | { kind: "verify"; ok: boolean; issues: VerifyIssue[]; round: number }
  | { kind: "reply"; text: string }
  | { kind: "error"; message: string }
  | { kind: "done"; files: number; verified: boolean };

export interface ModelReply {
  content: string;
  label: string;
  cost: string;
  fellBack: boolean;
}

export interface RunInput {
  mode: VcaMode;
  effort: VcaEffort;
  prompt: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Imagens anexadas (data URL ou https). */
  images?: string[];
  /** Plano aprovado (Construir a partir de um plano). */
  plan?: VcaPlan | null;
  /** Arquivos que o dev anexou (têm prioridade sobre o projeto). */
  attachments?: Array<{ path: string; content: string }>;
}

export interface RunDeps {
  callModel: (messages: VcaChatMessage[], opts: { json: boolean; maxTokens: number }) => Promise<ModelReply>;
  listPaths: () => Promise<string[]>;
  readFile: (path: string) => Promise<string | undefined>;
  /** Conteúdo para indexar (opcional: sem ele o índice usa só caminhos). */
  indexSource?: () => Promise<Array<{ path: string; content: string }>>;
  checkSyntax?: SyntaxChecker;
  emit: (e: VcaEvent) => void;
}

export interface RunResult {
  summary: string;
  plan?: VcaPlan;
  changes: FileChange[];
  verified: boolean;
  issues: VerifyIssue[];
}

export async function runVertalCodeAi(input: RunInput, deps: RunDeps): Promise<RunResult> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("empty_prompt");
  if (looksLikeSecret(prompt)) deps.emit({ kind: "status", title: "Aviso: o pedido parece conter um segredo. Use o cofre da Vertal, não cole chaves no chat." });

  const attached = new Map((input.attachments ?? []).filter((a) => isSafePath(a.path)).map((a) => [a.path, a.content]));
  const paths = new Set<string>([...(await deps.listPaths().catch(() => [])), ...attached.keys()]);
  const cache = new Map<string, string | undefined>(attached);
  const read = async (p: string) => {
    if (!cache.has(p)) cache.set(p, await deps.readFile(p).catch(() => undefined));
    return cache.get(p);
  };

  deps.emit({ kind: "status", title: `Indexando o projeto (${paths.size} arquivos)` });
  const source = deps.indexSource ? await deps.indexSource().catch(() => []) : [];
  for (const s of source) if (!cache.has(s.path)) cache.set(s.path, s.content);
  const index: IndexedFile[] = source.length
    ? source.slice(0, VCA_LIMITS.maxIndexFiles).map((s) => indexFile(s.path, s.content))
    : [...paths].slice(0, VCA_LIMITS.maxIndexFiles).map((p) => ({ path: p, size: 0, symbols: [], imports: [] }));
  for (const [p, c] of attached) if (!index.some((i) => i.path === p)) index.push(indexFile(p, c));

  const relevantPaths = [...new Set([...attached.keys(), ...rankRelevantFiles(index, prompt, 6)])].slice(0, 8);
  const relevant = (await Promise.all(relevantPaths.map(async (p) => ({ path: p, content: (await read(p)) ?? "" })))).filter((f) => f.content);
  if (relevant.length) deps.emit({ kind: "read", paths: relevant.map((r) => r.path) });

  const userText = userPrompt({ prompt, repoMap: repoMap(index), relevant, plan: input.plan });
  const userContent: VcaChatMessage["content"] = input.images?.length
    ? [{ type: "text", text: userText }, ...input.images.slice(0, 4).map((url) => ({ type: "image_url" as const, image_url: { url } }))]
    : userText;
  const messages: VcaChatMessage[] = [
    { role: "system", content: systemPrompt(input.mode, input.effort) },
    ...(input.history ?? []).slice(-8).map((h) => ({ role: h.role, content: h.content.slice(0, 4000) })),
    { role: "user", content: userContent },
  ];

  let pending = new Map<string, FileChange>();
  let summary = "";
  let plan: VcaPlan | undefined;
  let issues: VerifyIssue[] = [];
  let verified = false;
  let fixRounds = 0;
  let badOutputs = 0;
  const maxTokens = input.mode === "plan" ? 3_000 : 8_000;

  for (let turn = 0; turn < VCA_LIMITS.maxTurns; turn++) {
    let reply: ModelReply;
    try {
      reply = await deps.callModel(messages, { json: true, maxTokens });
    } catch (err) {
      // Sem modelo (cotas esgotadas / prazo): entrega o que já estiver pronto, se houver.
      if (!pending.size && !plan) throw err;
      deps.emit({ kind: "status", title: "Os modelos pararam de responder; entregando o que já estava pronto" });
      break;
    }
    deps.emit({ kind: "model", label: reply.label, cost: reply.cost, fellBack: reply.fellBack });
    const parsed = parseVcaTurn(reply.content);
    messages.push({ role: "assistant", content: reply.content.slice(0, 20_000) });
    if (parsed.retry) {
      if (++badOutputs > 1) break;
      messages.push({ role: "user", content: "Sua resposta não era um JSON válido no formato pedido. Responda de novo, só o JSON." });
      continue;
    }
    if (parsed.summary) summary = parsed.summary;

    const reads = parsed.actions.filter((a) => a.type === "read_file").slice(0, VCA_LIMITS.maxReadsPerTurn);
    const edits = input.mode === "build" ? parsed.actions.filter((a) => a.type !== "read_file") : [];

    if (input.mode === "plan" && parsed.plan) {
      plan = parsed.plan;
      if (!reads.length || parsed.final) break;
    }

    let editErrors: string[] = [];
    if (edits.length) {
      // O "antes" de cada arquivo existente precisa estar lido para o diff e o patch.
      for (const e of edits) if (paths.has(e.path)) await read(e.path);
      const res = applyActions(edits, (p) => cache.get(p), pending);
      pending = res.changes;
      editErrors = res.errors;
    }

    if (reads.length) {
      const files = await Promise.all(reads.map(async (r) => ({ path: r.path, content: (await read(r.path)) ?? "" })));
      deps.emit({ kind: "read", paths: files.map((f) => f.path) });
      messages.push({ role: "user", content: formatFiles(files) + (editErrors.length ? `\n\n${fixPrompt([], editErrors)}` : "") });
      continue;
    }

    if (input.mode === "plan") {
      if (!plan) {
        messages.push({ role: "user", content: 'Falta o campo "plan" com "steps". Responda com o plano completo.' });
        continue;
      }
      break;
    }

    // Construir: verifica e, se preciso, devolve os problemas ao modelo.
    if (pending.size || editErrors.length) {
      issues = await verifyChanges(pending.values(), paths, deps.checkSyntax);
      verified = issues.length === 0 && editErrors.length === 0;
      deps.emit({ kind: "verify", ok: verified, issues, round: fixRounds });
      if (!verified && fixRounds < VCA_LIMITS.maxFixRounds) {
        fixRounds++;
        deps.emit({ kind: "status", title: `Corrigindo sozinho (rodada ${fixRounds} de ${VCA_LIMITS.maxFixRounds})` });
        messages.push({ role: "user", content: fixPrompt(issues, editErrors) });
        continue;
      }
      break;
    }
    if (parsed.final) break;
    messages.push({ role: "user", content: "Nenhuma edição recebida. Se o pedido exige mudanças, mande as ações agora." });
  }

  const changes = [...pending.values()].filter((c) => c.after !== c.before);
  for (const c of changes) {
    const st = diffStats(c.before, c.after);
    deps.emit({
      kind: "diff",
      path: c.path,
      diff: unifiedDiff(c.path, c.before, c.after),
      added: st.added,
      removed: st.removed,
      isNew: !c.before,
      isDelete: c.after === null,
      after: c.after,
    });
  }
  if (plan) deps.emit({ kind: "plan", plan, summary });
  deps.emit({ kind: "reply", text: summary || (plan ? "Plano pronto." : changes.length ? "Mudanças prontas para revisão." : "Não consegui concluir o pedido.") });
  deps.emit({ kind: "done", files: changes.length, verified });
  return { summary, plan, changes, verified, issues };
}
