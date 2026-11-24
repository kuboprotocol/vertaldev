// deno-lint-ignore-file no-explicit-any
// VERTAL Code AI — agente de programação 100% na nuvem (aditivo ao Vibe Code).
//
//   status          ─► perfis disponíveis, sandbox, cota grátis restante
//   plan            ─► MODO PLANO: lê a árvore + arquivos relevantes e devolve passos (não escreve nada)
//   build           ─► MODO CONSTRUIR (ou "fix" com o log do sandbox): devolve edições multi-arquivo
//                      com diff unificado e baseHash; NADA é gravado aqui
//   sandbox_start   ─► sobe o sandbox E2B existente (orchestrator.ts), clona, grava as mudanças
//                      propostas e dispara install + typecheck + test + build em segundo plano
//   sandbox_poll    ─► andamento e erros resumidos (o navegador decide se pede "fix")
//   sandbox_update  ─► grava a nova rodada de mudanças e roda as checagens de novo
//   sandbox_stop    ─► encerra o sandbox
//
// Gravar no projeto continua sendo do caminho "apply" do vibe-code-agent (o
// navegador manda {apply:[{path,content,baseHash}]} para ele), então o motor
// existente, os checkpoints e a trava de escritor ficam exatamente como estão.
//
// Desligado por padrão: sem VERTAL_CODE_AI_ENABLED=true responde 404.
// Chaves só por env/Secrets do Supabase; nada de chave sai daqui.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { destroyContainer, execInContainer, orchestratorDriver, provisionContainer } from "../_shared/orchestrator.ts";
import { decryptSecret, encryptionReady, encryptSecret } from "../_shared/connectorCrypto.ts";
import { resolveEnvForRun } from "../_shared/kuboSecrets.ts";
import { isSafePath, lintGeneratedFile, looksLikeSecret } from "../_shared/vibeAgentCore.ts";
import { hashText } from "../_shared/vibeReviewEngine.ts";
import {
  availableProfiles,
  type Backend,
  buildChain,
  customBackend,
  isEffort,
  isProfileId,
  ollamaBackend,
  paidEnabled,
  type ProfileId,
  type ReasoningEffort,
  reasoningParams,
  type ResolvedBackend,
  shouldFallback,
  validateCustomProvider,
  type VcaiMode,
} from "../_shared/vertalCodeAi/models.ts";
import {
  type Attachment,
  buildMessages,
  type ChatMessage,
  parseBuild,
  parsePlan,
  pickContextFiles,
  sanitizeAttachments,
  type VcaiPlan,
} from "../_shared/vertalCodeAi/protocol.ts";
import { applyEdits, type FileEdit, unifiedDiff, diffStats } from "../_shared/vertalCodeAi/diff.ts";
import {
  cloneCommand,
  emptyProjectCommand,
  launchCommand,
  MAX_SANDBOX_BYTES,
  MAX_SANDBOX_FILES,
  needsReinstall,
  parsePoll,
  pollCommand,
  sanitizeTestCommand,
  summarizeFailure,
  writeFilesCommands,
} from "../_shared/vertalCodeAi/sandbox.ts";

const env = (k: string) => Deno.env.get(k) ?? undefined;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Orçamento de tempo de uma chamada (o limite da edge function é maior; sobra para responder). */
const CALL_BUDGET_MS = Number(env("VERTAL_CODE_AI_BUDGET_MS")) || 130_000;
const PER_BACKEND_TIMEOUT_MS = 90_000;
const HANDLE_TTL_MS = 25 * 60 * 1000;
const BLOCKED_WRITE = /(^|\/)(\.env(\..*)?|package-lock\.json|bun\.lockb?|pnpm-lock\.yaml|yarn\.lock)$|(^|\/)(dist|build|node_modules|\.git)\//;

class UserError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ---------------------------------------------------------------------------
// Leitura do projeto (somente leitura; mesmo critério do vibe-code-agent:
// GitHub quando GITHUB_TOKEN/GITHUB_REPO existem, senão o cofre vibe_project_files)
// ---------------------------------------------------------------------------
interface Reader {
  mode: "github" | "vault";
  list(): Promise<string[]>;
  read(path: string): Promise<string>;
}

function githubConfig() {
  const token = env("GITHUB_TOKEN");
  const repo = env("GITHUB_REPO");
  if (!token || !repo) return null;
  return { token, repo, branch: env("GITHUB_BRANCH") ?? "main" };
}

function b64decode(s: string): string {
  const bin = atob(s.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function makeReader(admin: any, userId: string, projectId: string | null): Reader {
  const gh = githubConfig();
  if (gh) {
    const ghFetch = async (path: string) => {
      const r = await fetch(`https://api.github.com${path}`, {
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${gh.token}`, "User-Agent": "vertal-code-ai" },
        signal: AbortSignal.timeout(20_000),
      });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`github_${r.status}`);
      return await r.json();
    };
    return {
      mode: "github",
      async list() {
        const tree = await ghFetch(`/repos/${gh.repo}/git/trees/${encodeURIComponent(gh.branch)}?recursive=1`);
        return ((tree?.tree ?? []) as Array<{ path: string; type: string }>).filter((n) => n.type === "blob").map((n) => n.path);
      },
      async read(path) {
        const data = await ghFetch(`/repos/${gh.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(gh.branch)}`);
        if (!data || Array.isArray(data) || typeof data.content !== "string") return "";
        return b64decode(data.content);
      },
    };
  }
  const scope = (q: any) => (projectId ? q.eq("project_id", projectId) : q.is("project_id", null));
  return {
    mode: "vault",
    async list() {
      const { data } = await scope(admin.from("vibe_project_files").select("path").eq("user_id", userId).limit(2000));
      return [...new Set<string>((data ?? []).map((r: any) => r.path))].sort();
    },
    async read(path) {
      const { data } = await scope(
        admin.from("vibe_project_files").select("content").eq("user_id", userId).eq("path", path).order("version", { ascending: false }).limit(1),
      );
      return (data?.[0]?.content as string | undefined) ?? "";
    },
  };
}

async function readMany(reader: Reader, paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    paths.map(async (p) => {
      try {
        out[p] = await reader.read(p);
      } catch {
        out[p] = "";
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------
let liveIdsCache: { at: number; ids: Set<string> } | null = null;

/** Lista pública de modelos do OpenRouter (sem chave), cache de 1 h. Falha = não filtra. */
async function liveOpenRouterIds(): Promise<Set<string> | null> {
  if (liveIdsCache && Date.now() - liveIdsCache.at < 3_600_000) return liveIdsCache.ids;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return liveIdsCache?.ids ?? null;
    const data = await r.json();
    const ids = new Set<string>(((data?.data ?? []) as Array<{ id: string }>).map((m) => m.id));
    liveIdsCache = { at: Date.now(), ids };
    return ids;
  } catch {
    return liveIdsCache?.ids ?? null;
  }
}

function textOnly(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) =>
    typeof m.content === "string" ? m : { role: m.role, content: m.content.filter((p) => p.type === "text").map((p: any) => p.text).join("\n") },
  );
}

interface CallResult<T> {
  value: T;
  backend: ResolvedBackend;
  attempts: number;
}

/**
 * Tenta a cadeia em ordem. Passa para o próximo em erro HTTP, timeout, resposta
 * vazia ou JSON inválido. Pago só cobra créditos depois de responder.
 */
async function callChain<T>(
  chain: ResolvedBackend[],
  messages: ChatMessage[],
  effort: ReasoningEffort,
  parse: (raw: string) => T,
  onPaid: (b: Backend) => Promise<void>,
): Promise<CallResult<T>> {
  const deadline = Date.now() + CALL_BUDGET_MS;
  let attempts = 0;
  const errors: string[] = [];
  for (const b of chain) {
    const left = deadline - Date.now();
    if (left < 10_000) break;
    attempts++;
    const body: Record<string, unknown> = {
      model: b.model,
      messages: b.vision ? messages : textOnly(messages),
      temperature: 0.2,
      max_tokens: b.maxTokens,
      ...reasoningParams(b, effort),
    };
    const headers: Record<string, string> = { "Content-Type": "application/json", ...(b.headers ?? {}) };
    if (b.key) headers.Authorization = `Bearer ${b.key}`;
    try {
      const r = await fetch(b.url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.min(PER_BACKEND_TIMEOUT_MS, left - 5000)),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        errors.push(`${b.name}:${r.status}`);
        console.warn(`[vertal-code-ai] ${b.name} HTTP ${r.status}: ${text.slice(0, 200)}`);
        if (shouldFallback(r.status)) continue;
        break;
      }
      const data = await r.json();
      const content = data?.choices?.[0]?.message?.content;
      const raw = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => c?.text ?? "").join("") : "";
      if (!raw.trim()) {
        errors.push(`${b.name}:vazio`);
        continue;
      }
      let value: T;
      try {
        value = parse(raw);
      } catch (e) {
        errors.push(`${b.name}:json`);
        console.warn(`[vertal-code-ai] ${b.name} resposta inválida: ${e instanceof Error ? e.message : e}`);
        continue;
      }
      if (b.cost === "paid") await onPaid(b);
      console.log(`[vertal-code-ai] ok via ${b.name} (tentativa ${attempts}; antes: ${errors.join(", ") || "-"})`);
      return { value, backend: b, attempts };
    } catch (e) {
      errors.push(`${b.name}:${e instanceof Error && e.name === "TimeoutError" ? "timeout" : "rede"}`);
    }
  }
  console.warn(`[vertal-code-ai] cadeia esgotada: ${errors.join(", ")}`);
  if (!chain.length) {
    throw new UserError("Nenhum modelo do VERTAL Code AI está configurado neste servidor. Peça ao administrador para ligar uma camada gratuita.", 503);
  }
  throw new UserError(
    "Os modelos gratuitos estão ocupados ou no limite de hoje. Tente de novo em alguns minutos, escolha outro perfil ou o Servidor próprio.",
    503,
  );
}

// ---------------------------------------------------------------------------
// Sandbox: o handle vai cifrado para o navegador (ninguém executa nada com ele fora daqui)
// ---------------------------------------------------------------------------
interface SandboxHandle {
  ref: string;
  uid: string;
  exp: number;
}

async function sealHandle(h: SandboxHandle): Promise<string> {
  const enc = await encryptSecret(JSON.stringify(h));
  return btoa(JSON.stringify(enc));
}

async function openHandle(raw: unknown, userId: string): Promise<SandboxHandle> {
  if (typeof raw !== "string" || raw.length > 4000) throw new UserError("Sessão de teste inválida.");
  try {
    const h = JSON.parse(await decryptSecret(JSON.parse(atob(raw)))) as SandboxHandle;
    if (h.uid !== userId) throw new Error("dono");
    if (Date.now() > h.exp) throw new UserError("A sessão de teste expirou. Rode os testes de novo.", 410);
    return h;
  } catch (e) {
    if (e instanceof UserError) throw e;
    throw new UserError("Sessão de teste inválida.");
  }
}

function sanitizeFiles(raw: unknown, max = MAX_SANDBOX_FILES): Array<{ path: string; content: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ path: string; content: string }> = [];
  let bytes = 0;
  for (const f of raw.slice(0, max)) {
    const r = (f ?? {}) as Record<string, unknown>;
    if (typeof r.path !== "string" || typeof r.content !== "string") continue;
    if (!isSafePath(r.path) || BLOCKED_WRITE.test(r.path)) throw new UserError(`Arquivo não permitido: ${r.path}`);
    bytes += r.content.length;
    if (bytes > MAX_SANDBOX_BYTES) throw new UserError("Mudanças grandes demais para o sandbox.");
    out.push({ path: r.path, content: r.content });
  }
  return out;
}

async function execOk(ref: string, cmd: string, kind: string, timeoutMs = 110_000) {
  const r = await execInContainer(ref, cmd, kind, timeoutMs);
  if (r.exit_code !== 0) throw new Error(`sandbox_${kind}_falhou: ${r.logs.slice(-400)}`);
  return r;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (env("VERTAL_CODE_AI_ENABLED") !== "true") return json(404, { error: "vertal_code_ai_disabled" });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "missing_authorization" });
  const userClient = createClient(env("SUPABASE_URL")!, env("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userRes?.user) return json(401, { error: "invalid_token" });
  const user = userRes.user;
  const userId = user.id;

  // Beta fechado opcional: lista de ids ou e-mails.
  const allow = (env("VERTAL_CODE_AI_ALLOWED_USERS") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allow.length && !allow.includes(userId.toLowerCase()) && !allow.includes((user.email ?? "").toLowerCase())) {
    return json(403, { error: "Seu acesso ao VERTAL Code AI ainda não foi liberado." });
  }

  const admin: any = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json_body" });
  }
  const action = typeof body.action === "string" ? body.action : "";

  if (action !== "status" && action !== "sandbox_poll") {
    try {
      const { data: rl } = await admin.rpc("bump_rate_limit", { _bucket: "vertal_code_ai", _user: userId, _window_seconds: 60 });
      if (typeof rl === "number" && rl > Number(env("VERTAL_CODE_AI_RPM") ?? 20)) return json(429, { error: "Muitos pedidos seguidos. Espere um minuto." });
    } catch {
      /* sem a RPC o limite fica com os provedores */
    }
  }

  const chargeCredits = async (amount: number, reason: string, metadata: Record<string, unknown>) => {
    if (amount <= 0) return;
    const { error } = await admin.rpc("execute_atomic_credit_deduction", {
      _user_id: userId,
      _amount: amount,
      _reason: reason,
      _category: "vertal_code_ai",
      _metadata: metadata,
      _idempotency_key: `vcai-${userId}-${crypto.randomUUID()}`,
    });
    if (error) throw new UserError("Créditos insuficientes para o perfil Pro.", 402);
  };

  try {
    let projectId: string | null = null;
    if (typeof body.projectId === "string" && UUID_RE.test(body.projectId)) {
      const { data: proj } = await userClient.from("projects").select("id").eq("id", body.projectId).maybeSingle();
      projectId = (proj?.id as string | undefined) ?? null;
    }

    // ---------------------------------------------------------------- status
    if (action === "status") {
      const or = env("OPENROUTER_API_KEY") ?? env("NAVIGATOR_OPENROUTER_KEY");
      let freeRequestsLeft: number | null = null;
      if (or) {
        try {
          const r = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${or}` }, signal: AbortSignal.timeout(3000) });
          const d = await r.json();
          const left = d?.data?.free_model_daily_requests?.remaining;
          if (typeof left === "number") freeRequestsLeft = left;
        } catch {
          /* opcional */
        }
      }
      return json(200, {
        enabled: true,
        profiles: availableProfiles(env).map(({ id, label, description, cost }) => ({ id, label, description, cost })),
        sandbox: orchestratorDriver() !== null && encryptionReady(),
        projectSource: githubConfig() ? "github" : "vault",
        paid: paidEnabled(env),
        selfHosted: !!ollamaBackend(env),
        customProviders: true,
        freeRequestsLeft,
      });
    }

    // ------------------------------------------------------- plan / build / fix
    if (action === "plan" || action === "build") {
      const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 12_000) : "";
      if (!prompt) throw new UserError("Escreva o que você quer fazer.");
      const fix = body.fix && typeof body.fix === "object" ? (body.fix as Record<string, unknown>) : null;
      const mode: VcaiMode = action === "plan" ? "plan" : fix ? "fix" : "build";
      const profile: ProfileId = isProfileId(body.profile) ? body.profile : "auto";
      const effort: ReasoningEffort = isEffort(body.effort) ? body.effort : mode === "plan" ? "medium" : "low";
      const attachments: Attachment[] = sanitizeAttachments(body.attachments);
      const needsVision = attachments.some((a) => a.kind === "image");
      const history = Array.isArray(body.history)
        ? (body.history as any[])
            .filter((h) => (h?.role === "user" || h?.role === "assistant") && typeof h?.content === "string")
            .slice(-6)
            .map((h) => ({ role: h.role as "user" | "assistant", content: String(h.content) }))
        : [];

      // Provedor próprio: a chave vem do Cofre de Segredos do usuário, resolvida aqui.
      let custom: Backend | null = null;
      let customKey: string | undefined;
      if (profile === "custom") {
        const v = validateCustomProvider(body.customProvider);
        if (!v.ok) throw new UserError(v.error);
        custom = customBackend(v.provider);
        if (v.provider.keyEnv) {
          const resolved = await resolveEnvForRun(admin, userId, [v.provider.keyEnv], { target: "vertal_code_ai" });
          const k = resolved.env[v.provider.keyEnv];
          if (!k) throw new UserError(`A chave ${v.provider.keyEnv} não está no seu Cofre de Segredos.`);
          customKey = k;
        } else {
          customKey = "";
        }
      }

      const chain = buildChain({ profile, mode, needsVision, env, liveOpenRouterIds: await liveOpenRouterIds(), custom }, customKey);
      const withImages = needsVision && chain.some((b) => b.vision);

      const reader = makeReader(admin, userId, projectId);
      const tree = await reader.list().catch(() => [] as string[]);
      const plan = (body.plan && typeof body.plan === "object" ? (body.plan as VcaiPlan) : null) ?? null;
      const mentioned = [
        ...(Array.isArray(plan?.steps) ? plan!.steps.flatMap((s) => (Array.isArray(s?.files) ? s.files : [])) : []),
        ...(Array.isArray(body.openFiles) ? (body.openFiles as unknown[]).filter((p): p is string => typeof p === "string") : []),
      ].filter((p) => isSafePath(p));

      // Versão em andamento (rodadas de correção): o que já foi proposto e ainda não aplicado.
      const working = sanitizeFiles(fix?.files ?? body.workingFiles ?? [], 60);
      const workingMap = Object.fromEntries(working.map((f) => [f.path, f.content]));
      const contextPaths = pickContextFiles(tree, prompt, [...working.map((f) => f.path), ...mentioned], mode === "plan" ? 8 : 10);
      const original = await readMany(reader, contextPaths.filter((p) => !(p in workingMap) || tree.includes(p)));
      const current: Record<string, string> = { ...original, ...workingMap };
      const files = contextPaths.map((p) => ({ path: p, content: current[p] ?? "" })).filter((f) => f.content);

      const failureLog = typeof fix?.log === "string" ? summarizeFailure(fix.log) : undefined;
      const editFailures = Array.isArray(fix?.failures) ? (fix!.failures as any[]).slice(0, 10).map((f) => ({ path: String(f?.path ?? ""), error: String(f?.error ?? "") })) : undefined;
      const messages = buildMessages({ mode, prompt, tree, files, plan, attachments, history, failureLog, editFailures }, withImages);
      const paidCredits = Number(env("VERTAL_CODE_AI_PAID_CREDITS") ?? 3);
      const onPaid = (b: Backend) => chargeCredits(paidCredits, "vertal_code_ai:paid", { mode, backend: b.name });

      if (mode === "plan") {
        const res = await callChain(chain, messages, effort, parsePlan, onPaid);
        return json(200, {
          mode,
          plan: res.value,
          route: { cost: res.backend.cost, attempts: res.attempts, imagesRead: withImages && res.backend.vision },
        });
      }

      const res = await callChain(chain, messages, effort, parseBuild, onPaid);
      const build = res.value;
      const rejected: Array<{ path: string; error: string }> = [];
      const edits: FileEdit[] = [];
      for (const e of build.edits) {
        if (!isSafePath(e.path) || BLOCKED_WRITE.test(e.path)) rejected.push({ path: e.path, error: "caminho não permitido" });
        else edits.push(e);
      }
      // Arquivos editados que não estavam no contexto: lê do projeto antes de aplicar.
      const missing = [...new Set(edits.map((e) => e.path))].filter((p) => !(p in current) && tree.includes(p));
      if (missing.length) Object.assign(original, await readMany(reader, missing));
      for (const p of missing) current[p] = original[p] ?? "";

      const { applied, failures } = applyEdits(current, edits);
      const out = applied.map((a) => {
        const base = original[a.path] ?? "";
        const diff = unifiedDiff(a.path, base, a.after);
        const problems = [...lintGeneratedFile(a.path, a.after), ...(looksLikeSecret(a.after) ? ["parece conter um segredo"] : [])];
        return {
          path: a.path,
          isNew: base === "",
          after: a.after,
          diff,
          ...diffStats(diff),
          reason: a.reason ?? null,
          baseHash: base === "" ? "" : hashText(base),
          problems,
        };
      });
      return json(200, {
        mode,
        summary: build.summary,
        notes: build.notes,
        testCommand: sanitizeTestCommand(build.testCommand) ?? null,
        files: out,
        failures: [...rejected, ...failures],
        route: { cost: res.backend.cost, attempts: res.attempts, imagesRead: withImages && res.backend.vision },
      });
    }

    // ----------------------------------------------------------------- sandbox
    if (action === "sandbox_start") {
      if (orchestratorDriver() === null) throw new UserError("O sandbox de testes não está configurado neste servidor.", 503);
      if (!encryptionReady()) throw new UserError("O sandbox de testes precisa da chave de cifra do servidor.", 503);
      const files = sanitizeFiles(body.files);
      const testCommand = sanitizeTestCommand(typeof body.testCommand === "string" ? body.testCommand : undefined);
      await chargeCredits(Number(env("VERTAL_CODE_AI_SANDBOX_CREDITS") ?? 0), "vertal_code_ai:sandbox", { files: files.length });

      const sessionId = crypto.randomUUID();
      const prov = await provisionContainer(sessionId, projectId ?? "vertal-code-ai", userId, 1500, env("VERTAL_CODE_AI_SANDBOX_TEMPLATE"));
      const ref = prov.container_ref;
      try {
        const gh = githubConfig();
        if (gh) {
          await execOk(ref, cloneCommand(gh.repo, gh.branch, gh.token), "clone", 115_000);
        } else {
          await execOk(ref, emptyProjectCommand(), "init");
          const reader = makeReader(admin, userId, projectId);
          const paths = (await reader.list()).slice(0, MAX_SANDBOX_FILES);
          const projectFiles = await readMany(reader, paths);
          const list = Object.entries(projectFiles).map(([path, content]) => ({ path, content })).filter((f) => isSafePath(f.path));
          for (const cmd of writeFilesCommands(list)) await execOk(ref, cmd, "write");
        }
        for (const cmd of writeFilesCommands(files)) await execOk(ref, cmd, "write");
        await execOk(ref, launchCommand({ install: true, testCommand }), "launch");
      } catch (e) {
        await destroyContainer(ref);
        console.error("[vertal-code-ai] sandbox_start:", e instanceof Error ? e.message.replace(/Basic [A-Za-z0-9+/=]+/g, "Basic ***") : e);
        throw new UserError("Não consegui preparar o sandbox de testes. Tente de novo.", 502);
      }
      return json(200, { handle: await sealHandle({ ref, uid: userId, exp: Date.now() + HANDLE_TTL_MS }), status: "running" });
    }

    if (action === "sandbox_poll") {
      const h = await openHandle(body.handle, userId);
      const r = await execInContainer(h.ref, pollCommand(), "poll", 30_000);
      const p = parsePoll(r.logs);
      return json(200, {
        done: p.done,
        exitCode: p.exitCode,
        steps: p.steps,
        log: p.log.slice(-6000),
        failure: p.done && p.exitCode !== 0 ? summarizeFailure(p.log) : null,
      });
    }

    if (action === "sandbox_update") {
      const h = await openHandle(body.handle, userId);
      const files = sanitizeFiles(body.files);
      const testCommand = sanitizeTestCommand(typeof body.testCommand === "string" ? body.testCommand : undefined);
      for (const cmd of writeFilesCommands(files)) await execOk(h.ref, cmd, "write");
      await execOk(h.ref, launchCommand({ install: needsReinstall(files.map((f) => f.path)), testCommand }), "launch");
      return json(200, { handle: await sealHandle({ ...h, exp: Date.now() + HANDLE_TTL_MS }), status: "running" });
    }

    if (action === "sandbox_stop") {
      const h = await openHandle(body.handle, userId).catch(() => null);
      if (h) await destroyContainer(h.ref);
      return json(200, { ok: true });
    }

    throw new UserError("Ação desconhecida.");
  } catch (e) {
    if (e instanceof UserError) return json(e.status, { error: e.message });
    console.error("[vertal-code-ai] erro:", e instanceof Error ? e.message : e);
    return json(500, { error: "Algo deu errado no VERTAL Code AI. Tente de novo." });
  }
});
