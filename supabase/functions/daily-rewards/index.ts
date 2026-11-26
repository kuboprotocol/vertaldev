// Checklist diário de recompensas + músicas do Kubo (painel /recompensas).
//
// Para liberar as recompensas do dia (America/Sao_Paulo) o usuário precisa completar TODAS as
// atividades: 1 vídeo premiado, as 5 músicas do Kubo e 1 anúncio TERRA ADS. Até lá os créditos do
// dia ficam pendentes (reward_events.status = 'pending'); quando o checklist fecha,
// public.release_daily_rewards os soma ao saldo (execute_atomic_credit_topup, idempotente).
//
// Ações (query ?action= ou campo "action" no corpo):
//   status        -> checklist do dia (vídeo, músicas faixa a faixa, TERRA ADS, créditos pendentes/liberados)
//   music-start   -> { track_id } abre uma sessão de escuta (nonce); fecha as outras do usuário
//   music-report  -> { nonce, listened_seconds } tempo de reprodução real acumulado nessa sessão.
//                    O servidor aceita no máximo o tempo de relógio desde o music-start (+2 s) e a
//                    duração da faixa; repetir o mesmo valor não soma de novo.
//
// Env (opcionais): KUBO_MUSIC_MIN_SECONDS (30) segundos por faixa para contar;
// KUBO_MUSIC_CREDITS (1) crédito pendente ao completar as 5 faixas no dia;
// KUBO_MUSIC_MIN_REPORT_INTERVAL_SECONDS (2); KUBO_MUSIC_MAX_STARTS_PER_HOUR (60).
import { sanitizeError } from "../_shared/cors.ts";
import { adminClient, authUserId, json, readJson, rewardsCors } from "../_shared/rewardsHttp.ts";
import { isValidNonce, REWARDS_TZ } from "../_shared/rewardsCore.ts";

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(Deno.env.get(name) ?? "", 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

const MUSIC_ERRORS: Record<string, number> = {
  invalid_track: 400,
  invalid_nonce: 400,
  rate_limited: 429,
  too_fast: 429,
  session_closed: 409,
  nonce_expired: 410,
};

const TRACK_ID = /^[A-Za-z0-9]{22}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: rewardsCors });

  try {
    const userId = await authUserId(req);
    if (!userId) return json({ error: "unauthorized" }, 401);

    const body = await readJson(req);
    const action = new URL(req.url).searchParams.get("action") || (body.action as string) || "status";
    const admin = adminClient();
    const threshold = intEnv("KUBO_MUSIC_MIN_SECONDS", 30, 5, 600);

    const status = async () => {
      // release_daily_rewards também expira pendentes antigos e fecha o dia se tudo estiver feito.
      const { data, error } = await admin.rpc("release_daily_rewards", { _user_id: userId, _tz: REWARDS_TZ });
      if (error) throw error;
      return { ...(data as Record<string, unknown>), music_min_seconds: threshold };
    };

    if (action === "status") return json(await status());

    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    if (action === "music-start") {
      const trackId = String(body.track_id ?? "");
      if (!TRACK_ID.test(trackId)) return json({ error: "invalid_track" }, 400);
      const { data, error } = await admin.rpc("start_kubo_music_session", {
        _user_id: userId,
        _track_id: trackId,
        _ttl_seconds: 1800,
        _max_starts_per_hour: intEnv("KUBO_MUSIC_MAX_STARTS_PER_HOUR", 60, 5, 1000),
      });
      if (error) throw error;
      const result = data as { ok: boolean; error?: string };
      if (!result.ok) return json(result, MUSIC_ERRORS[result.error ?? ""] ?? 400);
      return json({ ...result, music_min_seconds: threshold });
    }

    if (action === "music-report") {
      if (!isValidNonce(body.nonce)) return json({ error: "invalid_nonce" }, 400);
      const listened = Number(body.listened_seconds);
      if (!Number.isFinite(listened) || listened < 0 || listened > 3600) {
        return json({ error: "invalid_listened_seconds" }, 400);
      }
      const { data, error } = await admin.rpc("record_kubo_music_progress", {
        _user_id: userId,
        _nonce: body.nonce,
        _listened_seconds: Math.round(listened * 100) / 100,
        // 2 s de tolerância: os eventos do player chegam em intervalos, e a prévia de quem não está
        // logado no Spotify tem ~30 s cravados (mediria 29,x s).
        _threshold_seconds: Math.max(1, threshold - 2),
        _amount: intEnv("KUBO_MUSIC_CREDITS", 1, 0, 100),
        _min_report_interval_seconds: intEnv("KUBO_MUSIC_MIN_REPORT_INTERVAL_SECONDS", 2, 0, 60),
        _tz: REWARDS_TZ,
      });
      if (error) throw error;
      const result = data as { ok: boolean; error?: string };
      if (!result.ok) return json(result, MUSIC_ERRORS[result.error ?? ""] ?? 400);
      return json({ ...result, music_min_seconds: threshold });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    console.error("daily-rewards error:", err);
    return json({ error: sanitizeError(err) }, 500);
  }
});
