import { corsHeaders } from "../_shared/cors.ts";
import { getUser, deductCredits, recordAsset, sanitizeError, withRefundOnFailure } from "../_shared/creative.ts";
import { z } from "npm:zod@3";

const InputSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().min(1),
  })).optional(),
  prompt: z.string().optional(),
  tool: z.enum(["chat", "image", "video", "music", "pdf", "docs", "slide", "edit_image", "edit_video"]),
  model: z.string().optional(),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  metadata: z.record(z.any()).optional(),
  mode: z.enum(["chat", "research"]).optional(),
});

// Credit costs based on prompt instructions
const COSTS: Record<string, number> = {
  chat: 1,      // Message via OpenRouter
  chat_premium: 4, // Message premium frontier (Claude Sonnet)
  research: 3,  // Wide Research: web search + Perplexity Sonar
  image: 1,     // Pollinations / Nano Banana
  video: 36,    // MusKAI / Sogni (est.)
  music: 1,     // MusKAI / Suno
  slide: 5,     // Content + Template
  pdf: 0,       // Local Utility
  docs: 0,      // Local Utility
  edit_image: 0, // Local Utility
  edit_video: 0, // Local Utility
};

Deno.serve(withRefundOnFailure(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const user = await getUser(req.headers.get("Authorization"));
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? undefined;
  
  try {
    const body = await req.json();
    const parsed = InputSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "invalid_input", details: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tool, messages, prompt, model, temperature, max_tokens, metadata, mode = "chat" } = parsed.data;
    
    // Determine cost
    let cost = COSTS[tool] ?? 1;
    if (tool === "chat" && mode === "research") {
      cost = COSTS.research;
    } else if (tool === "chat" && model?.includes("sonnet")) {
      cost = COSTS.chat_premium;
    }
    if (tool === "chat" && !messages?.length) {
      return new Response(JSON.stringify({ error: "messages_required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduct credits
    const ded = await deductCredits(user.id, cost, tool === "chat" && mode === "research" ? "creative_research" : `creative_${tool}`, metadata ?? {}, user.email, idempotencyKey);
    if (!ded.ok) {
      return new Response(JSON.stringify({ error: ded.error }), {
        status: (ded as any).status ?? 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route based on tool
    if (tool === "chat") {
      return await handleChat(user.id, messages ?? [], mode, model, temperature, max_tokens, cost);
    } else if (tool === "image") {
      return await handleImage(user.id, prompt ?? "", metadata, cost);
    }

    return new Response(JSON.stringify({ error: "tool_not_implemented_in_router" }), {
      status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[creative-router] error:", e);
    return new Response(JSON.stringify({ error: sanitizeError(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Fallbacks used when the model the user picked is unavailable (retired, rate limited, provider down).
const CHAT_FALLBACKS = ["openai/gpt-4o-mini", "deepseek/deepseek-chat", "meta-llama/llama-3.3-70b-instruct"];

// Wide Research: a model that searches the web on its own, then models that get OpenRouter's search tool.
type Attempt = { model: string; extra?: Record<string, unknown> };
const RESEARCH_CHAIN: Attempt[] = [
  { model: "perplexity/sonar-pro" },
  { model: "perplexity/sonar" },
  { model: "openai/gpt-4o-mini", extra: { tools: [{ type: "openrouter:web_search", parameters: { max_results: 8 } }] } },
  { model: "openai/gpt-4o-mini:online" },
];

const CHAT_SYSTEM = "Você é o assistente KUBO Vibe. Seja direto, técnico e profissional. Idioma: Português Brasileiro. Use Markdown quando ajudar a leitura.";
const RESEARCH_SYSTEM = [
  "Você é o KUBO Wide Research, um pesquisador que consulta a internet em tempo real.",
  `Data de hoje: ${new Date().toISOString().slice(0, 10)}.`,
  "Pesquise em várias fontes, compare-as e entregue em Português Brasileiro, em Markdown:",
  "um resumo direto, os pontos principais em tópicos e, quando houver, números, datas e divergências entre fontes.",
  "Cite as fontes no texto como [1], [2]... na ordem em que aparecem. Nunca invente fontes ou dados.",
].join(" ");

async function handleChat(
  userId: string,
  messages: { role: string; content: string }[],
  mode: "chat" | "research",
  requestedModel?: string,
  temperature?: number,
  max_tokens?: number,
  cost?: number,
) {
  // Every chat model in the Creative panel goes through OpenRouter.
  const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY");
  if (!OPENROUTER_KEY) {
    return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const attempts: Attempt[] = mode === "research"
    ? RESEARCH_CHAIN
    : [...new Set([requestedModel, ...CHAT_FALLBACKS].filter(Boolean) as string[])].map((model) => ({ model }));
  const sys = { role: "system", content: mode === "research" ? RESEARCH_SYSTEM : CHAT_SYSTEM };
  // Keep the conversation within the model's context: the latest turns matter most.
  const history = messages.slice(-20);

  let lastStatus = 0;
  for (const attempt of attempts) {
    let resp: Response;
    try {
      resp = await fetchWithRetry(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://kubovibe.dev",
          "X-Title": "KUBO Vibe",
        },
        body: JSON.stringify({
          model: attempt.model,
          messages: [sys, ...history],
          temperature: mode === "research" ? 0.3 : temperature ?? 0.7,
          max_tokens: mode === "research" ? Math.max(max_tokens ?? 0, 2500) : max_tokens ?? 1500,
          stream: true,
          ...attempt.extra,
        }),
      });
    } catch (e) {
      console.warn(`[creative-router] ${attempt.model} threw:`, e);
      continue;
    }

    if (resp.ok && resp.body) {
      recordAsset(userId, {
        tool: mode === "research" ? "research" : "chat",
        prompt: history[history.length - 1]?.content?.slice(0, 1000),
        credits_spent: cost ?? 1,
        metadata: { engine: "openrouter", model: attempt.model, mode },
      }).catch(console.error);

      return new Response(resp.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "X-Engine": "openrouter",
          "X-Model": attempt.model,
          "Access-Control-Expose-Headers": "X-Model, X-Engine",
        },
      });
    }

    lastStatus = resp.status;
    console.warn(`[creative-router] ${attempt.model} failed:`, resp.status, (await resp.text().catch(() => "")).slice(0, 300));
    // A bad key or no OpenRouter credits fails the same way for every model.
    if (resp.status === 401 || resp.status === 402) break;
  }

  return new Response(JSON.stringify({ error: `openrouter_http_${lastStatus || 502}` }), {
    status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleImage(userId: string, prompt: string, metadata?: any, cost?: number) {
  // Image logic: Pollinations (Free/Fixed-ish) or Nano Banana (via Lovable/Gemini)
  // Prompt says: Pollinations for imagen (free/flat)
  const engine = metadata?.engine === "premium" ? "lovable" : "pollinations";
  
  if (engine === "pollinations") {
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`;
    
    await recordAsset(userId, {
      tool: "image",
      prompt,
      output_url: imageUrl,
      credits_spent: cost ?? 1,
      metadata: { engine: "pollinations" },
    }).catch(console.error);

    return new Response(JSON.stringify({ ok: true, image_url: imageUrl, engine: "pollinations" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Lovable/Gemini Premium path
  const LK = Deno.env.get("LOVABLE_API_KEY");
  if (!LK) return new Response(JSON.stringify({ error: "premium_image_provider_unavailable" }), { status: 503, headers: corsHeaders });

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LK}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-exp",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });

  const data = await r.json();
  const imageUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  
  if (imageUrl) {
    await recordAsset(userId, {
      tool: "image",
      prompt,
      output_url: imageUrl,
      credits_spent: cost ?? 1,
      metadata: { engine: "lovable_gemini" },
    }).catch(console.error);

    return new Response(JSON.stringify({ ok: true, image_url: imageUrl, engine: "lovable" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "image_generation_failed" }), { status: 502, headers: corsHeaders });
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    const resp = await fetch(url, options);
    if (resp.status !== 429) return resp;
    
    // Concurrency limit reached - wait a bit and retry
    attempt++;
    const wait = Math.pow(2, attempt) * 1000;
    console.warn(`[creative-router] 429 received, retrying in ${wait}ms...`);
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  return await fetch(url, options);
}
