// Run with: deno test --allow-env supabase/functions/vibe-agents/index_test.ts
// (esm.sh imports need network; offline, map them to npm: with --import-map.)
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

(Deno as unknown as { serve: unknown }).serve = () => ({});
const { handleRequest, __setDeps } = await import("./index.ts");

const USER = "11111111-1111-1111-1111-111111111111";

/** Minimal chainable stand-in for the supabase-js query builder over in-memory tables. */
function fakeAdmin(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      const rows = (tables[table] ??= []);
      const filters: [string, unknown][] = [];
      let op: "select" | "insert" | "update" = "select";
      let payload: any = null;
      let head = false;
      const match = () => rows.filter((r) => filters.every(([k, v]) => r[k] === v));
      const exec = () => {
        if (op === "insert") {
          const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...payload };
          rows.push(row);
          return [row];
        }
        if (op === "update") {
          const hit = match();
          hit.forEach((r) => Object.assign(r, structuredClone(payload)));
          return hit;
        }
        return match();
      };
      const q: any = {
        select: (_cols?: string, opts?: { head?: boolean }) => ((head = !!opts?.head), q),
        insert: (row: any) => ((op = "insert"), (payload = row), q),
        update: (patch: any) => ((op = "update"), (payload = patch), q),
        eq: (k: string, v: unknown) => (filters.push([k, v]), q),
        limit: () => q,
        single: async () => ({ data: exec()[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: structuredClone(exec()[0] ?? null), error: null }),
        then: (resolve: any) => {
          const data = exec();
          resolve(head ? { count: data.length, error: null } : { data, error: null });
        },
      };
      return q;
    },
  };
}

type ModelTurn = { content?: string; tool_calls?: { name: string; args: unknown }[] };

function setup(opts: { model?: ModelTurn[]; openrouter?: boolean; connected?: string[]; agentTools?: string[] } = {}) {
  const tables: Record<string, any[]> = {
    vibe_agents: [{ id: "agent-1", user_id: USER, name: "Pesquisador", instructions: "Pesquise.", tools: opts.agentTools ?? ["web_fetch", "slack_post", "create_agent", "run_agent"] }],
    vibe_agent_runs: [],
    api_credentials: (opts.connected ?? []).map((slug) => ({ id: crypto.randomUUID(), user_id: USER, connector_slug: slug, ciphertext: "c", iv: "i", tag: "t" })),
    gmail_accounts: [],
    github_connections: [],
  };
  const deductions: number[] = [];
  const turns = [...(opts.model ?? [{ content: "pronto" }])];
  const requests: any[] = [];
  const outbound: string[] = [];

  const fakeFetch = async (url: string, init?: RequestInit) => {
    if (url.startsWith("https://openrouter.ai/")) {
      requests.push(JSON.parse(String(init?.body)));
      const t = turns.shift() ?? { content: "fim" };
      const message = t.tool_calls
        ? { role: "assistant", content: t.content ?? null, tool_calls: t.tool_calls.map((c, i) => ({ id: `call_${requests.length}_${i}`, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })) }
        : { role: "assistant", content: t.content };
      return new Response(JSON.stringify({ choices: [{ message }] }));
    }
    outbound.push(url);
    if (url === "https://slack.com/api/chat.postMessage") return new Response(JSON.stringify({ ok: true }));
    if (url.startsWith("https://example.com")) return new Response("<html><body><h1>Olá</h1><script>x()</script></body></html>");
    throw new Error(`unexpected fetch ${url}`);
  };

  const env: Record<string, string> = {};
  if (opts.openrouter !== false) env.OPENROUTER_API_KEY = "or-test";

  __setDeps({
    getUser: async (h: string | null) => (h === "Bearer ok" ? { id: USER, email: "u@x.dev" } : null),
    deductCredits: async (_u: string, amount: number) => (deductions.push(amount), { ok: true }),
    admin: () => fakeAdmin(tables),
    fetch: fakeFetch,
    env: (k: string) => env[k],
    decrypt: async () => "xoxb-token",
    gmailToken: async () => null,
  } as any);

  const call = async (body: unknown, auth = "Bearer ok") => {
    const res = await handleRequest(new Request("https://fn/vibe-agents", { method: "POST", headers: { Authorization: auth }, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
  return { call, tables, deductions, requests, outbound };
}

const run = (task = "faça") => ({ action: "run", agent_id: "agent-1", task });
const toolSteps = (body: any) => body.steps.filter((s: any) => s.type === "tool");

Deno.test("rejects unauthenticated requests", async () => {
  assertEquals((await setup().call(run(), "Bearer nope")).status, 401);
});

Deno.test("design keeps only catalog tools and reports missing connectors", async () => {
  const t = setup({ model: [{ content: JSON.stringify({ name: "Resumo diário", instructions: "Leia e poste.", tools: ["slack_post", "rm_rf", "web_fetch", "slack_post"] }) }] });
  const r = await t.call({ action: "design", description: "resuma notícias e poste no slack" });
  assertEquals(r.status, 200);
  assertEquals(r.body.agent.tools, ["web_fetch", "slack_post"]);
  assertEquals(r.body.connectors, [{ connector: "slack", label: "Slack", setup_route: "/connectors/slack/setup", connected: false }]);
});

Deno.test("run without OPENROUTER_API_KEY returns 503 before charging", async () => {
  const t = setup({ openrouter: false });
  assertEquals((await t.call(run())).status, 503);
  assertEquals(t.deductions.length, 0);
});

Deno.test("runs tools, records every step and charges once", async () => {
  const t = setup({
    connected: ["slack"],
    model: [
      { tool_calls: [{ name: "web_fetch", args: { url: "https://example.com/news" } }] },
      { tool_calls: [{ name: "slack_post", args: { channel: "#geral", text: "Resumo: Olá" } }] },
      { content: "Postei o resumo." },
    ],
  });
  const r = await t.call(run());
  assertEquals(r.status, 200);
  assertEquals(r.body.status, "completed");
  assertEquals(r.body.output, "Postei o resumo.");
  assertEquals(t.deductions, [3]);
  const tools = toolSteps(r.body);
  assertEquals(tools.map((s: any) => [s.tool, s.ok]), [["web_fetch", true], ["slack_post", true]]);
  assertEquals(tools[0].result, "Olá", "script/markup stripped");
  assertEquals(t.tables.vibe_agent_runs[0].status, "completed");
  assertEquals(t.requests[0].tools.map((x: any) => x.function.name), ["web_fetch", "slack_post", "create_agent", "run_agent"]);
});

Deno.test("blocks private URLs, tools the agent was not given, and missing connectors", async () => {
  const t = setup({
    model: [
      { tool_calls: [{ name: "web_fetch", args: { url: "https://169.254.169.254/latest" } }, { name: "email_send", args: { to: "a@b.co", subject: "x", body: "y" } }, { name: "slack_post", args: { channel: "#g", text: "oi" } }] },
      { content: "não consegui" },
    ],
  });
  const r = await t.call(run());
  const tools = toolSteps(r.body);
  assertEquals(tools.map((s: any) => s.ok), [false, false, false]);
  assert(tools[0].result.includes("restricted_host"));
  assert(tools[1].result.includes("tool_not_allowed"));
  assert(tools[2].result.includes("slack_not_connected"));
  assertEquals(t.outbound.length, 0, "nothing left the sandbox");
});

Deno.test("caps side effects per run", async () => {
  const posts = Array.from({ length: 7 }, (_, i) => ({ name: "slack_post", args: { channel: "#g", text: `msg ${i}` } }));
  const t = setup({ connected: ["slack"], model: [{ tool_calls: posts }, { content: "ok" }] });
  const r = await t.call(run());
  const oks = toolSteps(r.body).map((s: any) => s.ok);
  assertEquals(oks, [true, true, true, true, true, false, false]);
  assertEquals(t.outbound.length, 5);
});

Deno.test("agents create agents that never get more tools than their creator, and run them", async () => {
  const t = setup({
    agentTools: ["web_fetch", "create_agent", "run_agent"],
    model: [
      { tool_calls: [{ name: "create_agent", args: { name: "Leitor", instructions: "Leia.", tools: ["web_fetch", "slack_post", "email_send"] } }] },
      { content: "criei" },
    ],
  });
  const r = await t.call(run());
  const created = t.tables.vibe_agents.find((a) => a.name === "Leitor");
  assertEquals(created.tools, ["web_fetch"]);
  assertEquals(created.user_id, USER);

  // The parent now delegates to the sub-agent; the sub-agent's model turns share the run's budget.
  const t2 = setup({
    model: [
      { tool_calls: [{ name: "run_agent", args: { agent_id: "agent-1", task: "sub" } }] },
      { content: "resultado do sub" },
      { content: "pai terminou" },
    ],
  });
  const r2 = await t2.call(run());
  assertEquals(r2.status, 200);
  assertEquals(toolSteps(r2.body)[0].result, "resultado do sub");
  assertEquals(r2.body.output, "pai terminou");
  assert(r.status === 200);
});

Deno.test("hitting the step limit fails the run (non-2xx, so the charge is refunded)", async () => {
  const loop = Array.from({ length: 20 }, () => ({ tool_calls: [{ name: "web_fetch", args: { url: "https://example.com" } }] }));
  const t = setup({ model: loop });
  const r = await t.call(run());
  assertEquals(r.status, 502);
  assertEquals(r.body.status, "failed");
  assertEquals(t.tables.vibe_agent_runs[0].status, "failed");
  assertEquals(t.requests.length, 12);
});
