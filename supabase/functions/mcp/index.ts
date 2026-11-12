// Edge function `mcp`: endpoint MCP do Vertal Vibe Dev.
//   POST /functions/v1/mcp                                      → JSON-RPC (MCP)
//   POST /functions/v1/mcp/keys                                 → gestão das chaves (JWT do usuário, keys.ts)
//   GET  /functions/v1/mcp/.well-known/oauth-protected-resource → metadados OAuth
// verify_jwt = false: a função valida o token ela mesma, porque o 401 precisa
// do cabeçalho WWW-Authenticate para o cliente MCP achar o login, e as chaves
// vtl_mcp_ não são JWT (o gateway as rejeitaria antes de chegar aqui).
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleMessage, type JsonRpcRequest, type Scope } from "./server.ts";
import { hashMcpKey, hasValidMcpKeyShape, isKeyActive, isMcpAccessKey } from "../_shared/mcpKeys.ts";
import { handleKeys } from "./keys.ts";

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

type Auth = { userId: string; scopes: Scope[]; db: ReturnType<typeof createClient> };

/**
 * Chave vtl_mcp_: valida o hash no banco e usa service role, filtrando sempre
 * pelo dono da chave (não há JWT para o RLS trabalhar). Retorna null se inválida.
 */
async function authFromAccessKey(token: string): Promise<Auth | null> {
  if (!hasValidMcpKeyShape(token)) return null;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: row, error } = await admin
    .from("mcp_access_keys")
    .select("id,user_id,scopes,expires_at,revoked_at")
    .eq("key_hash", await hashMcpKey(token))
    .maybeSingle();
  if (error || !row || !isKeyActive(row)) return null;

  // Marca o uso sem bloquear a resposta em caso de falha.
  try {
    await admin.from("mcp_access_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  } catch {
    // ignorado: o uso é só informativo
  }
  return { userId: row.user_id, scopes: row.scopes as Scope[], db: admin };
}

/** Access token do Supabase Auth (OAuth): acesso total, como o próprio usuário, com RLS. */
async function authFromJwt(token: string): Promise<Auth | null> {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userRes, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userRes?.user) return null;
  return { userId: userRes.user.id, scopes: ["read", "write"], db };
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

  // Gestão das chaves (tela /mcp): só JWT do usuário, tratada em keys.ts.
  if (url.pathname.endsWith("/keys")) return handleKeys(req);

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
  if (!token) return unauthorized("Login ou chave de acesso necessária");

  const auth = isMcpAccessKey(token) ? await authFromAccessKey(token) : await authFromJwt(token);
  if (!auth) {
    return unauthorized(
      isMcpAccessKey(token) ? "Chave inválida, revogada ou expirada" : "Token inválido ou expirado",
    );
  }
  const ctx = { db: auth.db, userId: auth.userId, scopes: auth.scopes };

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
