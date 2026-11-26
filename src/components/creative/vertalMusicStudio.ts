// Constantes e funções puras do Vertal Music Studio (porte do Studio da MusKAI).

export const MUSIC_STUDIO_COST = 1; // créditos por música (igual ao creative-router e à edge function creative-music)

export const MUSIC_STUDIO_STYLES = [
  "Pop", "Trap Gospel", "Lo-fi", "Drill", "Funk BR", "Sertanejo", "MPB", "Samba", "Pagode", "Forró",
  "Reggaeton", "EDM", "Rock", "R&B", "Hip-Hop", "Jazz", "Cinematic", "Phonk",
];
export const MUSIC_STUDIO_MOODS = [
  "Esperançoso", "Espiritual", "Épico", "Triste", "Romântico", "Agressivo", "Nostálgico", "Sonhador", "Festivo", "Sombrio",
];
export const MUSIC_STUDIO_VOCAL_TYPES = ["Feminino", "Masculino", "Coral", "Robótico", "Sem vocal"];
export const MUSIC_STUDIO_VOCAL_TONES = ["Suave", "Agressivo", "Espiritual", "Sussurrado", "Operístico", "Rasgado"];
export const MUSIC_STUDIO_LANGUAGES = ["Português", "English", "Español", "Français", "日本語"];
export const MUSIC_STUDIO_KEYS = [
  "C major", "C minor", "C# major", "C# minor", "D major", "D minor", "D# major", "D# minor",
  "E major", "E minor", "F major", "F minor", "F# major", "F# minor", "G major", "G minor",
  "G# major", "G# minor", "A major", "A minor", "A# major", "A# minor", "B major", "B minor",
];

export type StudioLyricsMode = "auto" | "assist" | "paste";

export interface MusicJobItem {
  audio_url: string;
  image_url?: string;
  title?: string;
  duration?: number;
}

export interface MusicJobView {
  ok?: boolean;
  asset_id: string;
  status: "processing" | "completed" | "failed" | string;
  title: string;
  lyrics?: string;
  provider?: string | null;
  style?: string | null;
  mood?: string | null;
  items: MusicJobItem[];
  refunded?: boolean;
  charged?: boolean;
  created_at?: string;
}

export type MusicStage = "sending" | "processing" | "done";

export function musicStage(job: MusicJobView | null, submitting: boolean): MusicStage {
  if (submitting || !job) return "sending";
  return job.status === "processing" ? "processing" : "done";
}

/** Mensagem em pt-BR para o erro devolvido pela edge function. */
export function musicErrorMessage(error: string, code?: string): string {
  const e = `${error} ${code ?? ""}`;
  if (/insufficient_credits|deduction_failed/.test(e)) return "Créditos insuficientes para criar a música.";
  if (/rate_limit_exceeded/.test(e)) return "Muitas gerações seguidas. Aguarde um minuto e tente de novo.";
  if (/duplicate_request/.test(e)) return "Esse pedido já foi enviado. Aguarde o resultado.";
  if (/music_unavailable/.test(e)) return "A geração de música está temporariamente indisponível. Nenhum crédito foi cobrado.";
  if (/Unauthorized|401/.test(e)) return "Sua sessão expirou. Entre de novo para criar músicas.";
  if (error && !/^(internal_server_error|FunctionsHttpError)/.test(error)) return error;
  return "Não foi possível criar a música agora. Se algum crédito foi cobrado, ele volta automaticamente.";
}
