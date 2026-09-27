// Edge function `mcp`: endpoint MCP do Vertal Vibe Dev.
//   POST /functions/v1/mcp                                      → JSON-RPC (MCP)
//   GET  /functions/v1/mcp/.well-known/oauth-protected-resource → metadados OAuth
// verify_jwt = false: a função valida o token ela mesma, porque o 401 precisa
// do cabeçalho WWW-Authenticate para o cliente MCP achar o login.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleMessage, type JsonRpcRequest } from "./server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, x-client-info, apikey",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

function endpoints() {
  const base = Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "");
  const resource = `${base}/functions/v1/mcp`;
  return {
    resource,
    metadataUrl: `${resource}/.well-known/oauth-protected-resource`,
    issuer: `${base}/auth/v1`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const { resource, metadataUrl, issuer } = endpoints();

  if (req.method === "GET" && url.pathname.endsWith("/.well-known/oauth-protected-resource")) {
    return json({
      resource,
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      resource_name: "Vertal Vibe Dev",
    });
  }

  // Sem estado: não há stream GET nem sessão para encerrar.
  if (req.method === "GET" || req.method === "DELETE") {
    return new Response(null, { status: 405, headers: { ...corsHeaders, Allow: "POST, OPTIONS" } });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const unauthorized = (description: string) =>
    json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: description } }, 401, {
      "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl}", error="invalid_token", error_description="${description}"`,
    });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return unauthorized("Login necessário");

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userRes, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userRes?.user) return unauthorized("Token inválido ou expirado");
  const ctx = { db, userId: userRes.user.id };

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }

  if (Array.isArray(body)) {
    if (body.length === 0) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }, 400);
    const replies = (await Promise.all(body.map((m) => handleMessage(m as JsonRpcRequest, ctx)))).filter((r) => r !== null);
    return replies.length ? json(replies) : new Response(null, { status: 202, headers: corsHeaders });
  }

  const reply = await handleMessage(body as JsonRpcRequest, ctx);
  return reply === null ? new Response(null, { status: 202, headers: corsHeaders }) : json(reply);
});
