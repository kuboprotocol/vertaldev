import { describe, expect, it } from "vitest";
import {
  applyReflection,
  applyReplacement,
  changedLines,
  composeReviewReply,
  extractJsonObject,
  fingerprintFinding,
  findingDiff,
  formatDevContext,
  formatFileForReview,
  locateSnippet,
  normalizeSeverity,
  parseAdjustOutput,
  parseAnswer,
  parseCodeSuggestions,
  parseDescribe,
  parseReflection,
  parseReviewOutput,
  pathsFromErrors,
  pickReviewFiles,
  reindentToLine,
  ReviewParseError,
  sanitizeErrorText,
  severityFromScore,
  sortFindings,
  validateFinding,
  type ReviewFinding,
} from "../../supabase/functions/_shared/vibeReviewEngine";

const FILE = [
  "import { useState } from \"react\";",
  "",
  "export function Counter() {",
  "  const [n, setN] = useState(0);",
  "  const inc = () => setN(n + 1);",
  "  return <button onClick={inc}>{n}</button>;",
  "}",
].join("\n");

describe("extractJsonObject", () => {
  it("aceita cercas ```json e texto em volta", () => {
    expect(extractJsonObject('Aqui está:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });
  it("falha com ReviewParseError quando não há JSON", () => {
    expect(() => extractJsonObject("sem json")).toThrow(ReviewParseError);
    expect(() => extractJsonObject("{quebrado")).toThrow(ReviewParseError);
    expect(() => extractJsonObject("[1,2]")).toThrow(ReviewParseError);
  });
});

describe("parseReviewOutput", () => {
  const raw = JSON.stringify({
    review: {
      summary: "Contador simples.",
      risk_level: "medium",
      security_concerns: "Não",
      key_issues_to_review: [
        {
          relevant_file: "src/Counter.tsx",
          issue_header: "Possible Bug",
          severity: "high",
          issue_content: "Cliques rápidos usam `n` antigo.",
          start_line: "5",
          end_line: 5,
          existing_code: "  const inc = () => setN(n + 1);",
          improved_code: "  const inc = () => setN((v) => v + 1);",
        },
        { relevant_file: "src/Counter.tsx", issue_header: "Sem explicação" },
        { issue_content: "sem arquivo" },
        "lixo",
      ],
    },
  });

  it("valida, normaliza e descarta itens inválidos", () => {
    const r = parseReviewOutput(raw);
    expect(r.findings).toHaveLength(1);
    expect(r.dropped).toBe(3);
    const f = r.findings[0];
    expect(f).toMatchObject({
      path: "src/Counter.tsx",
      title: "Possível problema",
      severity: "high",
      startLine: 5,
      endLine: 5,
      source: "review",
      applicable: false,
    });
    expect(f.id).toBe(fingerprintFinding(f));
    expect(r.riskLevel).toBe("medium");
    expect(r.securityConcerns).toBeUndefined();
    expect(r.summary).toBe("Contador simples.");
  });

  it("aceita lista na raiz (fila de erros) e respeita o máximo", () => {
    const many = { key_issues_to_review: Array.from({ length: 5 }, (_, i) => ({ relevant_file: `a${i}.ts`, issue_content: `x${i}` })) };
    const r = parseReviewOutput(JSON.stringify(many), "error", 3);
    expect(r.findings).toHaveLength(3);
    expect(r.findings[0].source).toBe("error");
    expect(r.dropped).toBe(2);
  });

  it("remove duplicados pela impressão digital", () => {
    const dup = { findings: [{ path: "a.ts", title: "T", explanation: "e" }, { path: "a.ts", title: "t", explanation: "outra" }] };
    expect(parseReviewOutput(JSON.stringify(dup)).findings).toHaveLength(1);
  });

  it("mantém security_concerns real", () => {
    const r = parseReviewOutput(JSON.stringify({ review: { security_concerns: "Exposição de segredo: chave no código", key_issues_to_review: [] } }));
    expect(r.securityConcerns).toContain("Exposição de segredo");
  });
});

describe("severidade", () => {
  it("normaliza pt/en e infere pela dica", () => {
    expect(normalizeSeverity("Crítico")).toBe("critical");
    expect(normalizeSeverity("MAJOR")).toBe("high");
    expect(normalizeSeverity(undefined, "Injeção de SQL")).toBe("high");
    expect(normalizeSeverity(undefined, "bug no contador")).toBe("medium");
    expect(normalizeSeverity(undefined, "nome")).toBe("low");
  });
  it("nota → gravidade (new_score_mechanism)", () => {
    expect(severityFromScore(10)).toBe("high");
    expect(severityFromScore(7)).toBe("medium");
    expect(severityFromScore(5)).toBe("low");
  });
  it("ordena por gravidade e nota", () => {
    const mk = (severity: ReviewFinding["severity"], score?: number) => ({ severity, score }) as ReviewFinding;
    expect(sortFindings([mk("low"), mk("critical"), mk("medium", 7), mk("medium", 9)]).map((f) => `${f.severity}${f.score ?? ""}`)).toEqual([
      "critical",
      "medium9",
      "medium7",
      "low",
    ]);
  });
});

describe("/improve + autorreflexão", () => {
  const suggestions = parseCodeSuggestions(
    JSON.stringify({
      code_suggestions: [
        { relevant_file: "src/Counter.tsx", existing_code: "  const inc = () => setN(n + 1);", improved_code: "  const inc = () => setN((v) => v + 1);", suggestion_content: "Use atualização funcional", one_sentence_summary: "Atualização funcional do estado", label: "possible bug" },
        { relevant_file: "src/Counter.tsx", existing_code: "export function Counter() {", improved_code: "/** doc */\nexport function Counter() {", suggestion_content: "Adicione docstring", one_sentence_summary: "Docstring" },
        { relevant_file: "src/Counter.tsx", existing_code: "a", improved_code: "a", suggestion_content: "nada", one_sentence_summary: "igual" },
        { relevant_file: "x.ts", suggestion_content: "sem existing_code" },
      ],
    }),
  );

  it("descarta sugestões sem existing_code", () => {
    expect(suggestions).toHaveLength(3);
    expect(suggestions[1].label).toBe("enhancement");
  });

  it("descarta as de nota baixa e as que não mudam nada", () => {
    const feedback = parseReflection(
      JSON.stringify({
        code_suggestions: [
          { suggestion_score: 9, why: "Evita bug real", relevant_lines_start: 5, relevant_lines_end: 5 },
          { suggestion_score: 0, why: "Docstring" },
          { suggestion_score: "8", why: "igual" },
        ],
      }),
    );
    const { findings, dropped } = applyReflection(suggestions, feedback);
    expect(dropped).toBe(2);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ source: "improve", score: 9, severity: "high", startLine: 5, why: "Evita bug real" });
  });

  it("sem reflexão usa a nota padrão (7) e mantém", () => {
    const { findings } = applyReflection(suggestions.slice(0, 2), null);
    expect(findings.map((f) => f.score)).toEqual([7, 7]);
  });

  it("limite configurável", () => {
    const fb = [{ score: 6, why: "" }, { score: 6, why: "" }];
    expect(applyReflection(suggestions.slice(0, 2), fb, { threshold: 7 }).findings).toHaveLength(0);
  });

  it("parseReflection limita a nota entre 0 e 10", () => {
    expect(parseReflection('{"code_suggestions":[{"suggestion_score":42},{"suggestion_score":"x"}]}').map((f) => f.score)).toEqual([10, 0]);
  });
});

describe("describe / ask / adjust", () => {
  it("parseDescribe", () => {
    const d = parseDescribe(JSON.stringify({ type: "Melhoria", title: "Contador", description: "- novo", pr_files: [{ filename: "a.ts", changes_summary: "criado" }, { filename: "b.ts" }] }));
    expect(d).toEqual({ title: "Contador", type: ["Melhoria"], description: "- novo", files: [{ path: "a.ts", summary: "criado", label: undefined }] });
    expect(() => parseDescribe("{}")).toThrow(ReviewParseError);
  });
  it("parseAnswer aceita JSON ou texto puro", () => {
    expect(parseAnswer('{"answer":"Porque sim."}')).toBe("Porque sim.");
    expect(parseAnswer("Resposta direta")).toBe("Resposta direta");
    expect(() => parseAnswer("   ")).toThrow(ReviewParseError);
  });
  it("parseAdjustOutput mantém arquivo e origem do item", () => {
    const base = parseReviewOutput(JSON.stringify({ findings: [{ path: "src/Counter.tsx", title: "T", explanation: "e", existing_code: "a", improved_code: "b" }] })).findings[0];
    const { finding, reply } = parseAdjustOutput(
      JSON.stringify({ reply: "Mantive o nome.", finding: { relevant_file: "outro.ts", existing_code: "x", improved_code: "y" } }),
      base,
    );
    expect(reply).toBe("Mantive o nome.");
    expect(finding.path).toBe("src/Counter.tsx");
    expect(finding.existingCode).toBe("x");
    expect(() => parseAdjustOutput('{"reply":"sem correção"}', base)).toThrow(ReviewParseError);
  });
});

describe("aplicação da correção", () => {
  it("localiza exato e tolerante a indentação", () => {
    expect(locateSnippet(FILE, "  const inc = () => setN(n + 1);")).toEqual({ start: 5, end: 5 });
    expect(locateSnippet(FILE, "const inc = () => setN(n + 1);\nreturn <button onClick={inc}>{n}</button>;")).toEqual({ start: 5, end: 6 });
    expect(locateSnippet(FILE, "não existe")).toBeNull();
    expect(locateSnippet(FILE, "export function Counter() {\n...\n}")).toBeNull();
  });

  it("com várias ocorrências usa a mais perto da linha sugerida", () => {
    const text = "a\nx\nb\nx\nc";
    expect(locateSnippet(text, "x", 4)).toEqual({ start: 4, end: 4 });
    expect(locateSnippet(text, "x")).toEqual({ start: 2, end: 2 });
  });

  it("reindenta a substituição (reindent_to_line)", () => {
    expect(reindentToLine("if (a) {\n  b();\n}", "    old();")).toBe("    if (a) {\n      b();\n    }");
    expect(reindentToLine("        x();", "  y();")).toBe("  x();");
    expect(reindentToLine("x();\n  y();", "\t\tz();")).toBe("\t\tx();\n\t\t  y();");
  });

  it("troca existing_code por improved_code reindentado", () => {
    const res = applyReplacement(FILE, "const inc = () => setN(n + 1);", "const inc = () => setN((v) => v + 1);");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.content.split("\n")[4]).toBe("  const inc = () => setN((v) => v + 1);");
      expect(res.content.split("\n")).toHaveLength(7);
    }
  });

  it("improved_code vazio remove as linhas", () => {
    const res = applyReplacement("a\nb\nc", "b", "");
    expect(res).toEqual({ ok: true, content: "a\nc", start: 2, end: 2 });
  });

  it("validateFinding confere arquivo, trecho e sintaxe", () => {
    const base = parseReviewOutput(
      JSON.stringify({ findings: [{ path: "src/Counter.tsx", title: "T", explanation: "e", start_line: 9, existing_code: "  const inc = () => setN(n + 1);", improved_code: "  const inc = () => setN((v) => v + 1);" }] }),
    ).findings[0];
    expect(validateFinding(base, undefined)).toMatchObject({ applicable: false, problem: "arquivo não encontrado no projeto" });
    const ok = validateFinding(base, FILE);
    expect(ok).toMatchObject({ applicable: true, startLine: 5, endLine: 5 });
    const broken = validateFinding({ ...base, improvedCode: "  const inc = () => { setN(n + 1);" }, FILE);
    expect(broken.applicable).toBe(false);
    expect(broken.problem).toContain("a troca introduz");
    expect(validateFinding({ ...base, existingCode: "nada disso" }, FILE).problem).toContain("não foi encontrado");
    expect(validateFinding({ ...base, existingCode: undefined }, FILE).applicable).toBe(false);
  });

  it("findingDiff", () => {
    expect(findingDiff({ existingCode: "a\nb", improvedCode: "c" })).toEqual([
      { type: "del", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "c" },
    ]);
    expect(findingDiff({ existingCode: undefined })).toEqual([]);
  });
});

describe("código numerado (formato __new hunk__)", () => {
  it("marca com + as linhas novas/alteradas", () => {
    const prev = "a\nb\nc";
    const cur = "a\nB\nc\nd";
    expect([...changedLines(prev, cur)].sort()).toEqual([1, 3]);
    const out = formatFileForReview("x.ts", cur, prev);
    expect(out).toContain("## Arquivo: 'x.ts' (2 linha(s)");
    expect(out).toContain("2 + B");
    expect(out).toContain("1   a");
  });
  it("sem versão anterior mostra o arquivo inteiro e corta por tamanho", () => {
    const out = formatFileForReview("x.ts", "linha\n".repeat(50), null, 60);
    expect(out).toContain("(arquivo inteiro)");
    expect(out).toMatch(/linha\(s\) cortadas por tamanho/);
  });
});

describe("contexto do projeto e do Dev", () => {
  const tree = ["src/App.tsx", "src/main.tsx", "src/pages/Home.tsx", "src/components/ui/button.tsx", "src/lib/a.test.ts", "package.json", "src/components/Card.tsx"];
  it("pickReviewFiles prioriza os da conversa e o miolo do app", () => {
    expect(pickReviewFiles(tree, ["src/components/Card.tsx", "fora.ts"], 4)).toEqual(["src/components/Card.tsx", "src/App.tsx", "src/main.tsx", "src/pages/Home.tsx"]);
  });
  it("pathsFromErrors acha arquivos citados em stack traces", () => {
    const errs = ["TypeError: x is undefined\n    at Home (src/pages/Home.tsx:12:5)", "[vite] Failed to resolve import in App.tsx"];
    expect(pathsFromErrors(errs, tree)).toEqual(["src/App.tsx", "src/pages/Home.tsx"]);
  });
  it("sanitizeErrorText remove segredos", () => {
    expect(sanitizeErrorText("chave sk_live_abcdefghijklmnop vazou")).toBe("chave [segredo removido] vazou");
  });
  it("formatDevContext inclui erros, arquivo aberto e decisões", () => {
    const ctx = formatDevContext({
      recentErrors: ["ReferenceError: foo is not defined"],
      openedPath: "src/App.tsx",
      conversationFiles: ["src/App.tsx"],
      decisions: [
        { title: "Atualização funcional", path: "src/Counter.tsx", decision: "skipped", comment: "prefiro assim" },
        { title: "XSS", path: "src/Chat.tsx", decision: "applied" },
      ],
    });
    expect(ctx).toContain("ReferenceError");
    expect(ctx).toContain("Arquivo aberto pelo Dev agora: src/App.tsx");
    expect(ctx).toContain('O Dev pulou "Atualização funcional"');
    expect(ctx).toContain('comentário: "prefiro assim"');
    expect(ctx).toContain('O Dev aplicou "XSS"');
    expect(formatDevContext(null)).toBe("");
    expect(formatDevContext({})).toBe("");
  });
  it("composeReviewReply conta por gravidade e explica o um-a-um", () => {
    const f = { severity: "high" } as ReviewFinding;
    const text = composeReviewReply({ command: "review", findings: [f, { severity: "low" } as ReviewFinding], dropped: 0 });
    expect(text).toContain("Encontrei 2 ponto(s) para corrigir (1 alto, 1 baixo)");
    expect(text).toContain("1/2");
    expect(composeReviewReply({ command: "improve", findings: [] })).toContain("autorrevisão");
  });
});
