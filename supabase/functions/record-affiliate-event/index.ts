// Edge function: registrar eventos de afiliados (cliques, signups, conversões)
// POST /functions/v1/record-affiliate-event

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface EventPayload {
  embed_code: string;
  event_type: string;
  user_ip?: string | null;
  user_agent?: string;
  referrer?: string;
  converted_user_id?: string;
  metadata?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: EventPayload;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!body.embed_code || !body.event_type) {
    return json({ error: "embed_code and event_type required" }, 400);
  }

  // Validar event_type
  if (!["click", "signup", "conversion"].includes(body.event_type)) {
    return json({ error: "invalid_event_type" }, 400);
  }

  try {
    // Extrair IP real do cliente (pode estar atrás de proxy)
    let userIp: string | null = null;
    const xForwardedFor = req.headers.get("x-forwarded-for");
    const xRealIp = req.headers.get("x-real-ip");

    if (xForwardedFor) {
      userIp = xForwardedFor.split(",")[0].trim();
    } else if (xRealIp) {
      userIp = xRealIp;
    }

    // Registrar evento usando a função SQL
    const { data, error } = await db.rpc("record_affiliate_event", {
      _embed_code: body.embed_code,
      _event_type: body.event_type,
      _user_ip: userIp ? `${userIp}::inet` : null,
      _user_agent: body.user_agent || null,
      _referrer: body.referrer || null,
      _converted_user_id: body.converted_user_id || null,
      _metadata: body.metadata || null,
    });

    if (error) {
      console.error("Error recording affiliate event:", error);
      // Não retorna erro para o cliente (não queremos bloquear o embed)
      return json({ success: false, error: error.message }, 500);
    }

    return json({ success: true, event_id: data });
  } catch (e: any) {
    console.error("Unexpected error:", e);
    return json({ success: false, error: e.message }, 500);
  }
});
