// Envia uma mensagem pelo canal (Instagram ou WhatsApp) em nome do dono, a pedido do Vertal Chat.
//
// POST { channel, to, text }. Só o dono (CHANNEL_OWNER_USER_IDS) envia; o resto recebe 403.
// Janela de 24 h: texto livre só para quem escreveu nas últimas 24 h. Fora dela → 409 outside_window.
// O chat sempre pede confirmação do usuário antes de chamar esta função.
import { z } from "npm:zod@3";
import { isFreeformWindowOpen, buildWhatsAppTextMessages } from "../_shared/virtualChat/whatsapp.ts";
import { buildInstagramTextMessages, isInstagramWindowOpen } from "../_shared/virtualChat/instagram.ts";
import { postGraph } from "../_shared/virtualChat/graphSend.ts";
import { requireChannelOwner } from "../_shared/virtualChat/owner.ts";
import { lastInboundAt, storeChannelMessage } from "../_shared/virtualChat/messageRepo.ts";
import { channelAdminClient } from "../_shared/virtualChat/adminClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Body = z.object({
  channel: z.enum(["instagram", "whatsapp"]),
  to: z.string().regex(/^\d{4,32}$/),
  text: z.string().trim().min(1).max(4000),
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    await requireChannelOwner(req);

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return json(400, { error: "invalid_input" });
    }
    const parsed = Body.safeParse(raw);
    if (!parsed.success) return json(400, { error: "invalid_input" });
    const { channel, to, text } = parsed.data;

    const admin = channelAdminClient();
    const last = await lastInboundAt(admin, channel, to);
    const now = Date.now();
    const windowOpen = channel === "instagram" ? isInstagramWindowOpen(last, now) : isFreeformWindowOpen(last, now);
    if (!windowOpen) return json(409, { error: "outside_window" });

    const isIg = channel === "instagram";
    const igAccountId = Deno.env.get("INSTAGRAM_ACCOUNT_ID") ?? "";
    const igToken = Deno.env.get("INSTAGRAM_ACCESS_TOKEN") ?? "";
    const waPhoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
    const waToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
    const configured = isIg ? !!(igAccountId && igToken) : !!(waPhoneId && waToken);
    if (!configured) return json(503, { error: "channel_not_configured" });

    const requests = isIg
      ? buildInstagramTextMessages({ igAccountId, recipientId: to, text })
      : buildWhatsAppTextMessages({ phoneNumberId: waPhoneId, to, text });
    const token = isIg ? igToken : waToken;

    let lastProviderId: string | null = null;
    for (const r of requests) {
      const res = await postGraph(r.path, token, r.body);
      if (!res.ok) {
        // Status apenas: o corpo da Meta pode trazer dados do cliente.
        console.error(`channel-send failed: channel=${channel} status=${res.status}`);
        return json(502, { error: "send_failed", status: res.status });
      }
      lastProviderId = res.providerId;
      const part = (r.body as { message?: { text?: string }; text?: { body?: string } });
      const partText = part.message?.text ?? part.text?.body ?? "";
      // A mensagem já saiu: falha ao gravar o histórico não pode virar erro de envio.
      try {
        await storeChannelMessage(admin, {
          channel,
          direction: "out",
          contact_id: to,
          display_name: null,
          message_id: res.providerId ?? `out:${crypto.randomUUID()}`,
          kind: "text",
          body: partText,
          occurred_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error(`channel-send store failed: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    return json(200, { ok: true, message_id: lastProviderId });
  } catch (e) {
    if (e instanceof Response) {
      return new Response(e.body, { status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    console.error(`channel-send error: ${e instanceof Error ? e.message : "unknown"}`);
    return json(500, { error: "internal" });
  }
});
