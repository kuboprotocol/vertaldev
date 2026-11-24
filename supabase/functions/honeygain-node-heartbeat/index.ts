// Heartbeat do Vertal Node (app desktop Electron e app Android com o Honeygain SDK).
//
// POST (padrão) -> { device_id, platform: "desktop"|"android", app_version?, opted_in, running }
//   Atualiza o dispositivo. Credita HONEYGAIN_NODE_DAILY_CREDITS (padrão 2) uma vez por usuário
//   por dia (America/Sao_Paulo), e só quando opted_in E running. Vários dispositivos no mesmo dia
//   não multiplicam o crédito.
// GET ?action=summary -> créditos ganhos compartilhando internet (ledger reward_events) e dispositivos.
//
// Autenticação: token do usuário (Authorization: Bearer <access_token do Supabase>).
import { sanitizeError } from "../_shared/cors.ts";
import { adminClient, authUserId, json, readJson, rewardsCors } from "../_shared/rewardsHttp.ts";
import { honeygainConfig, parseHeartbeat, REWARDS_TZ, rewardDay, sumCredits } from "../_shared/rewardsCore.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: rewardsCors });

  try {
    const userId = await authUserId(req);
    if (!userId) return json({ error: "unauthorized" }, 401);

    const admin = adminClient();
    const cfg = honeygainConfig((n) => Deno.env.get(n));
    const body = await readJson(req);
    const action = new URL(req.url).searchParams.get("action") || (body.action as string) || (req.method === "GET" ? "summary" : "heartbeat");

    if (action === "summary") {
      const [{ data: events, error: e1 }, { data: nodes, error: e2 }] = await Promise.all([
        admin.from("reward_events").select("credits, reward_day").eq("user_id", userId).eq("source", "honeygain_node"),
        admin
          .from("honeygain_nodes")
          .select("device_id, platform, opted_in, running, last_seen_at")
          .eq("user_id", userId)
          .order("last_seen_at", { ascending: false }),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const today = rewardDay(Date.now());
      const rows = (events ?? []) as { credits: number; reward_day: string }[];
      return json({
        daily_credits: cfg.dailyAmount,
        total_credits: sumCredits(rows),
        active_days: rows.length,
        credited_today: rows.some((r) => r.reward_day === today),
        devices: nodes ?? [],
      });
    }

    if (action !== "heartbeat" || req.method !== "POST") return json({ error: "unknown_action" }, 400);

    const parsed = parseHeartbeat(body);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const hb = parsed.value;

    const { data, error } = await admin.rpc("record_honeygain_heartbeat", {
      _user_id: userId,
      _device_id: hb.device_id,
      _platform: hb.platform,
      _app_version: hb.app_version,
      _opted_in: hb.opted_in,
      _running: hb.running,
      _amount: cfg.dailyAmount,
      _tz: REWARDS_TZ,
    });
    if (error) throw error;
    return json(data);
  } catch (err) {
    console.error("honeygain-node-heartbeat error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("subscription_not_found")) return json({ error: "subscription_not_found" }, 409);
    return json({ error: sanitizeError(err) }, 500);
  }
});
