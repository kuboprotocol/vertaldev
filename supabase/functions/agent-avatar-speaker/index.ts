// Avatar Speaker — gera roteiro otimizado para avatares falantes
// (HeyGen/D-ID/ElevenLabs). MVP entrega script + cues; integração de render é opt-in.
import { runAgent } from "../_shared/agentRuntime.ts";
import { aiText, parseJsonObject } from "../_shared/aiText.ts";
import { z } from "npm:zod@3";

const InputSchema = z.object({
  prompt: z.string().min(1).max(5000),
  persona: z.string().max(100).optional().default("host profissional"),
  duration: z.number().int().min(1).max(3600).optional().default(60),
  language: z.string().max(20).optional().default("pt-BR"),
});

Deno.serve((req) =>
  runAgent("avatar-speaker", req, async ({ input }) => {
    const validated = InputSchema.safeParse(input);
    if (!validated.success) {
      throw new Error(`invalid_input: ${JSON.stringify(validated.error.flatten().fieldErrors)}`);
    }
    const { prompt, persona, duration, language } = validated.data;
    if (!prompt) throw new Error("missing_prompt");

    const sys = `Você escreve roteiros para avatares falantes IA. Retorne JSON estrito: { "title": string, "persona": string, "duration_seconds": number, "scenes": [{ "text": string, "pause_after_ms": number, "emphasis_words": string[] }], "ssml": string }. Idioma: ${language}. Persona: ${persona}. Duração-alvo: ${duration}s.`;
    const content = await aiText(req, {
      task: "marketing",
      json: true,
      messages: [{ role: "system", content: sys }, { role: "user", content: String(prompt) }],
    });
    return {
      output: {
        script: parseJsonObject(content),
        render_provider: null,
        note: "Script + SSML pronto. Conecte HeyGen/D-ID para render final.",
      },
    };
  })
);
