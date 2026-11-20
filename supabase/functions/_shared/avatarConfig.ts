// Vertal Avatar AI: text → voice (MiniMax Speech-02 HD, Kokoro-82M or the user's cloned voice) → optional
// talking face (Kling AI Avatar v2).
// Shared by the creative-video edge function and the Creative panel (src/config/avatarPricing.ts).

export const AVATAR_TTS_MODEL = "fal-ai/minimax/speech-02-hd";
/** Kokoro-82M (hexgrad, Apache 2.0) Brazilian Portuguese voices, served by fal.ai. */
export const AVATAR_KOKORO_MODEL = "fal-ai/kokoro/brazilian-portuguese";
export const AVATAR_VOICE_CLONE_MODEL = "fal-ai/minimax/voice-clone";
export const AVATAR_VIDEO_MODEL = "fal-ai/kling-video/ai-avatar/v2/standard";

export const AVATAR_LIMITS = {
  maxTextChars: 1000,
  /** Lip-sync jobs still queued after this are marked failed and refunded. */
  jobTimeoutMinutes: 20,
};

// ── Voice catalog ───────────────────────────────────────────────────────────────────────────────

export type AvatarVoiceProvider = "minimax" | "kokoro" | "clone";
export type AvatarVoiceGender = "male" | "female" | "neutral";

/** A voice the panel can offer. Library voices are static; "clone" entries come from avatar_user_voices. */
export interface AvatarVoiceOption {
  /** Value sent as `voice`: a catalog id ("Male", "kokoro_pf_dora") or `clone:<uuid>`. */
  id: string;
  label: string;
  provider: AvatarVoiceProvider;
  gender: AvatarVoiceGender | null;
  language: string;
}

export interface AvatarLibraryVoice extends AvatarVoiceOption {
  provider: "minimax" | "kokoro";
  gender: AvatarVoiceGender;
  /** Provider-side voice id. Resolved on the server only. */
  providerVoiceId: string;
}

export const AVATAR_VOICE_CATALOG = [
  { id: "Male", label: "Masculina (MiniMax)", provider: "minimax", providerVoiceId: "Deep_Voice_Man", gender: "male", language: "multi" },
  { id: "Female", label: "Feminina (MiniMax)", provider: "minimax", providerVoiceId: "Wise_Woman", gender: "female", language: "multi" },
  { id: "Neutral", label: "Neutra (MiniMax)", provider: "minimax", providerVoiceId: "Friendly_Person", gender: "neutral", language: "multi" },
  { id: "kokoro_pf_dora", label: "Dora (Kokoro)", provider: "kokoro", providerVoiceId: "pf_dora", gender: "female", language: "pt-BR" },
  { id: "kokoro_pm_alex", label: "Alex (Kokoro)", provider: "kokoro", providerVoiceId: "pm_alex", gender: "male", language: "pt-BR" },
  { id: "kokoro_pm_santa", label: "Santa (Kokoro)", provider: "kokoro", providerVoiceId: "pm_santa", gender: "male", language: "pt-BR" },
] as const satisfies readonly AvatarLibraryVoice[];

export type AvatarVoice = (typeof AVATAR_VOICE_CATALOG)[number]["id"];
export const DEFAULT_AVATAR_VOICE: AvatarVoice = "Male";

/** The original MiniMax presets (kept for compatibility; the env overrides AVATAR_VOICE_<KEY> still apply). */
export const AVATAR_VOICES = {
  Male: "Deep_Voice_Man",
  Female: "Wise_Woman",
  Neutral: "Friendly_Person",
} as const;

export function isAvatarVoice(v: unknown): v is AvatarVoice {
  return typeof v === "string" && AVATAR_VOICE_CATALOG.some((voice) => voice.id === v);
}

export function getLibraryVoice(id: AvatarVoice): AvatarLibraryVoice {
  return AVATAR_VOICE_CATALOG.find((voice) => voice.id === id)!;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CLONE_VOICE_PREFIX = "clone:";

export function cloneVoiceRef(id: string): string {
  return `${CLONE_VOICE_PREFIX}${id}`;
}

/** The avatar_user_voices row id inside a `clone:<uuid>` voice value, or null if it is not one. */
export function parseCloneVoiceRef(v: unknown): string | null {
  if (typeof v !== "string" || !v.startsWith(CLONE_VOICE_PREFIX)) return null;
  const id = v.slice(CLONE_VOICE_PREFIX.length).toLowerCase();
  return UUID_RE.test(id) ? id : null;
}

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

// ── Voice cloning ───────────────────────────────────────────────────────────────────────────────

export const AVATAR_CLONE_LIMITS = {
  maxVoicesPerUser: 5,
  /** MiniMax needs at least 10 s of speech. */
  minSampleSeconds: 10,
  maxSampleSeconds: 300,
  maxSampleBytes: 20 * 1024 * 1024,
  maxNameChars: 40,
};

/** Script shown in the clone dialog for the user to read aloud (~30 s). */
export const AVATAR_CLONE_SCRIPT =
  "Olá! Estou gravando esta amostra para criar a minha voz no Vertal Avatar. " +
  "Falo com calma, no meu ritmo natural, em um lugar silencioso. " +
  "Hoje o dia está bonito, o café está quente e as ideias estão fluindo. " +
  "Um, dois, três, quatro, cinco. Obrigado por ouvir até aqui!";

/** Preview spoken with the new voice at clone time. Also keeps it: MiniMax deletes clones unused for 7 days. */
export const AVATAR_CLONE_PREVIEW_TEXT =
  "Oi! Esta é a minha voz clonada no Vertal Avatar. Ficou parecida comigo?";

// ── Pricing ─────────────────────────────────────────────────────────────────────────────────────

// Same economics as the Video Studio: ~40 credits per USD of provider cost.
const CREDITS_PER_USD = 40;
/** MiniMax Speech-02 HD at fal.ai (Kokoro is $0.02/1000 chars; both use this price). */
const TTS_USD_PER_1000_CHARS = 0.1;
/** Kling AI Avatar v2 cost at fal.ai, kept for margin checks. */
export const AVATAR_VIDEO_USD_PER_SECOND = 0.0562;
/** fal.ai MiniMax voice-clone: $1.50 per clone + $0.30 per 1000 preview characters. */
export const AVATAR_VOICE_CLONE_USD = 1.5;
export const AVATAR_VOICE_CLONE_PREVIEW_USD_PER_1000_CHARS = 0.3;
/** Brazilian Portuguese narration runs at roughly 15 characters per second. */
export const AVATAR_CHARS_PER_SECOND = 15;

/** Credits for the narration audio (charged up front). Same price for every voice. */
export function avatarVoiceCredits(chars: number): number {
  return Math.max(1, Math.ceil((chars / 1000) * TTS_USD_PER_1000_CHARS * CREDITS_PER_USD));
}

/** Credits to clone a voice (with its preview), from the provider cost at 40 credits/USD: 61 credits today. */
export function avatarVoiceCloneCredits(previewChars: number = AVATAR_CLONE_PREVIEW_TEXT.length): number {
  const usd = AVATAR_VOICE_CLONE_USD + (previewChars / 1000) * AVATAR_VOICE_CLONE_PREVIEW_USD_PER_1000_CHARS;
  return Math.ceil(usd * CREDITS_PER_USD - 1e-9);
}

/** Price of the lip-sync video: 4 credits per second of real audio (decided by the owner). */
export const AVATAR_VIDEO_CREDITS_PER_SECOND = 4;

/** Credits for the lip-sync video, from the real audio length (charged once the voice exists). */
export function avatarVideoCredits(seconds: number): number {
  return Math.max(5, Math.ceil(Math.max(0, seconds) * AVATAR_VIDEO_CREDITS_PER_SECOND));
}

/** Seconds of speech estimated from the text length. */
export function estimateSpeechSeconds(chars: number): number {
  return Math.max(1, Math.ceil(chars / AVATAR_CHARS_PER_SECOND));
}

/** Estimate shown before generating; the video part is billed on the real duration. */
export function quoteAvatar(text: string, withPhoto: boolean): { seconds: number; credits: number } {
  const chars = text.trim().length;
  const seconds = estimateSpeechSeconds(chars);
  const credits = avatarVoiceCredits(chars) + (withPhoto ? avatarVideoCredits(seconds) : 0);
  return { seconds, credits };
}

// ── Audio helpers ───────────────────────────────────────────────────────────────────────────────

/** Duration of a PCM WAV file from its header (Kokoro returns WAV without a duration), or null. */
export function wavDurationSeconds(bytes: Uint8Array): number | null {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let byteRate = 0;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt " && offset + 16 <= bytes.length) {
      byteRate = view.getUint32(offset + 16, true);
    } else if (id === "data") {
      if (!byteRate) return null;
      // Streamed WAVs may carry a 0/0xFFFFFFFF size: fall back to what is actually there.
      const dataSize = size > 0 && size !== 0xffffffff ? Math.min(size, bytes.length - offset - 8) : bytes.length - offset - 8;
      const seconds = dataSize / byteRate;
      return seconds > 0 && Number.isFinite(seconds) ? seconds : null;
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}
