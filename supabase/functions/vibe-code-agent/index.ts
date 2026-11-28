// deno-lint-ignore-file no-explicit-any
// KUBO Vibe Code Agent v2 — agente de LLM com loop, memória e conversas.
//
//   pedido ─► contexto (memória do Prime + resumo da conversa + histórico
//             + árvore do projeto + conectores) ─► loop do agente:
//                 raciocina ─► lê arquivos (observações voltam ao modelo) ─►
//                 propõe edições ─► auto-revisão (placeholder, segredo, JSON,
//                 sintaxe) ─► auto-reparo (1 rodada) ─► entrega
//             ─► diff/commit + checkpoint ─► requisitos (conectores e APIs)
//             ─► memória e conversa persistidas.
//
// DeepSeek-only (sem fallback), com roteador de complexidade e cobrança de
// créditos em tempo real. O código vive no GitHub (quando configurado) E num
// cofre versionado (vibe_project_files); sem GitHub o cofre é a fonte única.
//
// Vibe Reviewer (body.review): /review, /improve, /describe, /ask, fila de
// erros e "Ajustar" — estrutura portada do PR-Agent (MIT), ver ./review.ts.
//
// Plano (body.plan): grafo de tarefas (conceito à la Task Master, código
// próprio) + executor estilo Plandex (MIT) com mudanças staged, revisão do
// diff pelo Vibe Reviewer e aplicação pelo caminho de "apply" abaixo. Uma
// trava de escritor por conversa impede que executor, fila de correções e
// aplicações manuais gravem ao mesmo tempo. Ver ./plan.ts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { classifyComplexity } from "../_shared/deepseekRouter.ts";
import { GatewayError, inferTaskKind, providersFromProfiles, runGateway, type Provider } from "../_shared/aiGateway.ts";
import { type AgentTier, callWithTierFallback, mapWithConcurrency } from "../_shared/chatOrchestrator.ts";
import {
  applyOverrides,
  creditsFor,
  healthFromRuns,
  MODEL_CATALOG,
  type ModelProfile,
  parsePolicy,
  rankModels,
} from "../_shared/modelRouter.ts";
import { listVisibleSecrets } from "../_shared/kuboSecrets.ts";
import { parseVibeRecord } from "../_shared/vibeRecord.ts";
import { recordGatewayFailure, recordGatewayRun, supabaseGatewayCache } from "../_shared/aiGatewayStore.ts";
import { extractMemories, formatMemoriesForPrompt, loadMemories, saveMemories } from "../_shared/primeMemory.ts";
import {
  buildHistory,
  type ChatMsg,
  composeAgentReply,
  filterRepoTree,
  formatObservations,
  isSafePath,
  lintGeneratedFile,
  type Observation,
  ASK_CHAT_ACTION_LINE,
  ASK_CHAT_RULE,
  USE_BROWSER_ACTION_LINE,
  USE_BROWSER_RULE,
  canUseBrowser,
  parseBrowserRequest,
  canAskChat,
  checkVibeOrigin,
  parseAgentTurn,
  sanitizeMemories,
  titleFromPrompt,
} from "../_shared/vibeAgentCore.ts";
import {
  applyVaultStatus,
  applyConnectionStatus,
  detectRequirements,
  formatConnectorsForPrompt,
  mergeDeclaredRequirements,
} from "../_shared/connectorCatalog.ts";
import {
  auditGeneratedCode,
  buildDesignPrompt,
  formatAuditSummary,
  resolveDesignConfig,
} from "../_shared/designIntelligence.ts";
import { type DevContext, formatDevContext, hashText } from "../_shared/vibeReviewEngine.ts";
import { parseReviewRequest, runReviewCommand } from "./review.ts";
import { formatTaskGraphForPrompt, TaskGraphError } from "../_shared/vibeTaskGraph.ts";
import {
  compactAgentState,
  type HandoffStatus,
  lockBusyMessage,
  mergeHandoff,
  type ModelTier,
  normalizeAgentState,
  parseHandoffNote,
  parseLockOwner,
  readKnobs,
  type WriterKind,
} from "../_shared/vibePlandexEngine.ts";
import { type PlanActionName, PlanError, parsePlanRequest, READ_ONLY_PLAN_ACTIONS, runPlanAction } from "./plan.ts";
import { type ChatDelegateResult, formatChatAnswerForAgent, type RouterCall, runChatDelegation } from "../_shared/chatDelegate.ts";
import { vertalPersonaEnabled, withVertalPersona } from "../_shared/vertalPersona.ts";
import {
  AUTH_KIT_OFFER_PROMPT,
  buildAuthKitFiles,
  formatAuthKitForPrompt,
  isAuthKitPath,
  parseAuthKitRequest,
  resolveManagedAuth,
  wantsAuthKit,
} from "../_shared/vertalAuthKit.ts";
// Conector Vertal AI (flag VERTAL_AI_CONNECTOR_ENABLED, desligada por padrão; ver docs/VERTAL-AI-CONECTOR.md).
import { applyVertalAiToRequirements, isVertalAiPath, vertalAiFilesFor, vertalAiPromptBlock, vertalAiSteps } from "../_shared/vertalAiConnector.ts";
import { vertalAiForRequest } from "../_shared/vertalAiConnectorStore.ts";
import { vertalAiAwarenessFor } from "../_shared/vertalAiChatStore.ts"; // Vertal AI: conectores do Dev (só nomes/status)
import { sanitizeVertalAiReply, vertalAiFixEnvNames } from "../_shared/vertalAiChat.ts"; // Vertal AI: nunca pedir chave/env à mão

/**
 * Ponte Vibe Code → Vertal Chat: pergunta ao creative-router (tool agent_chat,
 * origin 'vibe_code') com o token do próprio usuário. O creative-router filtra as
 * ferramentas (só leitura/pesquisa/imagem) e cobra pelos caminhos de sempre.
 */
async function runDelegatedChat(token: string, question: string, context?: string, signal?: AbortSignal): Promise<ChatDelegateResult> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/creative-router`;
  const router: RouterCall = async (payload) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      },
      body: JSON.stringify(payload),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: "invalid_json" };
    }
    return { status: res.status, data };
  };
  return await runChatDelegation(question, router, { context });
}

/** Erro com mensagem já pronta para o Dev (pt-BR). */
class UserFacingError extends Error {}

/** O Dev apertou "Parar" (o cliente abortou a requisição): sai sem cobrar nem commitar. */
class AbortedByUserError extends Error {}

/** Leituras de arquivo de uma mesma volta rodam em paralelo, até este limite. */
const READ_CONCURRENCY = 4;

const WRITER_FOR_ACTION: Partial<Record<PlanActionName, WriterKind>> = {
  debug: "debug",
  rewind: "rewind",
  stage_edit: "fix_queue",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GH_API = "https://api.github.com";
const CREDIT_COST = { flash: 1, pro: 4 } as const;
const MAX_TURNS = 5; // leituras + auto-reparo
const MAX_REPAIRS = 1;
const MAX_PROMPT_CHARS = 8000;
const MAX_STEP_CONTENT = 60000;
const MAX_STORED_STEPS = 200;

// ---------------------------------------------------------------------------
// Armazenamento de arquivos: GitHub (quando configurado) + cofre versionado
// ---------------------------------------------------------------------------

interface FileStore {
  mode: "github" | "vault";
  label: string;
  list(): Promise<string[]>;
  read(path: string): Promise<{ content: string; sha?: string }>;
  write(path: string, content: string, message: string): Promise<string | undefined>;
  revert(sha: string): Promise<string[]>;
}

function b64decode(s: string) {
  return new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
}
function b64encode(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function githubConfig() {
  const token = Deno.env.get("GITHUB_TOKEN");
  const repo = Deno.env.get("GITHUB_REPO");
  if (!token || !repo) return null;
  return { token, repo, branch: Deno.env.get("GITHUB_BRANCH") ?? "main" };
}

async function vaultInsert(
  admin: any,
  userId: string,
  projectId: string | null,
  conversationId: string | null,
  path: string,
  content: string,
  commitSha: string | null,
): Promise<string | undefined> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let q = admin
      .from("vibe_project_files")
      .select("version")
      .eq("user_id", userId)
      .eq("path", path)
      .order("version", { ascending: false })
      .limit(1);
    q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
    const { data: latest } = await q;
    const version = ((latest?.[0]?.version as number | undefined) ?? 0) + 1;
    const { data, error } = await admin
      .from("vibe_project_files")
      .insert({
        user_id: userId,
        project_id: projectId,
        conversation_id: conversationId,
        path,
        content: content.slice(0, 500000),
        version,
        commit_sha: commitSha,
      })
      .select("id")
      .single();
    if (!error) return data?.id as string;
    if (error.code !== "23505") throw new Error(`vault_write_failed: ${error.message}`);
  }
  throw new Error("vault_write_conflict");
}

function makeStore(admin: any, userId: string, projectId: string | null, conversationId: string | null): FileStore {
  const vaultScope = (q: any) => (projectId ? q.eq("project_id", projectId) : q.is("project_id", null));

  const vaultRead = async (path: string) => {
    const { data } = await vaultScope(
      admin.from("vibe_project_files").select("id, content").eq("user_id", userId).eq("path", path)
        .order("version", { ascending: false }).limit(1),
    );
    const row = data?.[0];
    return row ? { content: row.content as string, sha: `vault:${row.id}` } : { content: "", sha: undefined };
  };

  const gh = githubConfig();
  if (!gh) {
    return {
      mode: "vault",
      label: `cofre:${projectId ?? userId}`,
      async list() {
        const { data } = await vaultScope(
          admin.from("vibe_project_files").select("path").eq("user_id", userId).limit(1000),
        );
        return [...new Set<string>((data ?? []).map((r: any) => r.path))].sort();
      },
      read: vaultRead,
      async write(path, content) {
        const id = await vaultInsert(admin, userId, projectId, conversationId, path, content, null);
        return id ? `vault:${id}` : undefined;
      },
      async revert(sha) {
        const id = sha.replace(/^vault:/, "");
        const { data: row } = await admin
          .from("vibe_project_files").select("path, version").eq("id", id).eq("user_id", userId).maybeSingle();
        if (!row) throw new Error("checkpoint_not_found");
        const { data: prev } = await vaultScope(
          admin.from("vibe_project_files").select("content").eq("user_id", userId).eq("path", row.path)
            .eq("version", row.version - 1).limit(1),
        );
        await vaultInsert(admin, userId, projectId, conversationId, row.path, prev?.[0]?.content ?? "", null);
        return [row.path as string];
      },
    };
  }

  const ghFetch = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`${GH_API}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${gh.token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`github_${r.status}: ${text.slice(0, 400)}`);
    return text ? JSON.parse(text) : {};
  };

  const read = async (path: string) => {
    try {
      const data = await ghFetch(`/repos/${gh.repo}/contents/${encodeURI(path)}?ref=${gh.branch}`);
      return { content: b64decode(data.content ?? ""), sha: data.sha as string };
    } catch (e) {
      if (String(e).includes("github_404")) return { content: "", sha: undefined };
      throw e;
    }
  };

  const write = async (path: string, content: string, message: string) => {
    const existing = await read(path);
    const res = await ghFetch(`/repos/${gh.repo}/contents/${encodeURI(path)}`, {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: b64encode(content),
        branch: gh.branch,
        ...(existing.sha ? { sha: existing.sha } : {}),
      }),
    });
    const commitSha = res.commit?.sha as string | undefined;
    // Espelha no cofre: o código fica guardado mesmo se o GitHub sair do ar.
    await vaultInsert(admin, userId, projectId, conversationId, path, content, commitSha ?? null)
      .catch((e) => console.warn("[vibe-code-agent] vault mirror failed:", e instanceof Error ? e.message : e));
    return commitSha;
  };

  return {
    mode: "github",
    label: gh.repo,
    async list() {
      const tree = await ghFetch(`/repos/${gh.repo}/git/trees/${gh.branch}?recursive=1`);
      return ((tree.tree ?? []) as Array<{ path: string; type: string }>)
        .filter((n) => n.type === "blob")
        .map((n) => n.path);
    },
    read,
    write,
    async revert(sha) {
      const commit = await ghFetch(`/repos/${gh.repo}/commits/${sha}`);
      const parent = commit.parents?.[0]?.sha;
      if (!parent) throw new Error("commit_has_no_parent");
      const files: Array<{ filename: string }> = commit.files ?? [];
      for (const f of files) {
        let previous = "";
        try {
          const prev = await ghFetch(`/repos/${gh.repo}/contents/${encodeURI(f.filename)}?ref=${parent}`);
          previous = b64decode(prev.content ?? "");
        } catch {
          previous = "";
        }
        await write(f.filename, previous, `revert: ${f.filename} (${sha.slice(0, 7)})`);
      }
      return files.map((f) => f.filename);
    },
  };
}

function makeDiff(oldText: string, newText: string, path: string) {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const out: string[] = [`--- a/${path}`, `+++ b/${path}`];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) out.push(`-${a[i]}`);
    if (b[i] !== undefined) out.push(`+${b[i]}`);
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Conectores já ligados pelo usuário
// ---------------------------------------------------------------------------

async function loadConnectedSlugs(admin: any, userId: string): Promise<string[]> {
  const has = async (table: string) => {
    const { data, error } = await admin.from(table).select("id").eq("user_id", userId).limit(1);
    return !error && (data ?? []).length > 0;
  };
  const [github, gmail, stripe, render, web3, credentials] = await Promise.all([
    has("github_connections"),
    has("gmail_accounts"),
    has("connected_accounts"),
    has("render_connections"),
    has("web3_connections"),
    admin.from("api_credentials").select("connector_slug").eq("user_id", userId).limit(100),
  ]);
  const slugs = new Set<string>();
  if (github) slugs.add("github");
  if (gmail) slugs.add("gmail");
  if (stripe) slugs.add("stripe");
  if (render) slugs.add("render");
  if (web3) slugs.add("web3");
  for (const row of credentials?.data ?? []) slugs.add(row.connector_slug);
  return [...slugs];
}

// ---------------------------------------------------------------------------
// Persona e protocolo do agente
// ---------------------------------------------------------------------------

const SYSTEM = `Você é o KUBO Vibe Code Agent: um engenheiro de software sênior (nível top 100) e arquiteto de produto, trabalhando num projeto web (Vite + React + TypeScript + Tailwind; backend em edge functions).
Você trabalha em voltas. A cada volta responda com UM objeto JSON ESTRITO (sem texto fora do JSON):
{
  "thought": "raciocínio curto em português do que você entendeu e vai fazer (máx. 300 caracteres)",
  "summary": "resumo do plano ou do que foi feito, curto",
  "actions": [
    {"type":"read_file","path":"src/..","reason":"por que preciso ler"},
    {"type":"edit_file","path":"src/..","reason":"o que muda","content":"CONTEÚDO FINAL COMPLETO do arquivo"},
    {"type":"message","reason":"nota ao usuário"},
    {"type":"ask_user","reason":"pergunta objetiva, só se for impossível decidir sozinho"},
    ${ASK_CHAT_ACTION_LINE},
    ${USE_BROWSER_ACTION_LINE}
  ],
  "requirements": [{"slug":"stripe","reason":"cobrança mensal"},{"name":"API de Frete","secrets":["FRETE_API_KEY"],"reason":"calcular frete"}],
  "memories": [{"scope":"user|project","kind":"preference|constraint|architecture|design|integration|decision|note","content":"fato durável"}],
  "conversation_summary": "resumo atualizado da conversa inteira (máx. 600 caracteres)",
  "title": "título curto da conversa (máx. 60 caracteres)",
  "final": true
}
Como trabalhar:
1. Se precisar entender código existente, devolva só read_file e "final": false. Você receberá o conteúdo e continuará. Leia o necessário e nada além; não invente caminhos que não estão na árvore.
2. Quando tiver o que precisa, entregue os edit_file com "final": true. Cada edit_file traz o arquivo FINAL COMPLETO: nunca diffs, nunca "..." ou "resto do código", zero TODO, zero catch vazio. Código pronto para produção, tipado, acessível, reaproveitando os padrões e design tokens do projeto.
3. "requirements": liste os conectores e APIs que esta aplicação exige para funcionar, usando os slugs do catálogo quando existirem; para APIs fora do catálogo use "name" e os nomes exatos dos segredos. Nunca peça nem escreva chaves, tokens ou senhas no código: use variáveis de ambiente. As chaves ficam guardadas no Cofre de segredos do Vertal (/secrets); quando faltar uma, diga em "message" o nome exato da variável que o usuário deve guardar lá.
4. "memories": só fatos duráveis e úteis em conversas futuras (preferências, restrições, decisões de arquitetura). Nada de segredos, nada efêmero.
5. Respeite a memória do Prime e o histórico: não refaça o que já foi feito, não contradiga decisões anteriores sem avisar.
6. Pedido ambíguo e caro de errar: use ask_user (uma pergunta) em vez de chutar. Pedido claro: execute.
7. Você não executa comandos; diga em "message" o que depender do usuário (credencial, decisão, deploy). ${ASK_CHAT_RULE}
8. Você conversa com o usuário: "summary" é a sua resposta direta a ele, em português, em 1 a 3 frases. Se o pedido for só uma pergunta ou conversa, responda em "summary" (e em "message" se precisar de mais) sem editar arquivos.
9. Para APIs fora do catálogo, inclua em "requirements" "key_url" (página oficial onde se gera a chave) e "site_url" (página oficial de cadastro), só https e só sites oficiais. Nunca invente um link que você não tem certeza que é oficial: deixe sem.
10. Seja educado, claro e direto, como um engenheiro sênior gentil: diga o que fez, o que falta e o próximo passo.
11. ${USE_BROWSER_RULE}`;

/** Saúde recente dos modelos (todas as execuções da plataforma, últimos 7 dias). */
async function loadModelHealth(admin: any) {
  const since = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
  const { data } = await admin
    .from("ai_gateway_runs")
    .select("status, model, attempts")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(400);
  return healthFromRuns(data ?? []);
}

/** Até 2 lições curtas a partir dos problemas que a auto-revisão encontrou. */
function lessonsFromProblems(problems: string[]): string[] {
  const out: string[] = [];
  for (const raw of problems) {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const lesson = `Lição aprendida: ao gerar código, evite repetir este problema — ${text}`.slice(0, 220);
    if (!out.includes(lesson)) out.push(lesson);
    if (out.length >= 2) break;
  }
  return out;
}

/**
 * Orquestrador de modelos: o mais adequado (custo x qualidade x saúde) para o pedido.
 * VIBE_AGENT_MODEL_POLICY=deepseek_only volta ao comportamento antigo sem deploy.
 */
async function routeModels(admin: any, prompt: string, tier: "flash" | "pro") {
  const policy = parsePolicy(Deno.env.get("VIBE_AGENT_MODEL_POLICY"));
  let routedProviders: Provider[] | undefined;
  let chosen: ModelProfile | null = null;
  let chosenReason = "";
  if (policy !== "deepseek_only") {
    const catalog = applyOverrides(MODEL_CATALOG, Deno.env.get("VIBE_MODEL_OVERRIDES"));
    const availableKeys = new Set(catalog.map((p) => p.keyEnv).filter((k) => !!Deno.env.get(k)));
    const health = await loadModelHealth(admin).catch(() => ({}));
    const routingKind = inferTaskKind(prompt);
    const ranked = rankModels({
      kind: routingKind === "chat" || routingKind === "marketing" || routingKind === "classify" ? "code" : routingKind,
      tier,
      policy,
      availableKeys,
      health,
      needJson: true,
      catalog,
    });
    if (ranked.length) {
      chosen = ranked[0].profile;
      chosenReason = ranked[0].reason;
      routedProviders = providersFromProfiles(ranked.slice(0, 3).map((r) => r.profile), tier);
    }
  }
  return { routedProviders, chosen, chosenReason };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "missing_authorization" });

  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userRes?.user) return json(401, { error: "invalid_token" });
  const userId = userRes.user.id;

  const admin: any = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  let body: {
    projectId?: string;
    conversationId?: string;
    prompt?: string;
    mode?: "preview" | "apply";
    /** baseHash: hash do arquivo quando a correção foi calculada (recusa se mudou por baixo). */
    apply?: Array<{ path: string; content: string; baseHash?: string }>;
    /** Quem está gravando (trava de escritor por conversa): fix_queue | manual. */
    lockKind?: string;
    /** Ação do plano/executor (grafo de tarefas + mudanças staged). */
    plan?: unknown;
    revertSha?: string;
    revertCheckpointId?: string;
    /** false desliga o Vertal Design Intelligence só neste pedido. */
    designIntelligence?: boolean;
    /** Força o perfil de design (web_app | saas_dashboard | mobile_app | landing_page). */
    designSurface?: string;
    /** Comando do Vibe Reviewer (PR-Agent): review | improve | describe | ask | fix_errors | adjust. */
    review?: unknown;
    /** Contexto do Dev: erros recentes, arquivo aberto, decisões da fila de correções. */
    devContext?: DevContext;
    /** Quem chamou: "vertal_chat" quando o Vertal Chat delega (profundidade 1, só preview/perguntas). */
    origin?: string;
    delegationDepth?: number;
    delegate?: unknown;
    /** Conversa do Vertal Chat que delegou (vai para agent_state.handoff). */
    chatConversationId?: string;
    /** Atualiza agent_state.handoff sem rodar o agente: {action:"note", goal?, status?, lastSummary?, ...}. */
    handoff?: unknown;
    /** Fase 4: grava uma troca feita no chat (/navegar, /github, navegador do agente) sem rodar o agente. */
    record?: unknown;
    /** Login com Google gerenciado pelo Vertal: {enabled, appName?, branding?, logoUrl?, termsAccepted?, termsVersion?}. */
    authKit?: unknown;
    /** Conector Vertal AI: {enabled:true} = o Dev aceitou (ativa de forma idempotente). Só vale com a flag ligada. */
    vertalAi?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json_body" });
  }
  const originCheck = checkVibeOrigin(body as Record<string, unknown>);
  if (!originCheck.ok) return json(400, { error: originCheck.error });
  const origin = originCheck.origin;

  // Limite por usuário: o loop faz várias chamadas ao modelo por pedido.
  try {
    const { data: rl } = await admin.rpc("bump_rate_limit", {
      _bucket: "vibe_code_agent",
      _user: userId,
      _window_seconds: 60,
    });
    if (typeof rl === "number" && rl > 20) return json(429, { error: "rate_limited" });
  } catch (e) {
    console.warn("[vibe-code-agent] rate-limit check failed:", e instanceof Error ? e.message : e);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let seq = 0;
      const recorded: Array<Record<string, unknown>> = [];
      const send = (event: Record<string, unknown>) => {
        const full: Record<string, unknown> = { id: `s${++seq}`, ...event };
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(full)}\n\n`));
        } catch {
          /* cliente desconectou (ex.: "Parar"): o histórico abaixo ainda é gravado */
        }
        if (recorded.length < MAX_STORED_STEPS) {
          const review = full.review as { files?: unknown } | undefined;
          recorded.push({
            ...full,
            // A cópia dos arquivos da fila serve só ao stream ao vivo; não vai para o histórico.
            ...(review && typeof review === "object" && review.files ? { review: { ...review, files: undefined } } : {}),
            // O estado do plano vive em vibe_conversations.agent_state; não duplica no histórico.
            ...(full.planState ? { planState: undefined } : {}),
            ...(typeof full.proposedContent === "string"
              ? { proposedContent: (full.proposedContent as string).slice(0, MAX_STEP_CONTENT) }
              : {}),
          });
        }
      };

      let conversationId: string | null = null;
      let userPrompt: string | null = null;
      // Resposta em texto do agente: vira o balão do chat e o content da mensagem guardada.
      let replyText = "";
      let conversationPatch: Record<string, unknown> = {};
      let projectId: string | null = null;
      // A origem fica gravada nos passos da mensagem (sem migração).
      if (origin === "vertal_chat") send({ kind: "message", status: "success", title: "Pedido vindo do Vertal Chat", origin });

      const chargeCredits = async (amount: number, reason: string, metadata: Record<string, unknown>) => {
        const { data, error } = await admin.rpc("execute_atomic_credit_deduction", {
          _user_id: userId,
          _amount: amount,
          _reason: reason,
          _category: "vibe_code_agent",
          _metadata: metadata,
          _idempotency_key: `vibe-${userId}-${crypto.randomUUID()}`,
        });
        if (error) throw new Error(error.message ?? "credit_deduction_failed");
        const balanceAfter = (data as { balance_after?: number })?.balance_after;
        send({ kind: "credits", status: "success", title: `-${amount} créditos`, creditsCharged: amount, balanceAfter });
        return balanceAfter;
      };

      const resolveConversation = async (create: boolean, prompt?: string) => {
        if (typeof body.conversationId === "string" && UUID_RE.test(body.conversationId)) {
          const { data } = await admin
            .from("vibe_conversations")
            .select("id, title, summary, message_count, project_id")
            .eq("id", body.conversationId)
            .eq("user_id", userId)
            .maybeSingle();
          if (data) return data as { id: string; title: string; summary: string | null; message_count: number; project_id: string | null };
        }
        if (!create) return null;
        const title = titleFromPrompt(prompt ?? "");
        const { data, error } = await admin
          .from("vibe_conversations")
          .insert({ user_id: userId, project_id: projectId, title })
          .select("id, title, summary, message_count, project_id")
          .single();
        if (error) {
          // Tabelas de conversa ainda não migradas: segue sem salvar a conversa.
          console.warn("[vibe-code-agent] conversation unavailable:", error.message);
          return null;
        }
        send({ kind: "conversation", status: "success", title, conversationId: data.id, isNew: true });
        return data as { id: string; title: string; summary: string | null; message_count: number; project_id: string | null };
      };

      const knobs = readKnobs((k) => Deno.env.get(k));
      let releaseLock: () => Promise<void> = async () => {};
      /** false = não grava esta troca na conversa (ex.: só carregar o estado do plano). */
      let persist = true;

      /**
       * Trava de escritor único por conversa (vibe_conversations.writer_lock_*):
       * executor, fila de correções, aplicações manuais, auto-debug e rewind
       * nunca gravam ao mesmo tempo. Sem a migração, segue sem trava no servidor
       * (o chat ainda serializa as escritas do lado do cliente).
       */
      const acquireWriterLock = async (convId: string | null, kind: WriterKind) => {
        if (!convId) return;
        const owner = `${kind}:${crypto.randomUUID()}`;
        const nowIso = new Date().toISOString();
        const until = new Date(Date.now() + knobs.lockTtlSeconds * 1000).toISOString();
        const { data, error } = await admin
          .from("vibe_conversations")
          .update({ writer_lock_owner: owner, writer_lock_until: until })
          .eq("id", convId)
          .eq("user_id", userId)
          .or(`writer_lock_until.is.null,writer_lock_until.lt."${nowIso}"`)
          .select("id");
        if (error) {
          console.warn("[vibe-code-agent] writer lock unavailable:", error.message);
          return;
        }
        if (!data?.length) {
          const { data: row } = await admin.from("vibe_conversations").select("writer_lock_owner").eq("id", convId).eq("user_id", userId).maybeSingle();
          if (!row) return;
          const held = parseLockOwner(row.writer_lock_owner as string | null);
          throw new UserFacingError(lockBusyMessage({ kind: held?.kind ?? "executor" }));
        }
        releaseLock = async () => {
          await admin
            .from("vibe_conversations")
            .update({ writer_lock_owner: null, writer_lock_until: null })
            .eq("id", convId)
            .eq("writer_lock_owner", owner);
        };
      };

      /** Resumo do plano da conversa, para o agente e o revisor saberem o que está em andamento. */
      const loadPlanSummary = async (convId: string | null) => {
        if (!convId) return "";
        const { data, error } = await admin.from("vibe_conversations").select("agent_state").eq("id", convId).maybeSingle();
        if (error || !data?.agent_state) return "";
        const st = normalizeAgentState(data.agent_state, knobs);
        const current = st.graph?.tasks.find((t) => t.status === "in-progress")?.id;
        const text = formatTaskGraphForPrompt(st.graph, current, 1500);
        return text ? `\n\n${text}` : "";
      };

      /**
       * Passagem de bastão Chat ↔ Vibe Code: grava agent_state.handoff (sem migração;
       * a coluna agent_state já existe). Lê, normaliza (preserva o resto do estado) e mescla.
       * Sem a coluna/conversa, só avisa no log: nunca derruba o pedido.
       */
      const saveHandoff = async (convId: string | null, patch: Parameters<typeof mergeHandoff>[1]) => {
        if (!convId) return null;
        const { data, error } = await admin.from("vibe_conversations").select("agent_state").eq("id", convId).eq("user_id", userId).maybeSingle();
        if (error || !data) {
          if (error) console.warn("[vibe-code-agent] handoff unavailable:", error.message);
          return null;
        }
        const state = normalizeAgentState(data.agent_state, knobs);
        const next = { ...state, handoff: mergeHandoff(state.handoff, patch) };
        const { error: upErr } = await admin
          .from("vibe_conversations")
          .update({ agent_state: compactAgentState(next) })
          .eq("id", convId)
          .eq("user_id", userId);
        if (upErr) {
          console.warn("[vibe-code-agent] handoff save failed:", upErr.message);
          return null;
        }
        return next.handoff;
      };

      /**
       * O caminho de "apply": checagem estática, conferência de hash (o arquivo
       * não pode ter mudado desde que a correção foi calculada), créditos,
       * commit e checkpoint. Usado pelo "Aplicar" do chat, pela fila de
       * correções e pelo executor do plano.
       */
      const applyFiles = async (store: FileStore, files: Array<{ path: string; content: string; baseHash?: string }>, meta: { summary?: string; reason: string }) => {
        for (const f of files) {
          if (!isSafePath(f.path)) throw new Error(`arquivo_recusado:${f.path}: caminho não permitido`);
          let problems = lintGeneratedFile(f.path, f.content).filter((p) => !p.startsWith("sintaxe"));
          const needsCurrent = problems.length > 0 || typeof f.baseHash === "string";
          const current = needsCurrent ? await store.read(f.path).catch(() => ({ content: "" })) : { content: "" };
          if (typeof f.baseHash === "string") {
            const currentHash = current.content === "" ? "" : hashText(current.content);
            if (currentHash !== f.baseHash) {
              throw new UserFacingError(`${f.path} mudou depois que esta correção foi calculada (outra ação gravou nele). Rode a revisão de novo para recalcular em cima da versão atual.`);
            }
          }
          if (problems.length && current.content) {
            // Correção pontual (fila do revisor) num arquivo que JÁ tinha o problema
            // (ex.: um TODO antigo): não barra pelo que não foi introduzido agora.
            const before = new Set(lintGeneratedFile(f.path, current.content));
            problems = problems.filter((p) => !before.has(p));
          }
          if (problems.length) throw new Error(`arquivo_recusado:${f.path}: ${problems.join("; ")}`);
        }

        const tier = classifyComplexity(files.map((f) => f.path).join(" "));
        const cost = CREDIT_COST[tier];
        await chargeCredits(cost, meta.reason, { tier, files: files.length });

        const committedFiles: string[] = [];
        const fileShas: Record<string, string> = {};
        let lastSha: string | undefined;
        for (const file of files) {
          send({ kind: "commit", status: "running", title: `Commitando ${file.path}`, path: file.path });
          const sha = await store.write(file.path, file.content, `vibe: ${meta.summary ? meta.summary.slice(0, 120) : `update ${file.path}`}`);
          lastSha = sha ?? lastSha;
          if (sha) fileShas[file.path] = sha;
          committedFiles.push(file.path);
          const repoUrl = store.mode === "github" && sha ? `https://github.com/${store.label}/blob/${sha}/${file.path}` : undefined;
          send({
            kind: "commit",
            status: "success",
            title: `Commitado ${file.path}`,
            path: file.path,
            commitSha: sha,
            proposedContent: file.content,
            repoUrl,
          });
        }

        let checkpointId: string | undefined;
        if (lastSha) {
          const { data: checkpoint } = await admin
            .from("vibe_checkpoints")
            .insert({
              user_id: userId,
              project_repo: store.label,
              commit_sha: lastSha,
              summary: meta.summary ?? `Aplicado: ${committedFiles.join(", ")}`,
              files_changed: committedFiles,
              credits_spent: cost,
              model_used: tier,
            })
            .select("id")
            .single();
          checkpointId = checkpoint?.id as string | undefined;
          send({ kind: "checkpoint", status: "success", title: "Checkpoint salvo", checkpointId, commitSha: lastSha });
        }
        return { checkpointId, commitSha: lastSha, fileShas, files: committedFiles, cost };
      };

      try {
        if (typeof body.projectId === "string" && UUID_RE.test(body.projectId)) {
          const { data: proj } = await userClient.from("projects").select("id").eq("id", body.projectId).maybeSingle();
          projectId = proj?.id ?? null;
        }

        // ------------------------------------------------------------------
        // Registro (fase 4): troca feita no chat do Vibe Code (/navegar, /github,
        // navegador pedido pelo agente). Só grava na conversa: sem modelo, sem créditos.
        // ------------------------------------------------------------------
        if (body.record !== undefined) {
          if (origin === "vertal_chat") throw new UserFacingError("Registro de conversa só pelo próprio Vibe Code.");
          const rec = parseVibeRecord(body.record);
          if (!rec) throw new UserFacingError("Registro inválido: envie prompt, reply e passos.");
          const conv = await resolveConversation(true, rec.prompt ?? rec.reply);
          conversationId = conv?.id ?? null;
          if (!conversationId) throw new UserFacingError("Não consegui abrir a conversa para guardar esta troca.");
          userPrompt = rec.prompt ?? null;
          replyText = rec.reply;
          send({ kind: "done", status: "success", title: "Troca registrada na conversa" });
          // O histórico guarda só os passos enviados (cartão do navegador, resposta do GitHub…).
          recorded.splice(0, recorded.length, ...rec.steps.map((st, i) => ({ id: `rec${i + 1}`, ...st })));
          return;
        }

        // ------------------------------------------------------------------
        // Handoff: só anota agent_state.handoff (não roda o agente, não cobra)
        // ------------------------------------------------------------------
        if (body.handoff !== undefined) {
          const patch = parseHandoffNote(body.handoff);
          if (!patch) throw new UserFacingError("Handoff inválido: use {action:\"note\"} com goal, status, lastSummary, chatConversationId ou origin.");
          persist = false;
          const conv = await resolveConversation(false);
          conversationId = conv?.id ?? null;
          if (!conversationId) throw new UserFacingError("Não encontrei a conversa do Vibe Code para anotar o handoff.");
          const saved = await saveHandoff(conversationId, patch);
          if (!saved) throw new UserFacingError("Não consegui gravar o handoff desta conversa.");
          send({ kind: "handoff", status: "success", title: "Handoff atualizado", handoff: saved, conversationId });
          send({ kind: "done", status: "success", title: "Handoff anotado" });
          return;
        }

        // ------------------------------------------------------------------
        // Reverter checkpoint / commit
        // ------------------------------------------------------------------
        if (body.revertCheckpointId || body.revertSha) {
          const conv = await resolveConversation(false);
          conversationId = conv?.id ?? null;
          await acquireWriterLock(conversationId, "rewind");
          const store = makeStore(admin, userId, projectId, conversationId);

          let sha = body.revertSha;
          if (body.revertCheckpointId) {
            const { data: cp, error } = await admin
              .from("vibe_checkpoints")
              .select("id, commit_sha")
              .eq("id", body.revertCheckpointId)
              .eq("user_id", userId)
              .maybeSingle();
            if (error || !cp) throw new Error("checkpoint_not_found");
            sha = cp.commit_sha;
          }
          if (!sha) throw new Error("missing_sha_or_checkpoint");

          send({ kind: "commit", status: "running", title: `Revertendo ${sha.replace(/^vault:/, "").slice(0, 7)}` });
          const files = await store.revert(sha);
          send({ kind: "commit", status: "success", title: `Revertido ${sha.replace(/^vault:/, "").slice(0, 7)}`, detail: files.join(", ") });

          if (body.revertCheckpointId) {
            await admin.from("vibe_checkpoints").insert({
              user_id: userId,
              project_repo: store.label,
              commit_sha: sha,
              parent_sha: null,
              summary: "Revertido: checkpoint anterior",
              files_changed: files,
              credits_spent: 0,
              reverted_checkpoint_id: body.revertCheckpointId,
            });
          }
          replyText = files.length
            ? `Desfiz a alteração e voltei ${files.length} arquivo(s) ao estado anterior: ${files.slice(0, 6).map((p) => `\`${p}\``).join(", ")}.`
            : "Desfiz a alteração.";
          send({ kind: "reply", status: "success", title: "Resposta do agente", detail: replyText });
          send({ kind: "done", status: "success", title: "Revert concluído" });
          return;
        }

        // ------------------------------------------------------------------
        // Aplicar o que foi pré-visualizado
        // ------------------------------------------------------------------
        if (body.apply?.length) {
          const conv = await resolveConversation(false);
          conversationId = conv?.id ?? null;
          await acquireWriterLock(conversationId, body.lockKind === "fix_queue" ? "fix_queue" : "manual");
          const store = makeStore(admin, userId, projectId, conversationId);

          const result = await applyFiles(store, body.apply, { reason: "vibe_code_agent:apply" });
          replyText = composeAgentReply({
            notes: [],
            questions: [],
            files: result.files.map((path) => ({ path })),
            mode: "apply",
            rejected: [],
            pendingRequirements: [],
          });
          send({ kind: "reply", status: "success", title: "Resposta do agente", detail: replyText });
          send({ kind: "done", status: "success", title: "Alterações aplicadas" });
          return;
        }

        // ------------------------------------------------------------------
        // Plano: grafo de tarefas ─► executor (staged) ─► revisão do diff ─►
        // aprovação ─► apply + checkpoint ─► próxima tarefa. Ver ./plan.ts.
        // ------------------------------------------------------------------
        if (body.plan !== undefined) {
          const planReq = parsePlanRequest(body.plan);
          if (!planReq) throw new Error("plan_invalid_action");
          const label = (body.prompt ?? "").trim().slice(0, MAX_PROMPT_CHARS) || `/plano ${planReq.action}`;
          persist = planReq.action !== "state";
          userPrompt = label;
          const conv = await resolveConversation(planReq.action === "create", planReq.prompt ?? label);
          conversationId = conv?.id ?? null;
          if (!conversationId) throw new UserFacingError("Não consegui abrir uma conversa para guardar o plano. Abra ou crie uma conversa e tente de novo.");

          const { data: stateRow, error: stateErr } = await admin
            .from("vibe_conversations")
            .select("agent_state")
            .eq("id", conversationId)
            .eq("user_id", userId)
            .maybeSingle();
          if (stateErr) {
            throw new UserFacingError("O plano precisa da migração 20261114030000_vibe_agent_state (colunas agent_state e writer_lock_*) aplicada no Supabase.");
          }
          if (!READ_ONLY_PLAN_ACTIONS.has(planReq.action)) {
            await acquireWriterLock(conversationId, WRITER_FOR_ACTION[planReq.action] ?? "executor");
          }
          const store = makeStore(admin, userId, projectId, conversationId);
          const memories = planReq.action === "create" || planReq.action === "next" || planReq.action === "debug" || planReq.action === "expand"
            ? await loadMemories(admin, userId, projectId).catch(() => [])
            : [];

          // Roteador de modelos por tier, resolvido uma vez por pedido.
          const routes = new Map<ModelTier, ReturnType<typeof routeModels>>();
          const routeFor = (tier: ModelTier) => {
            if (!routes.has(tier)) routes.set(tier, routeModels(admin, label, tier));
            return routes.get(tier)!;
          };

          const result = await runPlanAction(planReq, {
            knobs,
            state: normalizeAgentState(stateRow?.agent_state, knobs),
            list: () => store.list(),
            read: (path) => store.read(path),
            lint: lintGeneratedFile,
            send,
            shared: {
              memories: formatMemoriesForPrompt(memories),
              dev: formatDevContext(body.devContext),
              conversationSummary: conv?.summary ?? null,
            },
            callModel: async (messages, { tier, maxTokens, label: step, role }) => {
              const { routedProviders, chosen } = await routeFor(tier);
              send({ kind: "thinking", status: "running", title: `${role === "reviewer" ? "Vibe Reviewer" : "Executor"}: ${step}` });
              let llm;
              try {
                llm = await runGateway(
                  {
                    kind: "code",
                    tier,
                    ...(routedProviders?.length ? { providers: routedProviders } : { deepseekOnly: true }),
                    json: true,
                    maxTokens,
                    temperature: 0.2,
                    noCache: true,
                    messages,
                  },
                  { cache: supabaseGatewayCache(admin) },
                );
              } catch (err) {
                await recordGatewayFailure(admin, userId, projectId, "code", err).catch(() => {});
                throw err;
              }
              await recordGatewayRun(admin, userId, projectId, llm).catch(() => null);
              send({
                kind: "thinking",
                status: "success",
                title: `${role === "reviewer" ? "Vibe Reviewer" : "Executor"}: ${step}`,
                detail: `${chosen ? `${chosen.label} · ` : ""}${llm.provider} · ${llm.model} (${llm.tier}) · ~$${llm.costUsd.toFixed(4)}`,
                tier: llm.tier,
              });
              return llm.content;
            },
            applyFiles: (files, meta) => applyFiles(store, files, { summary: meta.summary, reason: "vibe_code_agent:plan_apply" }),
            revert: async (entry) => {
              const shas = entry.fileShas && Object.keys(entry.fileShas).length
                ? Object.values(entry.fileShas)
                : entry.commitSha
                  ? [entry.commitSha]
                  : [];
              if (!shas.length) throw new UserFacingError("Esta aplicação não tem commit registrado; não dá para desfazer pelo plano.");
              const files: string[] = [];
              for (const sha of [...shas].reverse()) {
                send({ kind: "commit", status: "running", title: `Revertendo ${sha.replace(/^vault:/, "").slice(0, 7)}` });
                for (const f of await store.revert(sha)) if (!files.includes(f)) files.push(f);
              }
              send({ kind: "commit", status: "success", title: `Revertido ${files.length} arquivo(s)`, detail: files.join(", ") });
              if (entry.checkpointId) {
                await admin.from("vibe_checkpoints").insert({
                  user_id: userId,
                  project_repo: store.label,
                  commit_sha: entry.commitSha ?? shas[shas.length - 1],
                  parent_sha: null,
                  summary: "Revertido pelo plano (/voltar)",
                  files_changed: files,
                  credits_spent: 0,
                  reverted_checkpoint_id: entry.checkpointId,
                });
              }
              return files;
            },
            saveState: async (next) => {
              const { error } = await admin
                .from("vibe_conversations")
                .update({ agent_state: compactAgentState(next) })
                .eq("id", conversationId)
                .eq("user_id", userId);
              if (error) throw new Error(`plan_state_save_failed: ${error.message}`);
            },
            chargeCredits: async (amount, reason) => {
              await chargeCredits(amount, reason, { action: planReq.action });
            },
          });
          replyText = result.reply;
          send({ kind: "reply", status: "success", title: "Resposta do agente", detail: replyText });
          send({ kind: "done", status: "success", title: result.continueNext ? "Tarefa concluída — seguindo para a próxima" : "Plano atualizado" });
          return;
        }

        // ------------------------------------------------------------------
        // Vibe Reviewer (PR-Agent): revisão, melhorias, descrição, perguntas,
        // fila de erros e ajuste de uma correção. Não grava nada: as correções
        // são aplicadas uma a uma pelo Dev pelo caminho "apply" acima.
        // ------------------------------------------------------------------
        if (body.review !== undefined) {
          const reviewReq = parseReviewRequest(body.review);
          if (!reviewReq) throw new Error("review_invalid_command");
          const label = (body.prompt ?? "").trim().slice(0, MAX_PROMPT_CHARS) || `/${reviewReq.command}`;
          userPrompt = label;
          const conv = await resolveConversation(true, label);
          conversationId = conv?.id ?? null;
          const store = makeStore(admin, userId, projectId, conversationId);

          const memories = await loadMemories(admin, userId, projectId).catch(() => []);
          const reviewTier: "flash" | "pro" = Deno.env.get("VIBE_REVIEW_TIER") === "pro" ? "pro" : "flash";
          const { routedProviders, chosen } = await routeModels(admin, label, reviewTier);
          send({
            kind: "estimate",
            status: "success",
            title: `Vibe Reviewer (PR-Agent) · ${chosen ? chosen.label : `modelo ${reviewTier}`}`,
            tier: reviewTier,
          });

          const reviewCost = Math.max(0, Number.parseInt(Deno.env.get("VIBE_REVIEW_CREDIT_COST") ?? "0", 10) || 0);
          if (reviewCost > 0 && reviewReq.command !== "adjust" && reviewReq.command !== "ask") {
            await chargeCredits(reviewCost, `vibe_code_agent:${reviewReq.command}`, { tier: reviewTier });
          }

          const readPrevious = async (path: string, current: string) => {
            const scoped = (q: any) => (projectId ? q.eq("project_id", projectId) : q.is("project_id", null));
            const { data } = await scoped(
              admin.from("vibe_project_files").select("content").eq("user_id", userId).eq("path", path)
                .order("version", { ascending: false }).limit(2),
            );
            const rows = (data ?? []) as Array<{ content: string }>;
            if (!rows.length) return null;
            return rows[0].content === current ? rows[1]?.content ?? null : rows[0].content;
          };

          replyText = await runReviewCommand(reviewReq, {
            list: () => store.list(),
            read: (path) => store.read(path),
            readPrevious,
            send,
            context: formatMemoriesForPrompt(memories) + formatDevContext(body.devContext) + (await loadPlanSummary(conversationId).catch(() => "")),
            scoreThreshold: Number.parseInt(Deno.env.get("VIBE_IMPROVE_SCORE_THRESHOLD") ?? "", 10) || undefined,
            callModel: async (messages, { maxTokens, label: step }) => {
              send({ kind: "thinking", status: "running", title: `Vibe Reviewer: ${step}` });
              let llm;
              try {
                llm = await runGateway(
                  {
                    kind: "code",
                    tier: reviewTier,
                    ...(routedProviders?.length ? { providers: routedProviders } : { deepseekOnly: true }),
                    json: true,
                    maxTokens,
                    temperature: 0.2,
                    noCache: true,
                    messages,
                  },
                  { cache: supabaseGatewayCache(admin) },
                );
              } catch (err) {
                await recordGatewayFailure(admin, userId, projectId, "code", err).catch(() => {});
                throw err;
              }
              await recordGatewayRun(admin, userId, projectId, llm).catch(() => null);
              send({
                kind: "thinking",
                status: "success",
                title: `Vibe Reviewer: ${step}`,
                detail: `${llm.provider} · ${llm.model} (${llm.tier}) · ~$${llm.costUsd.toFixed(4)}`,
              });
              return llm.content;
            },
          });
          send({ kind: "reply", status: "success", title: "Resposta do agente", detail: replyText });
          send({ kind: "done", status: "success", title: "Revisão concluída" });
          return;
        }

        // ------------------------------------------------------------------
        // Pedido novo: o loop do agente
        // ------------------------------------------------------------------
        const prompt = (body.prompt ?? "").trim().slice(0, MAX_PROMPT_CHARS);
        if (!prompt) throw new Error("prompt_required");
        userPrompt = prompt;
        const mode = body.mode === "apply" ? "apply" : "preview";

        const conv = await resolveConversation(true, prompt);
        conversationId = conv?.id ?? null;
        if (mode === "apply") await acquireWriterLock(conversationId, "manual");
        // Pedido delegado pelo Vertal Chat: abre/atualiza o handoff da conversa.
        const chatConversationId = typeof body.chatConversationId === "string" && UUID_RE.test(body.chatConversationId)
          ? body.chatConversationId
          : undefined;
        if (origin === "vertal_chat") {
          await saveHandoff(conversationId, { origin, goal: prompt, status: "running", ...(chatConversationId ? { chatConversationId } : {}) })
            .catch((e) => console.warn("[vibe-code-agent] handoff:", e instanceof Error ? e.message : e));
        }
        // Ponte Vibe → Chat: perguntas ao Vertal Chat feitas neste pedido.
        let chatDelegations = 0;
        let browserRequests = 0;
        const store = makeStore(admin, userId, projectId, conversationId);
        const planSummary = await loadPlanSummary(conversationId).catch(() => "");

        // Memória: o que o usuário pediu para lembrar + tudo o que já foi lembrado.
        const explicit = await saveMemories(admin, userId, projectId, extractMemories(prompt, !!projectId)).catch(() => []);
        for (const m of explicit) send({ kind: "memory", status: "success", title: "Memória salva", detail: m.content });
        const memories = await loadMemories(admin, userId, projectId).catch(() => []);
        if (memories.length) send({ kind: "memory", status: "success", title: `Usando ${memories.length} memória(s) do Prime` });

        // Histórico da conversa, árvore do projeto e conectores.
        const { data: lastMessages } = conversationId
          ? await admin
            .from("vibe_messages")
            .select("role, content, steps")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(12)
          : { data: [] };
        const history = buildHistory([...(lastMessages ?? [])].reverse());
        const [tree, connected] = await Promise.all([
          store.list().then(filterRepoTree).catch((e) => {
            console.warn("[vibe-code-agent] tree failed:", e instanceof Error ? e.message : e);
            return [] as string[];
          }),
          loadConnectedSlugs(admin, userId).catch(() => [] as string[]),
        ]);
        if (history.length) send({ kind: "memory", status: "success", title: `Lembrando ${history.length} mensagem(ns) desta conversa` });

        // Vertal Design Intelligence: regras de UI/UX, tokens e checklist no
        // prompt; a auditoria de design entra na auto-revisão abaixo.
        // Desligável por pedido (designIntelligence:false) ou globalmente
        // (secret DESIGN_INTELLIGENCE=off) — rollback sem deploy de código.
        const design = resolveDesignConfig({
          prompt,
          envFlag: Deno.env.get("DESIGN_INTELLIGENCE"),
          requestEnabled: body.designIntelligence,
          requestSurface: body.designSurface,
        });
        if (design.enabled) {
          send({
            kind: "design",
            status: "success",
            title: `Design Intelligence: perfil ${design.surface}`,
            detail: design.surfaceSource === "explicit" ? "perfil escolhido pelo usuário" : "perfil detectado pelo pedido",
          });
        }

        // Login com Google gerenciado pelo Vertal: ligado = o kit entra na entrega;
        // desligado e o pedido fala de login = o agente oferece.
        const authKit = parseAuthKitRequest(body.authKit);
        const authOffer = !authKit.enabled && wantsAuthKit(prompt);
        if (authKit.enabled) {
          for (const w of authKit.warnings) send({ kind: "auth_kit", status: "skipped", title: "Login Vertal", detail: w });
        }

        // Conector Vertal AI: flag desligada → {mode:"off"} sem tocar no banco; vertalAi* abaixo não muda nada.
        const vertalAi = await vertalAiForRequest(admin, Deno.env.toObject(), { userId, projectId, prompt, request: body.vertalAi }).catch(() => ({ state: { mode: "off" as const } })); // Vertal AI
        for (const st of vertalAiSteps(vertalAi.state, vertalAi).filter((x) => x.status !== "success" || x.vertalAi.created)) send(st);
        const vertalAiAwareness = await vertalAiAwarenessFor(admin, Deno.env.toObject(), userId, projectId, connected).catch(() => ""); // Vertal AI: flag off → "" sem banco

        // Atitude Vertal: soma a personalidade ao protocolo (JSON e regras intactos).
        // Ligada para todos por padrão; VERTAL_PERSONA_ENABLED=off desliga sem deploy.
        const system =
          withVertalPersona(SYSTEM, "vibe", vertalPersonaEnabled(Deno.env.get("VERTAL_PERSONA_ENABLED"))) +
          (authKit.enabled ? formatAuthKitForPrompt(authKit.options) : authOffer ? AUTH_KIT_OFFER_PROMPT : "") +
          vertalAiPromptBlock(vertalAi.state) +
          vertalAiAwareness +
          (design.enabled ? buildDesignPrompt(design.surface, { target: "react" }) : "") +
          formatMemoriesForPrompt(memories) +
          formatConnectorsForPrompt(connected) +
          formatDevContext(body.devContext) +
          planSummary +
          (conv?.summary ? `\n\nResumo da conversa até aqui:\n${conv.summary}` : "");

        const tier = classifyComplexity(prompt);

        // Orquestrador de modelos: o mais adequado (custo x qualidade x saúde) para este pedido.
        // VIBE_AGENT_MODEL_POLICY=deepseek_only volta ao comportamento antigo sem deploy.
        const { routedProviders, chosen, chosenReason } = await routeModels(admin, prompt, tier);
        const estimatedCost = creditsFor(CREDIT_COST[tier], chosen);
        send({
          kind: "estimate",
          status: "success",
          title: chosen
            ? `Modelo escolhido: ${chosen.label} · ${estimatedCost} crédito(s)`
            : `Estimativa: ${estimatedCost} crédito(s) (modelo ${tier})`,
          detail: chosen ? `Escolhi ${chosen.label} porque é ${chosenReason}.` : undefined,
          tier,
          estimatedCost,
        });

        const treeBlock = tree.length
          ? `\n\nArquivos do projeto (${store.mode === "github" ? store.label : "cofre de código"}):\n${tree.join("\n")}`
          : "\n\nO projeto ainda não tem arquivos: crie a estrutura necessária.";
        const messages: ChatMsg[] = [
          { role: "system", content: system },
          ...history,
          { role: "user", content: prompt + treeBlock },
        ];

        const proposed = new Map<string, { content: string; reason?: string }>();
        const questions: string[] = [];
        const notes: string[] = [];
        let finalTurn: ReturnType<typeof parseAgentTurn> | null = null;
        let repairsLeft = MAX_REPAIRS;
        let repaired = false;
        let reviewProblems: Record<string, string[]> = {};
        let designProblems: Record<string, string[]> = {};
        const readCache = new Map<string, Observation>();
        let switchedNotice = false;
        let parseRetried = false;
        // Primeiros problemas que a auto-revisão achou: viram lição para os próximos pedidos.
        let firstProblems: string[] = [];
        // "Parar" no chat aborta a requisição: conferido entre as voltas e antes de cobrar/commitar.
        const abortIfRequested = () => {
          if (req.signal.aborted) throw new AbortedByUserError("aborted_by_user");
        };
        // Rotas por tier: a do tier escolhido já está pronta; a do outro só se a volta precisar.
        const tierRoutes = new Map<AgentTier, Promise<{ routedProviders?: Provider[] }>>([
          [tier as AgentTier, Promise.resolve({ routedProviders })],
        ]);
        const routeForTier = (t: AgentTier) => {
          if (!tierRoutes.has(t)) tierRoutes.set(t, routeModels(admin, prompt, t));
          return tierRoutes.get(t)!;
        };

        for (let turn = 1; turn <= MAX_TURNS; turn++) {
          abortIfRequested();
          send({ kind: "thinking", status: "running", title: turn === 1 ? "Analisando o pedido" : `Raciocinando (volta ${turn})` });
          const noCache = mode === "apply" || turn > 1 || parseRetried;
          const callModel = async (t: AgentTier) => {
            const route = await routeForTier(t);
            try {
              const res = await runGateway(
                {
                  kind: "code",
                  tier: t,
                  ...(route.routedProviders?.length ? { providers: route.routedProviders } : { deepseekOnly: true }),
                  json: true,
                  maxTokens: 6000,
                  temperature: 0.2,
                  noCache: noCache || t !== tier,
                  messages,
                },
                { cache: supabaseGatewayCache(admin) },
              );
              await recordGatewayRun(admin, userId, projectId, res).catch(() => null);
              return res;
            } catch (err) {
              await recordGatewayFailure(admin, userId, projectId, "code", err).catch(() => {});
              throw err;
            }
          };
          // Mesmo padrão do Vertal Chat (creative-router handleAgentChat): "pro" que falha
          // volta ao flash, e saída ilegível ganha UMA nova tentativa no outro tier.
          // A cobrança continua sendo a estimativa (estimatedCost), qualquer que seja o tier usado.
          const attempt = await callWithTierFallback({
            tier: tier as AgentTier,
            call: callModel,
            parse: (r) => parseAgentTurn(r.content),
            needsRetry: (p) => p.retry === true,
            better: (again) => !again.retry,
            isRecoverable: (err) => err instanceof GatewayError,
          });
          if (attempt.fellBack) console.warn("[vibe-code-agent] pro falhou, voltando ao flash");
          const llm = attempt.result;
          if (chosen && llm.provider !== chosen.id && !switchedNotice) {
            switchedNotice = true;
            send({
              kind: "estimate",
              status: "success",
              title: `Troquei de modelo: ${chosen.label} não respondeu, segui com ${llm.model}`,
              detail: llm.attempts.join(" · "),
            });
          }

          const parsed = attempt.parsed;
          if (parsed.retry) {
            // JSON ilegível ou cortado sem nada aproveitável: pede de novo UMA vez (sem cache).
            if (!parseRetried) {
              parseRetried = true;
              send({ kind: "message", status: "skipped", title: "O modelo respondeu fora do formato; pedindo de novo" });
              messages.push({
                role: "user",
                content: "Sua última resposta veio cortada ou fora do formato. Responda de novo APENAS com o objeto JSON válido; se os arquivos forem grandes, edite menos arquivos nesta volta.",
              });
              turn--;
              continue;
            }
            // Volta tardia mal formada: entrega o que já foi proposto em vez de perder tudo.
            if (turn > 1 && finalTurn) {
              send({ kind: "message", status: "skipped", title: "O modelo respondeu fora do formato; entregando o que já estava pronto" });
              break;
            }
            throw new Error("plan_parse_failed");
          }
          finalTurn = parsed;
          send({
            kind: "thinking",
            status: "success",
            title: parsed.thought || "Análise concluída",
            detail: `${llm.provider} · ${llm.model} (${llm.tier})${llm.cached ? " · cache" : ""} · ~$${llm.costUsd.toFixed(4)}`,
          });
          if (turn === 1 && parsed.summary) {
            send({ kind: "plan", status: "success", title: parsed.summary, detail: `${parsed.actions.length} ação(ões)` });
          }

          // Executa as ações da volta. Leituras viram observações para o modelo.
          // read_file é só leitura: as da volta rodam em paralelo (até READ_CONCURRENCY),
          // e as observações saem na ordem em que o modelo pediu.
          const observations: Observation[] = [];
          const chatAnswers: string[] = [];
          const readFile = async (path: string): Promise<Observation> => {
            const cached = readCache.get(path);
            if (cached) return cached;
            send({ kind: "read_file", status: "running", title: `Lendo ${path}`, path });
            const proposedHere = proposed.get(path);
            const file = proposedHere ? { content: proposedHere.content, sha: undefined } : await store.read(path);
            const obs: Observation = { path, found: proposedHere ? true : file.sha !== undefined || file.content !== "", content: file.content };
            readCache.set(path, obs);
            send({
              kind: "read_file",
              status: "success",
              title: `Lido ${path}`,
              path,
              detail: obs.found ? `${file.content.split("\n").length} linhas` : "arquivo novo",
            });
            return obs;
          };
          // Leituras pendentes do trecho atual; são resolvidas antes de qualquer edit_file
          // seguinte, para uma leitura nunca ver uma edição pedida depois dela.
          let pendingReads: string[] = [];
          const flushReads = async () => {
            if (!pendingReads.length) return;
            const batch = pendingReads;
            pendingReads = [];
            const unique = [...new Set(batch)];
            const read = await mapWithConcurrency(unique, READ_CONCURRENCY, (path) => readFile(path));
            const byPath = new Map(unique.map((path, i) => [path, read[i]]));
            for (const path of batch) observations.push(byPath.get(path)!);
          };
          for (const action of parsed.actions) {
            if (action.type === "message") {
              if (action.reason) {
                notes.push(action.reason);
                send({ kind: "message", status: "success", title: action.reason });
              }
              continue;
            }
            if (action.type === "ask_user") {
              if (action.reason) {
                questions.push(action.reason);
                send({ kind: "question", status: "success", title: action.reason });
              }
              continue;
            }
            if (action.type === "use_browser") {
              // Fase 4: o navegador roda no chat do usuário (JWT dele, Worker /api/navigator,
              // mesmas regras: cofre, TOTP, gate de pagamento, auditoria). Aqui só registramos o pedido.
              const reqBrowser = parseBrowserRequest(action);
              if (!reqBrowser) continue;
              const allowedBrowser = canUseBrowser(origin, browserRequests);
              if (!allowedBrowser.ok) {
                send({
                  kind: "navigator",
                  status: "skipped",
                  title: allowedBrowser.reason === "delegation_depth_exceeded" ? "Pedido veio do Vertal Chat: o navegador fica com o chat" : "Limite de tarefas de navegador neste pedido",
                  detail: reqBrowser.task,
                });
                continue;
              }
              browserRequests++;
              send({
                kind: "navigator",
                status: "success",
                title: "O agente vai usar o navegador na nuvem",
                detail: reqBrowser.task,
                navigator: { state: "requested", origin: "agent", taskId: crypto.randomUUID(), startedAt: Date.now(), ...reqBrowser },
              });
              continue;
            }
            if (action.type === "ask_chat") {
              const question = (action.reason ?? action.content ?? "").trim();
              if (!question) continue;
              const allowed = canAskChat(origin, chatDelegations);
              if (!allowed.ok) {
                send({
                  kind: "delegate",
                  status: "skipped",
                  title: allowed.reason === "delegation_depth_exceeded" ? "Pedido veio do Vertal Chat: não pergunto de volta" : "Limite de perguntas ao Vertal Chat neste pedido",
                  detail: question,
                });
                continue;
              }
              chatDelegations++;
              abortIfRequested();
              send({ kind: "delegate", status: "running", title: "Perguntando ao Vertal Chat", detail: question });
              const answer = await runDelegatedChat(token, question, prompt.slice(0, 800), req.signal);
              send({
                kind: "delegate",
                status: answer.ok ? "success" : "failed",
                title: answer.ok ? "Vertal Chat respondeu" : answer.error ?? "O Vertal Chat não respondeu",
                detail: answer.ok ? answer.answer : question,
                delegate: { target: "vertal_chat", origin: "vibe_code", ...answer },
              });
              chatAnswers.push(formatChatAnswerForAgent(answer));
              continue;
            }
            if (!action.path) continue;

            if (!isSafePath(action.path)) {
              send({ kind: action.type, status: "failed", title: `Caminho não permitido: ${action.path}`, path: action.path });
              continue;
            }

            if (action.type === "read_file") {
              pendingReads.push(action.path);
              continue;
            }

            if (action.type === "edit_file" && typeof action.content === "string") {
              await flushReads();
              proposed.set(action.path, { content: action.content, reason: action.reason });
            }
          }
          await flushReads();

          // Precisa ler mais (ou o Vertal Chat respondeu)? Devolve as observações ao modelo.
          if ((!parsed.final && observations.length) || (chatAnswers.length && turn < MAX_TURNS)) {
            messages.push({ role: "assistant", content: llm.content });
            const parts = [observations.length ? formatObservations(observations) : "", ...chatAnswers].filter(Boolean);
            messages.push({ role: "user", content: parts.join("\n\n") });
            continue;
          }

          // Auto-revisão do que foi proposto; uma rodada de auto-reparo.
          reviewProblems = {};
          for (const [path, file] of proposed) {
            const problems = lintGeneratedFile(path, file.content);
            if (problems.length) reviewProblems[path] = problems;
          }
          // Bloqueadores de design (acessibilidade, marca) entram no mesmo
          // auto-reparo, mas nunca barram o arquivo: só pedem correção.
          designProblems = {};
          if (design.enabled && proposed.size) {
            const audit = auditGeneratedCode([...proposed].map(([path, f]) => ({ path, content: f.content })));
            for (const f of audit.findings) {
              if (f.severity !== "blocker" || !f.path) continue;
              (designProblems[f.path] ??= []).push(`design: ${f.message} Correção: ${f.fix}${f.line ? ` (linha ${f.line})` : ""}`);
            }
          }
          const failing = [...new Set([...Object.keys(reviewProblems), ...Object.keys(designProblems)])];
          if (failing.length && !firstProblems.length) {
            firstProblems = failing.flatMap((p) => [...(reviewProblems[p] ?? []), ...(designProblems[p] ?? [])]);
          }
          if (failing.length && repairsLeft > 0 && turn < MAX_TURNS) {
            repairsLeft--;
            repaired = true;
            const list = failing
              .map((p) => `- ${p}: ${[...(reviewProblems[p] ?? []), ...(designProblems[p] ?? [])].join("; ")}`)
              .join("\n");
            send({ kind: "review", status: "running", title: `Auto-revisão encontrou problemas em ${failing.length} arquivo(s); corrigindo`, detail: list });
            messages.push({ role: "assistant", content: llm.content });
            messages.push({
              role: "user",
              content: `Sua entrega tem problemas:\n${list}\n\nCorrija TODOS e devolva os arquivos completos corrigidos em edit_file, com "final": true.`,
            });
            continue;
          }
          break;
        }

        if (!finalTurn) throw new Error("plan_parse_failed");
        abortIfRequested();

        // Arquivos com problema grave não entram; sintaxe vira aviso.
        const rejected: string[] = [];
        for (const [path, problems] of Object.entries(reviewProblems)) {
          if (problems.some((p) => !p.startsWith("sintaxe"))) {
            proposed.delete(path);
            rejected.push(`${path}: ${problems.join("; ")}`);
          }
        }
        // Kit de login: arquivos determinísticos (o agente não escreve esses paths).
        if (authKit.enabled) {
          for (const path of [...proposed.keys()]) if (isAuthKitPath(path)) proposed.delete(path);
          const managed = resolveManagedAuth(Deno.env.get("VERTAL_AUTH_SUPABASE_URL"), Deno.env.get("VERTAL_AUTH_SUPABASE_PUBLISHABLE_KEY"));
          for (const f of buildAuthKitFiles(authKit.options, managed)) proposed.set(f.path, { content: f.content, reason: f.reason });
          send({
            kind: "auth_kit",
            status: "success",
            title: "Login com Google gerenciado pelo Vertal adicionado",
            detail: authKit.options.branding === "white_label"
              ? `Marca branca: logo do Dev e a linha "${authKit.options.footer}" embaixo do formulário.`
              : "Tela com e-mail, senha e Google, com o logo do Vertal Dev.",
            authKit: { branding: authKit.options.branding, managed: !!managed },
          });
        } else if (authOffer) {
          send({
            kind: "auth_kit",
            status: "skipped",
            title: "Quer o Login com Google gerenciado pelo Vertal?",
            detail: "Tela pronta com e-mail, senha e Google, sem configurar OAuth. Ligue em Login Vertal.",
            authKit: { offer: true },
          });
        }

        // Conector Vertal AI ativo: helper e proxy determinísticos (o agente não escreve esses paths). Off/oferta: nada.
        if (vertalAi.state.mode === "active") for (const path of [...proposed.keys()]) if (isVertalAiPath(path)) proposed.delete(path);
        for (const f of vertalAiFilesFor(vertalAi.state)) proposed.set(f.path, { content: f.content, reason: f.reason }); // Vertal AI
        if (vertalAi.state.mode !== "off") for (const [p, f] of proposed) if (!isVertalAiPath(p)) proposed.set(p, { ...f, content: vertalAiFixEnvNames(f.content) }); // Vertal AI: VERTAL_API_KEY → VERTAL_AI_API_KEY
        for (const st of vertalAiSteps(vertalAi.state).filter((x) => x.status === "success" && !x.vertalAi.created)) send(st);

        if (Object.keys(reviewProblems).length) {
          send({
            kind: "review",
            status: rejected.length ? "failed" : "success",
            title: rejected.length
              ? `${rejected.length} arquivo(s) barrado(s) pela auto-revisão`
              : "Auto-revisão: avisos de sintaxe, revise o diff",
            detail: Object.entries(reviewProblems).map(([p, pr]) => `${p}: ${pr.join("; ")}`).join("\n"),
          });
        } else if (proposed.size) {
          send({ kind: "review", status: "success", title: repaired ? "Auto-revisão: corrigido e aprovado" : "Auto-revisão: código aprovado", detail: `${proposed.size} arquivo(s) verificados` });
        }

        if (design.enabled && proposed.size) {
          const audit = auditGeneratedCode([...proposed].map(([path, f]) => ({ path, content: f.content })));
          if (audit.checkedFiles) {
            send({
              kind: "design",
              status: audit.blockers ? "failed" : "success",
              title: `Auditoria de design: ${audit.score}/100`,
              detail: formatAuditSummary(audit),
            });
          }
        }

        // Último ponto de saída: depois daqui cobra e commita.
        abortIfRequested();
        if (mode === "apply" && proposed.size) {
          await chargeCredits(estimatedCost, "vibe_code_agent:direct_apply", { tier, prompt: prompt.slice(0, 200) });
        }

        // Diff (preview) ou commit (apply).
        const committedFiles: string[] = [];
        let lastSha: string | undefined;
        for (const [path, file] of proposed) {
          send({ kind: "edit_file", status: "running", title: `Editando ${path}`, path });
          const current = await store.read(path);
          const diff = makeDiff(current.content, file.content, path);
          if (mode === "preview") {
            send({ kind: "diff", status: "success", title: `Preview ${path}`, path, detail: file.reason, diff, proposedContent: file.content });
          } else {
            const sha = await store.write(path, file.content, `vibe: ${file.reason ?? `update ${path}`}`);
            lastSha = sha ?? lastSha;
            committedFiles.push(path);
            // proposedContent e repoUrl alimentam a caixinha de código: abrir o arquivo no app ou no GitHub.
            const repoUrl = store.mode === "github" && sha ? `https://github.com/${store.label}/blob/${sha}/${path}` : undefined;
            send({
              kind: "commit",
              status: "success",
              title: `Commitado ${path}`,
              path,
              detail: file.reason,
              diff,
              commitSha: sha,
              proposedContent: file.content,
              repoUrl,
            });
          }
        }

        if (mode === "apply" && lastSha) {
          const { data: checkpoint } = await admin
            .from("vibe_checkpoints")
            .insert({
              user_id: userId,
              project_repo: store.label,
              commit_sha: lastSha,
              summary: finalTurn.summary || committedFiles.join(", "),
              files_changed: committedFiles,
              credits_spent: estimatedCost,
              model_used: tier,
            })
            .select("id")
            .single();
          send({ kind: "checkpoint", status: "success", title: "Checkpoint salvo", checkpointId: checkpoint?.id, commitSha: lastSha });
        }

        // Memórias aprendidas pelo modelo.
        const learned = await saveMemories(admin, userId, projectId, sanitizeMemories(finalTurn.memories, !!projectId)).catch(() => []);
        for (const m of learned) send({ kind: "memory", status: "success", title: "Aprendi algo novo", detail: m.content });

        // Aprende com os erros: o que a auto-revisão precisou corrigir vira regra para a próxima vez.
        const known = new Set(memories.map((m) => m.content.trim().toLowerCase()));
        const lessons = lessonsFromProblems(firstProblems)
          .filter((content) => !known.has(content.toLowerCase()))
          .map((content) => ({ scope: (projectId ? "project" : "user") as "project" | "user", kind: "constraint" as const, content }));
        const savedLessons = lessons.length ? await saveMemories(admin, userId, projectId, lessons).catch(() => []) : [];
        for (const m of savedLessons) send({ kind: "memory", status: "success", title: "Aprendi com um erro", detail: m.content });

        // Conectores e APIs que esta aplicação precisa.
        const files: Record<string, string> = {};
        for (const [path, f] of proposed) files[path] = f.content;
        // Chaves que já estão no Cofre de segredos contam como API pronta.
        const vaultKeys = await listVisibleSecrets(admin as unknown as Parameters<typeof listVisibleSecrets>[0], userId)
          .then((v) => v.map((s) => s.env_key))
          .catch(() => [] as string[]);
        const requirements = applyVaultStatus(
          applyConnectionStatus(
            mergeDeclaredRequirements(detectRequirements(prompt, files), finalTurn.requirements),
            connected,
          ),
          vaultKeys,
        );
        // Conector Vertal AI: tira chaves de outros provedores de IA e mostra "Vertal AI" conectada. Off: nada.
        if (vertalAi.state.mode !== "off") requirements.splice(0, requirements.length, ...applyVertalAiToRequirements(requirements, vertalAi.state, prompt));
        let pendingForReply: Parameters<typeof composeAgentReply>[0]["pendingRequirements"] = [];
        if (requirements.length) {
          const scoped = (q: any) => (projectId ? q.eq("project_id", projectId) : q.is("project_id", null));
          const { data: existing } = await scoped(
            admin.from("vibe_requirements").select("id, slug, status").eq("user_id", userId),
          );
          const byslug = new Map<string, { id: string; status: string }>(
            (existing ?? []).map((r: any) => [r.slug as string, { id: r.id as string, status: r.status as string }]),
          );
          const dismissed = new Set<string>([...byslug].filter(([, r]) => r.status === "dismissed").map(([slug]) => slug));
          const visible = requirements.filter((r) => !dismissed.has(r.slug) && !r.builtin);
          for (const r of visible) {
            const row = {
              conversation_id: conversationId,
              kind: r.kind,
              name: r.label,
              reason: r.reason,
              secrets: r.secrets,
              status: r.status,
              updated_at: new Date().toISOString(),
            };
            const known = byslug.get(r.slug);
            const { error } = known
              ? await admin.from("vibe_requirements").update(row).eq("id", known.id)
              : await admin.from("vibe_requirements").insert({ ...row, user_id: userId, project_id: projectId, slug: r.slug });
            if (error) console.warn("[vibe-code-agent] requirement save:", error.message);
          }
          const pending = visible.filter((r) => r.status === "needed");
          pendingForReply = pending.map((r) => ({
            label: r.label,
            secrets: r.secrets.filter((s) => !(r.inVault ?? []).includes(s)),
            kind: r.kind,
            connectPath: r.connectPath,
            keyUrl: r.keyUrl,
            siteUrl: r.siteUrl,
            linkSource: r.linkSource,
          }));
          send({
            kind: "requirements",
            status: "success",
            title: pending.length
              ? `Para funcionar, esta aplicação precisa de ${pending.length} conector(es)/API(s)`
              : "Conectores e APIs desta aplicação já estão prontos",
            requirements: requirements.filter((r) => !dismissed.has(r.slug)),
          });
        }

        // Conversa: resumo contínuo, título e contadores.
        conversationPatch = {
          summary: finalTurn.conversationSummary ?? conv?.summary ?? null,
          ...(conv?.title === "Nova conversa" && finalTurn.title ? { title: finalTurn.title } : {}),
        };
        if (typeof conversationPatch.title === "string") {
          send({ kind: "conversation", status: "success", title: conversationPatch.title as string, conversationId, isNew: false });
        }

        // O agente responde em texto, como numa conversa, além dos passos técnicos.
        replyText = composeAgentReply({
          summary: finalTurn.summary,
          notes,
          questions,
          files: [...proposed].map(([path, f]) => ({ path, reason: f.reason })),
          mode,
          rejected,
          pendingRequirements: pendingForReply,
        });
        if (vertalAi.state.mode !== "off") replyText = sanitizeVertalAiReply(replyText, { mode: vertalAi.state.mode === "active" ? "active" : "offer" }); // Vertal AI: sem "configure a chave/env"
        send({ kind: "reply", status: "success", title: "Resposta do agente", detail: replyText });

        if (origin === "vertal_chat") {
          const status: HandoffStatus = questions.length ? "waiting_user" : "done";
          await saveHandoff(conversationId, { origin, status, lastSummary: finalTurn?.summary || replyText })
            .catch((e) => console.warn("[vibe-code-agent] handoff:", e instanceof Error ? e.message : e));
        }

        send({
          kind: "done",
          status: "success",
          title: questions.length
            ? "Preciso de uma resposta sua para continuar"
            : proposed.size === 0
              ? "Concluído"
              : mode === "preview"
                ? "Preview pronto — revise e aplique"
                : "Todas as alterações commitadas",
        });
      } catch (err) {
        if (err instanceof AbortedByUserError) {
          // Parada pedida pelo Dev: nada foi cobrado nem commitado nesta execução.
          replyText = "Parei a pedido seu. Nada foi cobrado nem commitado.";
          send({ kind: "reply", status: "skipped", title: "Resposta do agente", detail: replyText });
          send({ kind: "done", status: "skipped", title: "Parado" });
          return;
        }
        const message = err instanceof Error ? err.message : "internal_error";
        const friendly = err instanceof UserFacingError || err instanceof PlanError || err instanceof TaskGraphError;
        console.error("[vibe-code-agent]", message);
        send({ kind: "error", status: "failed", title: friendly ? message : "Agente parou", detail: message });
        if (origin === "vertal_chat" && body.handoff === undefined) {
          await saveHandoff(conversationId, { origin, status: "failed", lastSummary: friendly ? message : "O agente parou." }).catch(() => null);
        }
        if (!replyText) {
          replyText = friendly
            ? message
            : "Não consegui terminar este pedido. Os detalhes estão em \"o que o agente fez\". Tente de novo ou reformule o pedido.";
          send({ kind: "reply", status: "failed", title: "Resposta do agente", detail: replyText });
        }
      } finally {
        await releaseLock().catch((e) => console.warn("[vibe-code-agent] lock release failed:", e instanceof Error ? e.message : e));
        // Persistência da conversa (não bloqueia o fim do stream em caso de falha).
        if (conversationId && persist) {
          try {
            const rows: any[] = [];
            const now = Date.now();
            if (userPrompt) {
              rows.push({
                conversation_id: conversationId,
                user_id: userId,
                role: "user",
                content: userPrompt,
                steps: [],
                created_at: new Date(now).toISOString(),
              });
            }
            rows.push({
              conversation_id: conversationId,
              user_id: userId,
              role: "assistant",
              content: replyText,
              steps: recorded,
              created_at: new Date(now + 1).toISOString(),
            });
            await admin.from("vibe_messages").insert(rows);
            const { data: current } = await admin
              .from("vibe_conversations")
              .select("message_count")
              .eq("id", conversationId)
              .maybeSingle();
            await admin
              .from("vibe_conversations")
              .update({
                ...conversationPatch,
                message_count: (current?.message_count ?? 0) + rows.length,
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", conversationId);
          } catch (e) {
            console.warn("[vibe-code-agent] persist failed:", e instanceof Error ? e.message : e);
          }
        }
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
