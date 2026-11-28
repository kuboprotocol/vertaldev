/**
 * Player alternativo das músicas do Kubo com os PRÓPRIOS arquivos do artista (masters enviados pelo
 * dono ao Supabase Storage, bucket público `kubo-music`, arquivo `<track_id>.mp3`).
 *
 * Por quê: no celular o embed do Spotify só toca uma prévia curta (sem login no navegador) e exige
 * um toque dentro do iframe. Com <audio> da própria página o toque no nome da faixa já é o gesto
 * do usuário, a faixa toca inteira e a medição é a mesma (ListeningMeter + sessão do servidor).
 *
 * DESLIGADO por padrão. Liga com VITE_KUBO_OWN_AUDIO=mobile (só celular) ou =all (todos), depois de
 * subir os 5 MP3. Nunca usa URLs de prévia do Spotify (p.scdn.co): só arquivos do próprio Kubo.
 */
export const KUBO_OWN_AUDIO_BUCKET = "kubo-music";

export type OwnAudioMode = "off" | "mobile" | "all";

export function ownAudioMode(raw: string | undefined): OwnAudioMode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "all" || v === "true" || v === "1") return "all";
  if (v === "mobile") return "mobile";
  return "off";
}

export function shouldUseOwnAudio(mode: OwnAudioMode, touch: boolean): boolean {
  return mode === "all" || (mode === "mobile" && touch);
}

export function kuboOwnAudioUrl(supabaseUrl: string, trackId: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${KUBO_OWN_AUDIO_BUCKET}/${encodeURIComponent(trackId)}.mp3`;
}

export const KUBO_OWN_AUDIO_MODE: OwnAudioMode = ownAudioMode(
  import.meta.env.VITE_KUBO_OWN_AUDIO as string | undefined,
);

export const KUBO_SUPABASE_URL: string =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "https://sccizjlpwezsgaxkclot.supabase.co";
