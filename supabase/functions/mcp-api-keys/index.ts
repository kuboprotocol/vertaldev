// Edge function: gerenciar MCP API keys (gerar, listar, revogar)
// POST /functions/v1/mcp-api-keys?action=generate|list|revoke

import { createClient } from "npm:@supabase/supabase-js@2";
import { crypto } from "npm:std@0.208.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Gera uma chave aleatória no formato: sk_live_XXXXX...XXXXX (128 chars total)
function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `sk_live_${hex}`;
}

// Cria preview da chave (primeiros 6 + últimos 4 chars)
function createKeyPreview(fullKey: string): string {
  const start = fullKey.substring(0, 12);
  const end = fullKey.substring(fullKey.length - 6);
  return `${start}***${end}`;
}

// Hash SHA-256 da chave para armazenar de forma segura
async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userRes, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userRes?.user) return json({ error: "invalid_token" }, 401);
  const userId = userRes.user.id;

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "list";

  if (action === "generate") {
    try {
      const body = await req.json() as { name?: string };
      const keyName = (body?.name || "Default").substring(0, 100);
      const fullKey = generateApiKey();
      const keyHash = await hashKey(fullKey);
      const keyPreview = createKeyPreview(fullKey);

      const { data, error } = await db
        .from("mcp_api_keys")
        .insert({
          user_id: userId,
          key_hash: keyHash,
          key_preview: keyPreview,
          name: keyName,
        })
        .select("id, key_preview, name, created_at")
        .single();

      if (error) throw error;

      return json({
        success: true,
        key: fullKey, // Retorna a chave APENAS uma vez (usuário deve guardar)
        key_preview: keyPreview,
        message: "Save this key somewhere safe. You won't see it again!",
        data,
      });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  if (action === "list") {
    try {
      const { data, error } = await db
        .from("mcp_api_keys")
        .select("id, key_preview, name, created_at, last_used_at, revoked_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return json({ keys: data });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  if (action === "revoke") {
    try {
      const body = await req.json() as { key_id: string };
      if (!body.key_id) return json({ error: "key_id required" }, 400);

      const { error } = await db
        .from("mcp_api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", body.key_id)
        .eq("user_id", userId);

      if (error) throw error;
      return json({ success: true, message: "Key revoked" });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  return json({ error: "invalid_action" }, 400);
});
