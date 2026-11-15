import { describe, expect, it, vi } from "vitest";
import { emptyAgentState, type ClientAgentState, toClientState, stageChange, type TaskGraph, type PlanTask } from "../engine";
import { matchPlanSlashHints, parsePlanSlash, PLAN_SLASH_COMMANDS } from "../planSlashCommands";
import { runAllDecision } from "../runAll";
import { createWriterLock, WriterBusyError } from "../writerLock";

const NOW = "2026-11-14T12:00:00.000Z";

describe("parsePlanSlash", () => {
  it("reconhece comandos e apelidos com argumentos", () => {
    expect(parsePlanSlash("/proxima 3")).toMatchObject({ def: { kind: "next" }, taskId: 3, arg: "3" });
    expect(parsePlanSlash("/próxima #4")?.taskId).toBe(4);
    expect(parsePlanSlash("/NEXT")?.def.kind).toBe("next");
    expect(parsePlanSlash("/plano um app de tarefas\ncom login")).toMatchObject({ def: { kind: "plan" }, arg: "um app de tarefas\ncom login" });
    expect(parsePlanSlash("/executar todas")).toMatchObject({ def: { kind: "run" }, all: true });
    expect(parsePlanSlash("/aplicar src/App.tsx")).toMatchObject({ def: { kind: "apply" }, arg: "src/App.tsx" });
  });

  it("autonomia e pacote só aceitam valores conhecidos", () => {
    expect(parsePlanSlash("/autonomia autonomo")?.autonomy).toBe("full");
    expect(parsePlanSlash("/autonomia semi")?.autonomy).toBe("semi");
    expect(parsePlanSlash("/autonomia basico+")?.autonomy).toBe("plus");
    expect(parsePlanSlash("/autonomia qualquer")?.autonomy).toBeUndefined();
    expect(parsePlanSlash("/pacote forte")?.modelPack).toBe("strong");
    expect(parsePlanSlash("/pack equilibrado")?.modelPack).toBe("balanced");
    expect(parsePlanSlash("/pacote nenhum")?.modelPack).toBeUndefined();
  });

  it("devolve null para o que não é comando do plano", () => {
    expect(parsePlanSlash("oi")).toBeNull();
    expect(parsePlanSlash("/review")).toBeNull();
    expect(parsePlanSlash("")).toBeNull();
  });

  it("nomes e apelidos não colidem", () => {
    const all = PLAN_SLASH_COMMANDS.flatMap((c) => [c.name, ...c.aliases]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("dicas enquanto digita", () => {
    expect(matchPlanSlashHints("/pro").map((c) => c.kind)).toContain("next");
    expect(matchPlanSlashHints("/proxima 1")).toEqual([]);
    expect(matchPlanSlashHints("pro")).toEqual([]);
    expect(matchPlanSlashHints("/").length).toBe(PLAN_SLASH_COMMANDS.length);
  });
});

describe("createWriterLock", () => {
  it("um escritor por vez; ocupado recusa com WriterBusyError em pt-BR", async () => {
    const lock = createWriterLock();
    const seen: Array<string | null> = [];
    const unsub = lock.subscribe((h) => seen.push(h));
    let release!: () => void;
    const first = lock.run("executor", () => new Promise<string>((r) => (release = () => r("ok"))));
    expect(lock.holder()).toBe("executor");
    await expect(lock.run("manual", async () => "x")).rejects.toBeInstanceOf(WriterBusyError);
    try {
      await lock.run("fix_queue", async () => 1);
    } catch (e) {
      expect((e as WriterBusyError).heldBy).toBe("executor");
      expect((e as Error).message).toContain("o executor do plano");
    }
    release();
    await expect(first).resolves.toBe("ok");
    expect(lock.holder()).toBeNull();
    expect(seen).toEqual(["executor", null]);
    unsub();
  });

  it("wait: true entra na fila e roda na vez, em ordem", async () => {
    const lock = createWriterLock();
    const order: string[] = [];
    let release!: () => void;
    const a = lock.run("executor", () => new Promise<void>((r) => (release = r)).then(() => order.push("executor")));
    const b = lock.run("manual", async () => {
      order.push(`manual:${lock.holder()}`);
    }, { wait: true });
    const c = lock.run("debug", async () => {
      order.push(`debug:${lock.holder()}`);
    }, { wait: true });
    release();
    await Promise.all([a, b, c]);
    expect(order).toEqual(["executor", "manual:manual", "debug:debug"]);
    expect(lock.holder()).toBeNull();
  });

  it("libera a trava mesmo quando a função falha", async () => {
    const lock = createWriterLock();
    await expect(lock.run("rewind", async () => {
      throw new Error("boom");
    })).rejects.toThrow("boom");
    expect(lock.holder()).toBeNull();
    await expect(lock.run("manual", async () => 2)).resolves.toBe(2);
  });

  it("timeout na fila recusa e sai da fila", async () => {
    vi.useFakeTimers();
    try {
      const lock = createWriterLock();
      let release!: () => void;
      const a = lock.run("executor", () => new Promise<void>((r) => (release = r)));
      const fn = vi.fn(async () => "nunca");
      const b = lock.run("manual", fn, { wait: true, timeoutMs: 100 });
      const assertion = expect(b).rejects.toBeInstanceOf(WriterBusyError);
      await vi.advanceTimersByTimeAsync(150);
      await assertion;
      release();
      await a;
      expect(fn).not.toHaveBeenCalled();
      expect(lock.holder()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

function task(id: number, extra: Partial<PlanTask> = {}): PlanTask {
  return { id, title: `T${id}`, description: "", details: "", testStrategy: "", priority: "medium", status: "pending", dependencies: [], subtasks: [], files: [], ...extra };
}

function clientState(tasks: PlanTask[] | null, extra: { autonomy?: "semi" | "full"; staged?: boolean } = {}): ClientAgentState {
  const graph: TaskGraph | null = tasks ? { version: 1, goal: "g", tasks, createdAt: NOW, updatedAt: NOW } : null;
  const base = emptyAgentState(undefined, NOW);
  return toClientState({
    ...base,
    graph,
    autonomy: extra.autonomy ?? "semi",
    staged: extra.staged ? [stageChange({ path: "a.ts", baseContent: "", content: "x", taskId: 1 })] : [],
  });
}

describe("runAllDecision", () => {
  const ctx = { iterations: 0, maxIterations: 10, lastOk: true, cancelled: false };

  it("segue quando há próxima tarefa liberada", () => {
    expect(runAllDecision(clientState([task(1, { status: "done" }), task(2, { dependencies: [1] })]), ctx)).toEqual({ stop: false });
  });

  it("para por cancelamento, erro, falta de plano", () => {
    expect(runAllDecision(clientState([task(1)]), { ...ctx, cancelled: true })).toMatchObject({ stop: true, reason: "cancelled" });
    expect(runAllDecision(clientState([task(1)]), { ...ctx, lastOk: false })).toMatchObject({ stop: true, reason: "error" });
    expect(runAllDecision(null, ctx)).toMatchObject({ stop: true, reason: "done" });
    expect(runAllDecision(clientState(null), ctx)).toMatchObject({ stop: true, reason: "done" });
  });

  it("para esperando aprovação quando há staged (mensagem muda com a autonomia)", () => {
    const semi = runAllDecision(clientState([task(1, { status: "in-progress" })], { staged: true }), ctx);
    expect(semi).toMatchObject({ stop: true, reason: "awaiting_approval" });
    const full = runAllDecision(clientState([task(1, { status: "in-progress" })], { staged: true, autonomy: "full" }), ctx);
    expect(full).toMatchObject({ stop: true, reason: "awaiting_approval" });
    expect(semi.stop && full.stop && semi.message !== full.message).toBe(true);
  });

  it("plano concluído, bloqueado ou limite de passos", () => {
    expect(runAllDecision(clientState([task(1, { status: "done" }), task(2, { status: "deferred" })]), ctx)).toMatchObject({ stop: true, reason: "done" });
    expect(runAllDecision(clientState([task(1, { status: "blocked" }), task(2, { dependencies: [1] })]), ctx)).toMatchObject({ stop: true, reason: "blocked" });
    expect(runAllDecision(clientState([task(1)]), { ...ctx, iterations: 10 })).toMatchObject({ stop: true, reason: "limit" });
  });
});
