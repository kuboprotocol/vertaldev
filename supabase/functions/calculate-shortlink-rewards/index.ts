// Edge function: recompensas diárias de shortlinks — DESATIVADA em 2026-11-26.
// O sistema de shortlinks saiu do painel de recompensas (/recompensas). O cron
// `calculate-shortlink-rewards-daily` foi removido (migration 20261126230000) e esta
// função não credita mais nada; responde 410 para qualquer chamada antiga.
// Tabelas e dados de shortlinks continuam no banco, intactos.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(
    JSON.stringify({ success: false, processed: 0, error: "shortlinks_discontinued" }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
