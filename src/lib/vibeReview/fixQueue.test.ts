import { describe, expect, it } from "vitest";
import {
  currentFixItem,
  emptyFixQueue,
  fixQueueReducer,
  isQueueActive,
  prepareApply,
  queueProgress,
  type FixQueueAction,
  type FixQueueState,
} from "./fixQueue";
import { fingerprintFinding, type ReviewFinding, type ReviewPayload } from "./engine";

const FILE = "const a = 1;\nconst b = 2;\nconst c = 3;\n";

function finding(i: number, over: Partial<ReviewFinding> = {}): ReviewFinding {
  const f: ReviewFinding = {
    id: "",
    source: "review",
    path: "src/x.ts",
    title: `Item ${i}`,
    severity: "medium",
    explanation: `explicação ${i}`,
    existingCode: `const ${"abc"[i]} = ${i + 1};`,
    improvedCode: `const ${"abc"[i]} = ${(i + 1) * 10};`,
    applicable: true,
    ...over,
  };
  return { ...f, id: over.id ?? fingerprintFinding(f) };
}

const payload = (findings: ReviewFinding[], files: Record<string, string> = { "src/x.ts": FILE }): ReviewPayload => ({
  command: "review",
  findings,
  files,
});

const run = (state: FixQueueState, ...actions: FixQueueAction[]) => actions.reduce(fixQueueReducer, state);

describe("fila de correções: máquina de estados", () => {
  it("começa no item 1 com progresso 1/N", () => {
    const s = run(emptyFixQueue, { type: "start", payload: payload([finding(0), finding(1), finding(2)]) });
    expect(isQueueActive(s)).toBe(true);
    expect(currentFixItem(s)?.finding.title).toBe("Item 0");
    expect(queueProgress(s)).toEqual({ position: 1, total: 3, applied: 0, skipped: 0, done: false, percent: 0 });
  });

  it("aplicar: applying → applied, atualiza a cópia de trabalho e avança", () => {
    let s = run(emptyFixQueue, { type: "start", payload: payload([finding(0), finding(1)]) });
    const prepared = prepareApply(s);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.content).toBe("const a = 10;\nconst b = 2;\nconst c = 3;\n");
    s = run(s, { type: "apply_start" });
    expect(currentFixItem(s)?.status).toBe("applying");
    s = run(s, { type: "apply_success", content: prepared.content });
    expect(s.items[0].status).toBe("applied");
    expect(s.files["src/x.ts"]).toBe(prepared.content);
    expect(queueProgress(s)).toMatchObject({ position: 2, applied: 1, percent: 50 });
    expect(s.decisions).toEqual([{ title: "Item 0", path: "src/x.ts", decision: "applied" }]);
    // a próxima correção no mesmo arquivo usa o texto novo
    const next = prepareApply(s);
    expect(next.ok && next.content).toBe("const a = 10;\nconst b = 20;\nconst c = 3;\n");
  });

  it("pular avança e registra a decisão; a fila termina", () => {
    const s = run(emptyFixQueue, { type: "start", payload: payload([finding(0), finding(1)]) }, { type: "skip" }, { type: "skip" });
    expect(queueProgress(s)).toEqual({ position: 2, total: 2, applied: 0, skipped: 2, done: true, percent: 100 });
    expect(isQueueActive(s)).toBe(false);
    expect(currentFixItem(s)).toBeNull();
    expect(s.decisions.map((d) => d.decision)).toEqual(["skipped", "skipped"]);
  });

  it("falha ao aplicar mantém o item na vez para tentar de novo", () => {
    let s = run(emptyFixQueue, { type: "start", payload: payload([finding(0)]) }, { type: "apply_start" }, { type: "apply_failed", error: "commit falhou" });
    expect(currentFixItem(s)).toMatchObject({ status: "failed", error: "commit falhou" });
    expect(s.index).toBe(0);
    s = run(s, { type: "apply_start" });
    expect(currentFixItem(s)).toMatchObject({ status: "applying", error: undefined });
    s = run(s, { type: "apply_success", content: "x" });
    expect(queueProgress(s).done).toBe(true);
  });

  it("ajustar: adjusting → pending com a correção refeita, mesma identidade", () => {
    const original = finding(0);
    let s = run(emptyFixQueue, { type: "start", payload: payload([original, finding(1)]) }, { type: "adjust_start", comment: "  use 100  " });
    expect(currentFixItem(s)).toMatchObject({ status: "adjusting", comment: "use 100" });
    // enquanto ajusta, não dá para aplicar nem pular
    expect(run(s, { type: "skip" })).toBe(s);
    expect(run(s, { type: "apply_start" })).toBe(s);
    s = run(s, { type: "adjust_result", finding: { ...finding(0, { improvedCode: "const a = 100;" }), id: "outro", path: "hack.ts" } });
    const cur = currentFixItem(s)!;
    expect(cur.status).toBe("pending");
    expect(cur.finding.id).toBe(original.id);
    expect(cur.finding.path).toBe("src/x.ts");
    expect(cur.finding.improvedCode).toBe("const a = 100;");
    expect(s.decisions).toEqual([{ title: "Item 0", path: "src/x.ts", decision: "adjusted", comment: "use 100" }]);
    const prepared = prepareApply(s);
    expect(prepared.ok && prepared.content.startsWith("const a = 100;")).toBe(true);
  });

  it("ajuste com comentário vazio é ignorado; falha volta para pending com erro", () => {
    const s0 = run(emptyFixQueue, { type: "start", payload: payload([finding(0)]) });
    expect(run(s0, { type: "adjust_start", comment: "   " })).toBe(s0);
    const s = run(s0, { type: "adjust_start", comment: "x" }, { type: "adjust_failed", error: "não deu" });
    expect(currentFixItem(s)).toMatchObject({ status: "pending", error: "não deu" });
  });

  it("depois de aplicar, revalida os itens pendentes do mesmo arquivo", () => {
    const conflicting = finding(1, { existingCode: "const a = 1;", improvedCode: "const a = 2;", title: "Conflito" });
    let s = run(emptyFixQueue, { type: "start", payload: payload([finding(0), conflicting]) });
    const p = prepareApply(s);
    if (!p.ok) throw new Error("deveria aplicar");
    s = run(s, { type: "apply_start" }, { type: "apply_success", content: p.content });
    expect(currentFixItem(s)?.finding).toMatchObject({ applicable: false });
    expect(prepareApply(s)).toEqual({ ok: false, reason: "o trecho original não foi encontrado no arquivo atual" });
  });

  it("prepareApply recusa item sem correção, sem arquivo ou que não muda nada", () => {
    const noFix = run(emptyFixQueue, { type: "start", payload: payload([finding(0, { existingCode: undefined, improvedCode: undefined })]) });
    expect(prepareApply(noFix).ok).toBe(false);
    const noFile = run(emptyFixQueue, { type: "start", payload: payload([finding(0)], {}) });
    expect(prepareApply(noFile)).toMatchObject({ ok: false });
    const same = run(emptyFixQueue, { type: "start", payload: payload([finding(0, { improvedCode: "const a = 1;" })]) });
    expect(prepareApply(same)).toEqual({ ok: false, reason: "a correção não muda nada no arquivo" });
    expect(prepareApply(emptyFixQueue)).toEqual({ ok: false, reason: "nenhum item na vez" });
  });

  it("o que o Dev pulou não volta numa nova revisão; decisões sobrevivem ao fechar", () => {
    const f0 = finding(0);
    let s = run(emptyFixQueue, { type: "start", payload: payload([f0, finding(1)]) }, { type: "skip" }, { type: "close" });
    expect(s.items).toHaveLength(0);
    expect(s.decisions).toHaveLength(1);
    s = run(s, { type: "start", payload: payload([f0, finding(1), finding(2)]) });
    expect(s.items.map((i) => i.finding.title)).toEqual(["Item 1", "Item 2"]);
  });

  it("resultados de describe/ask/adjust não abrem fila", () => {
    for (const command of ["describe", "ask", "adjust"] as const) {
      expect(run(emptyFixQueue, { type: "start", payload: { command, findings: [finding(0)] } })).toBe(emptyFixQueue);
    }
  });

  it("pular volta para itens pendentes anteriores (ex.: um ajustado)", () => {
    // item 0 falha, item 1 é pulado: a fila volta ao 0? não — falhou não é pending; termina só quando não sobra pending.
    let s = run(emptyFixQueue, { type: "start", payload: payload([finding(0), finding(1), finding(2)]) });
    s = run(s, { type: "skip" }, { type: "apply_start" }, { type: "apply_success", content: "y" });
    expect(s.index).toBe(2);
    s = run(s, { type: "skip" });
    expect(queueProgress(s)).toMatchObject({ done: true, applied: 1, skipped: 2 });
  });

  it("fila vazia: sem progresso e inativa", () => {
    const s = run(emptyFixQueue, { type: "start", payload: payload([]) });
    expect(isQueueActive(s)).toBe(false);
    expect(queueProgress(s)).toEqual({ position: 0, total: 0, applied: 0, skipped: 0, done: false, percent: 0 });
  });
});
