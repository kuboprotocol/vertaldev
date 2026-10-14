// Vertal Avatar AI: text → voice (MiniMax Speech-02 HD) → optional talking face (Kling AI Avatar v2).
// Shared by the creative-video edge function and the Creative panel (src/config/avatarPricing.ts).

export const AVATAR_TTS_MODEL = "fal-ai/minimax/speech-02-hd";
export const AVATAR_VIDEO_MODEL = "fal-ai/kling-video/ai-avatar/v2/standard";

export const AVATAR_LIMITS = {
  maxTextChars: 1000,
  /** Lip-sync jobs still queued after this are marked failed and refunded. */
  jobTimeoutMinutes: 20,
};

export const AVATAR_VOICES = {
  Male: "Deep_Voice_Man",
  Female: "Wise_Woman",
  Neutral: "Friendly_Person",
} as const;
export type AvatarVoice = keyof typeof AVATAR_VOICES;

export function isAvatarVoice(v: unknown): v is AvatarVoice {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(AVATAR_VOICES, v);
}

// Same economics as the Video Studio: ~40 credits per USD of provider cost.
const CREDITS_PER_USD = 40;
const TTS_USD_PER_1000_CHARS = 0.1;
const VIDEO_USD_PER_SECOND = 0.0562;
/** Brazilian Portuguese narration runs at roughly 15 characters per second. */
const CHARS_PER_SECOND = 15;

/** Credits for the narration audio (charged up front). */
export function avatarVoiceCredits(chars: number): number {
  return Math.max(1, Math.ceil((chars / 1000) * TTS_USD_PER_1000_CHARS * CREDITS_PER_USD));
}

/** Credits for the lip-sync video, from the real audio length (charged once the voice exists). */
export function avatarVideoCredits(seconds: number): number {
  return Math.max(5, Math.ceil(Math.max(0, seconds) * VIDEO_USD_PER_SECOND * CREDITS_PER_USD));
}

/** Estimate shown before generating; the video part is billed on the real duration. */
export function quoteAvatar(text: string, withPhoto: boolean): { seconds: number; credits: number } {
  const chars = text.trim().length;
  const seconds = Math.max(1, Math.ceil(chars / CHARS_PER_SECOND));
  const credits = avatarVoiceCredits(chars) + (withPhoto ? avatarVideoCredits(seconds) : 0);
  return { seconds, credits };
}
