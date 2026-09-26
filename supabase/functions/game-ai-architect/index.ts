// KUBO Game AI Architect — copiloto de game design do Quantum Engine.
// Recebe um pitch em linguagem natural e devolve um blueprint estruturado
// (lore, loop de gameplay, cena ECS) + um design doc em markdown.
//
// Passa pelo KUBO AI Gateway: o blueprint sai em JSON (tarefa
// "architecture" no modelo rápido, que suporta modo JSON) e o design doc na
// tarefa "docs". Ambos com cache, custo estimado e registro no painel
// Agent Activity.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { GatewayError, runGateway } from "../_shared/aiGateway.ts";
import { recordGatewayFailure, recordGatewayRun, supabaseGatewayCache } from "../_shared/aiGatewayStore.ts";

const SYSTEM = `You are the KUBO Game AI Architect — a AAA game director,
engine architect and technical artist. You design complete, production-ready
games inside the KUBO Quantum Engine (Three.js + ECS + WebGPU + VR).
Always think modular, scalable, and shippable. Never produce stubs.
Never invent secrets, network calls, or unsafe shaders.`;

const BLUEPRINT_TOOL = {
  type: "function",
  function: {
    name: "build_game_blueprint",
    description: "Full structured blueprint for a KUBO Quantum Engine game.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        genre: { type: "string" },
        dimension: { type: "string", enum: ["2D", "3D", "VR", "Hybrid"] },
        pillars: { type: "array", items: { type: "string" } },
        lore: { type: "string" },
        gameplay_loop: { type: "array", items: { type: "string" } },
        mechanics: { type: "array", items: { type: "string" } },
        art_direction: { type: "string" },
        soundtrack: { type: "string" },
        monetization: { type: "string" },
        scene: {
          type: "object",
          properties: {
            seed: { type: "integer" },
            ambient: { type: "string" },
            entities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  kind: { type: "string", enum: ["player", "npc", "enemy", "prop", "portal"] },
                  name: { type: "string" },
                  persona: { type: "string" },
                  position: {
                    type: "object",
                    properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } },
                    required: ["x", "y", "z"], additionalProperties: false,
                  },
                  color: { type: "string" },
                },
                required: ["kind", "name", "position"],
                additionalProperties: false,
              },
            },
          },
          required: ["seed", "ambient", "entities"],
          additionalProperties: false,
        },
        roadmap: { type: "array", items: { type: "string" } },
      },
      required: ["title", "genre", "dimension", "pillars", "lore",
        "gameplay_loop", "mechanics", "art_direction", "scene", "roadmap"],
      additionalProperties: false,
    },
  },
} as const;

// JSON Schema do blueprint, enviado no prompt (DeepSeek usa modo JSON, não tool-calling).
const BLUEPRINT_SCHEMA = JSON.stringify(BLUEPRINT_TOOL.function.parameters);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseBlueprint(raw: string): Record<string, unknown> {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const supa = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: userErr } = await supa.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  let body: { prompt?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const prompt = (body.prompt ?? "").trim();
  if (prompt.length < 4 || prompt.length > 4000) return json({ error: "prompt_length" }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cache = supabaseGatewayCache(admin);

  try {
    // 1) Blueprint estruturado (JSON)
    const plan = await runGateway(
      {
        kind: "architecture",
        tier: "flash",
        json: true,
        maxTokens: 4000,
        messages: [
          { role: "system", content: `${SYSTEM}\n\nReturn ONLY a JSON object that follows this JSON Schema:\n${BLUEPRINT_SCHEMA}` },
          { role: "user", content: `Design this game:\n\n${prompt}` },
        ],
      },
      { cache },
    );
    await recordGatewayRun(admin, user.id, null, plan).catch(() => null);
    const blueprint = parseBlueprint(plan.content);

    // 2) Design doc do diretor (markdown)
    const doc = await runGateway(
      {
        kind: "docs",
        maxTokens: 3000,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Write the director's design doc in markdown (vision, pillars, world, gameplay loop, art direction, monetization, roadmap) for this pitch:\n\n${prompt}\n\nReference the blueprint:\n${JSON.stringify(blueprint).slice(0, 4000)}`,
          },
        ],
      },
      { cache },
    );
    await recordGatewayRun(admin, user.id, null, doc).catch(() => null);

    return json({ blueprint, designDoc: doc.content, model: plan.model });
  } catch (e) {
    await recordGatewayFailure(admin, user.id, null, "architecture", e).catch(() => {});
    if (e instanceof GatewayError) {
      if (e.attempts.some((a) => a.endsWith(":429"))) return json({ error: "rate_limited" }, 429);
      return json({ error: "ai_unavailable" }, e.status);
    }
    console.error("[game-ai-architect]", e);
    return json({ error: "internal_error" }, 500);
  }
});
