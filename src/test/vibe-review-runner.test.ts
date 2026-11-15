import { describe, expect, it } from "vitest";
import { parseReviewRequest, runReviewCommand, type ReviewDeps } from "../../supabase/functions/vibe-code-agent/review";
import type { ChatMsg } from "../../supabase/functions/_shared/vibeAgentCore";

const FILES: Record<string, string> = {
  "src/App.tsx": "export default function App() {\n  const items = data.map((d) => d.name);\n  return <div>{items}</div>;\n}\n",
  "src/main.tsx": "import App from './App';\n",
};

function deps(replies: string[], extra: Partial<ReviewDeps> = {}) {
  const calls: Array<{ messages: ChatMsg[]; label: string }> = [];
  const events: Array<Record<string, unknown>> = [];
  const d: ReviewDeps = {
    list: async () => Object.keys(FILES),
    read: async (path) => ({ content: FILES[path] ?? "", sha: FILES[path] ? "sha" : undefined }),
    readPrevious: async () => null,
    callModel: async (messages, { label }) => {
      calls.push({ messages, label });
      const next = replies.shift();
      if (next === undefined) throw new Error("sem resposta");
      return next;
    },
    send: (e) => events.push(e),
    context: "\n\nContexto do Dev:\nArquivo aberto pelo Dev agora: src/App.tsx",
    ...extra,
  };
  return { d, calls, events };
}

const findingsEvent = (events: Array<Record<string, unknown>>) =>
  events.find((e) => e.kind === "review_findings")?.review as { findings: Array<Record<string, unknown>>; files: Record<string, string>; dropped?: number };

describe("parseReviewRequest", () => {
  it("valida o comando e limpa caminhos e erros", () => {
    expect(parseReviewRequest({ command: "rm -rf" })).toBeNull();
    expect(parseReviewRequest(null)).toBeNull();
    const r = parseReviewRequest({ command: "fix_errors", paths: ["src/App.tsx", "../etc/passwd", ".env", 3], errors: ["boom sk_live_abcdefghijklmnop", "", 4] });
    expect(r?.paths).toEqual(["src/App.tsx"]);
    expect(r?.errors).toEqual(["boom [segredo removido]"]);
  });
});

describe("runReviewCommand", () => {
  it("/review: numera o código, valida findings e monta a fila", async () => {
    const { d, calls, events } = deps([
      JSON.stringify({
        review: {
          summary: "App lista dados.",
          key_issues_to_review: [
            {
              relevant_file: "src/App.tsx",
              issue_header: "Variável indefinida",
              severity: "critical",
              issue_content: "`data` não existe.",
              start_line: 2,
              end_line: 2,
              existing_code: "  const items = data.map((d) => d.name);",
              improved_code: "  const items = ([] as Array<{ name: string }>).map((d) => d.name);",
            },
            { relevant_file: "src/main.tsx", issue_header: "Sem correção", issue_content: "Explicação" },
          ],
        },
      }),
    ]);
    const reply = await runReviewCommand({ command: "review", paths: ["src/App.tsx"] }, d);
    expect(calls).toHaveLength(1);
    expect(calls[0].messages[0].content).toContain("Vibe Reviewer");
    expect(calls[0].messages[0].content).toContain("Arquivo aberto pelo Dev agora");
    expect(calls[0].messages[1].content).toContain("2     const items = data.map");
    const review = findingsEvent(events);
    expect(review.findings).toHaveLength(2);
    expect(review.findings[0]).toMatchObject({ severity: "critical", applicable: true });
    expect(review.findings[1]).toMatchObject({ applicable: false });
    expect(Object.keys(review.files).sort()).toEqual(["src/App.tsx", "src/main.tsx"]);
    expect(reply).toContain("Encontrei 2 ponto(s)");
    expect(reply).toContain("1/2");
  });

  it("dá uma segunda chance quando o modelo sai do JSON", async () => {
    const { d, calls } = deps(["não sei responder em json", JSON.stringify({ review: { key_issues_to_review: [] } })]);
    const reply = await runReviewCommand({ command: "review" }, d);
    expect(calls).toHaveLength(2);
    expect(calls[1].label).toContain("nova tentativa");
    expect(reply).toContain("não encontrei problemas");
  });

  it("/improve: autorreflexão descarta as fracas", async () => {
    const { d, calls, events } = deps([
      JSON.stringify({
        code_suggestions: [
          { relevant_file: "src/App.tsx", existing_code: "  return <div>{items}</div>;", improved_code: "  return <ul>{items}</ul>;", suggestion_content: "Use lista semântica", one_sentence_summary: "Lista semântica" },
          { relevant_file: "src/App.tsx", existing_code: "export default function App() {", improved_code: "/** App */\nexport default function App() {", suggestion_content: "docstring", one_sentence_summary: "Docstring" },
        ],
      }),
      JSON.stringify({ code_suggestions: [{ suggestion_score: 6, why: "melhora a11y" }, { suggestion_score: 0, why: "docstring" }] }),
    ]);
    const reply = await runReviewCommand({ command: "improve" }, d);
    expect(calls.map((c) => c.label)).toEqual(["improve", "reflect"]);
    expect(calls[1].messages[1].content).toContain("suggestion 2");
    const review = findingsEvent(events);
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0]).toMatchObject({ score: 6, applicable: true, source: "improve" });
    expect(review.dropped).toBe(1);
    expect(reply).toContain("Descartei 1");
  });

  it("/improve: reflexão quebrada usa a nota padrão", async () => {
    const { d, events } = deps([
      JSON.stringify({ code_suggestions: [{ relevant_file: "src/App.tsx", existing_code: "  return <div>{items}</div>;", improved_code: "  return <ul>{items}</ul>;", suggestion_content: "x", one_sentence_summary: "y" }] }),
      "lixo",
      "lixo de novo",
    ]);
    await runReviewCommand({ command: "improve" }, d);
    expect(findingsEvent(events).findings[0]).toMatchObject({ score: 7 });
  });

  it("fix_errors: lê os arquivos citados no erro", async () => {
    const { d, calls, events } = deps([
      JSON.stringify({ key_issues_to_review: [{ relevant_file: "src/App.tsx", issue_header: "data indefinido", severity: "critical", issue_content: "causa", error_ref: "ReferenceError: data is not defined" }] }),
    ]);
    await runReviewCommand({ command: "fix_errors", errors: ["ReferenceError: data is not defined\n at App (src/App.tsx:2:17)"] }, d);
    expect(calls[0].messages[1].content).toContain("Erro 1:");
    expect(calls[0].messages[1].content).toContain("## Arquivo: 'src/App.tsx'");
    expect(findingsEvent(events).findings[0]).toMatchObject({ source: "error", errorRef: "ReferenceError: data is not defined" });
  });

  it("ask: responde sobre o item da vez sem abrir fila", async () => {
    const { d, calls, events } = deps(['{"answer":"Porque `data` não foi importado."}']);
    const reply = await runReviewCommand(
      { command: "ask", question: "por quê?", finding: { path: "src/App.tsx", title: "Variável indefinida", explanation: "x", existingCode: "a", improvedCode: "b" } },
      d,
    );
    expect(reply).toBe("Porque `data` não foi importado.");
    expect(calls[0].messages[1].content).toContain("Item da fila em discussão");
    expect(events.some((e) => e.kind === "review_findings")).toBe(false);
  });

  it("adjust: refaz a correção com o comentário e valida contra o arquivo enviado", async () => {
    const { d, events } = deps([
      JSON.stringify({ reply: "Troquei por props.", finding: { existing_code: "  const items = data.map((d) => d.name);", improved_code: "  const items = props.data.map((d) => d.name);" } }),
    ]);
    const reply = await runReviewCommand(
      {
        command: "adjust",
        comment: "use props",
        fileContent: FILES["src/App.tsx"],
        finding: { path: "src/App.tsx", title: "Variável indefinida", explanation: "x", existingCode: "a", improvedCode: "b", source: "review" },
      },
      d,
    );
    const review = findingsEvent(events) as unknown as { command: string; findings: Array<Record<string, unknown>> };
    expect(review.command).toBe("adjust");
    expect(review.findings[0]).toMatchObject({ applicable: true, improvedCode: "  const items = props.data.map((d) => d.name);" });
    expect(reply).toContain("Troquei por props.");
  });

  it("adjust exige comentário e caminho seguro", async () => {
    const { d } = deps([]);
    await expect(runReviewCommand({ command: "adjust", finding: { path: "src/App.tsx", title: "t", explanation: "e" } }, d)).rejects.toThrow("review_comment_required");
    await expect(runReviewCommand({ command: "adjust", comment: "x", finding: { path: "../x", title: "t", explanation: "e" } }, d)).rejects.toThrow("review_invalid_finding");
  });

  it("projeto vazio: avisa sem chamar o modelo", async () => {
    const { d, calls } = deps([], { list: async () => [] });
    expect(await runReviewCommand({ command: "review" }, d)).toContain("ainda não tem arquivos");
    expect(calls).toHaveLength(0);
  });

  it("describe: resumo sem fila", async () => {
    const { d, events } = deps([JSON.stringify({ type: ["Melhoria"], title: "Lista de itens", description: "- App lista dados", pr_files: [{ filename: "src/App.tsx", changes_summary: "lista" }] })]);
    const reply = await runReviewCommand({ command: "describe" }, d);
    expect(reply).toContain("**Lista de itens** (Melhoria)");
    expect(findingsEvent(events).findings).toEqual([]);
  });
});
