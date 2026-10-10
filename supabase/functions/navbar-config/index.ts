// Edge function: Gerenciar configurações de navbar dos apps
// GET /functions/v1/navbar-config?action=get&app_id=<app_id>
// POST /functions/v1/navbar-config?action=save

import { createClient } from "npm:@supabase/supabase-js@2";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userRes, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userRes?.user) return json({ error: "invalid_token" }, 401);

  const userId = userRes.user.id;

  // Pegar configuração de navbar
  if (action === "get") {
    try {
      const appId = url.searchParams.get("app_id");
      if (!appId) return json({ error: "app_id required" }, 400);

      const { data, error } = await db
        .from("app_navbar_configs")
        .select("*")
        .eq("app_id", appId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return json({ error: "Navbar config not found" }, 404);
      }

      return json({ config: data });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  // Salvar configuração de navbar
  if (action === "save") {
    try {
      const body = await req.json() as {
        app_id: string;
        logo_url?: string;
        logo_app_id?: string;
        logo_height?: number;
        bg_color?: string;
        text_color?: string;
        accent_color?: string;
        position?: string;
        shadow?: boolean;
        rounded?: string;
        menu_items?: Array<any>;
        show_search?: boolean;
        show_auth_buttons?: boolean;
        sticky_top?: string;
        z_index?: string;
        padding?: string;
        transparency?: string;
        is_active?: boolean;
      };

      const {
        app_id,
        logo_url,
        logo_app_id,
        logo_height = 40,
        bg_color = "#ffffff",
        text_color = "#000000",
        accent_color = "#0066ff",
        position = "sticky",
        shadow = true,
        rounded = "lg",
        menu_items = [],
        show_search = false,
        show_auth_buttons = true,
        sticky_top = "top-0",
        z_index = "z-50",
        padding = "px-6 h-16",
        transparency = "opacity-100",
        is_active = true,
      } = body;

      if (!app_id) return json({ error: "app_id required" }, 400);

      // Upsert navbar config
      const { data, error } = await db
        .from("app_navbar_configs")
        .upsert({
          app_id,
          user_id: userId,
          logo_url: logo_url || null,
          logo_app_id: logo_app_id || null,
          logo_height,
          bg_color,
          text_color,
          accent_color,
          position,
          shadow,
          rounded,
          menu_items,
          show_search,
          show_auth_buttons,
          sticky_top,
          z_index,
          padding,
          transparency,
          is_active,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "app_id,user_id",
        })
        .select("*")
        .single();

      if (error) throw error;

      return json({ success: true, config: data });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  // Deletar configuração de navbar
  if (action === "delete") {
    try {
      const appId = url.searchParams.get("app_id");
      if (!appId) return json({ error: "app_id required" }, 400);

      const { error } = await db
        .from("app_navbar_configs")
        .delete()
        .eq("app_id", appId)
        .eq("user_id", userId);

      if (error) throw error;

      return json({ success: true, message: "Navbar config deleted" });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  return json({ error: "invalid_action" }, 400);
});
