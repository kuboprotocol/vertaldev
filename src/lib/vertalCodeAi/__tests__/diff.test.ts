import { describe, expect, it } from "vitest";
import { applyEdit, applyEdits, diffLines, diffStats, replaceOnce, unifiedDiff } from "../core";

function rebuild(ops: ReturnType<typeof diffLines>) {
  return {
    a: ops.filter((o) => o.t !== "+").map((o) => o.line),
    b: ops.filter((o) => o.t !== "-").map((o) => o.line),
  };
}

describe("diffLines (Myers)", () => {
  it("reconstrói os dois lados em casos aleatórios", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let n = 0; n < 200; n++) {
      const a = Array.from({ length: Math.floor(rnd() * 30) }, () => String(Math.floor(rnd() * 6)));
      const b = Array.from({ length: Math.floor(rnd() * 30) }, () => String(Math.floor(rnd() * 6)));
      const ops = diffLines(a, b);
      expect(rebuild(ops)).toEqual({ a, b });
    }
  });

  it("produz diff mínimo para uma linha trocada", () => {
    const ops = diffLines(["a", "b", "c"], ["a", "x", "c"]);
    expect(ops.filter((o) => o.t !== " ")).toHaveLength(2);
  });
});

describe("unifiedDiff", () => {
  it("gera cabeçalho e hunk no formato git", () => {
    const d = unifiedDiff("src/a.ts", "um\ndois\ntrês\n", "um\nDOIS\ntrês\n");
    expect(d).toContain("--- a/src/a.ts");
    expect(d).toContain("+++ b/src/a.ts");
    expect(d).toContain("@@ -1,3 +1,3 @@");
    expect(d).toContain("-dois");
    expect(d).toContain("+DOIS");
    expect(diffStats(d)).toEqual({ added: 1, removed: 1 });
  });

  it("arquivo novo vem de /dev/null", () => {
    const d = unifiedDiff("novo.ts", "", "x\ny\n");
    expect(d.startsWith("--- /dev/null")).toBe(true);
    expect(d).toContain("@@ -0,0 +1,2 @@");
  });

  it("sem mudança, diff vazio", () => {
    expect(unifiedDiff("a", "x\n", "x\n")).toBe("");
  });

  it("separa hunks distantes", () => {
    const a = Array.from({ length: 40 }, (_, i) => `l${i}`).join("\n");
    const b = a.replace("l2\n", "L2\n").replace("l35", "L35");
    const d = unifiedDiff("f", a, b);
    expect(d.match(/^@@/gm)).toHaveLength(2);
  });
});

describe("edições", () => {
  it("troca trecho exato uma vez", () => {
    expect(replaceOnce("a b c", "b", "X")).toEqual({ ok: true, text: "a X c" });
  });

  it("recusa trecho ambíguo", () => {
    const r = replaceOnce("x\nx\n", "x", "y");
    expect(r.ok).toBe(false);
  });

  it("tolera indentação diferente", () => {
    const r = replaceOnce("function f() {\n    return 1;\n}\n", "return 1;", "return 2;");
    expect(r).toEqual({ ok: true, text: "function f() {\n    return 2;\n}\n" });
  });

  it("edit em arquivo inexistente pede create", () => {
    expect(applyEdit("", { path: "a", action: "edit", changes: [{ search: "x", replace: "y" }] }).ok).toBe(false);
  });

  it("acumula várias edições no mesmo arquivo e reporta falhas", () => {
    const { applied, failures } = applyEdits(
      { "a.ts": "const a = 1;\nconst b = 2;\n" },
      [
        { path: "a.ts", action: "edit", changes: [{ search: "const a = 1;", replace: "const a = 10;" }] },
        { path: "a.ts", action: "edit", changes: [{ search: "const b = 2;", replace: "const b = 20;" }] },
        { path: "b.ts", action: "create", content: "export {};\n" },
        { path: "c.ts", action: "edit", changes: [{ search: "nada", replace: "x" }] },
      ],
    );
    expect(applied.map((a) => a.path).sort()).toEqual(["a.ts", "b.ts"]);
    const a = applied.find((x) => x.path === "a.ts")!;
    expect(a.after).toBe("const a = 10;\nconst b = 20;\n");
    expect(a.added).toBe(2);
    expect(applied.find((x) => x.path === "b.ts")!.action).toBe("create");
    expect(failures).toEqual([{ path: "c.ts", error: expect.stringContaining("não existe") }]);
  });
});
