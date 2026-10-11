// Vibe Agents: user-created agents that plan, call tools and delegate to other agents.
//   POST { action: "design", description }        → agent spec (name, instructions, tools) + connector readiness
//   POST { action: "readiness", tools }            → which connectors the tools need and whether they are connected
//   POST { action: "save", name, instructions, tools, agent_id? } → create or update an agent
//   POST { action: "run", agent_id, task }         → run it; returns the run with every step
// Billing is metered like the rest of Vertal (VIBE_AGENT_PRICING): a run fee, then 1 credit before each AI step
// and each Python run. Out of credits mid-run, the agent stops and returns what it has; a failed run is refunded.
// python_run executes code in one E2B sandbox per run (shared with sub-agents, destroyed when the run ends).
// Agents only get the tools the user approved. Steps and side effects (sends, issues) are capped per run and
// shared with sub-agents, so agents creating and running agents cannot loop or spam.
import { corsHeaders } from "../_shared/cors.ts";
import * as creative from "../_shared/creative.ts";
import { decryptSecret } from "../_shared/connectorCrypto.ts";
import { getFreshAccessToken, loadAccount } from "../_shared/gmailToken.ts";
import { validatePublicUrl } from "../_shared/security.ts";
import { destroyContainer, execInContainer, provisionContainer } from "../_shared/orchestrator.ts";
import {
  VIBE_AGENT_LIMITS as LIMITS,
  VIBE_AGENT_PRICING as PRICING,
  VIBE_CONNECTORS,
  VIBE_PLATFORM_REQUIREMENTS,
  VIBE_TOOLS,
  VIBE_TOOL_IDS,
  requiredConnectors,
  requiredPlatform,
  sanitizePackages,
  sanitizeTools,
  type VibeConnector,
  type VibeToolId,
} from "../_shared/vibeAgentsConfig.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-4o-mini";
/** E2B template with Python + pandas/numpy/scikit-learn/matplotlib preinstalled. */
const DEFAULT_SANDBOX_TEMPLATE = "code-interpreter-v1";

type Agent = { id: string; user_id: string; name: string; instructions: string; tools: VibeToolId[] };
type Step =
  | { type: "thought"; agent: string; text: string }
  | { type: "tool"; agent: string; tool: VibeToolId; args: Record<string, unknown>; ok: boolean; result: string }
  | { type: "final"; agent: string; text: string };
interface RunBudget {
  steps: number;
  sideEffects: number;
  /** Credits charged so far in this run. */
  credits: number;
  user: { id: string; email?: string | null };
  /** Sandbox of this run, created on the first python_run. */
  sandboxRef?: string;
}

const defaultDeps = {
  getUser: creative.getUser,
  deductCredits: creative.deductCredits,
  admin: creative.supaAdmin as () => any,
  fetch: (input: string, init?: RequestInit) => fetch(input, init),
  env: (k: string): string | undefined => Deno.env.get(k),
  decrypt: decryptSecret,
  sandbox: {
    create: async (runId: string, userId: string, template: string) =>
      (await provisionContainer(runId, "vibe-agent", userId, LIMITS.sandboxLifetimeSeconds, template)).container_ref,
    exec: (ref: string, command: string, timeoutMs: number) => execInContainer(ref, command, "python", timeoutMs),
    destroy: (ref: string) => destroyContainer(ref),
  },
  gmailToken: async (admin: any, userId: string): Promise<{ token: string; email: string } | null> => {
    const { data } = await admin.from("gmail_accounts").select("id").eq("user_id", userId).limit(1).maybeSingle();
    if (!data) return null;
    const acct = await loadAccount(admin, userId, data.id);
    return { token: await getFreshAccessToken(admin, acct), email: (acct as { email: string }).email };
  },
};
let deps = defaultDeps;
/** Test seam: swap external dependencies (database, model, connectors). */
export function __setDeps(d: Partial<typeof defaultDeps>) {
  deps = { ...defaultDeps, ...d };
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j(405, { error: "method_not_allowed" });
  const user = await deps.getUser(req.headers.get("Authorization"));
  if (!user) return j(401, { error: "unauthorized" });

  try {
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case "design":
        return await design(user.id, body.description);
      case "readiness":
        return j(200, { connectors: await readiness(user.id, sanitizeTools(body.tools)) });
      case "save":
        return await save(user.id, body);
      case "run":
        return await run(user, body.agent_id, body.task, req.headers.get("X-Idempotency-Key"));
      default:
        return j(400, { error: "invalid_action" });
    }
  } catch (e) {
    console.error("[vibe-agents] error:", e);
    return j(500, { error: creative.sanitizeError(e) });
  }
}

Deno.serve(creative.withRefundOnFailure(handleRequest));

// ---------------------------------------------------------------- design / readiness / save

async function design(userId: string, description: unknown) {
  if (typeof description !== "string" || description.trim().length < 5) return j(400, { error: "description_required" });
  const catalog = VIBE_TOOL_IDS.map((id) => `- ${id}: ${VIBE_TOOLS[id].description}`).join("\n");
  const reply = await chat([
    {
      role: "system",
      content:
        `Você projeta agentes de IA para o Vertal Vibe Code. A partir do pedido do usuário, devolva APENAS JSON:\n` +
        `{"name": string (curto), "instructions": string (passo a passo claro, em português, de como o agente trabalha), ` +
        `"tools": string[] (somente IDs desta lista, o mínimo necessário)}\nFerramentas:\n${catalog}`,
    },
    { role: "user", content: description.slice(0, LIMITS.maxInstructionsChars) },
  ], { json: true });
  let spec: { name?: unknown; instructions?: unknown; tools?: unknown };
  try {
    spec = JSON.parse(reply.content ?? "{}");
  } catch {
    return j(502, { error: "invalid_design" });
  }
  const tools = sanitizeTools(spec.tools);
  const agent = {
    name: String(spec.name ?? "Novo agente").slice(0, LIMITS.maxNameChars),
    instructions: String(spec.instructions ?? description).slice(0, LIMITS.maxInstructionsChars),
    tools,
  };
  return j(200, { agent, connectors: await readiness(userId, tools) });
}

async function readiness(userId: string, tools: VibeToolId[]) {
  const connectors = await Promise.all(
    requiredConnectors(tools).map(async (c) => ({
      connector: c as string,
      label: VIBE_CONNECTORS[c].label,
      setup_route: VIBE_CONNECTORS[c].setupRoute as string | null,
      connected: await isConnected(userId, c),
    })),
  );
  // Platform capabilities: the user cannot connect these, so there is no setup route.
  const platform = requiredPlatform(tools).map((r) => ({
    connector: r as string,
    label: VIBE_PLATFORM_REQUIREMENTS[r].label,
    setup_route: null,
    connected: sandboxConfigured(),
  }));
  return [...connectors, ...platform];
}

function sandboxConfigured(): boolean {
  return !!deps.env("E2B_API_KEY");
}

async function isConnected(userId: string, c: VibeConnector): Promise<boolean> {
  const admin = deps.admin();
  if (c === "gmail") {
    const { data } = await admin.from("gmail_accounts").select("id").eq("user_id", userId).limit(1).maybeSingle();
    return !!data;
  }
  const { data } = await admin.from("api_credentials").select("id").eq("user_id", userId).eq("connector_slug", c).maybeSingle();
  if (data) return true;
  if (c === "github") {
    const { data: gh } = await admin.from("github_connections").select("user_id").eq("user_id", userId).maybeSingle();
    return !!gh;
  }
  return false;
}

async function save(userId: string, body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim().slice(0, LIMITS.maxNameChars) : "";
  const instructions = typeof body.instructions === "string" ? body.instructions.trim().slice(0, LIMITS.maxInstructionsChars) : "";
  if (!name || !instructions) return j(400, { error: "name_and_instructions_required" });
  const row = { name, instructions, tools: sanitizeTools(body.tools), updated_at: new Date().toISOString() };
  const admin = deps.admin();
  if (typeof body.agent_id === "string") {
    const { data, error } = await admin.from("vibe_agents").update(row).eq("id", body.agent_id).eq("user_id", userId).select("*").maybeSingle();
    if (error) throw new Error(`agent_update_failed:${error.message}`);
    return data ? j(200, { agent: data }) : j(404, { error: "not_found" });
  }
  return await createAgent(userId, row);
}

async function createAgent(userId: string, row: { name: string; instructions: string; tools: VibeToolId[] }) {
  const admin = deps.admin();
  const { count } = await admin.from("vibe_agents").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if ((count ?? 0) >= LIMITS.maxAgentsPerUser) return j(409, { error: "agent_limit_reached" });
  const { data, error } = await admin.from("vibe_agents").insert({ user_id: userId, ...row }).select("*").single();
  if (error || !data) throw new Error(`agent_insert_failed:${error?.message}`);
  return j(200, { agent: data });
}

// ---------------------------------------------------------------- run

async function run(user: { id: string; email?: string | null }, agentId: unknown, task: unknown, idempotencyKey: string | null) {
  if (typeof agentId !== "string") return j(400, { error: "agent_id_required" });
  if (typeof task !== "string" || !task.trim()) return j(400, { error: "task_required" });
  if (!deps.env("OPENROUTER_API_KEY")) return j(503, { error: "agent_model_not_configured" });

  const agent = await loadAgent(user.id, agentId);
  if (!agent) return j(404, { error: "not_found" });

  const ded = await deps.deductCredits(user.id, PRICING.runFee, "vibe_agent_run", { agent_id: agent.id }, user.email, idempotencyKey);
  if (!ded.ok) return j(ded.status ?? 402, { error: ded.error, credits_required: PRICING.runFee + PRICING.perStep });

  const admin = deps.admin();
  const { data: runRow, error } = await admin
    .from("vibe_agent_runs")
    .insert({ agent_id: agent.id, user_id: user.id, status: "running", task: task.slice(0, LIMITS.maxTaskChars), credits_spent: PRICING.runFee })
    .select("id")
    .single();
  if (error || !runRow) throw new Error(`run_insert_failed:${error?.message}`);

  const steps: Step[] = [];
  const budget: RunBudget & { runId: string } = { steps: 0, sideEffects: 0, credits: PRICING.runFee, user, runId: runRow.id };
  let output = "";
  let status: "completed" | "failed" = "completed";
  try {
    output = await executeAgent(user.id, agent, task.slice(0, LIMITS.maxTaskChars), steps, budget, 0);
  } catch (e) {
    status = "failed";
    output = creative.sanitizeError(e);
    console.error("[vibe-agents] run failed:", e);
  } finally {
    if (budget.sandboxRef) await deps.sandbox.destroy(budget.sandboxRef).catch(() => {});
  }
  await admin
    .from("vibe_agent_runs")
    .update({ status, output, steps, credits_spent: budget.credits, finished_at: new Date().toISOString() })
    .eq("id", runRow.id);

  const result = { run_id: runRow.id, status, output, steps, credits_charged: budget.credits };
  // A failed run delivered nothing: a non-2xx answer makes withRefundOnFailure refund the charge.
  return j(status === "completed" ? 200 : 502, result);
}

async function loadAgent(userId: string, agentId: string): Promise<Agent | null> {
  const { data } = await deps.admin().from("vibe_agents").select("id, user_id, name, instructions, tools").eq("id", agentId).eq("user_id", userId).maybeSingle();
  return data ? { ...data, tools: sanitizeTools(data.tools) } : null;
}

async function executeAgent(userId: string, agent: Agent, task: string, steps: Step[], budget: RunBudget & { runId: string }, depth: number): Promise<string> {
  const tools = agent.tools.map((id) => ({
    type: "function",
    function: { name: id, description: VIBE_TOOLS[id].description, parameters: VIBE_TOOLS[id].parameters },
  }));
  const messages: any[] = [
    {
      role: "system",
      content:
        `Você é "${agent.name}", um agente do Vertal Vibe Code.\n${agent.instructions}\n\n` +
        `Use as ferramentas quando precisar. Responda em português. Quando terminar, dê a resposta final sem chamar ferramentas.`,
    },
    { role: "user", content: task },
  ];

  while (budget.steps < LIMITS.maxSteps) {
    if (!(await charge(budget, PRICING.perStep, "vibe_agent_step"))) {
      // Nothing done yet: fail the run so the fee is refunded instead of charging for nothing.
      if (budget.steps === 0) throw new Error("insufficient_credits");
      const text = "Parei aqui: seus créditos acabaram. O que foi feito até agora está acima.";
      steps.push({ type: "final", agent: agent.name, text });
      return text;
    }
    budget.steps++;
    const msg = await chat(messages, tools.length ? { tools } : {});
    messages.push(msg);
    const calls: any[] = msg.tool_calls ?? [];
    if (!calls.length) {
      const text = String(msg.content ?? "").trim();
      steps.push({ type: "final", agent: agent.name, text });
      return text;
    }
    if (msg.content) steps.push({ type: "thought", agent: agent.name, text: String(msg.content) });
    for (const call of calls) {
      const tool = call.function?.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch { /* invalid JSON: the tool reports missing arguments */ }
      let ok = true;
      let result: string;
      try {
        if (!agent.tools.includes(tool)) throw new Error(`tool_not_allowed:${tool}`);
        result = await runTool(userId, tool as VibeToolId, args, { agent, steps, budget, depth });
      } catch (e) {
        ok = false;
        result = `erro: ${e instanceof Error ? e.message : String(e)}`;
      }
      result = result.slice(0, LIMITS.maxToolResultChars);
      steps.push({ type: "tool", agent: agent.name, tool, args, ok, result });
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
  throw new Error("step_limit_reached");
}

// ---------------------------------------------------------------- tools

interface ToolCtx {
  agent: Agent;
  steps: Step[];
  budget: RunBudget & { runId: string };
  depth: number;
}

async function runTool(userId: string, tool: VibeToolId, args: Record<string, unknown>, ctx: ToolCtx): Promise<string> {
  if (VIBE_TOOLS[tool].sideEffect) {
    if (ctx.budget.sideEffects >= LIMITS.maxSideEffects) throw new Error("side_effect_limit_reached");
    ctx.budget.sideEffects++;
  }
  const s = (k: string, max = 20000) => (typeof args[k] === "string" ? (args[k] as string).slice(0, max) : "");
  switch (tool) {
    case "web_fetch":
      return await webFetch(s("url", 2048));
    case "slack_post":
      return await slackPost(userId, s("channel", 80), s("text", 4000));
    case "email_send":
      return await emailSend(userId, s("to", 254), s("subject", 200), s("body"));
    case "github_list_repos":
      return await githubList(userId, s("repo", 200));
    case "github_create_issue":
      return await githubIssue(userId, s("repo", 200), s("title", 256), s("body"));
    case "python_run":
      return await pythonRun(userId, s("code", 20000), sanitizePackages(args.packages), ctx.budget);
    case "create_agent": {
      if (ctx.depth >= LIMITS.maxDepth) throw new Error("agent_depth_limit");
      const res = await createAgent(userId, {
        name: s("name", LIMITS.maxNameChars) || "Sub-agente",
        instructions: s("instructions", LIMITS.maxInstructionsChars),
        // A created agent never gets more power than its creator.
        tools: sanitizeTools(args.tools).filter((t) => ctx.agent.tools.includes(t)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "create_agent_failed");
      return JSON.stringify({ agent_id: data.agent.id, name: data.agent.name, tools: data.agent.tools });
    }
    case "run_agent": {
      if (ctx.depth >= LIMITS.maxDepth) throw new Error("agent_depth_limit");
      const sub = await loadAgent(userId, s("agent_id", 64));
      if (!sub) throw new Error("agent_not_found");
      return await executeAgent(userId, sub, s("task", LIMITS.maxTaskChars), ctx.steps, ctx.budget, ctx.depth + 1);
    }
  }
}

/**
 * Charges metered credits inside a run. The run start was already rate limited, so per-step charges skip it.
 * Returns false when the balance is not enough (the caller stops gracefully).
 */
async function charge(budget: RunBudget, amount: number, reason: string): Promise<boolean> {
  const ded = await deps.deductCredits(budget.user.id, amount, reason, {}, budget.user.email, null, { rateLimit: false });
  if (!ded.ok) return false;
  budget.credits += amount;
  return true;
}

async function pythonRun(userId: string, code: string, packages: string[], budget: RunBudget & { runId: string }): Promise<string> {
  if (!code.trim()) throw new Error("code_required");
  if (!sandboxConfigured()) throw new Error("sandbox_not_configured");
  if (!(await charge(budget, PRICING.perPythonRun, "vibe_agent_python"))) throw new Error("insufficient_credits");
  budget.sandboxRef ??= await deps.sandbox.create(budget.runId, userId, deps.env("VIBE_SANDBOX_TEMPLATE") || DEFAULT_SANDBOX_TEMPLATE);
  // The code travels base64-encoded, so nothing in it is interpreted by the shell.
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(code)));
  const install = packages.length ? `pip install -q ${packages.join(" ")} > /tmp/pip.log 2>&1 || tail -3 /tmp/pip.log; ` : "";
  const cmd = `set -o pipefail; cd /home/user && echo ${b64} | base64 -d > main.py && ${install}timeout ${LIMITS.pythonTimeoutSeconds} python3 main.py 2>&1 | head -c 20000`;
  const res = await deps.sandbox.exec(budget.sandboxRef, cmd, (LIMITS.pythonTimeoutSeconds + 60) * 1000);
  const out = res.logs.trim() || "(sem saída: use print() para mostrar resultados)";
  return res.exit_code === 0 ? out : `${out}\n[exit ${res.exit_code}]`;
}

async function webFetch(raw: string): Promise<string> {
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    const u = validatePublicUrl(url);
    if (u.protocol !== "https:") throw new Error("https_only");
    // Redirects are followed by hand so every hop goes through the same public-URL check.
    const res = await deps.fetch(u.toString(), { redirect: "manual", headers: { "User-Agent": "VertalAgent/1.0" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, u).toString();
      continue;
    }
    if (!res.ok) throw new Error(`http_${res.status}`);
    const text = (await res.text()).slice(0, 400_000);
    return htmlToText(text).slice(0, LIMITS.maxToolResultChars);
  }
  throw new Error("too_many_redirects");
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function credential(userId: string, slug: VibeConnector): Promise<string | null> {
  const admin = deps.admin();
  const { data } = await admin.from("api_credentials").select("ciphertext, iv, tag").eq("user_id", userId).eq("connector_slug", slug).maybeSingle();
  if (data) return await deps.decrypt(data);
  if (slug === "github") {
    const { data: gh } = await admin
      .from("github_connections")
      .select("access_token_ciphertext, access_token_iv, access_token_tag")
      .eq("user_id", userId)
      .maybeSingle();
    if (gh) return await deps.decrypt({ ciphertext: gh.access_token_ciphertext, iv: gh.access_token_iv, tag: gh.access_token_tag });
  }
  return null;
}

async function slackPost(userId: string, channel: string, text: string): Promise<string> {
  const token = await credential(userId, "slack");
  if (!token) throw new Error("slack_not_connected");
  const res = await deps.fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel, text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`slack_error:${data.error ?? res.status}`);
  return `mensagem enviada em ${channel}`;
}

async function emailSend(userId: string, to: string, subject: string, body: string): Promise<string> {
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) throw new Error("invalid_recipient");
  const gmail = await deps.gmailToken(deps.admin(), userId);
  if (!gmail) throw new Error("gmail_not_connected");
  const clean = (v: string) => v.replace(/[\r\n]+/g, " "); // no header injection from model output
  const raw = [`To: ${clean(to)}`, `Subject: ${clean(subject)}`, 'Content-Type: text/plain; charset="UTF-8"', "MIME-Version: 1.0", "", body].join("\r\n");
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(raw))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const res = await deps.fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${gmail.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64 }),
  });
  if (!res.ok) throw new Error(`gmail_error:${res.status}`);
  return `e-mail enviado para ${to}`;
}

async function github(userId: string, path: string, init: RequestInit = {}): Promise<any> {
  const token = await credential(userId, "github");
  if (!token) throw new Error("github_not_connected");
  const res = await deps.fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "VertalAgent", ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`github_${res.status}:${data.message ?? ""}`);
  return data;
}

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

async function githubList(userId: string, repo: string): Promise<string> {
  if (!repo) {
    const repos = await github(userId, "/user/repos?per_page=30&sort=updated");
    return JSON.stringify(repos.map((r: any) => ({ repo: r.full_name, private: r.private, open_issues: r.open_issues_count })));
  }
  if (!REPO_RE.test(repo)) throw new Error("invalid_repo");
  const issues = await github(userId, `/repos/${repo}/issues?state=open&per_page=30`);
  return JSON.stringify(issues.map((i: any) => ({ number: i.number, title: i.title, labels: i.labels?.map((l: any) => l.name), url: i.html_url })));
}

async function githubIssue(userId: string, repo: string, title: string, body: string): Promise<string> {
  if (!REPO_RE.test(repo)) throw new Error("invalid_repo");
  if (!title) throw new Error("title_required");
  const issue = await github(userId, `/repos/${repo}/issues`, { method: "POST", body: JSON.stringify({ title, body }) });
  return `issue #${issue.number} criada: ${issue.html_url}`;
}

// ---------------------------------------------------------------- model

async function chat(messages: unknown[], opts: { json?: boolean; tools?: unknown[] } = {}): Promise<any> {
  const key = deps.env("OPENROUTER_API_KEY");
  if (!key) throw new Error("agent_model_not_configured");
  const res = await deps.fetch(OPENROUTER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "https://vertal.dev", "X-Title": "Vertal Vibe Agents" },
    body: JSON.stringify({
      model: deps.env("VIBE_AGENT_MODEL") || DEFAULT_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 2000,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      ...(opts.tools ? { tools: opts.tools, tool_choice: "auto" } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`model_error_${res.status}`);
  const msg = data?.choices?.[0]?.message;
  if (!msg) throw new Error("model_empty_response");
  return msg;
}

function j(s: number, b: unknown) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
