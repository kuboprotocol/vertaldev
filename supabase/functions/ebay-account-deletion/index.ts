// ============================================================
// Edge Function: ebay-account-deletion
// Notificações de exclusão de conta do eBay (Marketplace Account Deletion),
// exigidas para o keyset de produção do app "Vertal Dev" no eBay Developers.
//
//   GET  ?challenge_code=X -> {challengeResponse: sha256(X + token + endpoint)}
//   POST notificação       -> 204; a conexão eBay do Vertal Fluxos com esse
//                             userId é apagada pelo dono no Vertal Dev (o motor só
//                             guarda o token, que o eBay revoga junto com a conta).
//
// Segredos: EBAY_VERIFICATION_TOKEN (32–80 caracteres [A-Za-z0-9_-]) e
// EBAY_DELETION_ENDPOINT (a URL exata cadastrada no eBay).
// URL: https://<ref>.supabase.co/functions/v1/ebay-account-deletion (verify_jwt = false)
// ============================================================

export async function challengeResponse(code: string, token: string, endpoint: string): Promise<string> {
  const bytes = new TextEncoder().encode(code + token + endpoint);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function handle(req: Request, env: (k: string) => string | undefined): Promise<Response> {
  const token = env("EBAY_VERIFICATION_TOKEN");
  const endpoint = env("EBAY_DELETION_ENDPOINT");
  if (!token || !endpoint) return json({ error: "not_configured" }, 503);
  const url = new URL(req.url);
  if (req.method === "GET") {
    const code = url.searchParams.get("challenge_code");
    if (!code || code.length > 512) return json({ error: "missing_challenge_code" }, 400);
    return json({ challengeResponse: await challengeResponse(code, token, endpoint) });
  }
  if (req.method === "POST") {
    const text = await req.text();
    if (text.length > 20_000) return json({ error: "too_large" }, 413);
    let topic = "";
    try {
      topic = JSON.parse(text)?.metadata?.topic ?? "";
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    // Sem dados pessoais no log: só o tipo do aviso.
    console.log(JSON.stringify({ event: "ebay_account_deletion", topic }));
    return new Response(null, { status: 204 });
  }
  return json({ error: "method_not_allowed" }, 405);
}

if (import.meta.main) {
  Deno.serve((req) => handle(req, (k) => Deno.env.get(k)));
}
