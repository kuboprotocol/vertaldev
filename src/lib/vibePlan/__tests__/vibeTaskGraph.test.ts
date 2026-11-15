import { describe, expect, it } from "vitest";
import {
  analyzeComplexity,
  canTransition,
  expandTask,
  findCycles,
  graphProgress,
  nextTask,
  parseTaskGraph,
  type PlanTask,
  repairTaskGraph,
  setTaskStatus,
  type TaskGraph,
  TaskGraphError,
  validateTaskGraph,
} from "../../../../supabase/functions/_shared/vibeTaskGraph";

const NOW = "2026-11-14T12:00:00.000Z";

function task(id: number, extra: Partial<PlanTask> = {}): PlanTask {
  return {
    id,
    title: `Tarefa ${id}`,
    description: "",
    details: "",
    testStrategy: "",
    priority: "medium",
    status: "pending",
    dependencies: [],
    subtasks: [],
    files: [],
    ...extra,
  };
}

function graph(tasks: PlanTask[]): TaskGraph {
  return { version: 1, goal: "teste", tasks, createdAt: NOW, updatedAt: NOW };
}

describe("parseTaskGraph", () => {
  it("normaliza ids, remapeia dependências e descarta as inválidas", () => {
    const raw = "```json\n" + JSON.stringify({
      reply: "Plano pronto",
      tasks: [
        { id: 10, title: "Base", priority: "alta", status: "done", files: ["./src/a.ts", "../etc/passwd", "/abs.ts"] },
        { id: 20, title: "Tela", dependencies: [10, 99, 20], complexity: 42 },
        { id: 10, title: "Duplicada" },
        { title: "" },
      ],
    }) + "\n```";
    const { graph: g, fixes, reply } = parseTaskGraph(raw, { now: NOW });
    expect(reply).toBe("Plano pronto");
    expect(g.tasks.map((t) => t.id)).toEqual([1, 2, 3]);
    expect(g.tasks[0]).toMatchObject({ priority: "high", status: "pending", files: ["src/a.ts"] });
    expect(g.tasks[1].dependencies).toEqual([1]);
    expect(g.tasks[1].complexity).toBe(10);
    expect(fixes.some((f) => f.includes("99"))).toBe(true);
    expect(fixes.some((f) => f.includes("dela mesma"))).toBe(true);
    expect(fixes.some((f) => f.includes("repetido"))).toBe(true);
  });

  it("rejeita saída sem tarefas", () => {
    expect(() => parseTaskGraph("nada aqui")).toThrow(TaskGraphError);
    expect(() => parseTaskGraph({ tasks: [] })).toThrow("plano_sem_tarefas");
  });
});

describe("validateTaskGraph", () => {
  it("grafo limpo é válido", () => {
    const res = validateTaskGraph(graph([task(1), task(2, { dependencies: [1] })]));
    expect(res).toEqual({ ok: true, issues: [] });
  });

  it("detecta ciclo e sugere cortar a aresta para o maior id", () => {
    const g = graph([task(1, { dependencies: [2] }), task(2, { dependencies: [3] }), task(3, { dependencies: [1] })]);
    expect(findCycles(g.tasks)).toHaveLength(1);
    const { ok, issues } = validateTaskGraph(g);
    expect(ok).toBe(false);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("cycle");
    expect(issues[0].fix).toBe("Remover #3 das dependências de #2.");
  });

  it("detecta dependência inexistente, autodependência e id duplicado", () => {
    const g = graph([task(1, { dependencies: [1] }), task(2, { dependencies: [7] }), task(2, { title: "Outra" })]);
    const types = validateTaskGraph(g).issues.map((i) => i.type).sort();
    expect(types).toEqual(["dangling", "duplicate", "self"]);
    expect(validateTaskGraph(repairTaskGraph(g).graph).ok).toBe(true);
  });

  it("detecta problemas nas subtarefas", () => {
    const g = graph([
      task(1, {
        subtasks: [
          { id: 1, title: "a", description: "", status: "pending", dependencies: [2] },
          { id: 2, title: "b", description: "", status: "pending", dependencies: [1, 9] },
        ],
      }),
    ]);
    const types = validateTaskGraph(g).issues.map((i) => i.type).sort();
    expect(types).toEqual(["subtask_cycle", "subtask_dangling"]);
  });

  it("autodependência é reportada uma vez só (não também como ciclo)", () => {
    expect(validateTaskGraph(graph([task(1, { dependencies: [1] })])).issues.map((i) => i.type)).toEqual(["self"]);
    const sub = graph([task(1, { subtasks: [{ id: 1, title: "s", description: "", status: "pending", dependencies: [1] }] })]);
    expect(validateTaskGraph(sub).issues.map((i) => i.type)).toEqual(["subtask_dangling"]);
  });
});

describe("repairTaskGraph", () => {
  it("aplica as correções até o grafo ficar válido", () => {
    const g = graph([
      task(1, { dependencies: [1, 2] }),
      task(2, { dependencies: [1, 42] }),
      task(2, { title: "Repetida" }),
      task(3, { subtasks: [{ id: 1, title: "s", description: "", status: "pending", dependencies: [1, 5] }] }),
    ]);
    const { graph: fixed, fixes } = repairTaskGraph(g);
    expect(validateTaskGraph(fixed).ok).toBe(true);
    expect(fixed.tasks.map((t) => t.id)).toEqual([1, 2, 4, 3]);
    // 1↔2: corta a aresta que aponta para o maior id (#1 → #2).
    expect(fixed.tasks[0].dependencies).toEqual([]);
    expect(fixed.tasks[1].dependencies).toEqual([1]);
    expect(fixed.tasks[3].subtasks[0].dependencies).toEqual([]);
    expect(fixes.length).toBeGreaterThanOrEqual(4);
    // não muta o original
    expect(g.tasks[0].dependencies).toEqual([1, 2]);
  });
});

describe("nextTask", () => {
  it("retoma a tarefa em andamento primeiro", () => {
    const g = graph([task(1, { priority: "high" }), task(2, { status: "in-progress", priority: "low" })]);
    expect(nextTask(g)?.id).toBe(2);
  });

  it("escolhe a de maior prioridade com dependências feitas", () => {
    const g = graph([
      task(1, { status: "done" }),
      task(2, { priority: "low", dependencies: [1] }),
      task(3, { priority: "high", dependencies: [4] }),
      task(4, { priority: "medium" }),
      task(5, { priority: "medium" }),
      task(6, { priority: "high", status: "blocked" }),
    ]);
    // #3 (alta) espera #4; #4 e #5 empatam em média, #4 destrava #3.
    expect(nextTask(g)?.id).toBe(4);
    const g2 = setTaskStatus(setTaskStatus(g, 4, "done", {}, NOW), 5, "done", {}, NOW);
    expect(nextTask(g2)?.id).toBe(3);
  });

  it("devolve null sem plano ou sem tarefa liberada", () => {
    expect(nextTask(null)).toBeNull();
    expect(nextTask(graph([task(1, { dependencies: [2], status: "pending" }), task(2, { status: "blocked" })]))).toBeNull();
  });
});

describe("setTaskStatus", () => {
  it("só uma tarefa em andamento por vez", () => {
    const g = setTaskStatus(graph([task(1), task(2)]), 1, "in-progress", {}, NOW);
    expect(g.tasks[0].status).toBe("in-progress");
    expect(() => setTaskStatus(g, 2, "in-progress", {}, NOW)).toThrow(/já está em andamento/);
  });

  it("não entra em andamento com dependências pendentes", () => {
    expect(() => setTaskStatus(graph([task(1), task(2, { dependencies: [1] })]), 2, "in-progress")).toThrow(/ainda depende de #1/);
  });

  it("recusa transições inválidas e tarefas inexistentes", () => {
    expect(canTransition("deferred", "in-progress")).toBe(false);
    expect(canTransition("done", "done")).toBe(true);
    expect(() => setTaskStatus(graph([task(1, { status: "deferred" })]), 1, "done")).toThrow(TaskGraphError);
    expect(() => setTaskStatus(graph([task(1)]), 9, "done")).toThrow(/não existe/);
  });

  it("feita marca subtarefas; rewind limpa checkpoint e devolve dependentes em andamento", () => {
    const sub = { id: 1, title: "s", description: "", status: "pending" as const, dependencies: [] };
    let g = graph([task(1, { subtasks: [sub] }), task(2, { dependencies: [1] })]);
    g = setTaskStatus(g, 1, "done", { checkpointId: "cp1", commitSha: "abc" }, NOW);
    expect(g.tasks[0]).toMatchObject({ status: "done", checkpointId: "cp1" });
    expect(g.tasks[0].subtasks[0].status).toBe("done");
    g = setTaskStatus(g, 2, "in-progress", {}, NOW);
    g = setTaskStatus(g, 1, "pending", {}, NOW);
    expect(g.tasks[0].checkpointId).toBeUndefined();
    expect(g.tasks[0].commitSha).toBeUndefined();
    expect(g.tasks[0].subtasks[0].status).toBe("pending");
    expect(g.tasks[1].status).toBe("pending");
    expect(g.tasks[1].note).toContain("#1 foi desfeita");
  });

  it("progresso ignora adiadas no percentual", () => {
    const p = graphProgress(graph([task(1, { status: "done" }), task(2, { status: "deferred" }), task(3)]));
    expect(p).toMatchObject({ total: 3, done: 1, deferred: 1, pending: 1, percent: 50 });
  });
});

describe("analyzeComplexity", () => {
  it("tarefa simples não precisa dividir", () => {
    const r = analyzeComplexity(task(1, { title: "Trocar a cor do botão" }));
    expect(r).toMatchObject({ score: 1, shouldExpand: false, recommendedSubtasks: 0 });
  });

  it("temas pesados e muitos arquivos sugerem dividir", () => {
    const t = task(1, {
      title: "Login com OAuth e pagamento Stripe",
      description: "auth + payment",
      files: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts"],
    });
    const r = analyzeComplexity(t);
    expect(r.score).toBeGreaterThanOrEqual(7);
    expect(r.shouldExpand).toBe(true);
    expect(r.recommendedSubtasks).toBeGreaterThanOrEqual(2);
    expect(r.reasons.some((x) => x.startsWith("tema sensível"))).toBe(true);
  });

  it("usa a nota do planejador quando maior; não sugere dividir se já tem subtarefas", () => {
    const r = analyzeComplexity(task(1, { complexity: 9 }));
    expect(r.score).toBe(9);
    expect(r.reasons).toContain("nota do planejador");
    const withSubs = analyzeComplexity(task(1, { complexity: 9, subtasks: [{ id: 1, title: "s", description: "", status: "pending", dependencies: [] }] }));
    expect(withSubs.shouldExpand).toBe(false);
  });

  it("expandTask limpa dependências das subtarefas e recusa tarefa feita", () => {
    const g = graph([task(1), task(2, { status: "done" })]);
    const out = expandTask(g, 1, [
      { id: 1, title: "a", description: "", status: "pending", dependencies: [1, 3] },
      { id: 2, title: "b", description: "", status: "pending", dependencies: [1] },
    ], NOW);
    expect(out.tasks[0].subtasks.map((s) => s.dependencies)).toEqual([[], [1]]);
    expect(() => expandTask(g, 2, [])).toThrow(/já foi feita/);
  });
});
