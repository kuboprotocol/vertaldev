// Vertal Avatar AI: talking photo via HeyGen Avatar IV (OpenRouter), or text → voice (MiniMax Speech-02 HD) → Kling AI Avatar v2 (fal.ai).
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
/** Kling AI Avatar v2 cost at fal.ai, kept for margin checks. */
export const AVATAR_VIDEO_USD_PER_SECOND = 0.0562;
/** Brazilian Portuguese narration runs at roughly 15 characters per second. */
const CHARS_PER_SECOND = 15;

/** Credits for the narration audio (charged up front). */
export function avatarVoiceCredits(chars: number): number {
  return Math.max(1, Math.ceil((chars / 1000) * TTS_USD_PER_1000_CHARS * CREDITS_PER_USD));
}

/** Price of the lip-sync video: 4 credits per second of real audio (decided by the owner). */
export const AVATAR_VIDEO_CREDITS_PER_SECOND = 4;

/** Credits for the lip-sync video, from the real audio length (charged once the voice exists). */
export function avatarVideoCredits(seconds: number): number {
  return Math.max(5, Math.ceil(Math.max(0, seconds) * AVATAR_VIDEO_CREDITS_PER_SECOND));
}

/** Estimated speech length of a script, in whole seconds (at least 1). */
export function estimateAvatarSeconds(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / CHARS_PER_SECOND));
}

// ── HeyGen Avatar IV (via OpenRouter) ───────────────────────────────────────────────────────────
// Default provider for talking-photo videos: HeyGen voices the script itself, so there is no separate voice charge.
// Set the AVATAR_PROVIDER=fal secret to go back to MiniMax voice + Kling lip-sync.

export const AVATAR_HEYGEN_MODEL = "heygen/avatar-iv";
/** OpenRouter price for heygen/avatar-iv. */
export const HEYGEN_USD_PER_SECOND = 0.05;
/** Owner's rule: 185% profit over cost, so price = cost × 2.85. */
export const HEYGEN_PRICE_MULTIPLIER = 2.85;
/** Seconds covered by the base price; seconds beyond it cost 20% more. */
export const HEYGEN_BASE_SECONDS = 60;
export const HEYGEN_OVER_BASE_SURCHARGE = 1.2;
/** Mirrors videoStudioConfig.ts: USD_TO_BRL and the cheapest credit package (CREDIT_VALUE_BRL.min). Tests keep them in sync. */
const USD_TO_BRL = 5.6;
const CREDIT_VALUE_BRL_MIN = 0.3;
/** Credits per second inside the base window (≈2.66). Priced on the cheapest package so the margin holds for every package. */
export const HEYGEN_CREDITS_PER_SECOND = (HEYGEN_USD_PER_SECOND * HEYGEN_PRICE_MULTIPLIER * USD_TO_BRL) / CREDIT_VALUE_BRL_MIN;

/** Credits for a HeyGen talking-photo video: base rate up to 60 s, +20% per second beyond that. */
export function heygenVideoCredits(seconds: number): number {
  const s = Math.max(0, seconds);
  const base = Math.min(s, HEYGEN_BASE_SECONDS) * HEYGEN_CREDITS_PER_SECOND;
  const extra = Math.max(s - HEYGEN_BASE_SECONDS, 0) * HEYGEN_CREDITS_PER_SECOND * HEYGEN_OVER_BASE_SURCHARGE;
  return Math.max(5, Math.ceil(base + extra));
}

/** Estimate shown before generating. With a photo the video is HeyGen (voice included); without one it is only the narration. */
export function quoteAvatar(text: string, withPhoto: boolean): { seconds: number; credits: number } {
  const seconds = estimateAvatarSeconds(text);
  const credits = withPhoto ? heygenVideoCredits(seconds) : avatarVoiceCredits(text.trim().length);
  return { seconds, credits };
}

/** Estimate for the legacy fal.ai path (AVATAR_PROVIDER=fal): narration plus Kling lip-sync billed on the audio length. */
export function quoteAvatarFal(text: string, withPhoto: boolean): { seconds: number; credits: number } {
  const seconds = estimateAvatarSeconds(text);
  const credits = avatarVoiceCredits(text.trim().length) + (withPhoto ? avatarVideoCredits(seconds) : 0);
  return { seconds, credits };
}
