// Heartbeat do Vertal Node (apps desktop Electron e Android), independente do SDK de banda usado.
//
// POST (padrão) -> { device_id, platform: "desktop"|"android", provider?, app_version?, opted_in, running }
//   provider: "cashraven" (padrão de VERTAL_NODE_PROVIDERS) | "honeygain" (aguardando aprovação;
//   religar com VERTAL_NODE_PROVIDERS=cashraven,honeygain) | "pawns" | "bright" | "infatica" |
//   "earnfm" (quando liberados em VERTAL_NODE_PROVIDERS). Ausente = "honeygain" (apps antigos).
//   Atualiza o dispositivo (um provedor por dispositivo). Credita VERTAL_NODE_DAILY_CREDITS
//   (padrão 2) uma vez por usuário por dia (America/Sao_Paulo), só quando opted_in E running.
//   Vários dispositivos ou provedores no mesmo dia NÃO multiplicam o crédito, a não ser que
//   VERTAL_NODE_CREDIT_PER_PROVIDER=true (aí é 1x por provedor por dia). O provedor vai em
//   reward_events.metadata.provider.
// GET ?action=summary -> créditos ganhos compartilhando internet (ledger reward_events) e dispositivos.
//
// Autenticação: token do usuário (Authorization: Bearer <access_token do Supabase>).
import { sanitizeError } from "../_shared/cors.ts";
import { adminClient, authUserId, json, readJson, rewardsCors } from "../_shared/rewardsHttp.ts";
import { nodeConfig, parseHeartbeat, REWARDS_TZ, rewardDay, sumCredits } from "../_shared/rewardsCore.ts";

// Fontes do ledger que contam como "Vertal Node" (honeygain_node = linhas da versão anterior).
const NODE_SOURCES = ["vertal_node", "honeygain_node"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: rewardsCors });

  try {
    const userId = await authUserId(req);
    if (!userId) return json({ error: "unauthorized" }, 401);

    const admin = adminClient();
    const cfg = nodeConfig((n) => Deno.env.get(n));
    const body = await readJson(req);
    const action = new URL(req.url).searchParams.get("action") || (body.action as string) || (req.method === "GET" ? "summary" : "heartbeat");

    if (action === "summary") {
      const [{ data: events, error: e1 }, { data: nodes, error: e2 }] = await Promise.all([
        admin.from("reward_events").select("credits, reward_day").eq("user_id", userId).in("source", NODE_SOURCES),
        admin
          .from("vertal_nodes")
          .select("device_id, platform, provider, opted_in, running, last_seen_at")
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
        active_days: new Set(rows.map((r) => r.reward_day)).size,
        credited_today: rows.some((r) => r.reward_day === today),
        devices: nodes ?? [],
      });
    }

    if (action !== "heartbeat" || req.method !== "POST") return json({ error: "unknown_action" }, 400);

    const parsed = parseHeartbeat(body, cfg.enabledProviders);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.error === "provider_disabled" ? 403 : 400);
    const hb = parsed.value;

    const { data, error } = await admin.rpc("record_vertal_node_heartbeat", {
      _user_id: userId,
      _device_id: hb.device_id,
      _platform: hb.platform,
      _provider: hb.provider,
      _app_version: hb.app_version,
      _opted_in: hb.opted_in,
      _running: hb.running,
      _amount: cfg.dailyAmount,
      _per_provider: cfg.creditPerProvider,
      _tz: REWARDS_TZ,
    });
    if (error) throw error;
    return json(data);
  } catch (err) {
    console.error("vertal-node-heartbeat error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("subscription_not_found")) return json({ error: "subscription_not_found" }, 409);
    return json({ error: sanitizeError(err) }, 500);
  }
});
