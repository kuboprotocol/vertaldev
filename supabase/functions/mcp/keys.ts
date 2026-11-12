// Gestão das chaves de acesso do MCP, servida pela própria função `mcp` em
//   POST /functions/v1/mcp/keys
//   body: { action: "list" }
//         { action: "create", name, scopes: ["read"|"write"], expiresInDays: 7|30|90|365|null }
//         { action: "revoke", id }
// Autenticação: SOMENTE o JWT do usuário logado. Uma chave vtl_mcp_ não pode criar
// nem revogar outras chaves. A chave completa só volta na resposta de "create".
// Esta rota fica na função `mcp` (verify_jwt = false) para não gastar um slot de
// Edge Function; a autenticação é feita aqui, rota a rota.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, sanitizeError } from "../_shared/cors.ts";
import {
  ALLOWED_EXPIRY_DAYS,
  expiresAtFromDays,
  generateMcpKey,
  hashMcpKey,
  isKeyActive,
  isMcpAccessKey,
  mcpKeyPrefix,
  normalizeScopes,
} from "../_shared/mcpKeys.ts";

const MAX_ACTIVE_KEYS = 10;
const LIST_COLUMNS = "id,name,key_prefix,scopes,created_at,last_used_at,expires_at,revoked_at";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function badRequest(message: string) {
  return json({ error: message }, 400);
}

/** Rota de chaves. Retorna sempre uma Response; nunca lança. */
export async function handleKeys(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  // Chave MCP não gerencia chaves: só o login do usuário.
  if (!token || isMcpAccessKey(token)) return json({ error: "login necessário" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const userDb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userDb.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "invalid token" }, 401);
    const userId = userData.user.id;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return badRequest("JSON inválido");
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    switch (body.action) {
      case "list": {
        // RLS: o select do usuário já restringe às próprias chaves.
        const { data, error } = await userDb
          .from("mcp_access_keys")
          .select(LIST_COLUMNS)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw new Error(error.message);
        return json({ keys: data ?? [] });
      }

      case "create": {
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name || name.length > 60) return badRequest("Dê um nome de até 60 caracteres à chave");

        let scopes;
        try {
          scopes = normalizeScopes(body.scopes);
        } catch (e) {
          return badRequest(e instanceof Error ? e.message : "Nível de acesso inválido");
        }

        const days = body.expiresInDays === undefined ? null : body.expiresInDays;
        if (!(ALLOWED_EXPIRY_DAYS as readonly unknown[]).includes(days)) {
          return badRequest("Validade inválida");
        }

        const { data: existing, error: countErr } = await admin
          .from("mcp_access_keys")
          .select("revoked_at,expires_at")
          .eq("user_id", userId);
        if (countErr) throw new Error(countErr.message);
        const active = (existing ?? []).filter((k) => isKeyActive(k)).length;
        if (active >= MAX_ACTIVE_KEYS) {
          return badRequest(`Você já tem ${MAX_ACTIVE_KEYS} chaves ativas. Revogue uma para criar outra.`);
        }

        const key = generateMcpKey();
        const { data: record, error } = await admin
          .from("mcp_access_keys")
          .insert({
            user_id: userId,
            name,
            key_prefix: mcpKeyPrefix(key),
            key_hash: await hashMcpKey(key),
            scopes,
            expires_at: expiresAtFromDays(days as number | null),
          })
          .select(LIST_COLUMNS)
          .single();
        if (error) throw new Error(error.message);

        return json({ key, record }, 201);
      }

      case "revoke": {
        const id = typeof body.id === "string" ? body.id : "";
        if (!/^[0-9a-f-]{36}$/i.test(id)) return badRequest("id inválido");
        const { data, error } = await admin
          .from("mcp_access_keys")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", userId)
          .is("revoked_at", null)
          .select("id")
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return json({ error: "Chave não encontrada ou já revogada" }, 404);
        return json({ ok: true });
      }

      default:
        return badRequest("Ação desconhecida");
    }
  } catch (err) {
    return json({ error: sanitizeError(err) }, 500);
  }
}
