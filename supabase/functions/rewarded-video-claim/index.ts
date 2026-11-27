// Vídeo premiado (AppLixir web SDK; Google Ad Manager GPT rewarded como alternativa) na página /shortlinks.
//
// Ações (query ?action= ou campo "action" no corpo):
//   status -> estado do usuário (quantos hoje, cooldown, valor)
//   start  -> { provider? } emite um nonce de uso único ANTES do anúncio (recusa se em cooldown/limite)
//   claim  -> { nonce } depois do "complete" (AppLixir) / rewardedSlotGranted (GAM); marca o nonce
//             como usado e credita. Recusa (too_soon) se o resgate vier antes do tempo mínimo de vídeo.
//
// Checklist diário: o crédito do vídeo entra como pendente (reward_events.status='pending') e só vai
// para o saldo quando o usuário completa vídeo + 5 músicas do Kubo + TERRA ADS no dia (função daily-rewards).
// Idempotência: o nonce só credita uma vez (claim_rewarded_video trava e marca na mesma
// transação; o crédito usa a chave "rewarded_video:<nonce>" em credit_transactions).
// Cooldown e limite diário são conferidos de novo no Postgres, com o dia em America/Sao_Paulo.
//
// Env (todos opcionais): REWARDED_VIDEO_CREDITS (1), REWARDED_VIDEO_COOLDOWN_SECONDS (60),
// REWARDED_VIDEO_DAILY_CAP (10), REWARDED_VIDEO_NONCE_TTL_SECONDS (1800),
// REWARDED_VIDEO_MIN_WATCH_SECONDS (5): tempo mínimo entre o start e o claim do mesmo nonce.
import { sanitizeError } from "../_shared/cors.ts";
import { adminClient, authUserId, json, readJson, rewardsCors } from "../_shared/rewardsHttp.ts";
import {
  isValidNonce,
  newNonce,
  REWARDS_TZ,
  rewardedVideoConfig,
  rewardedVideoStatus,
  type ClaimedSession,
} from "../_shared/rewardsCore.ts";

const CLAIM_ERRORS: Record<string, number> = {
  invalid_nonce: 400,
  nonce_expired: 410,
  nonce_already_used: 409,
  daily_cap_reached: 429,
  cooldown: 429,
  too_soon: 425,
};

const PROVIDERS = new Set(["applixir", "gam"]);

function minWatchSeconds(): number {
  const n = Number.parseInt(Deno.env.get("REWARDED_VIDEO_MIN_WATCH_SECONDS") ?? "", 10);
  return Number.isFinite(n) && n >= 0 && n <= 600 ? n : 5;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: rewardsCors });

  try {
    const userId = await authUserId(req);
    if (!userId) return json({ error: "unauthorized" }, 401);

    const body = await readJson(req);
    const action = new URL(req.url).searchParams.get("action") || (body.action as string) || "status";
    const cfg = rewardedVideoConfig((n) => Deno.env.get(n));
    const admin = adminClient();

    const loadStatus = async () => {
      // 48h cobrem o dia corrente em São Paulo e o último resgate para o cooldown.
      const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      const { data, error } = await admin
        .from("rewarded_video_sessions")
        .select("claimed_at, reward_day")
        .eq("user_id", userId)
        .not("claimed_at", "is", null)
        .gte("claimed_at", since);
      if (error) throw error;
      return rewardedVideoStatus((data ?? []) as ClaimedSession[], Date.now(), cfg);
    };

    if (action === "status") {
      return json(await loadStatus());
    }

    if (action === "start") {
      if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const status = await loadStatus();
      if (!status.can_watch) return json({ error: status.reason, ...status }, 429);

      const nonce = newNonce();
      const expiresAt = new Date(Date.now() + cfg.nonceTtlSeconds * 1000).toISOString();
      const provider = PROVIDERS.has(String(body.provider)) ? String(body.provider) : "gam";
      const { error } = await admin
        .from("rewarded_video_sessions")
        .insert({ nonce, user_id: userId, expires_at: expiresAt, provider });
      if (error) throw error;
      return json({ nonce, expires_at: expiresAt, ...status });
    }

    if (action === "claim") {
      if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      if (!isValidNonce(body.nonce)) return json({ error: "invalid_nonce" }, 400);

      // Tempo mínimo de vídeo: o nonce nasce antes do anúncio; um resgate imediato é recusado
      // sem gastar o nonce (o usuário ainda pode resgatá-lo depois de assistir).
      const { data: session, error: sessionError } = await admin
        .from("rewarded_video_sessions")
        .select("created_at")
        .eq("nonce", body.nonce)
        .eq("user_id", userId)
        .maybeSingle();
      if (sessionError) throw sessionError;
      const minWatch = minWatchSeconds();
      if (session && Date.now() - Date.parse(session.created_at as string) < minWatch * 1000) {
        return json({ error: "too_soon", ...(await loadStatus()) }, CLAIM_ERRORS.too_soon);
      }

      const { data, error } = await admin.rpc("claim_rewarded_video", {
        _user_id: userId,
        _nonce: body.nonce,
        _amount: cfg.amount,
        _cooldown_seconds: cfg.cooldownSeconds,
        _daily_cap: cfg.dailyCap,
        _tz: REWARDS_TZ,
      });
      if (error) throw error;
      const result = data as {
        ok: boolean;
        error?: string;
        credits?: number;
        pending?: boolean;
        checklist?: Record<string, unknown>;
      };
      const status = await loadStatus();
      if (!result.ok) {
        const code = result.error ?? "claim_failed";
        return json({ error: code, ...status }, CLAIM_ERRORS[code] ?? 400);
      }
      // Desde o checklist diário (2026-11-26) o crédito fica pendente até o usuário completar todas as
      // atividades do dia; `pending` diz se ainda está pendente e `checklist` traz o estado do dia.
      return json({
        success: true,
        credits_earned: result.credits,
        pending: result.pending ?? false,
        checklist: result.checklist ?? null,
        ...status,
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    console.error("rewarded-video-claim error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("subscription_not_found")) return json({ error: "subscription_not_found" }, 409);
    return json({ error: sanitizeError(err) }, 500);
  }
});
