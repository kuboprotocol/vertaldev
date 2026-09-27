// Manus — automação multi-step: decompõe tarefa em plano + executa pesquisa textual.
import { runAgent } from "../_shared/agentRuntime.ts";
import { aiText, parseJsonObject } from "../_shared/aiText.ts";

Deno.serve((req) =>
  runAgent("manus", req, async ({ input }) => {
    const { task, depth = "standard", language = "pt-BR" } = input as Record<string, string>;
    if (!task) throw new Error("missing_task");

    const sys = `Você é o Vertal Manus, agente de automação. Decomponha a tarefa em plano executável e produza o entregável final. Retorne JSON estrito: { "plan": [{ "step": number, "action": string, "rationale": string }], "deliverable": string, "next_actions": string[], "confidence": number }. Profundidade: ${depth}. Idioma: ${language}.`;
    const content = await aiText(req, {
      task: "plan",
      tier: depth === "deep" ? "pro" : "flash",
      json: true,
      messages: [{ role: "system", content: sys }, { role: "user", content: task }],
    });
    return { output: parseJsonObject(content) };
  })
);
