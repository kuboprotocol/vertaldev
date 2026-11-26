import { supabase } from "@/integrations/supabase/client";

/**
 * Checklist diário de recompensas (/recompensas).
 *
 * Para liberar as recompensas do dia (America/Sao_Paulo) o usuário precisa completar TODAS as
 * atividades: assistir 1 vídeo premiado, ouvir as 5 músicas do Kubo e ver 1 anúncio TERRA ADS.
 * Até lá os créditos ficam pendentes; quem decide é o servidor (função `daily-rewards`).
 */
export const DAILY_CHECKLIST_NOTICE =
  "Para ganhar suas recompensas, complete todas as atividades do dia: assista ao vídeo, ouça as 5 músicas do Kubo e veja o anúncio TERRA ADS.";

/** Segundos de reprodução real para uma faixa contar (o servidor tem a palavra final). */
export const KUBO_MUSIC_MIN_SECONDS = 30;

export const KUBO_SPOTIFY_ARTIST_URL = "https://open.spotify.com/artist/6yeUux05YsNyKo3Cbfgpu7";

export interface KuboTrack {
  track_id: string;
  title: string;
  duration_seconds: number;
}

/** As 5 faixas do Kubo (mesma lista da tabela public.kubo_music_tracks). */
export const KUBO_TRACKS: KuboTrack[] = [
  { track_id: "21WDwktTTX1IYwsrnN7mk9", title: "Milagre em Códgo", duration_seconds: 162 },
  { track_id: "02ph1xmr2fPzONA7uXS6I7", title: "Kubo é Vida", duration_seconds: 183 },
  { track_id: "0ksUwTc8HCB7KbJ0yHEPvx", title: "Vibe Elevvada", duration_seconds: 140 },
  { track_id: "5o4iRiBgxjFTyIeYbctSq3", title: "Deus no Comando", duration_seconds: 129 },
  { track_id: "3ArhPi46d9w8jR6jobBL6y", title: "Vibe que não para", duration_seconds: 154 },
];

export interface ChecklistTrack extends KuboTrack {
  listened_seconds: number;
  counted: boolean;
}

/** Estado do dia, como a função `daily-rewards` (e public.release_daily_rewards) devolve. */
export interface DailyChecklist {
  day: string;
  video_done: boolean;
  videos_today: number;
  music_done: boolean;
  music_tracks_counted: number;
  music_tracks_total: number;
  tracks: ChecklistTrack[];
  terra_done: boolean;
  terra_today: number;
  completed: boolean;
  completed_at: string | null;
  pending_credits: number;
  released_credits: number;
  expired_credits: number;
  just_completed?: boolean;
  released_now?: number;
  music_min_seconds?: number;
}

export interface MusicStartResult {
  ok: boolean;
  nonce?: string;
  error?: string;
}

export interface MusicReportResult {
  ok: boolean;
  error?: string;
  track_id?: string;
  accepted_seconds?: number;
  track_listened_seconds?: number;
  track_counted?: boolean;
  checklist?: DailyChecklist;
}

async function callDailyRewards<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(`daily-rewards?action=${action}`, {
    method: "POST",
    body: { ...body, action },
  });
  if (error) {
    // Recusas de regra (too_fast, session_closed...) vêm com { ok:false, error } no corpo.
    const payload = await (error as { context?: Response }).context?.json?.().catch(() => null);
    if (payload && typeof payload === "object" && "ok" in payload) return payload as T;
    throw error;
  }
  return data as T;
}

export const fetchDailyChecklist = () => callDailyRewards<DailyChecklist>("status");
export const startMusicSession = (trackId: string) =>
  callDailyRewards<MusicStartResult>("music-start", { track_id: trackId });
export const reportMusicProgress = (nonce: string, listenedSeconds: number) =>
  callDailyRewards<MusicReportResult>("music-report", { nonce, listened_seconds: listenedSeconds });

export { ListeningMeter, type PlaybackState } from "@/lib/listeningMeter";
