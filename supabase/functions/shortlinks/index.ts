// Edge function `shortlinks`: hoje só atende a recompensa por anúncio TERRA ADS
// (?action=ad-status|ad-click|ad-withdraw). O sistema de shortlinks (vídeos curtos:
// create|list|delete|get-limits|record-view) foi desativado em 2026-11-26 e responde 410.

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

const SHORTLINK_ACTIONS: readonly string[] = ["create", "list", "delete", "get-limits", "record-view"];

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
  const action = url.searchParams.get("action") || "";

  // Sistema de shortlinks desativado (2026-11-26): só a recompensa TERRA ADS continua aqui.
  if (SHORTLINK_ACTIONS.includes(action)) {
    return json({ error: "shortlinks_discontinued", message: "O sistema de shortlinks foi desativado." }, 410);
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

  return json({ error: "invalid_action" }, 400);
});
