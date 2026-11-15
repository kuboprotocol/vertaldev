import { describe, expect, it } from "vitest";
import { lintGeneratedFile, type ChatMsg } from "../../../../supabase/functions/_shared/vibeAgentCore";
import {
  type AppliedEntry,
  emptyAgentState,
  type ModelRole,
  type ModelTier,
  type PlanKnobs,
  readKnobs,
  type VibeAgentState,
} from "../../../../supabase/functions/_shared/vibePlandexEngine";
import { type PlanDeps, PlanError, type PlanRequestBody, parsePlanRequest, runPlanAction } from "../../../../supabase/functions/vibe-code-agent/plan";

const NOW = "2026-11-14T12:00:00.000Z";

const APP_V0 = [
  "import { useState } from 'react';",
  "",
  "export default function App() {",
  "  const [n, setN] = useState(0);",
  "  return (",
  "    <main>",
  "      <button onClick={() => setN(n + 1)}>{n}</button>",
  "    </main>",
  "  );",
  "}",
  "",
  "export const VERSION = 1;",
  "export const NAME = 'demo';",
  "",
].join("\n");

const HEADER = "export function Header() {\n  return <header>Vertal</header>;\n}\n";
const APP_WITH_HEADER = APP_V0.replace("import { useState } from 'react';", "import { useState } from 'react';\nimport { Header } from './Header';").replace(
  "    <main>",
  "    <main>\n      <Header />",
);

const PLAN = JSON.stringify({
  reply: "Dividi em duas tarefas.",
  tasks: [
    { id: 1, title: "Criar o Header", description: "Componente de cabeçalho", priority: "high", files: ["src/Header.tsx"] },
    { id: 2, title: "Usar o Header no App", priority: "medium", dependencies: [1, 77], files: ["src/App.tsx"] },
  ],
});

const tell = (files: Array<{ path: string; content: string }>, summary = "Feito.") => JSON.stringify({ thought: "ok", summary, files, subtasks_done: [] });
const CLEAN_REVIEW = JSON.stringify({ review: { summary: "ok", key_issues_to_review: [] } });

type Call = { role: ModelRole; tier: ModelTier; label: string; messages: ChatMsg[] };

/** Projeto, modelo e caminho de apply simulados. Respostas do modelo por papel (fila). */
function harness(opts: { knobs?: PlanKnobs; files?: Record<string, string>; replies?: Partial<Record<ModelRole, string[]>> } = {}) {
  const fs: Record<string, string> = { "src/App.tsx": APP_V0, "src/main.tsx": "import App from './App';\n", ...opts.files };
  const replies: Partial<Record<ModelRole, string[]>> = { reviewer: [], ...opts.replies };
  const calls: Call[] = [];
  const events: Array<Record<string, unknown>> = [];
  const applies: Array<{ files: Array<{ path: string; content: string }>; meta: { summary: string; taskId?: number } }> = [];
  const snapshots: Record<string, Record<string, string | undefined>> = {};
  const knobs = opts.knobs ?? readKnobs(() => undefined);
  let state: VibeAgentState = emptyAgentState(knobs, NOW);
  let cp = 0;
  const saved: VibeAgentState[] = [];

  const deps = (): PlanDeps => ({
    knobs,
    state,
    list: async () => Object.keys(fs),
    read: async (path) => ({ content: fs[path] ?? "" }),
    callModel: async (messages, o) => {
      calls.push({ role: o.role, tier: o.tier, label: o.label, messages });
      const queue = replies[o.role];
      if (o.role === "reviewer" && (!queue || !queue.length)) return CLEAN_REVIEW;
      const next = queue?.shift();
      if (next === undefined) throw new Error(`sem resposta simulada para ${o.role}`);
      return next;
    },
    applyFiles: async (files, meta) => {
      const id = `cp${++cp}`;
      snapshots[id] = Object.fromEntries(files.map((f) => [f.path, fs[f.path]]));
      for (const f of files) fs[f.path] = f.content;
      applies.push({ files, meta });
      return { checkpointId: id, commitSha: `sha${cp}`, files: files.map((f) => f.path) };
    },
    revert: async (entry: AppliedEntry) => {
      const snap = snapshots[entry.checkpointId!];
      for (const [p, c] of Object.entries(snap)) {
        if (c === undefined) delete fs[p];
        else fs[p] = c;
      }
      return Object.keys(snap);
    },
    lint: lintGeneratedFile,
    send: (e) => events.push(e),
    shared: { memories: "", dev: "", conversationSummary: null },
    saveState: async (s) => {
      saved.push(s);
    },
    now: () => NOW,
  });

  const run = async (req: PlanRequestBody) => {
    const res = await runPlanAction(req, deps());
    state = res.state;
    return res;
  };
  return {
    fs,
    calls,
    events,
    applies,
    saved,
    replies,
    run,
    get state() {
      return state;
    },
    set state(s: VibeAgentState) {
      state = s;
    },
  };
}

const statusOf = (s: VibeAgentState, id: number) => s.graph?.tasks.find((t) => t.id === id)?.status;

describe("parsePlanRequest", () => {
  it("valida ação e limpa campos", () => {
    expect(parsePlanRequest({ action: "drop_table" })).toBeNull();
    const r = parsePlanRequest({ action: "apply", paths: ["src/a.ts", "../x", ".env"], taskId: -1, autonomy: "autonomo", status: "nope" });
    expect(r).toMatchObject({ action: "apply", paths: ["src/a.ts"], taskId: undefined, autonomy: "full", status: undefined });
  });
});

describe("runPlanAction: pipeline completo com modelo simulado", () => {
  it("cria plano → próxima → diff staged → revisão no staged → aplicar → tarefa feita → próxima", async () => {
    const h = harness({
      replies: {
        planner: [PLAN],
        coder: [tell([{ path: "src/Header.tsx", content: HEADER }], "Criei o Header."), tell([{ path: "src/App.tsx", content: APP_WITH_HEADER }], "Usei o Header.")],
      },
    });

    // 1. criar plano
    const created = await h.run({ action: "create", prompt: "Quero um cabeçalho no app" });
    expect(h.calls[0]).toMatchObject({ role: "planner", tier: "flash" });
    expect(h.state.graph?.tasks).toHaveLength(2);
    expect(h.state.graph?.tasks[1].dependencies).toEqual([1]);
    expect(h.state.graph?.tasks.every((t) => typeof t.complexity === "number")).toBe(true);
    expect(created.reply).toContain("Dividi em duas tarefas.");
    expect(created.reply).toContain("Próxima: #1 Criar o Header");
    expect(created.reply).toContain("77");
    expect(h.saved).toHaveLength(1);

    // 2. próxima → mudanças staged + revisão só no diff staged (semi: não aplica)
    const next1 = await h.run({ action: "next" });
    expect(statusOf(h.state, 1)).toBe("in-progress");
    expect(h.state.staged).toHaveLength(1);
    expect(h.state.staged[0]).toMatchObject({ path: "src/Header.tsx", baseHash: "", taskId: 1, origin: "task" });
    expect(h.fs["src/Header.tsx"]).toBeUndefined();
    const coderCall = h.calls.find((c) => c.role === "coder")!;
    expect(coderCall.tier).toBe("flash");
    expect(coderCall.messages[1].content).toContain("TAREFA ATUAL #1");
    const reviewCall = h.calls.find((c) => c.role === "reviewer")!;
    expect(reviewCall.tier).toBe("flash");
    expect(reviewCall.label).toContain("revisão do diff");
    expect(reviewCall.messages.map((m) => m.content).join("\n")).toContain("<header>Vertal</header>");
    const findings = h.events.find((e) => e.kind === "review_findings")?.review as { target: string; taskId: number };
    expect(findings).toMatchObject({ target: "staged", taskId: 1 });
    expect(next1.reply).toContain("Nada foi gravado no projeto ainda");
    expect(next1.continueNext).toBe(false);

    // próxima com staged pendente é recusada
    await expect(h.run({ action: "next" })).rejects.toThrow(PlanError);

    // 3. aplicar → tarefa feita, checkpoint anotado, cliente segue sozinho (semi)
    const applied = await h.run({ action: "apply" });
    expect(h.fs["src/Header.tsx"]).toBe(HEADER);
    expect(h.applies[0].meta).toEqual({ summary: "Tarefa #1: Criar o Header", taskId: 1 });
    expect(statusOf(h.state, 1)).toBe("done");
    expect(h.state.graph?.tasks[0]).toMatchObject({ checkpointId: "cp1", commitSha: "sha1" });
    expect(h.state.staged).toHaveLength(0);
    expect(h.state.applied).toHaveLength(1);
    expect(applied.reply).toContain("Tarefa #1 concluída.");
    expect(applied.continueNext).toBe(true);

    // 4. próxima tarefa (#2, dependência feita)
    await h.run({ action: "next" });
    expect(statusOf(h.state, 2)).toBe("in-progress");
    expect(h.state.staged[0]).toMatchObject({ path: "src/App.tsx", taskId: 2 });
    const coder2 = h.calls.filter((c) => c.role === "coder")[1];
    // contexto carregou o App atual
    expect(coder2.messages[1].content).toContain("useState(0)");
    const last = await h.run({ action: "apply" });
    expect(h.fs["src/App.tsx"]).toBe(APP_WITH_HEADER);
    expect(statusOf(h.state, 2)).toBe("done");
    expect(last.reply).toContain("Plano concluído: 2/2");
    expect(last.continueNext).toBe(false);

    // rewind desfaz a última aplicação e devolve a tarefa para pendente
    const rew = await h.run({ action: "rewind" });
    expect(h.fs["src/App.tsx"]).toBe(APP_V0);
    expect(statusOf(h.state, 2)).toBe("pending");
    expect(rew.reply).toContain("a tarefa #2 voltou para pendente");
  });

  it("rejeitar: descarta o staged, nada vai para o projeto e a tarefa volta a pendente", async () => {
    const h = harness({ replies: { planner: [PLAN], coder: [tell([{ path: "src/Header.tsx", content: HEADER }])] } });
    await h.run({ action: "create", prompt: "cabeçalho" });
    await h.run({ action: "next" });
    const r = await h.run({ action: "reject" });
    expect(h.state.staged).toHaveLength(0);
    expect(h.fs["src/Header.tsx"]).toBeUndefined();
    expect(h.applies).toHaveLength(0);
    expect(statusOf(h.state, 1)).toBe("pending");
    expect(h.state.graph?.tasks[0].note).toBe("mudanças rejeitadas pelo Dev");
    expect(r.reply).toContain("Rejeitei 1 mudança(s)");
    await expect(h.run({ action: "reject" })).rejects.toThrow(/Não há mudanças staged/);
  });

  it("arquivo mudou por baixo: rebase quando encaixa, invalida quando não", async () => {
    const h = harness({
      files: { "src/Header.tsx": HEADER },
      replies: {
        planner: [JSON.stringify({ tasks: [{ id: 1, title: "Usar o Header", files: ["src/App.tsx"] }] })],
        coder: [tell([{ path: "src/App.tsx", content: APP_WITH_HEADER }]), tell([{ path: "src/App.tsx", content: APP_WITH_HEADER }])],
      },
    });
    await h.run({ action: "create", prompt: "usar header" });

    // rebase: outra ação mudou uma linha longe do trecho
    await h.run({ action: "next" });
    h.fs["src/App.tsx"] = APP_V0.replace("export const NAME = 'demo';", "export const NAME = 'vertal';");
    const ok = await h.run({ action: "apply" });
    expect(ok.reply).toContain("rebaseados automaticamente");
    expect(h.fs["src/App.tsx"]).toContain("<Header />");
    expect(h.fs["src/App.tsx"]).toContain("NAME = 'vertal'");
    expect(statusOf(h.state, 1)).toBe("done");

    // falha: o mesmo trecho mudou → mudança invalidada e descartada
    h.state = { ...h.state, graph: { ...h.state.graph!, tasks: h.state.graph!.tasks.map((t) => ({ ...t, status: "pending" as const })) } };
    h.fs["src/App.tsx"] = APP_V0;
    await h.run({ action: "next" });
    h.fs["src/App.tsx"] = APP_V0.replace("    <main>", "    <section>");
    const stale = await h.run({ action: "apply" });
    expect(stale.reply).toContain("Invalidei 1 mudança(s)");
    expect(h.state.staged).toHaveLength(0);
    expect(h.fs["src/App.tsx"]).toContain("<section>");
    expect(h.fs["src/App.tsx"]).not.toContain("<Header />");
    expect(statusOf(h.state, 1)).toBe("in-progress");
    expect(h.events.some((e) => e.kind === "staged" && e.status === "failed")).toBe(true);
  });

  it("contexto respeita o orçamento de tokens", async () => {
    const big = `export const BIG = [\n${Array.from({ length: 900 }, (_, i) => `  "linha ${i} xxxxxxxxx",`).join("\n")}\n];\n`;
    const knobs = readKnobs((k) => (k === "VIBE_CONTEXT_TOKEN_BUDGET" ? "2000" : undefined));
    const h = harness({
      knobs,
      files: { "src/big.ts": big },
      replies: {
        planner: [JSON.stringify({ tasks: [{ id: 1, title: "Mexer no App", files: ["src/App.tsx", "src/big.ts"] }] })],
        coder: [tell([{ path: "src/App.tsx", content: APP_WITH_HEADER }])],
      },
    });
    await h.run({ action: "create", prompt: "x" });
    await h.run({ action: "next" });
    const skipped = h.events.filter((e) => e.kind === "read_file" && e.status === "skipped").map((e) => e.path);
    const loaded = h.events.filter((e) => e.kind === "read_file" && e.status === "success").map((e) => e.path);
    expect(skipped).toContain("src/big.ts");
    expect(loaded).toContain("src/App.tsx");
    const coder = h.calls.find((c) => c.role === "coder")!;
    expect(coder.messages[1].content).not.toContain("linha 500");
  });

  it("autonomia total: aplica sozinho; auto-debug sobe para pro e para no VIBE_AUTODEBUG_MAX", async () => {
    const knobs = readKnobs((k) => (k === "VIBE_AUTODEBUG_MAX" ? "2" : undefined));
    const h = harness({
      knobs,
      replies: {
        planner: [JSON.stringify({ tasks: [{ id: 1, title: "Criar o Header", files: ["src/Header.tsx"] }, { id: 2, title: "Rodapé", dependencies: [1] }] })],
        coder: [tell([{ path: "src/Header.tsx", content: HEADER }])],
        debugger: [
          tell([{ path: "src/Header.tsx", content: HEADER.replace("Vertal", "Vertal 1") }], "Correção 1"),
          tell([{ path: "src/Header.tsx", content: HEADER.replace("Vertal", "Vertal 2") }], "Correção 2"),
        ],
      },
    });
    await h.run({ action: "create", prompt: "header" });
    await h.run({ action: "config", autonomy: "full" });
    expect(h.state.autonomy).toBe("full");

    const next = await h.run({ action: "next" });
    expect(h.fs["src/Header.tsx"]).toBe(HEADER);
    expect(statusOf(h.state, 1)).toBe("done");
    expect(next.continueNext).toBe(true);
    expect(h.state.debug).toEqual({ taskId: 1, attempts: 0 });

    const errors = ["TypeError: x is undefined at src/Header.tsx:2"];
    await expect(h.run({ action: "debug" })).rejects.toThrow(/Não recebi nenhum erro/);

    const d1 = await h.run({ action: "debug", errors });
    expect(d1.reply).toContain("tentativa 1/2");
    expect(h.fs["src/Header.tsx"]).toContain("Vertal 1");
    expect(h.state.debug).toEqual({ taskId: 1, attempts: 1 });
    // correção pequena: revisão pulada
    expect(h.events.some((e) => e.kind === "review" && e.status === "skipped")).toBe(true);

    const d2 = await h.run({ action: "debug", errors });
    expect(d2.reply).toContain("tentativa 2/2");
    expect(h.fs["src/Header.tsx"]).toContain("Vertal 2");

    const debugTiers = h.calls.filter((c) => c.role === "debugger").map((c) => c.tier);
    expect(debugTiers).toEqual(["flash", "pro"]);

    const callsBefore = h.calls.length;
    const d3 = await h.run({ action: "debug", errors });
    expect(h.calls.length).toBe(callsBefore);
    expect(d3.reply).toContain("Já tentei 2 vez(es)");
    // tarefa já feita continua feita (não volta para bloqueada)
    expect(statusOf(h.state, 1)).toBe("done");
  });

  it("autonomia total não aplica quando a revisão acha item crítico", async () => {
    const critical = JSON.stringify({
      review: {
        key_issues_to_review: [
          { relevant_file: "src/Header.tsx", issue_header: "XSS", severity: "critical", issue_content: "perigoso", start_line: 2, end_line: 2, existing_code: "  return <header>Vertal</header>;", improved_code: "  return <header>Ok</header>;" },
        ],
      },
    });
    const h = harness({ replies: { planner: [JSON.stringify({ tasks: [{ id: 1, title: "Header", files: ["src/Header.tsx"] }] })], coder: [tell([{ path: "src/Header.tsx", content: HEADER }])], reviewer: [critical] } });
    await h.run({ action: "create", prompt: "h" });
    await h.run({ action: "config", autonomy: "full" });
    const r = await h.run({ action: "next" });
    expect(r.reply).toContain("Não apliquei sozinho");
    expect(h.fs["src/Header.tsx"]).toBeUndefined();
    expect(h.state.staged).toHaveLength(1);
    expect(r.continueNext).toBe(false);
  });

  it("tarefa já atendida pelo código é marcada como feita sem staged", async () => {
    const h = harness({ replies: { planner: [JSON.stringify({ tasks: [{ id: 1, title: "App", files: ["src/App.tsx"] }] })], coder: [tell([{ path: "src/App.tsx", content: APP_V0 }], "Já estava pronto.")] } });
    await h.run({ action: "create", prompt: "a" });
    const r = await h.run({ action: "next" });
    expect(h.state.staged).toHaveLength(0);
    expect(statusOf(h.state, 1)).toBe("done");
    expect(r.reply).toContain("já estava atendida");
  });
});
