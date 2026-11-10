import { corsHeaders } from "../_shared/cors.ts";
import { getUser, deductCredits, recordAsset, sanitizeError, withRefundOnFailure, enforceRateLimit, supaAdmin } from "../_shared/creative.ts";
import { z } from "npm:zod@3";
import { createClient } from "npm:@supabase/supabase-js@2";
import { runGateway, GatewayError } from "../_shared/aiGateway.ts";
import {
  OfficeAiOutputError,
  buildOfficeMessages,
  clipSource,
  parseOfficeOutput,
} from "../_shared/officeAi.ts";
import {
  NOTEBOOK_GATEWAY_CONTEXT_CHARS,
  NOTEBOOK_LIMITS,
  NotebookAiOutputError,
  buildNotebookMessages,
  gatewayParams,
  notebookAiCost,
  parseNotebookOutput,
  type NotebookAiRequest,
} from "../_shared/notebookAi.ts";
import {
  ATTACHMENT_MAX_BYTES,
  OfficeEmailError,
  base64DecodedSize,
  buildRawEmail,
  sanitizeAttachmentName,
  toGmailRaw,
} from "../_shared/officeEmail.ts";
import { getFreshAccessToken, loadAccount } from "../_shared/gmailToken.ts";
import {
  AGENT_LIMITS,
  API_METHODS,
  buildAgentSystemPrompt,
  formatToolResults,
  parseAgentTurn,
  secretPlaceholders,
} from "../_shared/chatAgent.ts";
import { listVisibleSecrets, resolveEnvForRun } from "../_shared/kuboSecrets.ts";
import { validatePublicUrl } from "../_shared/security.ts";

const InputSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().min(1),
  })).optional(),
  prompt: z.string().optional(),
  tool: z.enum(["chat", "image", "video", "music", "pdf", "docs", "slide", "edit_image", "edit_video", "office_ai", "office_email", "chat_json", "notebook_ai", "agent_chat", "api_request"]),
  model: z.string().optional(),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  metadata: z.record(z.any()).optional(),
  // Entrada das ações do Vertal Office (validada em cada handler).
  office: z.record(z.any()).optional(),
  // Entrada do Vertal Notebook (validada em handleNotebookAi).
  notebook: z.record(z.any()).optional(),
  // Vertal Chat: resultados das ferramentas da rodada anterior (validados em handleAgentChat).
  agent: z.record(z.any()).optional(),
  // Vertal Chat: chamada de API externa aprovada pelo usuário (validada em handleApiRequest).
  api: z.record(z.any()).optional(),
});

// Credit costs based on prompt instructions
const COSTS: Record<string, number> = {
  chat: 1,      // Message via OpenRouter
  chat_premium: 4, // Message premium frontier (Claude Sonnet)
  image: 1,     // Pollinations / Nano Banana
  video: 36,    // MusKAI / Sogni (est.)
  music: 1,     // MusKAI / Suno
  slide: 5,     // Content + Template
  pdf: 0,       // Local Utility
  docs: 0,      // Local Utility
  edit_image: 0, // Local Utility
  edit_video: 0, // Local Utility
  office_ai: 1,    // Vertal Office: preparar/gerar com IA (1 crédito por uso)
  office_email: 0, // Vertal Office: envio de e-mail não é cobrado
  chat_json: 0,    // Modo de conversa: custo real vem de chatJsonCost (grátis até 5/dia, depois 1)
  notebook_ai: 1,  // Vertal Notebook: custo real vem de notebookAiCost(pedido)
  agent_chat: 0,   // Vertal Chat: custo real vem de chatJsonCost (mesma cota do modo de conversa)
  api_request: 0,  // Vertal Chat: chamada de API externa não é cobrada (tem limite de requisições)
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

    const { tool, messages, prompt, model, temperature, max_tokens, metadata, office, notebook, agent, api } = parsed.data;
    
    // Determine cost
    let cost = COSTS[tool] ?? 1;
    if (tool === "chat" && model?.includes("sonnet")) {
      cost = COSTS.chat_premium;
    }
    // Modo de conversa: 5 grátis por dia (UTC), a partir da sexta 1 crédito.
    if (tool === "chat_json" || tool === "agent_chat") {
      cost = await chatJsonCost(user.id);
    }
    // Vertal Notebook: preço pela ação, pelo tamanho do podcast e pelo volume de contexto.
    let notebookReq: NotebookAiRequest | null = null;
    if (tool === "notebook_ai") {
      const nb = NotebookAiInput.safeParse(notebook ?? {});
      if (!nb.success) return jsonResponse(400, { error: "invalid_input" });
      notebookReq = nb.data as NotebookAiRequest;
      cost = notebookAiCost(notebookReq);
    }

    // Deduct credits
    const ded = await deductCredits(user.id, cost, `creative_${tool}`, metadata ?? {}, user.email, idempotencyKey);
    if (!ded.ok) {
      return new Response(JSON.stringify({ error: ded.error }), {
        status: (ded as any).status ?? 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route based on tool
    if (tool === "chat") {
      return await handleChat(user.id, messages ?? [], model, temperature, max_tokens, cost);
    } else if (tool === "image") {
      return await handleImage(user.id, prompt ?? "", metadata, cost);
    } else if (tool === "office_ai") {
      return await handleOfficeAi(office ?? {}, cost);
    } else if (tool === "office_email") {
      return await handleOfficeEmail(user, office ?? {});
    } else if (tool === "notebook_ai") {
      return await handleNotebookAi(notebookReq!, cost);
    } else if (tool === "chat_json") {
      return await handleChatJson(user, messages ?? [], temperature, max_tokens, cost === 0);
    } else if (tool === "agent_chat") {
      return await handleAgentChat(user, messages ?? [], agent ?? {}, cost);
    } else if (tool === "api_request") {
      return await handleApiRequest(user, api ?? {});
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

async function handleChat(userId: string, messages: any[], requestedModel?: string, temperature?: number, max_tokens?: number, cost?: number) {
  // Every chat model in the Creative panel goes through OpenRouter.
  const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY");
  if (!OPENROUTER_KEY) {
    return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const model = requestedModel ?? "meta-llama/llama-3.1-70b-instruct";
  const sys = {
    role: "system",
    content: "Você é o assistente KUBO Vibe. Seja direto, técnico e profissional. Idioma: Português Brasileiro.",
  };

  const resp = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://kubovibe.dev",
      "X-Title": "KUBO Vibe",
    },
    body: JSON.stringify({
      model,
      messages: [sys, ...messages],
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 1500, // Hard limit from prompt
      stream: true,
    }),
  });

  if (resp.ok && resp.body) {
    recordAsset(userId, {
      tool: "chat",
      prompt: messages[messages.length - 1]?.content?.slice(0, 1000),
      credits_spent: cost ?? 1,
      metadata: { engine: "openrouter", model },
    }).catch(console.error);

    return new Response(resp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Engine": "openrouter" },
    });
  }

  console.error("[creative-router] OpenRouter failed:", resp.status, await resp.text().catch(() => ""));
  return new Response(JSON.stringify({ error: `openrouter_http_${resp.status}` }), {
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

// ─── Vertal Office ───────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const OfficeAiInput = z.object({
  action: z.enum(["sheet", "doc", "email", "slides"]),
  prompt: z.string().trim().min(3).max(2000),
  source: z.string().max(60_000).optional(),
});

/** Gera planilha, documento ou assunto+texto de e-mail. Cobrança já feita antes do despacho. */
async function handleOfficeAi(raw: unknown, cost: number): Promise<Response> {
  const parsed = OfficeAiInput.safeParse(raw);
  if (!parsed.success) return jsonResponse(400, { error: "invalid_input" });
  const { action, prompt, source } = parsed.data;
  try {
    const gw = await runGateway({
      messages: buildOfficeMessages(action, prompt, clipSource(source ?? "")),
      kind: "docs",
      tier: "flash",
      json: true,
      temperature: 0.2,
      maxTokens: 4000,
    });
    const output = parseOfficeOutput(action, gw.content);
    return jsonResponse(200, {
      action, output, provider: gw.provider, model: gw.model, creditsCharged: cost,
    });
  } catch (err) {
    if (err instanceof OfficeAiOutputError) return jsonResponse(502, { error: "invalid_model_output" });
    if (err instanceof GatewayError) return jsonResponse(503, { error: "ai_unavailable" });
    throw err;
  }
}

const L = NOTEBOOK_LIMITS;
const NotebookContextItem = z.object({
  id: z.string().regex(/^(source|note):[A-Za-z0-9_-]{1,64}$/),
  title: z.string().max(L.maxItemTitleChars * 2),
  content: z.string().max(L.contextMaxChars * 2),
});
const NotebookAiInput = z.object({
  action: z.enum(["chat", "transform", "guide", "study", "podcast"]),
  notebook: z.object({ name: z.string().max(200), description: z.string().max(2_000).optional() }).optional(),
  context: z.array(NotebookContextItem).max(L.maxContextItems),
  language: z.string().max(60).optional(),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(L.maxMessageChars * 2),
  })).max(60).optional(),
  transformation: z.object({ title: z.string().max(200), prompt: z.string().min(3).max(L.maxPromptChars) }).optional(),
  study: z.enum(["flashcards", "quiz", "mindmap", "timeline"]).optional(),
  podcast: z.object({
    briefing: z.string().max(L.maxPromptChars).optional(),
    speakers: z.array(z.object({
      name: z.string().min(1).max(60),
      backstory: z.string().max(600).optional(),
      personality: z.string().max(400).optional(),
    })).min(1).max(L.maxSpeakers),
    length: z.enum(["short", "medium", "long"]).optional(),
  }).optional(),
}).refine((v) => JSON.stringify(v.context).length <= L.contextMaxChars * 3, { message: "context_too_large" });

/** Vertal Notebook: chat com fontes, transformações, guia, estudo e podcast. Cobrança já feita antes do despacho. */
async function handleNotebookAi(req: NotebookAiRequest, cost: number): Promise<Response> {
  try {
    const params = gatewayParams(req);
    const gw = await runGateway({
      messages: buildNotebookMessages(req),
      kind: params.kind,
      tier: "flash",
      json: params.json,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      contextChars: NOTEBOOK_GATEWAY_CONTEXT_CHARS,
    });
    const output = parseNotebookOutput(req, gw.content);
    return jsonResponse(200, {
      action: req.action, output, provider: gw.provider, model: gw.model, creditsCharged: cost,
    });
  } catch (err) {
    if (err instanceof NotebookAiOutputError) return jsonResponse(502, { error: "invalid_model_output" });
    if (err instanceof GatewayError) return jsonResponse(503, { error: "ai_unavailable" });
    throw err;
  }
}

const OfficeEmailInput = z.object({
  accountId: z.string().uuid(),
  to: z.string().email().max(254),
  subject: z.string().trim().min(1).max(200),
  body: z.string().min(1).max(50_000),
  attachment: z.object({
    filename: z.string().min(1).max(200),
    contentBase64: z.string().min(1).max(Math.ceil((ATTACHMENT_MAX_BYTES * 4) / 3) + 4),
  }).optional(),
  // Confirmação explícita do usuário: sem ela o envio não acontece.
  confirmed: z.literal(true),
});

/** Envia pela conta Gmail do próprio usuário. Sem cobrança em créditos, com limite de requisições. */
async function handleOfficeEmail(user: { id: string; email?: string | null }, raw: unknown): Promise<Response> {
  const limit = await enforceRateLimit(user.id, "office_email", { max: 20, windowSeconds: 60, userEmail: user.email ?? null });
  if (!limit.ok) return jsonResponse(429, { error: limit.error });

  const parsed = OfficeEmailInput.safeParse(raw);
  if (!parsed.success) return jsonResponse(400, { error: "invalid_input" });
  const { accountId, to, subject, body, attachment } = parsed.data;

  try {
    let safeAttachment: { filename: string; contentBase64: string } | undefined;
    if (attachment) {
      const { filename } = sanitizeAttachmentName(attachment.filename);
      if (base64DecodedSize(attachment.contentBase64) > ATTACHMENT_MAX_BYTES) {
        return jsonResponse(413, { error: "attachment_too_large" });
      }
      safeAttachment = { filename, contentBase64: attachment.contentBase64 };
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const acct = await loadAccount(admin, user.id, accountId);
    const token = await getFreshAccessToken(admin, acct);

    const mime = buildRawEmail({ to, subject, body, attachment: safeAttachment });
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: toGmailRaw(mime) }),
    });
    const sent = await res.json();
    if (!res.ok) return jsonResponse(502, { error: "gmail_send_failed" });

    await admin.from("connector_activity_logs").insert({
      user_id: user.id,
      connector_slug: "gmail",
      event_type: "gmail_sent",
      message: `Email com anexo enviado para ${to}`,
      status: "success",
      metadata: {
        to,
        subject,
        attachment: safeAttachment?.filename ?? null,
        accountEmail: (acct as { email: string }).email,
        messageId: sent.id,
      },
    });

    return jsonResponse(200, { success: true, id: sent.id });
  } catch (e) {
    if (e instanceof OfficeEmailError) return jsonResponse(400, { error: e.message });
    throw e;
  }
}

// ─── Modo de conversa (resposta JSON, sem streaming) ─────────────────────

const CHAT_JSON_MODEL = "openai/gpt-3.5-turbo";
const CHAT_FREE_PER_DAY = 5;
const CHAT_JSON_MAX_MESSAGES = 40;
const CHAT_JSON_MAX_CHARS = 8_000;

/** Conversa com a OpenRouter a partir do servidor: a chave fica no segredo do Supabase, nunca no navegador. */
/** Conta a conversa no dia e devolve o custo: 0 (grátis) até o limite diário, depois 1 crédito. */
async function chatJsonCost(userId: string): Promise<number> {
  const { data, error } = await supaAdmin().rpc("increment_creative_chat_usage", { p_user_id: userId });
  if (error || typeof data !== "number") throw new Error("chat_quota_unavailable");
  return data <= CHAT_FREE_PER_DAY ? 0 : 1;
}

async function releaseChatSlot(userId: string): Promise<void> {
  const { error } = await supaAdmin().rpc("release_creative_chat_usage", { p_user_id: userId });
  if (error) console.error("[creative-router] release_creative_chat_usage failed:", error);
}

async function handleChatJson(
  user: { id: string; email?: string | null },
  messages: Array<{ role: string; content: string }>,
  temperature?: number,
  max_tokens?: number,
  freeSlot = false,
): Promise<Response> {
  const limit = await enforceRateLimit(user.id, "chat_json", { max: 30, windowSeconds: 60, userEmail: user.email ?? null });
  if (!limit.ok) {
    if (freeSlot) await releaseChatSlot(user.id);
    return jsonResponse(429, { error: limit.error });
  }

  const trimmed = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-CHAT_JSON_MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, CHAT_JSON_MAX_CHARS) }));
  if (trimmed.length === 0 || trimmed[trimmed.length - 1].role !== "user") {
    if (freeSlot) await releaseChatSlot(user.id);
    return jsonResponse(400, { error: "invalid_messages" });
  }

  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) {
    if (freeSlot) await releaseChatSlot(user.id);
    return jsonResponse(503, { error: "openrouter_not_configured" });
  }

  const resp = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://vertal.dev",
      "X-Title": "Vertal Creative Panel",
    },
    body: JSON.stringify({
      model: CHAT_JSON_MODEL,
      messages: trimmed,
      temperature: Math.min(Math.max(temperature ?? 0.7, 0), 1.5),
      max_tokens: Math.min(max_tokens ?? 1000, 2000),
    }),
  });

  if (!resp.ok) {
    console.error("[creative-router] chat_json OpenRouter failed:", resp.status);
    if (freeSlot) await releaseChatSlot(user.id);
    return jsonResponse(502, { error: `openrouter_http_${resp.status}` });
  }
  const data = await resp.json();
  return jsonResponse(200, data);
}


// ─── Vertal Chat: agente que usa as ferramentas do painel ────────────────

const AgentInput = z.object({
  tool_results: z.array(z.object({
    tool: z.string().max(40),
    ok: z.boolean(),
    summary: z.string().max(AGENT_LIMITS.maxToolResultChars * 2),
  })).max(8).optional(),
});

/**
 * Uma rodada do agente: devolve a resposta e as ações que o navegador vai executar.
 * As ações rodam pelas funções de cada ferramenta, com a cobrança e os limites delas.
 */
async function handleAgentChat(
  user: { id: string; email?: string | null },
  messages: Array<{ role: string; content: string }>,
  rawAgent: unknown,
  cost: number,
): Promise<Response> {
  const freeSlot = cost === 0;
  const fail = async (status: number, error: string) => {
    if (freeSlot) await releaseChatSlot(user.id);
    return jsonResponse(status, { error });
  };

  const limit = await enforceRateLimit(user.id, "agent_chat", { max: 30, windowSeconds: 60, userEmail: user.email ?? null });
  if (!limit.ok) return fail(429, limit.error);

  const agent = AgentInput.safeParse(rawAgent);
  if (!agent.success) return fail(400, "invalid_input");

  const trimmed = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-CHAT_JSON_MAX_MESSAGES)
    .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, CHAT_JSON_MAX_CHARS) }));
  const results = agent.data.tool_results ?? [];
  if (trimmed.length === 0 || (results.length === 0 && trimmed[trimmed.length - 1].role !== "user")) {
    return fail(400, "invalid_messages");
  }

  // Só os NOMES dos segredos vão para o modelo; os valores ficam no cofre.
  let secretNames: string[] = [];
  try {
    secretNames = (await listVisibleSecrets(supaAdmin(), user.id)).map((s) => s.env_key);
  } catch (e) {
    console.error("[creative-router] agent_chat secrets list failed:", sanitizeError(e));
  }

  const system = buildAgentSystemPrompt({ secretNames, today: new Date().toISOString().slice(0, 10) });
  const convo = results.length
    ? [...trimmed, { role: "user" as const, content: formatToolResults(results) }]
    : trimmed;

  try {
    const gw = await runGateway({
      messages: [{ role: "system", content: system }, ...convo],
      kind: "chat",
      tier: "flash",
      json: true,
      temperature: 0.4,
      maxTokens: 3500,
      contextChars: 48_000,
      noCache: true,
    });
    const turn = parseAgentTurn(gw.content);
    if (!turn.reply && turn.actions.length === 0) return fail(502, "invalid_model_output");
    return jsonResponse(200, {
      reply: turn.reply, actions: turn.actions, provider: gw.provider, model: gw.model, creditsCharged: cost,
    });
  } catch (err) {
    if (err instanceof GatewayError) return fail(503, "ai_unavailable");
    if (freeSlot) await releaseChatSlot(user.id);
    throw err;
  }
}

// ─── Vertal Chat: chamada de API externa ─────────────────────────────────

const API_TIMEOUT_MS = 20_000;
const API_RESPONSE_MAX_BYTES = 200_000;
const API_RESPONSE_MAX_CHARS = 12_000;
const BLOCKED_REQUEST_HEADERS = new Set(["host", "content-length", "connection", "transfer-encoding", "cookie"]);

const ApiRequestInput = z.object({
  method: z.enum(API_METHODS),
  url: z.string().min(10).max(2000),
  headers: z.record(z.string().max(4000)).optional(),
  body: z.string().max(AGENT_LIMITS.maxApiBodyChars).optional(),
  // Sem a aprovação explícita do usuário na tela a chamada não sai.
  confirmed: z.literal(true),
});

/** Troca {{NOME}} pelo valor do segredo. */
function fillSecrets(text: string, env: Record<string, string>): string {
  return text.replace(/\{\{\s*([A-Z][A-Z0-9_]{1,63})\s*\}\}/g, (whole, name: string) => env[name] ?? whole);
}

/**
 * Faz uma requisição HTTPS para uma API pública em nome do usuário.
 * Proteções: só https, sem IPs/hosts internos, sem seguir redirecionamentos,
 * tempo e tamanho limitados, e os valores dos segredos nunca voltam na resposta.
 */
async function handleApiRequest(user: { id: string; email?: string | null }, raw: unknown): Promise<Response> {
  const limit = await enforceRateLimit(user.id, "api_request", { max: 20, windowSeconds: 60, userEmail: user.email ?? null });
  if (!limit.ok) return jsonResponse(429, { error: limit.error });

  const parsed = ApiRequestInput.safeParse(raw);
  if (!parsed.success) return jsonResponse(400, { error: "invalid_input" });
  const { method, url, headers = {}, body } = parsed.data;
  if (Object.keys(headers).length > AGENT_LIMITS.maxHeaders) return jsonResponse(400, { error: "too_many_headers" });

  // O destino é fixado antes de qualquer segredo entrar: um segredo não pode mudar o host.
  let template: URL;
  try {
    template = validatePublicUrl(url.replace(/\{\{[^}]*\}\}/g, "x"));
  } catch {
    return jsonResponse(400, { error: "url_not_allowed" });
  }
  const ownHost = new URL(Deno.env.get("SUPABASE_URL")!).host;
  if (template.protocol !== "https:" || template.host === ownHost) return jsonResponse(400, { error: "url_not_allowed" });

  const needed = secretPlaceholders([url, body ?? "", ...Object.values(headers)].join("\n"));
  let env: Record<string, string> = {};
  if (needed.length > 0) {
    const resolved = await resolveEnvForRun(supaAdmin(), user.id, needed, { target: `chat_api:${template.host}` });
    if (resolved.missing.length > 0) return jsonResponse(400, { error: "missing_secrets", missing: resolved.missing });
    env = resolved.env;
  }

  let target: URL;
  try {
    target = validatePublicUrl(fillSecrets(url, Object.fromEntries(Object.entries(env).map(([k, v]) => [k, encodeURIComponent(v)]))));
  } catch {
    return jsonResponse(400, { error: "url_not_allowed" });
  }
  if (target.host !== template.host || target.protocol !== "https:") return jsonResponse(400, { error: "url_not_allowed" });

  const outHeaders = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(name) || BLOCKED_REQUEST_HEADERS.has(name.toLowerCase())) continue;
    outHeaders.set(name, fillSecrets(value, env));
  }
  const sendBody = body !== undefined && method !== "GET" ? fillSecrets(body, env) : undefined;
  if (sendBody !== undefined && !outHeaders.has("content-type")) outHeaders.set("content-type", "application/json");

  let res: Response;
  try {
    res = await fetch(target, {
      method, headers: outHeaders, body: sendBody, redirect: "manual", signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    return jsonResponse(200, { ok: false, status: 0, error: timedOut ? "timeout" : "network_error", body: "" });
  }

  // Lê só até o limite: uma resposta gigante não derruba a função.
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > API_RESPONSE_MAX_BYTES) {
        truncated = true;
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.byteLength; }
  let text = new TextDecoder().decode(bytes);
  for (const value of Object.values(env)) {
    if (value.length >= 6) text = text.split(value).join("[segredo]");
  }
  if (text.length > API_RESPONSE_MAX_CHARS) {
    text = text.slice(0, API_RESPONSE_MAX_CHARS);
    truncated = true;
  }

  await supaAdmin().from("connector_activity_logs").insert({
    user_id: user.id,
    connector_slug: "chat_api",
    event_type: "api_request",
    message: `${method} ${target.host}${target.pathname}`.slice(0, 300),
    status: res.ok ? "success" : "error",
    metadata: { host: target.host, method, http_status: res.status, secrets: needed },
  }).then(({ error }) => { if (error) console.error("[creative-router] api_request log failed:", error.message); });

  return jsonResponse(200, {
    ok: res.ok,
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    location: res.status >= 300 && res.status < 400 ? res.headers.get("location") ?? "" : "",
    body: text,
    truncated,
  });
}
