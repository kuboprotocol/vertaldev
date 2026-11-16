// Lê a caixa de entrada dos canais (Instagram e WhatsApp) para o Vertal Chat.
//
// POST { channel?, contact?, limit? } → { messages, configured }. Só o dono (CHANNEL_OWNER_USER_IDS).
// "configured" diz quais canais têm os segredos definidos (só sim/não, nunca os valores).
import { z } from "npm:zod@3";
import { requireChannelOwner } from "../_shared/virtualChat/owner.ts";
import { CHANNEL_TABLE } from "../_shared/virtualChat/messageRepo.ts";
import { channelAdminClient } from "../_shared/virtualChat/adminClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Body = z.object({
  channel: z.enum(["instagram", "whatsapp"]).optional(),
  contact: z.string().regex(/^\d{4,32}$/).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    await requireChannelOwner(req);

    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      raw = {};
    }
    const parsed = Body.safeParse(raw);
    if (!parsed.success) return json(400, { error: "invalid_input" });
    const { channel, contact, limit = 20 } = parsed.data;

    const admin = channelAdminClient();
    let query = admin
      .from(CHANNEL_TABLE)
      .select("channel,direction,contact_id,display_name,kind,body,occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (channel) query = query.eq("channel", channel);
    if (contact) query = query.eq("contact_id", contact);
    const { data, error } = await query;
    if (error) throw new Error(`inbox ${error.code ?? "error"}`);

    return json(200, {
      messages: data ?? [],
      configured: {
        instagram: !!(Deno.env.get("INSTAGRAM_ACCOUNT_ID") && Deno.env.get("INSTAGRAM_ACCESS_TOKEN")),
        whatsapp: !!(Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") && Deno.env.get("WHATSAPP_ACCESS_TOKEN")),
      },
    });
  } catch (e) {
    if (e instanceof Response) {
      return new Response(e.body, { status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    console.error(`channel-inbox error: ${e instanceof Error ? e.message : "unknown"}`);
    return json(500, { error: "internal" });
  }
});
