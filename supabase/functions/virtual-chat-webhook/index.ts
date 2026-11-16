// Webhook do canal WhatsApp Business (Meta Cloud API) para o Vertal Chat.
//
// GET  → handshake de verificação do webhook (hub.challenge).
// POST → valida X-Hub-Signature-256, normaliza as mensagens, responde só aos números
//        permitidos (WHATSAPP_ALLOWED_WA_IDS) e devolve 200 de imediato para a Meta não reenviar.
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

async function sendText(to: string, text: string): Promise<void> {
  const requests = buildWhatsAppTextMessages({ phoneNumberId: PHONE_NUMBER_ID, to, text });
  for (const r of requests) {
    const res = await fetch(`https://graph.facebook.com/${r.path}`, {
      method: r.method,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(r.body),
    });
    if (!res.ok) {
      // Sem corpo de resposta nos logs: pode conter dados do cliente.
      console.error(`whatsapp send failed: status=${res.status} graph=${WHATSAPP_GRAPH_VERSION}`);
    }
  }
}

async function handleInbound(msg: NormalizedInbound): Promise<void> {
  if (!ALLOWED_IDS.has(msg.externalUserId)) {
    // Remetente fora da lista: ignora sem responder, para não gerar custo de IA nem mensagens.
    return;
  }
  if (!rememberMessage(msg.messageId)) return;

  if (msg.kind !== "text" || !msg.text) {
    await sendText(msg.externalUserId, NON_TEXT_NOTICE);
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
    await sendText(msg.externalUserId, content);
  } catch (err) {
    console.error(`whatsapp reply failed: ${err instanceof Error ? err.message : "unknown"}`);
    await sendText(msg.externalUserId, FALLBACK_ERROR);
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
  const work = Promise.all(messages.map((m) => handleInbound(m).catch((e) => {
    console.error(`whatsapp inbound error: ${e instanceof Error ? e.message : "unknown"}`);
  })));

  // Responde 200 já; o processamento continua em segundo plano quando o runtime permite.
  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(work);
  else await work;

  return new Response("ok", { status: 200 });
});
