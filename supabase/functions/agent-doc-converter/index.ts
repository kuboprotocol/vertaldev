// Doc Converter — converte texto entre formatos (markdown, html, plain, json).
import { runAgent } from "../_shared/agentRuntime.ts";
import { aiText } from "../_shared/aiText.ts";

const ALLOWED = ["markdown", "html", "plain", "json", "csv"];

Deno.serve((req) =>
  runAgent("doc-converter", req, async ({ input }) => {
    const { content, from = "markdown", to = "html" } = input as Record<string, string>;
    if (!content) throw new Error("missing_content");
    if (!ALLOWED.includes(from) || !ALLOWED.includes(to)) throw new Error("invalid_format");

    const sys = `Converta o conteúdo de ${from} para ${to}. Retorne APENAS o conteúdo convertido, sem comentários, sem cercas de código.`;
    const converted = await aiText(req, {
      task: "docs",
      messages: [{ role: "system", content: sys }, { role: "user", content }],
    });
    return { output: { from, to, converted } };
  })
);
