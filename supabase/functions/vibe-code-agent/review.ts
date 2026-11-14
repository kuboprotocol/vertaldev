// Vibe Reviewer — comandos /review, /improve, /describe, /ask, fila de erros e
// "Ajustar", rodando dentro da edge function vibe-code-agent (o projeto está no
// limite de edge functions, então não existe uma função separada).
//
// Estrutura portada do PR-Agent (MIT, Copyright (c) 2026 The PR Agent —
// https://github.com/The-PR-Agent/pr-agent): prompts em
// ../_shared/vibeReviewPrompts.ts, parsing/validação/aplicação em
// ../_shared/vibeReviewEngine.ts. Ver THIRD_PARTY_NOTICES.md.
//
//   pedido ─► arquivos do projeto (os da conversa primeiro) numerados com "+"
//             nas linhas novas ─► modelo (JSON) ─► validação do JSON
//             ─► [improve] autorreflexão: nota 0-10, descarta as fracas
//             ─► cada correção conferida contra o arquivo real
//             ─► evento "review_findings" (a fila do chat) + resposta em pt-BR

import { type ChatMsg, filterRepoTree, isSafePath } from "../_shared/vibeAgentCore.ts";
import {
  applyReflection,
  composeReviewReply,
  type CodeSuggestion,
  formatFileForReview,
  normalizeIssue,
  parseAdjustOutput,
  parseAnswer,
  parseCodeSuggestions,
  parseDescribe,
  parseReflection,
  parseReviewOutput,
  pathsFromErrors,
  pickReviewFiles,
  type ReflectionFeedback,
  type ReviewCommand,
  type ReviewFinding,
  type ReviewPayload,
  sanitizeErrorText,
  sortFindings,
  validateFinding,
} from "../_shared/vibeReviewEngine.ts";
import {
  buildAdjustMessages,
  buildAskMessages,
  buildDescribeMessages,
  buildFixErrorsMessages,
  buildImproveMessages,
  buildReflectMessages,
  buildReviewMessages,
} from "../_shared/vibeReviewPrompts.ts";

export const REVIEW_COMMANDS: ReviewCommand[] = ["review", "improve", "describe", "ask", "fix_errors", "adjust"];

export interface ReviewRequestBody {
  command: ReviewCommand;
  /** Foco opcional ("/review segurança do login"). */
  focus?: string;
  /** Pergunta do Dev (/ask ou pergunta no meio da fila). */
  question?: string;
  /** Arquivos que o agente tocou nesta conversa (o "PR" do Vibe Code). */
  paths?: string[];
  /** Erros de build/runtime para a fila de erros. */
  errors?: string[];
  /** Item da fila em discussão (ask) ou a ajustar (adjust). */
  finding?: unknown;
  /** Comentário do Dev em "Ajustar". */
  comment?: string;
  /** Conteúdo atual do arquivo do item (cópia de trabalho da fila). */
  fileContent?: string;
}

export interface ReviewDeps {
  list(): Promise<string[]>;
  read(path: string): Promise<{ content: string; sha?: string }>;
  /** Versão anterior do arquivo (para marcar com "+" o que mudou), quando existir. */
  readPrevious(path: string, current: string): Promise<string | null>;
  /** Uma chamada ao modelo em modo JSON; devolve o texto cru. */
  callModel(messages: ChatMsg[], opts: { maxTokens: number; label: string }): Promise<string>;
  send(event: Record<string, unknown>): void;
  /** Contexto do Dev + memória do Prime, já formatados para o prompt. */
  context: string;
  /** Nota mínima da autorreflexão (padrão 5). */
  scoreThreshold?: number;
}

const MAX_FILES = 8;
const MAX_FILE_CHARS = 12000;
const MAX_TOTAL_CHARS = 60000;
const MAX_FINDINGS = 8;
const MAX_TEXT = 2000;

const cleanText = (v: unknown, max = MAX_TEXT) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseReviewRequest(raw: unknown): ReviewRequestBody | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const command = r.command as ReviewCommand;
  if (!REVIEW_COMMANDS.includes(command)) return null;
  const paths = (Array.isArray(r.paths) ? r.paths : []).filter((p): p is string => typeof p === "string" && isSafePath(p)).slice(0, 40);
  const errors = (Array.isArray(r.errors) ? r.errors : [])
    .filter((e): e is string => typeof e === "string" && !!e.trim())
    .slice(0, 10)
    .map((e) => sanitizeErrorText(e));
  return {
    command,
    focus: cleanText(r.focus, 500) || undefined,
    question: cleanText(r.question) || undefined,
    paths,
    errors,
    finding: r.finding,
    comment: cleanText(r.comment, 1000) || undefined,
    fileContent: typeof r.fileContent === "string" ? r.fileContent.slice(0, 200000) : undefined,
  };
}

/** Lê os arquivos e monta o bloco numerado. Devolve também o conteúdo cru para validar as correções. */
async function loadCode(deps: ReviewDeps, paths: string[]) {
  const files: Record<string, string> = {};
  const blocks: string[] = [];
  let used = 0;
  for (const path of paths.slice(0, MAX_FILES)) {
    if (used >= MAX_TOTAL_CHARS) break;
    const file = await deps.read(path).catch(() => ({ content: "", sha: undefined }));
    if (!file.content) continue;
    files[path] = file.content;
    const previous = await deps.readPrevious(path, file.content).catch(() => null);
    const block = formatFileForReview(path, file.content, previous, Math.min(MAX_FILE_CHARS, MAX_TOTAL_CHARS - used));
    used += block.length;
    blocks.push(block);
  }
  return { files, code: blocks.join("\n\n") };
}

/** Uma chamada JSON com uma segunda chance quando o modelo sai do formato. */
async function askJson<T>(deps: ReviewDeps, messages: ChatMsg[], parse: (raw: string) => T, maxTokens: number, label: string): Promise<T> {
  const raw = await deps.callModel(messages, { maxTokens, label });
  try {
    return parse(raw);
  } catch {
    const retry = await deps.callModel(
      [
        ...messages,
        { role: "assistant", content: raw.slice(0, 4000) },
        { role: "user", content: "Sua resposta não estava no formato JSON pedido. Responda de novo SOMENTE com o objeto JSON, sem texto fora dele." },
      ],
      { maxTokens, label: `${label} (nova tentativa)` },
    );
    return parse(retry);
  }
}

function validateAll(findings: ReviewFinding[], files: Record<string, string>) {
  return findings.map((f) => validateFinding(f, files[f.path]));
}

function filesFor(findings: ReviewFinding[], files: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const f of findings) if (files[f.path] !== undefined) out[f.path] = files[f.path];
  return out;
}

/** Executa um comando do revisor. Devolve o texto da resposta (balão do chat). */
export async function runReviewCommand(req: ReviewRequestBody, deps: ReviewDeps): Promise<string> {
  const tree = filterRepoTree(await deps.list().catch(() => [] as string[]), 400);
  const treeSet = new Set(tree);
  const conversationPaths = (req.paths ?? []).filter((p) => treeSet.has(p));

  // ---------------------------------------------------------------- adjust
  if (req.command === "adjust") {
    const base = normalizeIssue(
      typeof req.finding === "object" && req.finding
        ? {
          ...(req.finding as Record<string, unknown>),
          relevant_file: (req.finding as Record<string, unknown>).path,
          issue_header: (req.finding as Record<string, unknown>).title,
          issue_content: (req.finding as Record<string, unknown>).explanation,
          existing_code: (req.finding as Record<string, unknown>).existingCode,
          improved_code: (req.finding as Record<string, unknown>).improvedCode,
          start_line: (req.finding as Record<string, unknown>).startLine,
          end_line: (req.finding as Record<string, unknown>).endLine,
        }
        : null,
      ((req.finding as Record<string, unknown> | undefined)?.source as ReviewFinding["source"]) ?? "review",
    );
    if (!base || !isSafePath(base.path)) throw new Error("review_invalid_finding");
    if (!req.comment) throw new Error("review_comment_required");
    const content = req.fileContent ?? (await deps.read(base.path)).content;
    deps.send({ kind: "review", status: "success", title: `Refazendo a correção de ${base.path} com o seu comentário`, path: base.path });
    const code = formatFileForReview(base.path, content, null, MAX_FILE_CHARS * 2);
    const { finding, reply } = await askJson(
      deps,
      buildAdjustMessages({ code, context: deps.context }, base, req.comment),
      (raw) => parseAdjustOutput(raw, base),
      3000,
      "adjust",
    );
    const validated = validateFinding({ ...finding, id: base.id }, content);
    const payload: ReviewPayload = { command: "adjust", findings: [validated], files: { [base.path]: content } };
    deps.send({ kind: "review_findings", status: "success", title: validated.applicable ? "Correção ajustada" : "Correção ajustada (precisa de revisão manual)", review: payload });
    return [
      reply || "Refiz a correção seguindo o seu comentário.",
      validated.applicable ? "Confira o novo diff e escolha Aplicar, Pular ou Ajustar de novo." : `Não consegui deixá-la aplicável automaticamente (${validated.problem}). Você pode ajustar de novo ou pular.`,
    ].join(" ");
  }

  // ---------------------------------------------------------------- arquivos-alvo
  let targets: string[];
  if (req.command === "fix_errors") {
    targets = [...new Set([...pathsFromErrors(req.errors ?? [], tree), ...conversationPaths])].slice(0, MAX_FILES);
    if (!targets.length) targets = pickReviewFiles(tree, [], 4);
  } else if (req.command === "ask" && req.finding && typeof req.finding === "object") {
    const p = (req.finding as Record<string, unknown>).path;
    targets = [...new Set([...(typeof p === "string" && treeSet.has(p) ? [p] : []), ...conversationPaths])].slice(0, 4);
  } else {
    targets = pickReviewFiles(tree, conversationPaths, MAX_FILES);
  }
  if (!targets.length && req.command !== "ask") {
    return "O projeto ainda não tem arquivos para revisar. Peça ao agente para criar algo primeiro e depois rode a revisão.";
  }

  const verb: Record<string, string> = {
    review: "Revisando",
    improve: "Procurando melhorias em",
    describe: "Descrevendo as mudanças de",
    ask: "Lendo",
    fix_errors: "Investigando os erros em",
  };
  deps.send({
    kind: "review",
    status: "success",
    title: `${verb[req.command]} ${targets.length} arquivo(s)`,
    detail: targets.join(", "),
  });
  const { files, code } = await loadCode(deps, targets);
  for (const path of Object.keys(files)) deps.send({ kind: "read_file", status: "success", title: `Lido ${path}`, path });
  const prompt = { code: code || "(nenhum arquivo legível)", context: deps.context, focus: req.focus };

  // ---------------------------------------------------------------- ask
  if (req.command === "ask") {
    const question = req.question ?? req.focus;
    if (!question) throw new Error("review_question_required");
    const focusFinding = req.finding && typeof req.finding === "object" ? (req.finding as ReviewFinding) : null;
    const answer = await askJson(deps, buildAskMessages(prompt, question, focusFinding), parseAnswer, 2500, "ask");
    deps.send({ kind: "review", status: "success", title: "Pergunta respondida" });
    return answer;
  }

  // ---------------------------------------------------------------- describe
  if (req.command === "describe") {
    const describe = await askJson(deps, buildDescribeMessages(prompt), parseDescribe, 2500, "describe");
    const payload: ReviewPayload = { command: "describe", findings: [], describe };
    deps.send({ kind: "review_findings", status: "success", title: describe.title, review: payload });
    return composeReviewReply(payload);
  }

  // ---------------------------------------------------------------- improve (+ autorreflexão)
  if (req.command === "improve") {
    const suggestions = await askJson(deps, buildImproveMessages(prompt, 6), (raw) => parseCodeSuggestions(raw, 8), 5000, "improve");
    let feedback: ReflectionFeedback[] | null = null;
    if (suggestions.length) {
      deps.send({ kind: "review", status: "success", title: `Autorrevisão: dando nota a ${suggestions.length} sugestão(ões)` });
      feedback = await askJson(deps, buildReflectMessages(prompt, suggestions as CodeSuggestion[]), parseReflection, 2500, "reflect")
        .catch((e) => {
          console.warn("[vibe-review] reflection failed:", e instanceof Error ? e.message : e);
          return null;
        });
    }
    const reflected = applyReflection(suggestions, feedback, { threshold: deps.scoreThreshold });
    const findings = sortFindings(validateAll(reflected.findings, files)).slice(0, MAX_FINDINGS);
    const payload: ReviewPayload = { command: "improve", findings, files: filesFor(findings, files), dropped: reflected.dropped };
    deps.send({
      kind: "review_findings",
      status: "success",
      title: findings.length ? `${findings.length} melhoria(s) aprovada(s) na autorrevisão` : "Nenhuma melhoria relevante",
      detail: feedback ? `${reflected.dropped} descartada(s) por nota baixa` : "autorreflexão indisponível: notas padrão",
      review: payload,
    });
    return composeReviewReply(payload);
  }

  // ---------------------------------------------------------------- review / fix_errors
  const messages = req.command === "fix_errors"
    ? buildFixErrorsMessages(prompt, req.errors?.length ? req.errors : ["(o Dev pediu para corrigir erros, mas não mandou o texto do erro)"], 6)
    : buildReviewMessages(prompt, MAX_FINDINGS);
  const parsed = await askJson(
    deps,
    messages,
    (raw) => parseReviewOutput(raw, req.command === "fix_errors" ? "error" : "review", MAX_FINDINGS),
    5000,
    req.command,
  );
  const findings = sortFindings(validateAll(parsed.findings, files));
  const payload: ReviewPayload = {
    command: req.command,
    findings,
    files: filesFor(findings, files),
    summary: parsed.summary,
    riskLevel: parsed.riskLevel,
    securityConcerns: parsed.securityConcerns,
    dropped: parsed.dropped,
  };
  deps.send({
    kind: "review_findings",
    status: "success",
    title: findings.length ? `${findings.length} item(ns) na fila de correções` : "Nenhum problema relevante",
    detail: parsed.riskLevel ? `risco ${parsed.riskLevel}` : undefined,
    review: payload,
  });
  return composeReviewReply(payload);
}
