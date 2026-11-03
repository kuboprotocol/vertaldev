// Retired: domain purchases are paid by card at checkout now (see domain-checkout).
// This used to debit credits and order at IONOS before any payment was taken, which put the
// domain cost on the platform's account. Kept only so old clients get a clear answer.
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({ error: "use_domain_checkout" }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
