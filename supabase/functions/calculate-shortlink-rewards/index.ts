// Edge function: calcular recompensas diárias de shortlinks
// POST /functions/v1/calculate-shortlink-rewards
// Deve ser chamado uma vez por dia (meia-noite) via cron

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all users with active shortlinks
    const { data: usersWithShortlinks, error: usersError } = await db
      .from("shortlinks")
      .select("user_id")
      .eq("status", "active")
      .distinct();

    if (usersError) throw usersError;

    if (!usersWithShortlinks || usersWithShortlinks.length === 0) {
      return json({
        success: true,
        processed: 0,
        message: "No users with active shortlinks",
      });
    }

    // Get unique user IDs
    const uniqueUserIds = [...new Set(usersWithShortlinks.map(u => (u as any).user_id))];

    const results: any[] = [];
    let processed = 0;
    let errors = [];

    // Calculate rewards for each user
    for (const userId of uniqueUserIds) {
      try {
        const { data, error } = await db.rpc("calculate_shortlink_rewards", {
          _user_id: userId,
          _reward_date: new Date().toISOString().split('T')[0],
        });

        if (error) {
          errors.push({ userId, error: error.message });
          continue;
        }

        if (data && data.length > 0) {
          const reward = data[0];
          results.push({
            userId,
            base_reward: reward.base_reward,
            bonus_reward: reward.bonus_reward,
            total_reward: reward.total_reward,
            user_balance_after: reward.user_balance_after,
          });
          processed++;
        }
      } catch (e: any) {
        errors.push({ userId, error: e.message });
      }
    }

    return json({
      success: true,
      processed,
      results,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});
