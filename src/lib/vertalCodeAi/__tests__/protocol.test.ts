import { describe, expect, it } from "vitest";
import { buildMessages, extractJson, parseBuild, parsePlan, pickContextFiles, sanitizeAttachments } from "../core";

describe("leitura da resposta do modelo", () => {
  it("ignora raciocínio e cercas", () => {
    const raw = '<think>pensando {não é json}</think>\n```json\n{"summary":"ok","steps":[{"title":"t","detail":"d","files":["a.ts"]}]}\n```';
    expect(parsePlan(raw)).toEqual({ summary: "ok", steps: [{ title: "t", detail: "d", files: ["a.ts"] }], questions: [], risks: [] });
  });

  it("aceita chaves dentro de strings", () => {
    expect(extractJson('texto {"a":"{x}","b":"\\"}"} fim')).toEqual({ a: "{x}", b: '"}' });
  });

  it("acusa JSON cortado", () => {
    expect(() => extractJson('{"a": "b"')).toThrow(/incompleto/);
  });

  it("normaliza edições", () => {
    const b = parseBuild(
      JSON.stringify({
        summary: "s",
        edits: [
          { path: "./src/a.ts", action: "edit", changes: [{ search: "x", replace: "y" }, { search: "", replace: "z" }] },
          { path: "src/b.ts", content: "novo" },
          { action: "create", content: "sem caminho" },
        ],
        testCommand: "npx tsc --noEmit",
      }),
    );
    expect(b.edits).toEqual([
      { path: "src/a.ts", action: "edit", reason: undefined, changes: [{ search: "x", replace: "y" }] },
      { path: "src/b.ts", action: "replace", reason: undefined, content: "novo" },
    ]);
    expect(b.testCommand).toBe("npx tsc --noEmit");
  });
});

describe("contexto", () => {
  const tree = ["src/components/Login.tsx", "src/lib/auth.ts", "src/pages/Home.tsx", "node_modules/x/index.js", "README.md"];

  it("prioriza arquivos citados e depois por palavras do pedido", () => {
    const picked = pickContextFiles(tree, "corrigir o botão de login na tela de auth", ["src/pages/Home.tsx"], 3);
    expect(picked[0]).toBe("src/pages/Home.tsx");
    expect(picked.slice(1).sort()).toEqual(["src/components/Login.tsx", "src/lib/auth.ts"]);
    expect(pickContextFiles(tree, "login", [], 5)).not.toContain("node_modules/x/index.js");
  });

  it("imagens viram image_url só quando o modelo tem visão", () => {
    const att = [{ name: "print.png", kind: "image" as const, data: "data:image/png;base64,AAAA" }];
    const withImg = buildMessages({ mode: "build", prompt: "faça igual", tree, files: [], attachments: att }, true);
    expect(Array.isArray(withImg.at(-1)!.content)).toBe(true);
    const noImg = buildMessages({ mode: "build", prompt: "faça igual", tree, files: [], attachments: att }, false);
    expect(typeof noImg.at(-1)!.content).toBe("string");
    expect(noImg.at(-1)!.content as string).toContain("não puderam ser lidas");
    expect(withImg[0].content as string).toContain("VERTAL Code AI");
  });

  it("anexos: só imagens data: e texto dentro do limite", () => {
    const out = sanitizeAttachments([
      { name: "a.png", kind: "image", data: "data:image/png;base64,AAA" },
      { name: "b.svg", kind: "image", data: "data:image/svg+xml;base64,AAA" },
      { name: "c.txt", kind: "text", data: "x".repeat(200_000) },
      { name: "d", kind: "exe", data: "x" },
    ]);
    expect(out.map((a) => a.name)).toEqual(["a.png", "c.txt"]);
    expect(out[1].data.length).toBe(60_000);
  });
});
