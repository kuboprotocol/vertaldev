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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { classifyComplexity } from "../_shared/deepseekRouter.ts";
import { runGateway } from "../_shared/aiGateway.ts";
import { recordGatewayFailure, recordGatewayRun, supabaseGatewayCache } from "../_shared/aiGatewayStore.ts";
import { extractMemories, formatMemoriesForPrompt, loadMemories, saveMemories } from "../_shared/primeMemory.ts";
import {
  buildHistory,
  type ChatMsg,
  filterRepoTree,
  formatObservations,
  isSafePath,
  lintGeneratedFile,
  type Observation,
  parseAgentTurn,
  sanitizeMemories,
  titleFromPrompt,
} from "../_shared/vibeAgentCore.ts";
import {
  applyConnectionStatus,
  detectRequirements,
  formatConnectorsForPrompt,
  mergeDeclaredRequirements,
} from "../_shared/connectorCatalog.ts";

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
    {"type":"ask_user","reason":"pergunta objetiva, só se for impossível decidir sozinho"}
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
3. "requirements": liste os conectores e APIs que esta aplicação exige para funcionar, usando os slugs do catálogo quando existirem; para APIs fora do catálogo use "name" e os nomes exatos dos segredos. Nunca peça nem escreva chaves, tokens ou senhas no código: use variáveis de ambiente.
4. "memories": só fatos duráveis e úteis em conversas futuras (preferências, restrições, decisões de arquitetura). Nada de segredos, nada efêmero.
5. Respeite a memória do Prime e o histórico: não refaça o que já foi feito, não contradiga decisões anteriores sem avisar.
6. Pedido ambíguo e caro de errar: use ask_user (uma pergunta) em vez de chutar. Pedido claro: execute.
7. Você não executa comandos nem acessa a internet; diga em "message" o que depender do usuário (credencial, decisão, deploy).`;

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
    apply?: Array<{ path: string; content: string }>;
    revertSha?: string;
    revertCheckpointId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json_body" });
  }

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
        const full = { id: `s${++seq}`, ...event };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(full)}\n\n`));
        if (recorded.length < MAX_STORED_STEPS) {
          recorded.push({
            ...full,
            ...(typeof full.proposedContent === "string"
              ? { proposedContent: (full.proposedContent as string).slice(0, MAX_STEP_CONTENT) }
              : {}),
          });
        }
      };

      let conversationId: string | null = null;
      let userPrompt: string | null = null;
      let conversationPatch: Record<string, unknown> = {};
      let projectId: string | null = null;

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

      try {
        if (typeof body.projectId === "string" && UUID_RE.test(body.projectId)) {
          const { data: proj } = await userClient.from("projects").select("id").eq("id", body.projectId).maybeSingle();
          projectId = proj?.id ?? null;
        }

        // ------------------------------------------------------------------
        // Reverter checkpoint / commit
        // ------------------------------------------------------------------
        if (body.revertCheckpointId || body.revertSha) {
          const conv = await resolveConversation(false);
          conversationId = conv?.id ?? null;
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
          send({ kind: "done", status: "success", title: "Revert concluído" });
          return;
        }

        // ------------------------------------------------------------------
        // Aplicar o que foi pré-visualizado
        // ------------------------------------------------------------------
        if (body.apply?.length) {
          const conv = await resolveConversation(false);
          conversationId = conv?.id ?? null;
          const store = makeStore(admin, userId, projectId, conversationId);

          for (const f of body.apply) {
            const problems = lintGeneratedFile(f.path, f.content).filter((p) => !p.startsWith("sintaxe"));
            if (problems.length) throw new Error(`arquivo_recusado:${f.path}: ${problems.join("; ")}`);
          }

          const tier = classifyComplexity(body.apply.map((f) => f.path).join(" "));
          const cost = CREDIT_COST[tier];
          await chargeCredits(cost, "vibe_code_agent:apply", { tier, files: body.apply.length });

          const committedFiles: string[] = [];
          let lastSha: string | undefined;
          for (const file of body.apply) {
            send({ kind: "commit", status: "running", title: `Commitando ${file.path}`, path: file.path });
            const sha = await store.write(file.path, file.content, `vibe: update ${file.path}`);
            lastSha = sha ?? lastSha;
            committedFiles.push(file.path);
            send({ kind: "commit", status: "success", title: `Commitado ${file.path}`, path: file.path, commitSha: sha });
          }

          if (lastSha) {
            const { data: checkpoint } = await admin
              .from("vibe_checkpoints")
              .insert({
                user_id: userId,
                project_repo: store.label,
                commit_sha: lastSha,
                summary: `Aplicado: ${committedFiles.join(", ")}`,
                files_changed: committedFiles,
                credits_spent: cost,
                model_used: tier,
              })
              .select("id")
              .single();
            send({ kind: "checkpoint", status: "success", title: "Checkpoint salvo", checkpointId: checkpoint?.id, commitSha: lastSha });
          }
          send({ kind: "done", status: "success", title: "Alterações aplicadas" });
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
        const store = makeStore(admin, userId, projectId, conversationId);

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

        const system =
          SYSTEM +
          formatMemoriesForPrompt(memories) +
          formatConnectorsForPrompt(connected) +
          (conv?.summary ? `\n\nResumo da conversa até aqui:\n${conv.summary}` : "");

        const tier = classifyComplexity(prompt);
        const estimatedCost = CREDIT_COST[tier];
        send({
          kind: "estimate",
          status: "success",
          title: `Estimativa: ${estimatedCost} crédito(s) (modelo ${tier})`,
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
        const readCache = new Map<string, Observation>();

        for (let turn = 1; turn <= MAX_TURNS; turn++) {
          send({ kind: "thinking", status: "running", title: turn === 1 ? "Analisando o pedido" : `Raciocinando (volta ${turn})` });
          let llm;
          try {
            llm = await runGateway(
              {
                kind: "code",
                tier,
                deepseekOnly: true,
                json: true,
                maxTokens: 6000,
                temperature: 0.2,
                noCache: mode === "apply" || turn > 1,
                messages,
              },
              { cache: supabaseGatewayCache(admin) },
            );
          } catch (err) {
            await recordGatewayFailure(admin, userId, projectId, "code", err).catch(() => {});
            throw err;
          }
          await recordGatewayRun(admin, userId, projectId, llm).catch(() => null);

          let parsed: ReturnType<typeof parseAgentTurn>;
          try {
            parsed = parseAgentTurn(llm.content);
          } catch (parseErr) {
            // Volta tardia mal formada: entrega o que já foi proposto em vez de perder tudo.
            if (turn > 1 && finalTurn) {
              send({ kind: "message", status: "skipped", title: "O modelo respondeu fora do formato; entregando o que já estava pronto" });
              break;
            }
            throw parseErr;
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
          const observations: Observation[] = [];
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
            if (!action.path) continue;

            if (!isSafePath(action.path)) {
              send({ kind: action.type, status: "failed", title: `Caminho não permitido: ${action.path}`, path: action.path });
              continue;
            }

            if (action.type === "read_file") {
              const cached = readCache.get(action.path);
              if (cached) {
                observations.push(cached);
                continue;
              }
              send({ kind: "read_file", status: "running", title: `Lendo ${action.path}`, path: action.path });
              const proposedHere = proposed.get(action.path);
              const file = proposedHere ? { content: proposedHere.content, sha: undefined } : await store.read(action.path);
              const obs: Observation = { path: action.path, found: proposedHere ? true : file.sha !== undefined || file.content !== "", content: file.content };
              readCache.set(action.path, obs);
              observations.push(obs);
              send({
                kind: "read_file",
                status: "success",
                title: `Lido ${action.path}`,
                path: action.path,
                detail: obs.found ? `${file.content.split("\n").length} linhas` : "arquivo novo",
              });
              continue;
            }

            if (action.type === "edit_file" && typeof action.content === "string") {
              proposed.set(action.path, { content: action.content, reason: action.reason });
            }
          }

          // Precisa ler mais? Devolve as observações ao modelo.
          if (!parsed.final && observations.length) {
            messages.push({ role: "assistant", content: llm.content });
            messages.push({ role: "user", content: formatObservations(observations) });
            continue;
          }

          // Auto-revisão do que foi proposto; uma rodada de auto-reparo.
          reviewProblems = {};
          for (const [path, file] of proposed) {
            const problems = lintGeneratedFile(path, file.content);
            if (problems.length) reviewProblems[path] = problems;
          }
          const failing = Object.keys(reviewProblems);
          if (failing.length && repairsLeft > 0 && turn < MAX_TURNS) {
            repairsLeft--;
            repaired = true;
            const list = failing.map((p) => `- ${p}: ${reviewProblems[p].join("; ")}`).join("\n");
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

        // Arquivos com problema grave não entram; sintaxe vira aviso.
        const rejected: string[] = [];
        for (const [path, problems] of Object.entries(reviewProblems)) {
          if (problems.some((p) => !p.startsWith("sintaxe"))) {
            proposed.delete(path);
            rejected.push(`${path}: ${problems.join("; ")}`);
          }
        }
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
            send({ kind: "commit", status: "success", title: `Commitado ${path}`, path, detail: file.reason, diff, commitSha: sha });
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

        // Conectores e APIs que esta aplicação precisa.
        const files: Record<string, string> = {};
        for (const [path, f] of proposed) files[path] = f.content;
        const requirements = applyConnectionStatus(
          mergeDeclaredRequirements(detectRequirements(prompt, files), finalTurn.requirements),
          connected,
        );
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
        const message = err instanceof Error ? err.message : "internal_error";
        console.error("[vibe-code-agent]", message);
        send({ kind: "error", status: "failed", title: "Agente parou", detail: message });
      } finally {
        // Persistência da conversa (não bloqueia o fim do stream em caso de falha).
        if (conversationId) {
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
              content: "",
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
