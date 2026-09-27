// Edge function: gerenciar instalações de embed para afiliados
// POST /functions/v1/affiliate-installs?action=create|list|update|delete|stats

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

// Gera código único no formato: aff_XXXXXXXXXXXXX (16 chars após prefixo)
function generateEmbedCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `aff_${hex}`;
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

  if (action === "create") {
    try {
      const body = await req.json() as { domain: string; description?: string };
      if (!body.domain) return json({ error: "domain required" }, 400);

      // Validar que é um domínio válido
      try {
        new URL(`https://${body.domain}`);
      } catch {
        return json({ error: "invalid_domain" }, 400);
      }

      // Verificar se já existe install ativo para este domínio
      const { data: existing } = await db
        .from("affiliate_installs")
        .select("id")
        .eq("affiliate_id", userId)
        .eq("domain", body.domain)
        .eq("status", "active")
        .single();

      if (existing) {
        return json({ error: "domain_already_installed" }, 400);
      }

      const embedCode = generateEmbedCode();
      const { data, error } = await db
        .from("affiliate_installs")
        .insert({
          affiliate_id: userId,
          embed_code: embedCode,
          domain: body.domain,
          description: body.description?.substring(0, 500),
        })
        .select("id, embed_code, domain, description, created_at")
        .single();

      if (error) throw error;

      return json({
        success: true,
        install: data,
        embedCode: embedCode,
        htmlSnippet: `<script>
window.__VERTAL_AFFILIATE = {
  code: "${embedCode}",
  domain: "https://vertal.app"
};
</script>
<script src="https://embed.vertal.app/affiliate.js"></script>`,
      });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  if (action === "list") {
    try {
      const { data, error } = await db
        .from("affiliate_installs")
        .select("id, embed_code, domain, description, status, created_at, last_activity_at")
        .eq("affiliate_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return json({ installs: data });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  if (action === "stats") {
    try {
      const { data, error } = await db
        .from("affiliate_install_stats")
        .select("*")
        .eq("affiliate_id", userId);

      if (error) throw error;
      return json({ stats: data });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  if (action === "update") {
    try {
      const body = await req.json() as { install_id: string; status?: string; description?: string };
      if (!body.install_id) return json({ error: "install_id required" }, 400);

      const update: Record<string, any> = {};
      if (body.status) update.status = body.status;
      if (body.description) update.description = body.description.substring(0, 500);

      const { error } = await db
        .from("affiliate_installs")
        .update(update)
        .eq("id", body.install_id)
        .eq("affiliate_id", userId);

      if (error) throw error;
      return json({ success: true });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  if (action === "delete") {
    try {
      const body = await req.json() as { install_id: string };
      if (!body.install_id) return json({ error: "install_id required" }, 400);

      const { error } = await db
        .from("affiliate_installs")
        .update({ status: "removed" })
        .eq("id", body.install_id)
        .eq("affiliate_id", userId);

      if (error) throw error;
      return json({ success: true, message: "Install removed" });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  return json({ error: "invalid_action" }, 400);
});
