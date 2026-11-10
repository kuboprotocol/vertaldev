// Edge function: gerenciar shortlinks (vídeos curtos)
// POST /functions/v1/shortlinks?action=create|list|delete|get-limits|record-view
// Recompensa por anúncio TERRA ADS: ?action=ad-status|ad-click|ad-withdraw

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  AD_REWARD_ACTIONS,
  AD_TYPE_CLICK,
  AD_TYPE_WITHDRAWAL,
  handleAdReward,
  type AdRewardAction,
  type AdRewardRow,
  type AdRewardStore,
} from "../_shared/adRewardsCore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // supabase-js manda apikey e x-client-info; sem eles o navegador barra a chamada no preflight.
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-action, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Acesso ao banco para a recompensa por anúncio. Usa service role: `ad_rewards` só aceita
// escrita do backend, e o topup de créditos só roda como service_role.
function adRewardStore(): AdRewardStore {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const PAGE = 1000;
  return {
    async listRows(userId) {
      const rows: AdRewardRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin
          .from("ad_rewards")
          .select("ad_type, reward_credits, created_at")
          .eq("user_id", userId)
          .in("ad_type", [AD_TYPE_CLICK, AD_TYPE_WITHDRAWAL])
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...((data ?? []) as AdRewardRow[]));
        if (!data || data.length < PAGE) return rows;
      }
    },
    async insertRow(row) {
      const { error } = await admin.from("ad_rewards").insert(row);
      if (!error) return "ok";
      if (error.code === "23505") return "conflict";
      throw error;
    },
    async deleteRow(id) {
      const { error } = await admin.from("ad_rewards").delete().eq("id", id);
      if (error) throw error;
    },
    async topup(userId, amount, idempotencyKey) {
      const { error } = await admin.rpc("execute_atomic_credit_topup", {
        _user_id: userId,
        _amount: amount,
        _reason: "reward:terra_ads",
        _category: "ad_reward",
        _metadata: { source: "terra_ads" },
        _idempotency_key: idempotencyKey,
      });
      if (error) throw error;
    },
  };
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

  // Recompensa por anúncio TERRA ADS
  if (AD_REWARD_ACTIONS.includes(action)) {
    try {
      const result = await handleAdReward(action as AdRewardAction, userId, adRewardStore());
      return json(result.body, result.status);
    } catch (e: any) {
      console.error("[shortlinks] ad reward failed:", e);
      return json({ error: "ad_reward_failed" }, 500);
    }
  }

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
