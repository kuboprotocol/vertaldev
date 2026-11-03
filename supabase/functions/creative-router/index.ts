import { corsHeaders } from "../_shared/cors.ts";
import { getUser, deductCredits, recordAsset, sanitizeError, withRefundOnFailure, enforceRateLimit } from "../_shared/creative.ts";
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
  ATTACHMENT_MAX_BYTES,
  OfficeEmailError,
  base64DecodedSize,
  buildRawEmail,
  sanitizeAttachmentName,
  toGmailRaw,
} from "../_shared/officeEmail.ts";
import { getFreshAccessToken, loadAccount } from "../_shared/gmailToken.ts";

const InputSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().min(1),
  })).optional(),
  prompt: z.string().optional(),
  tool: z.enum(["chat", "image", "video", "music", "pdf", "docs", "slide", "edit_image", "edit_video", "office_ai", "office_email"]),
  model: z.string().optional(),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  metadata: z.record(z.any()).optional(),
  // Entrada das ações do Vertal Office (validada em cada handler).
  office: z.record(z.any()).optional(),
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

    const { tool, messages, prompt, model, temperature, max_tokens, metadata, office } = parsed.data;
    
    // Determine cost
    let cost = COSTS[tool] ?? 1;
    if (tool === "chat" && model?.includes("sonnet")) {
      cost = COSTS.chat_premium;
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
  action: z.enum(["sheet", "doc", "email"]),
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

