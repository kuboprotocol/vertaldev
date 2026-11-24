// VERTAL Code AI — prompts dos modos Plano/Construir/Corrigir, montagem de
// contexto e leitura robusta da resposta do modelo. Módulo puro.
import type { FileEdit } from "./diff.ts";
import type { VcaiMode } from "./models.ts";

export interface PlanStep {
  title: string;
  detail: string;
  files: string[];
}

export interface VcaiPlan {
  summary: string;
  steps: PlanStep[];
  questions: string[];
  risks: string[];
  testCommand?: string;
}

export interface VcaiBuild {
  summary: string;
  edits: FileEdit[];
  notes: string[];
  testCommand?: string;
}

export interface Attachment {
  name: string;
  /** "text" vai como contexto; "image" vai como image_url (data URL). */
  kind: "text" | "image";
  /** Texto do arquivo, ou data URL da imagem. */
  data: string;
}

export const MAX_ATTACH_TEXT = 60_000;
export const MAX_IMAGE_BYTES = 4_000_000;
export const MAX_IMAGES = 4;

const BASE_RULES = [
  "Você é o VERTAL Code AI, agente de programação do Vertal. Responda sempre em português do Brasil.",
  "Nunca diga qual modelo ou empresa está por trás de você: você é o VERTAL Code AI.",
  "Nunca escreva segredos, chaves ou senhas no código: use variáveis de ambiente (import.meta.env / Deno.env / process.env).",
  "Não crie recursos para burlar limites de provedores, rodar IPs rotativos, contornar segurança ou remover filtros de modelos.",
  "Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois e sem cercas de código.",
].join("\n");

export const PLAN_PROMPT = `${BASE_RULES}

MODO PLANO: você só lê e planeja; não escreve código.
Formato:
{"summary":"o que será feito, em 1-3 frases",
 "steps":[{"title":"passo curto","detail":"o que mudar e por quê","files":["caminho/arquivo.ts"]}],
 "questions":["dúvida que muda o resultado (opcional)"],
 "risks":["o que pode quebrar (opcional)"],
 "testCommand":"comando para validar no sandbox (opcional, ex.: npx tsc --noEmit)"}
Regras: no máximo 8 passos; cite só arquivos que existem na árvore ou que serão criados; prefira mudanças pequenas e aditivas.`;

export const BUILD_PROMPT = `${BASE_RULES}

MODO CONSTRUIR: escreva as mudanças de código.
Formato:
{"summary":"o que mudou",
 "edits":[
   {"path":"src/arquivo.ts","action":"edit","reason":"por quê","changes":[{"search":"trecho EXATO atual","replace":"trecho novo"}]},
   {"path":"src/novo.ts","action":"create","reason":"por quê","content":"conteúdo completo"},
   {"path":"src/pequeno.ts","action":"replace","reason":"por quê","content":"conteúdo completo"}
 ],
 "notes":["o que o dev precisa saber (opcional)"],
 "testCommand":"comando de validação (opcional)"}
Regras:
- Para arquivos existentes prefira "edit" com trechos "search" copiados EXATAMENTE do conteúdo mostrado (com contexto suficiente para serem únicos).
- Use "replace" só para arquivos pequenos (< 150 linhas) e "create" só para arquivos novos.
- Não apague arquivos. Não mexa em lockfiles, .env nem em pastas de build.
- Código completo e funcional: sem TODO, sem "..." e sem placeholders.`;

export const FIX_PROMPT = `${BUILD_PROMPT}

MODO CORRIGIR: as mudanças anteriores falharam nos testes do sandbox (log abaixo).
Corrija a causa dos erros com o mínimo de mudanças. Os arquivos mostrados JÁ incluem as mudanças anteriores.`;

export function systemPromptFor(mode: VcaiMode): string {
  return mode === "plan" ? PLAN_PROMPT : mode === "fix" ? FIX_PROMPT : BUILD_PROMPT;
}

const STOP = new Set([
  "a", "o", "e", "de", "da", "do", "das", "dos", "um", "uma", "para", "com", "que", "no", "na", "em", "por", "se", "os", "as",
  "the", "and", "to", "of", "in", "for", "on", "with", "is", "it", "src", "ts", "tsx", "js", "index",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs|css|scss|html|json|md|sql|py|go|rs|vue|svelte|toml|ya?ml)$/i;
const NOISE = /(^|\/)(node_modules|dist|build|\.git|coverage|\.next|vendor|public\/assets)\//;

/**
 * Arquivos que entram no contexto: os citados no plano/pedido primeiro, depois os
 * de maior sobreposição de palavras com o pedido. Determinístico e barato (sem embeddings).
 */
export function pickContextFiles(tree: string[], prompt: string, mentioned: string[] = [], max = 10): string[] {
  const exists = new Set(tree);
  const chosen: string[] = [];
  for (const m of mentioned) {
    if (exists.has(m) && !chosen.includes(m)) chosen.push(m);
  }
  for (const path of tree) {
    if (chosen.length >= max) break;
    if (prompt.includes(path) && !chosen.includes(path)) chosen.push(path);
  }
  const q = new Set(tokens(prompt));
  if (q.size === 0) return chosen.slice(0, max);
  const scored = tree
    .filter((p) => CODE_EXT.test(p) && !NOISE.test(p) && !chosen.includes(p))
    .map((p) => {
      const pt = tokens(p);
      let score = 0;
      for (const t of pt) if (q.has(t)) score += 2;
      const base = p.split("/").pop() ?? p;
      for (const t of tokens(base)) if (q.has(t)) score += 3;
      if (/test|spec|__tests__/.test(p)) score -= 1;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.length - b.p.length);
  for (const { p } of scored) {
    if (chosen.length >= max) break;
    chosen.push(p);
  }
  return chosen;
}

/** Árvore resumida para o prompt (sem ruído, no máximo `max` caminhos). */
export function compactTree(tree: string[], max = 400): string[] {
  return tree.filter((p) => !NOISE.test(p)).slice(0, max);
}

export function formatFiles(files: Array<{ path: string; content: string }>, maxEach = 14_000, maxTotal = 60_000): string {
  let total = 0;
  const parts: string[] = [];
  for (const f of files) {
    if (total >= maxTotal) {
      parts.push(`### ${f.path}\n(omitido: limite de contexto)`);
      continue;
    }
    let body = f.content;
    if (body.length > maxEach) body = `${body.slice(0, maxEach)}\n/* … arquivo cortado (${f.content.length} caracteres) … */`;
    total += body.length;
    parts.push(`### ${f.path}\n\`\`\`\n${body}\n\`\`\``);
  }
  return parts.join("\n\n");
}

export interface ContextInput {
  mode: VcaiMode;
  prompt: string;
  tree: string[];
  files: Array<{ path: string; content: string }>;
  plan?: VcaiPlan | null;
  attachments?: Attachment[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  failureLog?: string;
  editFailures?: Array<{ path: string; error: string }>;
}

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };

/** Mensagens no formato OpenAI. Imagens vão como partes image_url só se `withImages`. */
export function buildMessages(input: ContextInput, withImages: boolean): ChatMessage[] {
  const sections: string[] = [];
  sections.push(`## Pedido\n${input.prompt.trim()}`);
  if (input.plan) {
    sections.push(
      `## Plano aprovado\n${input.plan.summary}\n${input.plan.steps.map((s, i) => `${i + 1}. ${s.title}: ${s.detail}${s.files.length ? ` (${s.files.join(", ")})` : ""}`).join("\n")}`,
    );
  }
  if (input.tree.length) sections.push(`## Árvore do projeto (parcial)\n${compactTree(input.tree).join("\n")}`);
  if (input.files.length) sections.push(`## Arquivos atuais\n${formatFiles(input.files)}`);
  const texts = (input.attachments ?? []).filter((a) => a.kind === "text");
  if (texts.length) {
    let budget = MAX_ATTACH_TEXT;
    const chunks: string[] = [];
    for (const a of texts) {
      const body = a.data.slice(0, Math.max(0, budget));
      budget -= body.length;
      chunks.push(`### ${a.name}\n\`\`\`\n${body}\n\`\`\``);
    }
    sections.push(`## Anexos do usuário\n${chunks.join("\n\n")}`);
  }
  const images = (input.attachments ?? []).filter((a) => a.kind === "image").slice(0, MAX_IMAGES);
  if (images.length && !withImages) sections.push(`## Imagens anexadas\n(${images.length} imagem(ns) não puderam ser lidas por este modelo: ${images.map((i) => i.name).join(", ")})`);
  if (input.editFailures?.length) {
    sections.push(`## Edições que não puderam ser aplicadas\n${input.editFailures.map((f) => `- ${f.path}: ${f.error}`).join("\n")}\nRefaça essas edições com trechos "search" exatos.`);
  }
  if (input.failureLog) sections.push(`## Log do sandbox (erros)\n\`\`\`\n${input.failureLog}\n\`\`\``);

  const text = sections.join("\n\n");
  const user: ChatMessage =
    withImages && images.length
      ? { role: "user", content: [{ type: "text", text }, ...images.map((i) => ({ type: "image_url" as const, image_url: { url: i.data } }))] }
      : { role: "user", content: text };
  const history = (input.history ?? []).slice(-6).map((h) => ({ role: h.role, content: h.content.slice(0, 4000) }) as ChatMessage);
  return [{ role: "system", content: systemPromptFor(input.mode) }, ...history, user];
}

/** Tira blocos de raciocínio e cercas de código, e acha o primeiro objeto JSON balanceado. */
export function extractJson(raw: string): unknown {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1].trim().startsWith("{")) text = fence[1].trim();
  const start = text.indexOf("{");
  if (start < 0) throw new Error("resposta sem JSON");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("JSON incompleto (resposta cortada)");
}

const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strList = (v: unknown, maxItems = 12, max = 500) =>
  Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, maxItems) : [];

export function parsePlan(raw: string): VcaiPlan {
  const obj = extractJson(raw) as Record<string, unknown>;
  const steps = Array.isArray(obj.steps)
    ? obj.steps
        .map((s) => {
          const r = (s ?? {}) as Record<string, unknown>;
          return { title: str(r.title, 200), detail: str(r.detail, 1500), files: strList(r.files, 20, 300) };
        })
        .filter((s) => s.title)
        .slice(0, 12)
    : [];
  const plan: VcaiPlan = { summary: str(obj.summary, 1500), steps, questions: strList(obj.questions), risks: strList(obj.risks) };
  const tc = str(obj.testCommand, 300);
  if (tc) plan.testCommand = tc;
  if (!plan.summary && !plan.steps.length) throw new Error("plano vazio");
  return plan;
}

export function parseBuild(raw: string): VcaiBuild {
  const obj = extractJson(raw) as Record<string, unknown>;
  const edits: FileEdit[] = [];
  if (Array.isArray(obj.edits)) {
    for (const e of obj.edits.slice(0, 40)) {
      const r = (e ?? {}) as Record<string, unknown>;
      const path = str(r.path, 300).replace(/^\.\//, "");
      const action = r.action === "create" || r.action === "replace" || r.action === "edit" ? r.action : typeof r.content === "string" ? "replace" : "edit";
      if (!path) continue;
      const edit: FileEdit = { path, action, reason: str(r.reason, 500) || undefined };
      if (action === "edit") {
        edit.changes = Array.isArray(r.changes)
          ? r.changes
              .map((c) => {
                const cc = (c ?? {}) as Record<string, unknown>;
                return { search: typeof cc.search === "string" ? cc.search : "", replace: typeof cc.replace === "string" ? cc.replace : "" };
              })
              .filter((c) => c.search)
          : [];
      } else {
        edit.content = typeof r.content === "string" ? r.content : undefined;
      }
      edits.push(edit);
    }
  }
  const build: VcaiBuild = { summary: str(obj.summary, 1500), edits, notes: strList(obj.notes) };
  const tc = str(obj.testCommand, 300);
  if (tc) build.testCommand = tc;
  if (!build.edits.length && !build.summary) throw new Error("resposta sem edições");
  return build;
}

/** Valida anexos vindos do navegador (tamanho, tipo e quantidade). */
export function sanitizeAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  const out: Attachment[] = [];
  let images = 0;
  let textBudget = MAX_ATTACH_TEXT * 2;
  for (const a of raw.slice(0, 12)) {
    const r = (a ?? {}) as Record<string, unknown>;
    const name = str(r.name, 120) || "anexo";
    if (r.kind === "image" && typeof r.data === "string") {
      if (images >= MAX_IMAGES) continue;
      if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(r.data)) continue;
      if (r.data.length > MAX_IMAGE_BYTES * 1.37) continue;
      images++;
      out.push({ name, kind: "image", data: r.data });
    } else if (r.kind === "text" && typeof r.data === "string") {
      if (textBudget <= 0) continue;
      const data = r.data.slice(0, Math.min(MAX_ATTACH_TEXT, textBudget));
      textBudget -= data.length;
      out.push({ name, kind: "text", data });
    }
  }
  return out;
}
