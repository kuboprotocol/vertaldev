import { describe, expect, it } from "vitest";
import { activitySteps, collectCodeFiles, diffStats, fileName, replyOf } from "@/lib/vibeCodeFiles";
import type { VibeStep } from "@/lib/vibeCodeAgentTypes";

const step = (s: Partial<VibeStep>): VibeStep => ({
  id: s.id ?? Math.random().toString(36),
  kind: "diff",
  title: "",
  status: "success",
  startedAt: 0,
  ...s,
});

describe("collectCodeFiles", () => {
  it("vira uma caixinha por arquivo tocado, ignorando leituras e falhas", () => {
    const files = collectCodeFiles([
      step({ kind: "read_file", path: "src/a.ts" }),
      step({ kind: "diff", path: "src/b.ts", proposedContent: "B", diff: "+x" }),
      step({ kind: "diff", path: "src/c.ts", status: "failed" }),
      step({ kind: "edit_file", path: "src/b.ts", status: "running" }),
    ]);
    expect(files.map((f) => f.path)).toEqual(["src/b.ts"]);
    expect(files[0]).toMatchObject({ status: "preview", content: "B", diff: "+x" });
  });

  it("o commit vence o preview do mesmo arquivo e guarda o link do GitHub", () => {
    const [file] = collectCodeFiles([
      step({ kind: "diff", path: "src/b.ts", proposedContent: "old" }),
      step({ kind: "commit", path: "src/b.ts", proposedContent: "new", commitSha: "abc1234", repoUrl: "https://github.com/o/r/blob/abc1234/src/b.ts" }),
    ]);
    expect(file).toMatchObject({ status: "committed", content: "new", commitSha: "abc1234" });
    expect(file.repoUrl).toContain("github.com");
  });

  it("aproveita o conteúdo do preview quando o commit (conversa antiga) não trouxe", () => {
    const [file] = collectCodeFiles([
      step({ kind: "diff", path: "x.ts", proposedContent: "conteudo" }),
      step({ kind: "commit", path: "x.ts" }),
    ]);
    expect(file.content).toBe("conteudo");
  });

  it("marca o arquivo como desfeito", () => {
    const [file] = collectCodeFiles([step({ kind: "commit", path: "x.ts", reverted: true })]);
    expect(file.status).toBe("reverted");
  });
});

describe("diffStats", () => {
  it("conta linhas + e - sem os cabeçalhos", () => {
    expect(diffStats("--- a/x\n+++ b/x\n+uma\n+duas\n-velha\n contexto")).toEqual({ added: 2, removed: 1 });
    expect(diffStats(null)).toEqual({ added: 0, removed: 0 });
  });
});

describe("replyOf / activitySteps", () => {
  it("usa o content guardado ou, no stream, o passo reply", () => {
    expect(replyOf({ id: "1", role: "assistant", content: "Olá", createdAt: 0 })).toBe("Olá");
    expect(
      replyOf({ id: "1", role: "assistant", content: "", createdAt: 0, steps: [step({ kind: "reply", detail: "Feito" })] }),
    ).toBe("Feito");
  });

  it("tira reply e conversation da lista de atividade", () => {
    const steps = [step({ kind: "reply" }), step({ kind: "conversation" }), step({ kind: "plan" })];
    expect(activitySteps(steps).map((s) => s.kind)).toEqual(["plan"]);
  });
});

describe("fileName", () => {
  it("separa nome e pasta", () => {
    expect(fileName("src/pages/App.tsx")).toEqual({ name: "App.tsx", dir: "src/pages" });
    expect(fileName("README.md")).toEqual({ name: "README.md", dir: "" });
  });
});
