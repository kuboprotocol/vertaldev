import { describe, expect, it } from "vitest";
import {
  buildRepoMap,
  checkFreshness,
  decideLock,
  DEFAULT_KNOBS,
  diffStats,
  emptyAgentState,
  estimateTokens,
  expectedCallsPerTask,
  isTinyDiff,
  normalizeAgentState,
  normalizeAutonomy,
  normalizeModelPack,
  parseLockOwner,
  readKnobs,
  rebaseContent,
  resolveImports,
  selectContextFiles,
  stageChange,
  stagedDiff,
  tierFor,
  toClientState,
  unifiedDiff,
  upsertStaged,
} from "../../../../supabase/functions/_shared/vibePlandexEngine";

const NOW = "2026-11-14T12:00:00.000Z";
const BASE = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].join("\n");
const withLine = (text: string, from: string, to: string) => text.split("\n").map((l) => (l === from ? to : l)).join("\n");

describe("mudanças staged", () => {
  it("stageChange calcula hash da base e estatísticas", () => {
    const novo = stageChange({ path: "src/n.ts", baseContent: "", content: "x\ny", taskId: 2, now: NOW });
    expect(novo).toMatchObject({ baseHash: "", added: 2, removed: 0, origin: "task", status: "pending", taskId: 2 });
    const edit = stageChange({ path: "src/a.ts", baseContent: BASE, content: withLine(BASE, "b", "B"), now: NOW });
    expect(edit.baseHash).not.toBe("");
    expect(edit).toMatchObject({ added: 1, removed: 1 });
    expect(diffStats(BASE, BASE)).toEqual({ added: 0, removed: 0 });
  });

  it("upsertStaged mantém a base original e a mudança mais nova", () => {
    const first = stageChange({ path: "f.ts", baseContent: BASE, content: withLine(BASE, "b", "B"), taskId: 1, now: NOW });
    const second = stageChange({ path: "f.ts", baseContent: withLine(BASE, "b", "B"), content: withLine(BASE, "b", "BB"), now: NOW });
    const list = upsertStaged([first], second);
    expect(list).toHaveLength(1);
    expect(list[0].baseContent).toBe(BASE);
    expect(list[0].baseHash).toBe(first.baseHash);
    expect(list[0].content).toBe(withLine(BASE, "b", "BB"));
    expect(list[0].taskId).toBe(1);
    expect(upsertStaged(list, stageChange({ path: "g.ts", baseContent: "", content: "z" }))).toHaveLength(2);
  });

  it("isTinyDiff respeita o limite", () => {
    const c = stageChange({ path: "f.ts", baseContent: BASE, content: withLine(BASE, "b", "B") });
    expect(isTinyDiff([c], 12)).toBe(true);
    expect(isTinyDiff([c], 1)).toBe(false);
    expect(isTinyDiff([], 12)).toBe(false);
  });
});

describe("checkFreshness / rebase", () => {
  const proposed = withLine(BASE, "b", "B");
  const change = stageChange({ path: "f.ts", baseContent: BASE, content: proposed });

  it("arquivo inalterado: aplica como está", () => {
    expect(checkFreshness(change, BASE)).toEqual({ state: "fresh", content: proposed });
  });

  it("base mudou longe do trecho: rebase encaixa as duas mudanças", () => {
    const current = withLine(BASE, "h", "H");
    const res = checkFreshness(change, current);
    expect(res.state).toBe("rebased");
    expect(res.state === "rebased" && res.content).toBe(withLine(withLine(BASE, "b", "B"), "h", "H"));
  });

  it("base mudou no mesmo trecho: rebase falha e a mudança fica stale (descartada)", () => {
    const res = checkFreshness(change, withLine(BASE, "b", "X"));
    expect(res.state).toBe("stale");
    expect(res.state === "stale" && res.reason).toMatch(/f\.ts mudou/);
    expect(rebaseContent(BASE, proposed, withLine(BASE, "b", "X")).ok).toBe(false);
  });

  it("arquivo novo criado por outra ação fica stale", () => {
    const novo = stageChange({ path: "n.ts", baseContent: "", content: "oi" });
    expect(checkFreshness(novo, "").state).toBe("fresh");
    expect(checkFreshness(novo, "outro").state).toBe("stale");
  });

  it("rebase sem mudanças devolve o arquivo atual", () => {
    expect(rebaseContent(BASE, BASE, "zzz")).toEqual({ ok: true, content: "zzz" });
  });
});

describe("unifiedDiff", () => {
  it("gera cabeçalhos e hunk com contexto", () => {
    const out = unifiedDiff("src/a.ts", "a\nb\nc", "a\nB\nc").split("\n");
    expect(out.slice(0, 3)).toEqual(["--- a/src/a.ts", "+++ b/src/a.ts", "@@ -1,3 +1,3 @@"]);
    expect(out).toContain(" a");
    expect(out).toContain("-b");
    expect(out).toContain("+B");
    expect(out).toContain(" c");
  });

  it("arquivo novo vem de /dev/null", () => {
    const out = unifiedDiff("n.ts", "", "x\ny").split("\n");
    expect(out).toEqual(["--- /dev/null", "+++ b/n.ts", "@@ -0,0 +1,2 @@", "+x", "+y"]);
  });

  it("mudanças distantes viram hunks separados", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `l${i}`);
    const changed = [...lines];
    changed[1] = "X";
    changed[25] = "Y";
    const diff = unifiedDiff("f.ts", lines.join("\n"), changed.join("\n"));
    expect(diff.match(/^@@/gm)).toHaveLength(2);
    expect(stagedDiff(stageChange({ path: "f.ts", baseContent: lines.join("\n"), content: changed.join("\n") }))).toBe(diff);
  });
});

describe("trava de escritor", () => {
  const held = { owner: "executor:a", kind: "executor" as const, until: 1000 };
  it("livre, expirada ou do mesmo dono: libera", () => {
    expect(decideLock(null, { owner: "x", kind: "manual" }, 500)).toEqual({ ok: true });
    expect(decideLock(held, { owner: "manual:b", kind: "manual" }, 1000)).toEqual({ ok: true });
    expect(decideLock(held, { owner: "executor:a", kind: "executor" }, 500)).toEqual({ ok: true });
  });
  it("ocupada por outro: recusa com mensagem em pt-BR", () => {
    const r = decideLock(held, { owner: "fix_queue:c", kind: "fix_queue" }, 500);
    expect(r.ok).toBe(false);
    if (!("message" in r)) throw new Error("deveria recusar");
    expect(r.message).toContain("o executor do plano");
    expect(r.held).toBe(held);
  });
  it("parseLockOwner", () => {
    expect(parseLockOwner("debug:123")).toEqual({ kind: "debug", id: "123" });
    expect(parseLockOwner("hacker:1")).toBeNull();
    expect(parseLockOwner(null)).toBeNull();
  });
});

describe("escolha de contexto", () => {
  const tree = ["src/components/Header.tsx", "src/components/Header.test.tsx", "src/lib/auth.ts", "src/pages/Login.tsx", "README.md", "src/App.tsx"];

  it("arquivos do plano primeiro, depois extras e palavras da tarefa (sem testes)", () => {
    const files = selectContextFiles({
      tree,
      task: { title: "Tela de login", description: "Usar header", details: "", files: ["src/App.tsx", "nao/existe.ts"] },
      extra: ["src/lib/auth.ts"],
    });
    expect(files[0]).toBe("src/App.tsx");
    expect(files[1]).toBe("src/lib/auth.ts");
    expect(files).toContain("src/pages/Login.tsx");
    expect(files).toContain("src/components/Header.tsx");
    expect(files).not.toContain("src/components/Header.test.tsx");
    expect(files).not.toContain("nao/existe.ts");
  });

  it("respeita o máximo", () => {
    expect(selectContextFiles({ tree, task: { title: "", description: "", details: "", files: tree }, max: 2 })).toHaveLength(2);
  });

  it("resolveImports acha imports relativos e @/", () => {
    const content = "import { Header } from './components/Header';\nimport { login } from '@/lib/auth';\nimport x from 'react';";
    expect(resolveImports("src/App.tsx", content, tree)).toEqual(["src/components/Header.tsx", "src/lib/auth.ts"]);
  });

  it("estimateTokens ≈ caracteres/4", () => {
    expect(estimateTokens("a".repeat(8000))).toBe(2000);
    expect(estimateTokens("abc")).toBe(1);
  });

  it("mapa do repositório é reaproveitado quando a árvore não muda", () => {
    const first = buildRepoMap(["b.ts", "a.ts"], null, NOW);
    expect(first.reused).toBe(false);
    expect(first.map.tree).toEqual(["a.ts", "b.ts"]);
    expect(buildRepoMap(["a.ts", "b.ts"], first.map).reused).toBe(true);
    expect(buildRepoMap(["a.ts"], first.map).reused).toBe(false);
  });
});

describe("pacotes de modelos / tiers", () => {
  it("equilibrado: flash por padrão, pro em nova tentativa ou complexidade alta", () => {
    expect(tierFor("coder", "balanced")).toBe("flash");
    expect(tierFor("coder", "balanced", { complexity: 5 })).toBe("flash");
    expect(tierFor("coder", "balanced", { complexity: 8 })).toBe("pro");
    expect(tierFor("coder", "balanced", { complexity: 6, proComplexity: 6 })).toBe("pro");
    expect(tierFor("debugger", "balanced", { attempt: 2 })).toBe("pro");
    expect(tierFor("reviewer", "balanced", { attempt: 3, complexity: 10 })).toBe("flash");
    expect(tierFor("planner", "balanced")).toBe("flash");
    expect(tierFor("planner", "balanced", { planTier: "pro" })).toBe("pro");
  });

  it("econômico só sobe em nova tentativa; forte usa pro (revisão só em retry)", () => {
    expect(tierFor("coder", "cheap", { complexity: 10 })).toBe("flash");
    expect(tierFor("coder", "cheap", { attempt: 2 })).toBe("pro");
    expect(tierFor("coder", "strong")).toBe("pro");
    expect(tierFor("planner", "strong")).toBe("pro");
    expect(tierFor("reviewer", "strong")).toBe("flash");
    expect(tierFor("reviewer", "strong", { attempt: 2 })).toBe("pro");
  });

  it("normaliza apelidos em português", () => {
    expect(normalizeAutonomy("autônomo")).toBe("full");
    expect(normalizeAutonomy("basico+")).toBe("plus");
    expect(normalizeAutonomy("??", "none")).toBe("none");
    expect(normalizeModelPack("forte")).toBe("strong");
    expect(normalizeModelPack("econômico")).toBe("cheap");
    expect(normalizeModelPack("xyz")).toBe("balanced");
  });

  it("readKnobs usa padrões e limita valores", () => {
    expect(readKnobs(() => undefined)).toEqual(DEFAULT_KNOBS);
    const env: Record<string, string> = { VIBE_AUTODEBUG_MAX: "99", VIBE_CONTEXT_TOKEN_BUDGET: "10", VIBE_PLAN_TIER: "pro", VIBE_AUTONOMY_DEFAULT: "autonomo" };
    const k = readKnobs((key) => env[key]);
    expect(k).toMatchObject({ autodebugMax: 10, contextTokenBudget: 2000, planTier: "pro", autonomyDefault: "full" });
  });

  it("estimativa de chamadas por tarefa", () => {
    const manual = expectedCallsPerTask({ autonomy: "none", pack: "balanced" });
    expect(manual.typical.map((c) => c.role)).toEqual(["coder"]);
    expect(manual.worstCase).toBe(2);
    const full = expectedCallsPerTask({ autonomy: "full", pack: "balanced" });
    expect(full.typical.map((c) => `${c.role}/${c.tier}`)).toEqual(["coder/flash", "reviewer/flash"]);
    expect(full.worstCase).toBe(2 + 1 + DEFAULT_KNOBS.autodebugMax * 2);
  });
});

describe("estado do agente", () => {
  it("normalizeAgentState é defensivo", () => {
    const s = normalizeAgentState({ autonomy: "manual", modelPack: "forte", staged: [{ path: "a" }, null], applied: [{ files: ["a"] }, {}], debug: { taskId: "x", attempts: "2" } });
    expect(s).toMatchObject({ autonomy: "none", modelPack: "strong", staged: [], graph: null, debug: { taskId: null, attempts: 2 } });
    expect(s.applied).toHaveLength(1);
    expect(normalizeAgentState(null).autonomy).toBe("semi");
  });

  it("toClientState tira a base e manda o diff", () => {
    const state = { ...emptyAgentState(DEFAULT_KNOBS, NOW), staged: [stageChange({ path: "a.ts", baseContent: "x", content: "y" })] };
    const client = toClientState(state);
    expect(client.staged[0]).not.toHaveProperty("baseContent");
    expect(client.staged[0].diff).toContain("+y");
    expect(client.repoFiles).toBe(0);
  });
});
