// Edge function: gerenciar shortlinks (vídeos curtos)
// POST /functions/v1/shortlinks?action=create|list|delete|get-limits|record-view

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
  const action = url.searchParams.get("action") || "list";

  // For record-view, allow without auth
  if (action === "record-view") {
    try {
      const body = await req.json() as {
        shortlink_id: string;
      };

      const db = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!
      );

      const { error } = await db.rpc("record_shortlink_view", {
        _shortlink_id: body.shortlink_id,
        _ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                    req.headers.get("x-real-ip") || null,
        _user_agent: req.headers.get("user-agent"),
      });

      if (error) throw error;
      return json({ success: true });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  // All other actions require auth
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userRes, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userRes?.user) return json({ error: "invalid_token" }, 401);
  const userId = userRes.user.id;

  // LIST shortlinks
  if (action === "list") {
    try {
      const { data, error } = await db.rpc("get_user_shortlinks_with_stats", {
        _user_id: userId,
      });

      if (error) throw error;
      return json({ shortlinks: data || [] });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  // GET LIMITS
  if (action === "get-limits") {
    try {
      const { data, error } = await db.rpc("check_shortlink_limits", {
        _user_id: userId,
      });

      if (error) throw error;

      const limits = (data as any)?.[0];
      return json({
        active_count: limits?.active_count || 0,
        max_allowed: 10,
        can_create_more: limits?.can_create_more,
        daily_base_reward: 5,
        daily_bonus_reward: limits?.daily_bonus_reward || 0,
        total_daily_reward: limits?.total_daily_reward || 5,
      });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  // CREATE shortlink
  if (action === "create") {
    try {
      const body = await req.json() as {
        title: string;
        description?: string;
        video_url: string;
        video_duration_seconds: number;
      };

      // Validate required fields
      if (!body.title || !body.video_url || !body.video_duration_seconds) {
        return json({ error: "title, video_url, and video_duration_seconds are required" }, 400);
      }

      // Validate duration (5-7 seconds)
      if (body.video_duration_seconds < 5 || body.video_duration_seconds > 7) {
        return json({ error: "Video duration must be between 5 and 7 seconds" }, 400);
      }

      // Check limits
      const { data: limitsData, error: limitsError } = await db.rpc("check_shortlink_limits", {
        _user_id: userId,
      });

      if (limitsError) throw limitsError;

      const limits = (limitsData as any)?.[0];
      if (!limits?.can_create_more) {
        return json({
          error: "shortlink_limit_reached",
          message: `Você atingiu o máximo de 10 shortlinks ativos. Arquive alguns para criar novos.`,
          active_count: limits?.active_count,
          max_allowed: 10,
        }, 403);
      }

      // Insert shortlink
      const { data, error } = await db
        .from("shortlinks")
        .insert({
          user_id: userId,
          title: body.title.substring(0, 200),
          description: body.description?.substring(0, 1000),
          video_url: body.video_url,
          video_duration_seconds: body.video_duration_seconds,
          status: "active",
        })
        .select()
        .single();

      if (error) throw error;

      return json({
        success: true,
        shortlink: data,
        message: "Shortlink criado com sucesso! Começa a ganhar 5 créditos por dia.",
      });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  // DELETE/ARCHIVE shortlink
  if (action === "delete") {
    try {
      const body = await req.json() as { shortlink_id: string };
      if (!body.shortlink_id) return json({ error: "shortlink_id required" }, 400);

      const { error } = await db
        .from("shortlinks")
        .update({ status: "archived" })
        .eq("id", body.shortlink_id)
        .eq("user_id", userId);

      if (error) throw error;
      return json({ success: true, message: "Shortlink arquivado" });
    } catch (e: any) {
      return json({ error: e.message }, 400);
    }
  }

  return json({ error: "invalid_action" }, 400);
});
