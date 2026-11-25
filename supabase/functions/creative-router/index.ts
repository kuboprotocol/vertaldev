import { corsHeaders } from "../_shared/cors.ts";
import { getUser, deductCredits, recordAsset, sanitizeError, withRefundOnFailure, enforceRateLimit, supaAdmin } from "../_shared/creative.ts";
import { z } from "npm:zod@3";
import { createClient } from "npm:@supabase/supabase-js@2";
import { runGateway, GatewayError, emptyOutputFallbackProvider } from "../_shared/aiGateway.ts";
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
import { decryptSecret as decryptConnectorSecret } from "../_shared/connectorCrypto.ts";
import { handleFluxosApps } from "../_shared/fluxosAppsHandler.ts";
import { brokerToken, isFluxosSharedApp, makeFluxosKey, verifyFluxosKey } from "../_shared/fluxosBroker.ts";
import {
  AGENT_TOKEN_HEADER, fluxosAgentName, fluxosPostAgentOptions, isAgentesBrokerOp, makeAgentToken,
  parseAgentBridgeOp, parseAgentesBrokerOp, verifyAgentToken,
} from "../_shared/agentesFluxos.ts";
import { handleChatBrainOp, loadChatBrain, saveChatBrain } from "../_shared/chatBrain.ts";
import { callWithTierFallback, chooseAgentTier, ORCHESTRATOR_LIMITS, type AgentTier } from "../_shared/chatOrchestrator.ts";
import {
  AGENT_LIMITS,
  API_METHODS,
  buildAgentSystemPrompt,
  formatToolResults,
  agentOutputNeedsRetry,
  parseAgentOutput,
  parseConnections,
  secretPlaceholders,
  rerouteFormActions,
  fallbackReplyFromResults,
  plainReplyPrompt,
  cleanPlainReply,
  fluxosAppsInConversation,
} from "../_shared/chatAgent.ts";
import { wantsBrowserForm } from "../_shared/browserForm.ts";
import { wantsNavigator } from "../_shared/navigatorCore.ts";
import { emailRoute, rerouteEmailActions } from "../_shared/emailRouting.ts";
import { wantsGithub } from "../_shared/githubOps.ts";
import { wantsMedia } from "../_shared/youtubeCore.ts";
import {
  AUTOMATISCH_LIMITS,
  AUTOMATISCH_SECRETS,
  normalizeAutomatischUrl,
  parseAutomatischOp,
  runAutomatischOp,
  wantsAutomatisch,
} from "../_shared/automatischCore.ts";
import {
  clipData,
  huginnFailure,
  openHuginnSession,
  scrubSecrets,
  HUGINN_ERROR_MESSAGES,
  HUGINN_LIMITS,
  HUGINN_SECRETS,
  type HuginnOp,
  isHuginnBridge,
  normalizeHuginnUrl,
  parseHuginnOp,
  runHuginnOp,
  wantsHuginn,
} from "../_shared/huginnCore.ts";
import { type BridgeOp, runHuginnBridge } from "../_shared/huginnBridge.ts";
import { listVisibleSecrets, resolveEnvForRun } from "../_shared/kuboSecrets.ts";
import {
  DELEGATED_CHAT_PROMPT,
  delegatedResultsViolateDepth,
  filterActionsForOrigin,
  parseChatOrigin,
} from "../_shared/chatDelegate.ts";
import { validatePublicUrl } from "../_shared/security.ts";
import { wantsAuthKit } from "../_shared/vertalAuthKit.ts";
import { decodeImageDataUrl, generateChatImage } from "../_shared/chatImage.ts";
import { GMAIL_SECRETARY_COST } from "../_shared/gmailBilling.ts";
// Agendador do Vertal Chat: desligado por padrão (VERTAL_CHAT_SCHEDULER_ENABLED + VERTAL_CHAT_SCHEDULER_USER_IDS).
import { schedulerAllowed, wantsScheduler } from "../_shared/chatScheduler.ts";

const InputSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().min(1),
  })).optional(),
  prompt: z.string().optional(),
  tool: z.enum(["chat", "image", "video", "music", "pdf", "docs", "slide", "edit_image", "edit_video", "office_ai", "office_email", "chat_json", "notebook_ai", "agent_chat", "api_request", "automatisch", "huginn"]),
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
  // Vertal Chat: operação no Automatisch do cliente aprovada na tela (validada em handleAutomatisch).
  automatisch: z.record(z.any()).optional(),
  // Vertal Chat: operação no Huginn do cliente aprovada na tela (validada em handleHuginn).
  huginn: z.record(z.any()).optional(),
});

// Credit costs based on prompt instructions
const COSTS: Record<string, number> = {
  chat: 1,      // Message via OpenRouter
  chat_premium: 4, // Message premium frontier (Claude Sonnet)
  image: 1,     // Nano Banana (OpenRouter), gerada no servidor
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
  automatisch: 0,  // Vertal Chat: Automatisch do cliente, não é cobrado (tem limite de requisições)
  huginn: 0,       // Vertal Chat: Huginn do cliente, não é cobrado (tem limite de requisições)
  // Vertal Chat: cada ação de secretário do Gmail (buscar/ler/resumir, rascunho, responder, enviar,
  // encaminhar, organizar, lixeira, anexos). Cobrada nas próprias gmail-* (chatCharge), com estorno se falhar.
  gmail_secretary: GMAIL_SECRETARY_COST,
};

Deno.serve(withRefundOnFailure(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Vertal Fluxos ("Conta do Vertal"): o servidor do Fluxos se autentica com a
  // chave VERTAL_FLUXOS_KEY do usuário, não com a sessão.
  if (req.headers.get("X-Vertal-Fluxos-Key")) return await handleFluxosBroker(req);
  // Vertal Agentes → apps do Vertal Fluxos: o agente (PostAgent) se autentica com o
  // token vat1 do dono, não com a sessão. Só ops status/describe/run (ver agentesFluxos.ts).
  if (req.headers.get(AGENT_TOKEN_HEADER)) return await handleAgentBridge(req);

  const user = await getUser(req.headers.get("Authorization"));
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? undefined;
  
  try {
    const body = await req.json();
    // Vertal Chat: busca/leitura na web e memória. Grátis (sem créditos), com
    // limite próprio por usuário; fica aqui porque o projeto está no teto de edge functions.
    if (body?.tool === "agent_op") return jsonResponse(...(await handleChatBrainOp(user, body?.op_input ?? {})));
    // Vertal Fluxos: conectar apps do catálogo por usuário e rodar ações/buscas (chat cobra por ação).
    if (body?.tool === "fluxos_apps") return await handleFluxosApps(user, body?.fluxos ?? {});
    const parsed = InputSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "invalid_input", details: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tool, messages, prompt, model, temperature, max_tokens, metadata, office, notebook, agent, api, automatisch, huginn } = parsed.data;
    
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
    } else if (tool === "automatisch") {
      return await handleAutomatisch(user, automatisch ?? {});
    } else if (tool === "huginn") {
      return await handleHuginn(user, huginn ?? {});
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

/**
 * Gera a imagem de verdade no servidor (Nano Banana via OpenRouter) e só responde
 * ok quando há imagem. Antes, o caminho padrão só montava uma URL da Pollinations
 * anônima: o modelo dela não entende português (o "sapo de língua vermelha" virava
 * uma mulher), o limite de 1 imagem/45 s por IP quebrava a imagem e o crédito era
 * cobrado mesmo assim. Falha → 502/503 e o withRefundOnFailure devolve o crédito.
 */
async function handleImage(userId: string, prompt: string, metadata?: any, cost?: number) {
  const gen = await generateChatImage({ prompt, apiKey: Deno.env.get("OPENROUTER_API_KEY") });
  if (!gen.ok) {
    console.warn("[creative-router] image failed:", { error: gen.error, detail: gen.detail, attempts: gen.attempts });
    return jsonResponse(gen.error === "image_provider_unavailable" ? 503 : 502, { error: gen.error });
  }

  // Guarda no bucket público `uploads`: a conversa salva uma URL curta e durável
  // (e o Vibe Code recebe um link, não um data URL de megabytes).
  const imageUrl = (await rehostChatImage(gen.url, userId)) ?? gen.url;
  const source = typeof metadata?.source === "string" ? metadata.source.slice(0, 40) : undefined;

  // "nano_banana" é o valor aceito por creative_assets_tool_check ("image" era recusado).
  await recordAsset(userId, {
    tool: "nano_banana",
    prompt: prompt.slice(0, 1000),
    output_url: imageUrl.startsWith("data:") ? undefined : imageUrl,
    credits_spent: cost ?? 1,
    metadata: { engine: "openrouter", model: gen.model, attempts: gen.attempts, ...(source ? { source } : {}) },
  }).catch(console.error);

  return jsonResponse(200, { ok: true, image_url: imageUrl, engine: "openrouter", model: gen.model });
}

/** Sobe a imagem gerada para `uploads/<user>/chat/`. Devolve a URL pública ou null. */
async function rehostChatImage(url: string, userId: string): Promise<string | null> {
  try {
    let file = decodeImageDataUrl(url);
    if (!file) {
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      const type = r.headers.get("content-type") ?? "";
      if (!r.ok || !type.startsWith("image/")) return null;
      const ext = type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : "png";
      file = { type, ext, bytes: new Uint8Array(await r.arrayBuffer()) };
    }
    const path = `${userId}/chat/${crypto.randomUUID()}.${file.ext}`;
    const storage = supaAdmin().storage.from("uploads");
    const { error } = await storage.upload(path, file.bytes, { contentType: file.type, upsert: false });
    if (error) {
      console.warn("[creative-router] image rehost failed:", error.message);
      return null;
    }
    return storage.getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.warn("[creative-router] image rehost error:", sanitizeError(e));
    return null;
  }
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
// Vertal Chat: o navegador manda a conversa inteira; acima disto o resumo rolante cobre o começo.
const CHAT_BRAIN_MAX_MESSAGES = 400;

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
  })).max(ORCHESTRATOR_LIMITS.maxToolResults).optional(),
  // Fuso do aparelho e conexões que o cliente adicionou no chat (validadas em parseConnections).
  context: z.object({
    timezone: z.string().max(64).optional(),
    connections: z.array(z.record(z.any())).max(20).optional(),
    // Conversa atual (resumo rolante e memória); a posse é conferida no servidor.
    conversation_id: z.string().uuid().optional(),
  }).optional(),
  // Última rodada de ferramentas do turno: o modelo tem de responder, sem novas ações.
  final: z.boolean().optional(),
  // Modo plano em execução (validado em parsePlanState).
  plan: z.record(z.any()).optional(),
  // Quem chamou: ausente/"vertal_chat" = o próprio chat; "vibe_code" = pergunta delegada
  // pelo Vibe Code (só leitura/pesquisa/imagem, sem vibe_code: profundidade 1).
  origin: z.string().max(20).optional(),
});

/** Data e hora no fuso do usuário, por extenso. Fuso inválido cai para UTC. */
function localNow(timezone?: string): { text: string; timezone: string } {
  const format = (tz: string) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: tz, dateStyle: "full", timeStyle: "short" }).format(new Date());
  try {
    if (timezone) return { text: format(timezone), timezone };
  } catch {
    // fuso desconhecido
  }
  return { text: format("UTC"), timezone: "UTC" };
}

/**
 * Uma rodada do agente: devolve a resposta e as ações que o navegador vai executar.
 * As ações rodam pelas funções de cada ferramenta, com a cobrança e os limites delas.
 * O "cérebro" (memória, resumo rolante, plano e revisão) fica em _shared/chatBrain.ts.
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
  const origin = parseChatOrigin(agent.data.origin);
  if (!origin) return fail(400, "invalid_origin");
  const delegated = origin === "vibe_code";
  if (delegatedResultsViolateDepth(agent.data.tool_results ?? [], origin) || (delegated && agent.data.plan)) {
    return fail(400, "delegation_depth_exceeded");
  }

  // Conversa inteira (até CHAT_BRAIN_MAX_MESSAGES); a janela enviada ao modelo sai do resumo rolante.
  const filtered = messages.filter((m) => m.role === "user" || m.role === "assistant");
  const all = filtered
    .slice(-CHAT_BRAIN_MAX_MESSAGES)
    .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, CHAT_JSON_MAX_CHARS) }));
  const results = agent.data.tool_results ?? [];
  if (all.length === 0 || (results.length === 0 && all[all.length - 1].role !== "user")) {
    return fail(400, "invalid_messages");
  }

  // Só os NOMES dos segredos vão para o modelo; os valores ficam no cofre.
  let secretNames: string[] = [];
  try {
    secretNames = (await listVisibleSecrets(supaAdmin(), user.id)).map((s) => s.env_key);
  } catch (e) {
    console.error("[creative-router] agent_chat secrets list failed:", sanitizeError(e));
  }

  // Memória, recordação entre conversas, resumo rolante e plano. Falhas aqui não derrubam a conversa.
  const brain = await loadChatBrain({
    userId: user.id,
    conversationId: agent.data.context?.conversation_id,
    messages: all,
    offset: filtered.length - all.length,
    maxMessages: CHAT_JSON_MAX_MESSAGES,
    firstRound: results.length === 0,
    plan: agent.data.plan,
  });

  const now = localNow(agent.data.context?.timezone);
  // Ferramenta de formulários só quando a conversa fala disso (e nunca em pedido delegado pelo Vibe Code).
  const browserFormOn = !delegated && wantsBrowserForm([...all.slice(-8), ...results.slice(-6)]);
  // E-mail do próprio usuário: conector do Gmail (ler, resumir, perguntar, enviar só com aprovação).
  // O navegador só entra se o usuário insistir nele (fix 22/11: abria a página de marketing do Gmail).
  const mailRoute = delegated ? null : emailRoute(all.filter((m) => m.role === "user").map((m) => m.content));
  // Vertal Navigator: idem, só quando a conversa pede para operar um site (e não é pedido de e-mail pelo conector).
  const navigatorOn = !delegated && mailRoute !== "gmail" && wantsNavigator([...all.slice(-8), ...results.slice(-6)]);
  // Fase 3: GitHub (Vibe Code) e YouTube só entram no prompt quando a conversa pede.
  const githubOn = !delegated && wantsGithub([...all.slice(-8), ...results.slice(-6)]);
  const mediaOn = wantsMedia([...all.slice(-6), ...results.slice(-4)]);
  const automatischOn = !delegated && wantsAutomatisch([...all.slice(-8), ...results.slice(-6)]);
  const huginnOn = !delegated && wantsHuginn([...all.slice(-8), ...results.slice(-6)]);
  // Login com Google gerenciado pelo Vertal: a oferta só entra quando o Dev fala de login.
  const authKitOn = !delegated && wantsAuthKit(all.filter((m) => m.role === "user").slice(-6));
  // Apps do Vertal Fluxos conectados pelo usuário: a ferramenta fluxos entra quando a conversa cita algum.
  let fluxosApps: Array<{ key: string; name: string }> = [];
  if (!delegated) {
    const { data: fx } = await supaAdmin().from("fluxos_connections").select("app_key")
      .eq("user_id", user.id).eq("status", "connected");
    if (fx?.length) {
      fluxosApps = fluxosAppsInConversation(
        fx.map((r: { app_key: string }) => r.app_key),
        [...all.slice(-8).map((m) => m.content), ...results.slice(-6).map((r) => JSON.stringify(r))],
      );
    }
  }
  const system = buildAgentSystemPrompt({
    secretNames,
    today: new Date().toISOString().slice(0, 10),
    localNow: now.text,
    timezone: now.timezone,
    connections: parseConnections(agent.data.context?.connections),
    memoryEnabled: brain.memoryEnabled,
    memories: brain.memories,
    recall: brain.recall,
    summary: brain.summary,
    plan: brain.planBlock,
    browserForm: browserFormOn,
    navigator: navigatorOn,
    email: mailRoute,
    github: githubOn,
    media: mediaOn,
    automatisch: automatischOn,
    huginn: huginnOn,
    authKit: authKitOn,
    fluxosApps,
    // Só com a flag ligada para este usuário E a conversa falando de agendar/lembrar/gatilho; senão o prompt é o mesmo de antes.
    ...(!delegated && schedulerAllowed((k) => Deno.env.get(k), user.id) && wantsScheduler([...all.slice(-6), ...results.slice(-4)])
      ? { scheduler: true }
      : {}),
  }) + (delegated ? DELEGATED_CHAT_PROMPT : "");
  const final = agent.data.final === true || brain.planPhase === "final";
  const convo = results.length
    ? [...brain.window, { role: "user" as const, content: formatToolResults(results, { final }) }]
    : brain.window;

  // Orquestrador v2: flash por padrão; "pro" na síntese do plano e na 1ª rodada de pedido complexo.
  const lastUserText = [...all].reverse().find((m) => m.role === "user")?.content ?? "";
  const route = chooseAgentTier({
    lastUserText,
    firstRound: results.length === 0,
    planPhase: brain.planPhase,
    escalation: Deno.env.get("VERTAL_CHAT_ESCALATION") !== "off",
  });
  const callModel = (tier: AgentTier) => runGateway({
    messages: [{ role: "system", content: system }, ...convo],
    kind: "chat",
    tier,
    json: true,
    temperature: 0.4,
    maxTokens: ORCHESTRATOR_LIMITS.maxTokens[tier],
    contextChars: 78_000,
    noCache: true,
  });

  try {
    // Escalar nunca piora (pro que falha volta ao flash) e saída quebrada ganha
    // uma nova tentativa no outro tier: mesmo helper usado pelo Vibe Code.
    const attempt = await callWithTierFallback({
      tier: route.tier,
      call: callModel,
      parse: (r) => parseAgentOutput(r.content),
      needsRetry: (p) => agentOutputNeedsRetry(p.status),
      better: (again, first) => !agentOutputNeedsRetry(again.status) || (first.status === "empty" && again.status !== "empty"),
      isRecoverable: (err) => err instanceof GatewayError,
    });
    if (attempt.fellBack) console.warn("[creative-router] agent_chat pro falhou, voltando ao flash");
    let gw = attempt.result;
    let parsed = attempt.parsed;
    const retried = attempt.retried;
    // Resgate: DeepSeek vazio/inválido nos dois tiers -> uma tentativa em outro modelo (OpenRouter).
    if (agentOutputNeedsRetry(parsed.status)) {
      const rescue = emptyOutputFallbackProvider();
      if (rescue) {
        try {
          const r = await runGateway({
            messages: [{ role: "system", content: system }, ...convo],
            kind: "chat", tier: "flash", json: true, temperature: 0.4,
            maxTokens: ORCHESTRATOR_LIMITS.maxTokens.flash, contextChars: 78_000, noCache: true,
            providers: [rescue],
          });
          const p2 = parseAgentOutput(r.content);
          if (!agentOutputNeedsRetry(p2.status) || (parsed.status === "empty" && p2.status !== "empty")) {
            console.warn(`[creative-router] agent_chat resgatado por ${r.provider}/${r.model} (antes: ${parsed.status})`);
            gw = r;
            parsed = p2;
          }
        } catch (err) {
          console.warn("[creative-router] resgate OpenRouter falhou", err instanceof Error ? err.message : err);
        }
      }
    }
    if (retried) {
      console.warn(`[creative-router] agent_chat saída ${parsed.status} após nova tentativa (${gw.provider}/${gw.model})`);
    }
    let turn = parsed.turn;
    if (!turn.reply && turn.actions.length === 0) {
      // Depois de ferramentas, nunca 502: relata o que saiu (ex.: a ferramenta falhou).
      if (results.length === 0) return fail(502, "invalid_model_output");
      // Segunda chance barata: texto simples (sem JSON) só com o pedido e os resultados.
      let plain = "";
      try {
        const again = await runGateway({
          messages: [
            { role: "system", content: "Você é o Vertal Chat. Responda curto e direto, em português do Brasil." },
            { role: "user", content: plainReplyPrompt(results, lastUserText) },
          ],
          kind: "chat",
          tier: "flash",
          json: false,
          temperature: 0.3,
          maxTokens: 300,
          contextChars: 12_000,
          noCache: true,
        });
        plain = cleanPlainReply(again.content);
      } catch (e) {
        console.warn("[creative-router] agent_chat resposta simples falhou:", sanitizeError(e));
      }
      console.warn(`[creative-router] agent_chat saída vazia após ferramentas: ${plain ? "resposta simples" : "resposta de contingência"}`);
      turn = { reply: plain || fallbackReplyFromResults(results), actions: [] };
    }
    // Última rodada ou fase final do plano: sem novas ações. Durante um plano, sem plano dentro de plano.
    let actions = final ? [] : turn.actions;
    // Pedido de formulário de site: api_request/web_read na página do usuário vira browser_form (inspect).
    if (browserFormOn && actions.length) {
      const reroute = rerouteFormActions(actions, {
        lastUserText,
        alreadyInspected: results.some((r) => r.tool === "browser_form"),
      });
      if (reroute.rerouted) {
        console.warn(`[creative-router] agent_chat ${reroute.rerouted} ação(ões) de formulário trocada(s) por browser_form`);
        actions = reroute.actions;
      }
    }
    // Pedido de e-mail pela rota do conector: navigator sobre a caixa de e-mail vira leitura pelo Gmail.
    if (mailRoute === "gmail" && actions.length) {
      const mail = rerouteEmailActions(actions, mailRoute);
      if (mail.rerouted) {
        console.warn(`[creative-router] agent_chat ${mail.rerouted} ação(ões) de navigator sobre e-mail trocada(s) por gmail_search`);
        actions = mail.actions as typeof actions;
      }
    }
    if (brain.planPhase) actions = actions.filter((a) => a.tool !== "plan");
    // Pedido do Vibe Code: só leitura/pesquisa/imagem, filtrado AQUI no servidor (nunca vibe_code).
    const originFilter = filterActionsForOrigin(actions, origin);
    actions = originFilter.actions;
    if (originFilter.refused.length) console.warn(`[creative-router] agent_chat origin=${origin} recusou: ${originFilter.refused.join(", ")}`);
    // Memória (no mesmo JSON, sem chamada extra), revisão crítica da resposta final e resumo em segundo plano.
    const after = await saveChatBrain(brain, {
      userId: user.id,
      turn: { ...turn, actions },
      results,
      lastUserText,
    });
    return jsonResponse(200, {
      reply: after.reply, actions, provider: gw.provider, model: gw.model, creditsCharged: cost,
      tier: gw.tier, ...(route.tier === "pro" ? { escalated: route.reason } : {}), ...(retried ? { retried: true } : {}),
      ...(after.memory ? { memory: after.memory } : {}),
      ...(after.reviewed ? { reviewed: true } : {}),
      ...(delegated ? { origin, refused: originFilter.refused } : {}),
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
    // Servidores MCP devolvem o id da sessão neste cabeçalho.
    sessionId: res.headers.get("mcp-session-id") ?? "",
    body: text,
    truncated,
  });
}

// ─── Vertal Chat: Automatisch do cliente ─────────────────────────────────

/**
 * Executa uma operação no Automatisch (edição comunitária) do cliente.
 * URL, e-mail e senha vêm do Cofre de segredos e só existem aqui; o login
 * (token) é feito, usado e revogado nesta requisição. A resposta leva só os
 * dados do fluxo/execução, nunca credenciais nem token.
 */
async function handleAutomatisch(user: { id: string; email?: string | null }, raw: unknown): Promise<Response> {
  const limit = await enforceRateLimit(user.id, "automatisch", { max: 20, windowSeconds: 60, userEmail: user.email ?? null });
  if (!limit.ok) return jsonResponse(429, { error: limit.error });

  // Sem a aprovação explícita do usuário na tela a chamada não sai.
  if ((raw as { confirmed?: unknown } | null)?.confirmed !== true) return jsonResponse(400, { error: "confirmation_required" });
  const op = parseAutomatischOp(raw);
  if (!op) return jsonResponse(400, { error: "invalid_input" });

  const resolved = await resolveEnvForRun(supaAdmin(), user.id, [...AUTOMATISCH_SECRETS], { target: "automatisch" });
  if (resolved.missing.length > 0) return jsonResponse(400, { error: "missing_secrets", missing: resolved.missing });
  const env = resolved.env;

  const base = normalizeAutomatischUrl(env.AUTOMATISCH_URL);
  if (!base) return jsonResponse(400, { error: "bad_url" });
  let host: string;
  try {
    host = validatePublicUrl(base).host;
  } catch {
    return jsonResponse(400, { error: "url_not_allowed" });
  }
  const ownHost = new URL(Deno.env.get("SUPABASE_URL")!).host;
  if (host === ownHost) return jsonResponse(400, { error: "url_not_allowed" });

  let vertalKey: string | undefined;
  if (op.op === "sync_connection") {
    const secret = Deno.env.get("FLUXOS_BROKER_SECRET");
    if (!secret) return jsonResponse(503, { error: "fluxos_broker_not_configured" });
    vertalKey = await makeFluxosKey(user.id, secret);
  }

  const result = await runAutomatischOp(
    op,
    { url: base, email: env.AUTOMATISCH_EMAIL, password: env.AUTOMATISCH_PASSWORD, vertalKey },
    {
      fetch: async (url, init) => {
        // Cada chamada fica no mesmo host da base (um redirecionamento não é seguido).
        if (new URL(url).host !== host) throw new TypeError("host_changed");
        return await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(AUTOMATISCH_LIMITS.timeoutMs) });
      },
    },
  );

  await supaAdmin().from("connector_activity_logs").insert({
    user_id: user.id,
    connector_slug: "automatisch",
    event_type: `automatisch_${op.op}`,
    message: `${op.op} ${host}`.slice(0, 300),
    status: result.ok ? "success" : "error",
    metadata: { host, op: op.op, ...(result.ok ? {} : { code: result.code, http_status: result.status ?? null }) },
  }).then(({ error }) => { if (error) console.error("[creative-router] automatisch log failed:", error.message); });

  return jsonResponse(200, result);
}

// ─── Vertal Fluxos: corretor "Conta do Vertal" ───────────────────────────

/**
 * Chamado pelo servidor do Vertal Fluxos com a chave do usuário.
 * ops: whoami | token {app} (access token de curta duração do conector
 * compartilhado) | api {request} (chamada com segredos do Cofre, para o app
 * Vertal). Refresh tokens e client secrets nunca saem daqui.
 */
async function handleFluxosBroker(req: Request): Promise<Response> {
  const userId = await verifyFluxosKey(req.headers.get("X-Vertal-Fluxos-Key"), Deno.env.get("FLUXOS_BROKER_SECRET"));
  if (!userId) return jsonResponse(401, { error: "invalid_key" });
  const limit = await enforceRateLimit(userId, "fluxos_broker", { max: 120, windowSeconds: 60, userEmail: null });
  if (!limit.ok) return jsonResponse(429, { error: limit.error });

  const body = await req.json().catch(() => ({})) as { op?: unknown; app?: unknown; request?: unknown };
  const admin = supaAdmin();
  if (body.op === "whoami") return jsonResponse(200, { ok: true });

  if (body.op === "token") {
    if (!isFluxosSharedApp(body.app)) return jsonResponse(400, { error: "invalid_app" });
    const app = body.app;
    let token = null;
    try {
      token = await brokerToken(userId, app, {
        gmail: async (uid) => {
          const { data } = await admin.from("gmail_accounts").select("*").eq("user_id", uid)
            .order("updated_at", { ascending: false }).limit(1).maybeSingle();
          return data ? await getFreshAccessToken(admin, data) : null;
        },
        spotify: async (uid) => {
          const internal = Deno.env.get("NAVIGATOR_INTERNAL_TOKEN");
          if (!internal) return null;
          const origin = Deno.env.get("VERTAL_WORKER_ORIGIN") ?? "https://vertal.dev";
          const r = await fetch(`${origin}/api/spotify/internal/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-navigator-token": internal },
            body: JSON.stringify({ user_id: uid }),
            redirect: "manual",
            signal: AbortSignal.timeout(15_000),
          });
          return r.ok ? await r.json() : null;
        },
        apiKey: async (uid, slug) => {
          const { data } = await admin.from("api_credentials").select("ciphertext, iv, tag")
            .eq("user_id", uid).eq("connector_slug", slug).maybeSingle();
          return data ? await decryptConnectorSecret(data) : null;
        },
      });
    } catch (e) {
      console.error("[creative-router] fluxos token failed:", app, e instanceof Error ? e.message : e);
      token = null;
    }
    await admin.from("connector_activity_logs").insert({
      user_id: userId, connector_slug: app, event_type: "fluxos_token",
      message: `Vertal Fluxos pediu acesso a ${app}`, status: token ? "success" : "error", metadata: { app },
    }).then(({ error }) => { if (error) console.error("[creative-router] fluxos log failed:", error.message); });
    if (!token) return jsonResponse(404, { error: "not_connected" });
    return new Response(JSON.stringify(token), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }

  if (body.op === "api") {
    const { data } = await admin.auth.admin.getUserById(userId);
    return await handleApiRequest({ id: userId, email: data?.user?.email ?? null }, body.request ?? {});
  }
  // Vertal Fluxos → Vertal Agentes (app "Vertal" do motor): agentes do MESMO usuário.
  if (isAgentesBrokerOp(body.op)) return await handleAgentesFromFluxos(userId, body);
  return jsonResponse(400, { error: "invalid_op" });
}

// ─── Vertal Agentes ↔ Vertal Fluxos ──────────────────────────────────────

/** Login no Vertal Agentes do usuário (segredos HUGINN_* do Cofre dele), com host fixo. */
async function huginnAccess(userId: string): Promise<
  | { ok: true; creds: { url: string; username: string; password: string }; fetch: (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<Response>; host: string }
  | { ok: false; status: number; error: string; missing?: string[] }
> {
  const resolved = await resolveEnvForRun(supaAdmin(), userId, [...HUGINN_SECRETS], { target: "huginn" });
  if (resolved.missing.length > 0) return { ok: false, status: 400, error: "missing_secrets", missing: resolved.missing };
  const env = resolved.env;
  const base = normalizeHuginnUrl(env.HUGINN_URL);
  if (!base) return { ok: false, status: 400, error: "bad_url" };
  const host = allowedHost(base);
  if (!host) return { ok: false, status: 400, error: "url_not_allowed" };
  return {
    ok: true,
    host,
    creds: { url: base, username: env.HUGINN_USERNAME, password: env.HUGINN_PASSWORD },
    fetch: async (url, init) => {
      if (new URL(url).host !== host) throw new TypeError("host_changed");
      return await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(HUGINN_LIMITS.timeoutMs) });
    },
  };
}

/**
 * Chamado pelo motor do Vertal Fluxos (app "Vertal", chave vfk1 do usuário):
 * listar agentes, ler eventos novos (gatilho por consulta), mandar um evento a um
 * WebhookAgent e rodar um agente. A aprovação foi dada ao montar e publicar o fluxo.
 */
async function handleAgentesFromFluxos(userId: string, body: Record<string, unknown>): Promise<Response> {
  const op = parseAgentesBrokerOp(body);
  if (!op) return jsonResponse(400, { error: "invalid_input" });
  const acc = await huginnAccess(userId);
  if (!acc.ok) return jsonResponse(acc.status, { error: acc.error, ...(acc.missing ? { missing: acc.missing } : {}) });
  const hop: HuginnOp = op.op === "agentes_list" ? { op: "list_agents" }
    : op.op === "agentes_events" ? { op: "list_events", agent_id: op.agent_id }
    : op.op === "agentes_run" ? { op: "run_agent", agent_id: op.agent_id }
    : { op: "send_webhook_event", agent_id: op.agent_id, payload: op.payload };
  const result = op.op === "agentes_events"
    ? await agentEventsForFlow(op.agent_id, acc.creds, acc.fetch)
    : await runHuginnOp(hop, acc.creds, { fetch: acc.fetch });
  await supaAdmin().from("connector_activity_logs").insert({
    user_id: userId, connector_slug: "huginn", event_type: `fluxos_${op.op}`,
    message: `Vertal Fluxos → Vertal Agentes: ${op.op}${"agent_id" in op ? ` ${op.agent_id}` : ""}`.slice(0, 300),
    status: result.ok ? "success" : "error", metadata: { op: op.op, source: "vertal_fluxos" },
  }).then(({ error }) => { if (error) console.error("[creative-router] agentes log failed:", error.message); });
  if (!result.ok) return jsonResponse(502, { ok: false, error: result.code, message: result.message });
  // Sem instance_url (marca branca e nada do host para o motor).
  const data = JSON.parse(JSON.stringify(result.data, (k, v) => (k === "instance_url" ? undefined : v)));
  return jsonResponse(200, { ok: true, data });
}

/** Eventos recentes de um agente para o gatilho do fluxo: payload maior que o do chat (até 8 mil caracteres). */
async function agentEventsForFlow(
  agentId: number,
  creds: { url: string; username: string; password: string },
  fetchFn: (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<Response>,
) {
  const op: HuginnOp = { op: "list_events", agent_id: agentId };
  let session: Awaited<ReturnType<typeof openHuginnSession>> | undefined;
  const secrets = () => [creds.password, creds.username, ...(session?.sensitive() ?? [])];
  try {
    session = await openHuginnSession(creds, fetchFn);
    const items = await session.json("GET", `/agents/${agentId}/events.json`);
    const events = (Array.isArray(items) ? items : []).slice(0, 25).map((e: Record<string, unknown>) => ({
      id: e.id, agentId: e.agent_id, createdAt: e.created_at, payload: clipData(e.payload, 8_000),
    }));
    return { ok: true as const, op: op.op, data: scrubSecrets({ events }, secrets()), summary: "" };
  } catch (e) {
    return huginnFailure(op, e, secrets());
  }
}

/**
 * Chamado por um agente do Vertal Agentes (PostAgent criado por
 * create_fluxos_agent) com o token vat1 do dono: roda a ação/busca do app do
 * Vertal Fluxos com a conexão desse usuário. 2 créditos por execução, devolvidos
 * se falhar (withRefundOnFailure). A aprovação foi dada ao criar o agente.
 */
async function handleAgentBridge(req: Request): Promise<Response> {
  const userId = await verifyAgentToken(req.headers.get(AGENT_TOKEN_HEADER), Deno.env.get("FLUXOS_BROKER_SECRET"));
  if (!userId) return jsonResponse(401, { error: "invalid_token" });
  const limit = await enforceRateLimit(userId, "agentes_fluxos", { max: 60, windowSeconds: 60, userEmail: null });
  if (!limit.ok) return jsonResponse(429, { error: limit.error });
  const op = parseAgentBridgeOp(await req.json().catch(() => null));
  if (!op) return jsonResponse(400, { error: "invalid_input" });
  const { data } = await supaAdmin().auth.admin.getUserById(userId);
  const user = { id: userId, email: data?.user?.email ?? null };
  if (op.op === "status") return await handleFluxosApps(user, { op: "status" });
  if (op.op === "describe") return await handleFluxosApps(user, { op: "describe", app: op.app });
  return await handleFluxosApps(
    user,
    { op: "run", app: op.app, kind: op.kind, key: op.key, parameters: op.parameters, chatCharge: crypto.randomUUID() },
    undefined,
    { source: "vertal_agentes" },
  );
}

/**
 * create_fluxos_agent: confere que o app está conectado PELO usuário e que a
 * ação/busca existe, gera o token vat1 dele e monta as opções do PostAgent.
 * Devolve a op pronta (com post_options) ou um erro.
 */
async function prepareFluxosAgent(
  user: { id: string; email?: string | null },
  op: Extract<HuginnOp, { op: "create_fluxos_agent" }>,
): Promise<{ ok: true; op: Extract<HuginnOp, { op: "create_fluxos_agent" }> } | { ok: false; code: string; message: string }> {
  const secret = Deno.env.get("FLUXOS_BROKER_SECRET");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!secret || !anon) return { ok: false, code: "fluxos_not_configured", message: HUGINN_ERROR_MESSAGES.fluxos_not_configured };
  const r = await handleFluxosApps(user, { op: "describe", app: op.app });
  const d = await r.json().catch(() => ({})) as {
    ok?: boolean; error?: string;
    app?: { name?: string; supportsConnections?: boolean };
    actions?: Array<{ key: string; name?: string }>; searches?: Array<{ key: string; name?: string }>;
    connection?: { status?: string } | null;
  };
  if (!r.ok || d.ok !== true) {
    const code = d.error === "app_not_found" ? "fluxos_app_not_found" : "fluxos_not_configured";
    return { ok: false, code, message: HUGINN_ERROR_MESSAGES[code] };
  }
  if (d.app?.supportsConnections && d.connection?.status !== "connected") {
    return { ok: false, code: "fluxos_not_connected", message: `${HUGINN_ERROR_MESSAGES.fluxos_not_connected} (${d.app?.name ?? op.app})` };
  }
  const list = (op.kind === "trigger" ? d.searches : d.actions) ?? [];
  const item = list.find((x) => x.key === op.key);
  if (!item) return { ok: false, code: "fluxos_action_not_found", message: HUGINN_ERROR_MESSAGES.fluxos_action_not_found };
  const spec = { app: op.app, appName: d.app?.name, kind: op.kind, key: op.key, keyName: item.name, parameters: op.parameters };
  const token = await makeAgentToken(user.id, secret);
  const routerUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/creative-router`;
  return {
    ok: true,
    op: { ...op, name: op.name ?? fluxosAgentName(spec), post_options: fluxosPostAgentOptions({ routerUrl, anonKey: anon, token, spec }) },
  };
}

// ─── Vertal Chat: Huginn do cliente ──────────────────────────────────────

/** Host público em https permitido (não é o próprio Supabase). null = recusado. */
function allowedHost(base: string): string | null {
  try {
    const host = validatePublicUrl(base).host;
    return host === new URL(Deno.env.get("SUPABASE_URL")!).host ? null : host;
  } catch {
    return null;
  }
}

/**
 * Executa uma operação no Huginn do cliente (e, nas ops connect_*, também no
 * Automatisch dele). URL, usuário e senha vêm do Cofre e só existem aqui; a
 * sessão (cookie) vive só nesta requisição. A resposta leva só dados de
 * agentes/eventos, nunca credenciais, cookie, token CSRF ou segredo de webhook.
 */
async function handleHuginn(user: { id: string; email?: string | null }, raw: unknown): Promise<Response> {
  const limit = await enforceRateLimit(user.id, "huginn", { max: 20, windowSeconds: 60, userEmail: user.email ?? null });
  if (!limit.ok) return jsonResponse(429, { error: limit.error });

  // Sem a aprovação explícita do usuário na tela a chamada não sai.
  if ((raw as { confirmed?: unknown } | null)?.confirmed !== true) return jsonResponse(400, { error: "confirmation_required" });
  let op = parseHuginnOp(raw);
  if (!op) return jsonResponse(400, { error: "invalid_input" });
  const bridge = isHuginnBridge(op);
  if (op.op === "create_fluxos_agent") {
    const prepared = await prepareFluxosAgent(user, op);
    if (!prepared.ok) return jsonResponse(200, { ok: false, op: op.op, code: prepared.code, message: prepared.message });
    op = prepared.op;
  }

  const keys: string[] = [...HUGINN_SECRETS, ...(bridge ? AUTOMATISCH_SECRETS : [])];
  const resolved = await resolveEnvForRun(supaAdmin(), user.id, keys, { target: "huginn" });
  if (resolved.missing.length > 0) return jsonResponse(400, { error: "missing_secrets", missing: resolved.missing });
  const env = resolved.env;

  const base = normalizeHuginnUrl(env.HUGINN_URL);
  if (!base) return jsonResponse(400, { error: "bad_url" });
  const host = allowedHost(base);
  if (!host) return jsonResponse(400, { error: "url_not_allowed" });

  // Cada chamada fica no host indicado (um redirecionamento não é seguido).
  const pinned = (allowed: string, timeoutMs: number) => async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    if (new URL(url).host !== allowed) throw new TypeError("host_changed");
    return await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
  };
  const huginnFetch = pinned(host, HUGINN_LIMITS.timeoutMs);
  const huginnCreds = { url: base, username: env.HUGINN_USERNAME, password: env.HUGINN_PASSWORD };

  let result;
  let automatischHost: string | null = null;
  if (bridge) {
    const aBase = normalizeAutomatischUrl(env.AUTOMATISCH_URL);
    if (!aBase) return jsonResponse(400, { error: "bad_url" });
    automatischHost = allowedHost(aBase);
    if (!automatischHost) return jsonResponse(400, { error: "url_not_allowed" });
    result = await runHuginnBridge(
      op as BridgeOp,
      { huginn: huginnCreds, automatisch: { url: aBase, email: env.AUTOMATISCH_EMAIL, password: env.AUTOMATISCH_PASSWORD } },
      { huginnFetch, automatischFetch: pinned(automatischHost, AUTOMATISCH_LIMITS.timeoutMs) },
    );
  } else {
    result = await runHuginnOp(op, huginnCreds, { fetch: huginnFetch });
  }

  await supaAdmin().from("connector_activity_logs").insert({
    user_id: user.id,
    connector_slug: "huginn",
    event_type: `huginn_${op.op}`,
    message: `${op.op} ${host}${automatischHost ? ` ↔ ${automatischHost}` : ""}`.slice(0, 300),
    status: result.ok ? "success" : "error",
    metadata: { host, op: op.op, ...(automatischHost ? { automatisch_host: automatischHost } : {}), ...(result.ok ? {} : { code: result.code, http_status: result.status ?? null }) },
  }).then(({ error }) => { if (error) console.error("[creative-router] huginn log failed:", error.message); });

  return jsonResponse(200, result);
}
