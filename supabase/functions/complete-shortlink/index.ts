// Edge function: concluir shortlink e creditar — DESATIVADA em 2026-11-26.
// O sistema de shortlinks saiu do painel de recompensas (/recompensas) e não credita
// mais nada; responde 410. Os dados (shortlink_clicks etc.) continuam no banco.
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(JSON.stringify({ error: "shortlinks_discontinued" }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
