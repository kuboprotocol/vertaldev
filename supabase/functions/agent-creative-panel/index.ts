// Creative Panel — briefing criativo estruturado (campanha, narrativa, mood).
import { runAgent } from "../_shared/agentRuntime.ts";
import { aiText, parseJsonObject } from "../_shared/aiText.ts";

Deno.serve((req) =>
  runAgent("creative-panel", req, async ({ input }) => {
    const { prompt, brand, audience, channel, language = "pt-BR" } = input as Record<string, string>;
    if (!prompt) throw new Error("missing_prompt");

    const sys = `Você é um diretor criativo sênior. Gere um briefing estruturado em JSON estrito com campos: { "concept": string, "tagline": string, "tone": string, "audience": string, "channels": string[], "visual_direction": string, "key_messages": string[], "deliverables": string[] }. Idioma: ${language}.`;
    const user = `Brief do usuário: ${prompt}\nMarca: ${brand ?? "—"}\nAudiência: ${audience ?? "—"}\nCanal: ${channel ?? "—"}`;

    const content = await aiText(req, {
      task: "marketing",
      json: true,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    });
    return { output: { brief: parseJsonObject(content), raw: content } };
  })
);
