// Webhook do canal WhatsApp Business (Meta Cloud API) para o Vertal Chat.
//
// GET  → handshake de verificação do webhook (hub.challenge).
// POST → valida X-Hub-Signature-256, normaliza as mensagens, responde só aos números
//        permitidos (WHATSAPP_ALLOWED_WA_IDS) e devolve 200 de imediato para a Meta não reenviar.
//
// Toda mensagem (entrada e saída) é gravada na caixa de entrada do Vertal Chat.
//
// Segredos (Supabase → Edge Functions → Secrets): WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET,
// WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ALLOWED_WA_IDS (separados por vírgula).
import { callLlm } from "../_shared/llm.ts";
import {
  buildWhatsAppTextMessages,
  parseWhatsAppWebhook,
  verifyWhatsAppSignature,
  verifyWhatsAppSubscription,
  WHATSAPP_GRAPH_VERSION,
} from "../_shared/virtualChat/whatsapp.ts";
import { postGraph } from "../_shared/virtualChat/graphSend.ts";
import { storeChannelMessage } from "../_shared/virtualChat/messageRepo.ts";
import { channelAdminClient } from "../_shared/virtualChat/adminClient.ts";
import type { NormalizedInbound } from "../_shared/virtualChat/types.ts";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const ALLOWED_IDS = new Set(
  (Deno.env.get("WHATSAPP_ALLOWED_WA_IDS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const SYSTEM_PROMPT =
  "Você é o Vertal Chat, respondendo por WhatsApp. Seja direto, use frases curtas e responda em português do Brasil.";
const FALLBACK_ERROR = "Não consegui responder agora. Tente de novo em instantes.";
const NON_TEXT_NOTICE = "Por enquanto eu só entendo mensagens de texto.";

// Deduplicação best-effort por isolate: a Meta pode reenviar o mesmo messageId.
const seenMessageIds = new Map<string, number>();
const SEEN_TTL_MS = 10 * 60 * 1000;

function rememberMessage(id: string): boolean {
  const now = Date.now();
  for (const [k, t] of seenMessageIds) if (now - t > SEEN_TTL_MS) seenMessageIds.delete(k);
  if (seenMessageIds.has(id)) return false;
  seenMessageIds.set(id, now);
  return true;
}

// deno-lint-ignore no-explicit-any
async function recordInbound(admin: any, msg: NormalizedInbound): Promise<boolean> {
  try {
    return await storeChannelMessage(admin, {
      channel: "whatsapp",
      direction: "in",
      contact_id: msg.externalUserId,
      display_name: msg.displayName,
      message_id: msg.messageId,
      kind: msg.kind === "text" ? "text" : msg.kind === "image" ? "image" : msg.kind === "document" ? "document" : "other",
      body: msg.text,
      occurred_at: new Date(msg.receivedAt).toISOString(),
    });
  } catch (e) {
    console.error(`whatsapp store inbound failed: ${e instanceof Error ? e.message : "unknown"}`);
    return rememberMessage(msg.messageId);
  }
}

// deno-lint-ignore no-explicit-any
async function sendText(admin: any, to: string, text: string): Promise<void> {
  const requests = buildWhatsAppTextMessages({ phoneNumberId: PHONE_NUMBER_ID, to, text });
  for (const r of requests) {
    const res = await postGraph(r.path, ACCESS_TOKEN, r.body);
    if (!res.ok) {
      // Sem corpo de resposta nos logs: pode conter dados do cliente.
      console.error(`whatsapp send failed: status=${res.status} graph=${WHATSAPP_GRAPH_VERSION}`);
      continue;
    }
    try {
      await storeChannelMessage(admin, {
        channel: "whatsapp",
        direction: "out",
        contact_id: to,
        display_name: null,
        message_id: res.providerId ?? `out:${crypto.randomUUID()}`,
        kind: "text",
        body: text,
        occurred_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error(`whatsapp store outbound failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
}

// deno-lint-ignore no-explicit-any
async function handleInbound(admin: any, msg: NormalizedInbound): Promise<void> {
  // Guarda a mensagem mesmo de quem não está na lista: o dono vê a caixa de entrada no Vertal Chat.
  const fresh = await recordInbound(admin, msg);
  if (!fresh) return;
  // Resposta automática só para a lista (falha fechada): sem custo de IA para desconhecidos.
  if (!ALLOWED_IDS.has(msg.externalUserId)) return;

  if (msg.kind !== "text" || !msg.text) {
    await sendText(admin, msg.externalUserId, NON_TEXT_NOTICE);
    return;
  }

  try {
    const { content } = await callLlm({
      prefer: "kimi",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: msg.text.slice(0, 4000) },
      ],
    });
    await sendText(admin, msg.externalUserId, content);
  } catch (err) {
    console.error(`whatsapp reply failed: ${err instanceof Error ? err.message : "unknown"}`);
    await sendText(admin, msg.externalUserId, FALLBACK_ERROR);
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const params = Object.fromEntries(url.searchParams.entries());
    const challenge = verifyWhatsAppSubscription(params, VERIFY_TOKEN);
    if (challenge === null) return new Response("forbidden", { status: 403 });
    return new Response(challenge, { status: 200 });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!(await verifyWhatsAppSignature(raw, signature, APP_SECRET))) {
    return new Response("invalid signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const messages = parseWhatsAppWebhook(body);
  const admin = channelAdminClient();
  const work = Promise.all(messages.map((m) => handleInbound(admin, m).catch((e) => {
    console.error(`whatsapp inbound error: ${e instanceof Error ? e.message : "unknown"}`);
  })));

  // Responde 200 já; o processamento continua em segundo plano quando o runtime permite.
  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(work);
  else await work;

  return new Response("ok", { status: 200 });
});
