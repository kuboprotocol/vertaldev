// Vertal Avatar AI: talking avatars (photo + script → lip-synced video) via HeyGen Avatar IV on OpenRouter.
// Pure TypeScript with no Deno/browser APIs: imported by the edge function and by the frontend
// (src/config/avatar.ts re-exports it), so the price shown to users and the price charged never diverge.
import { CREDIT_VALUE_BRL, USD_TO_BRL } from "./videoStudioConfig.ts";

export const AVATAR_MODEL = "heygen/avatar-iv";

/** OpenRouter list price for heygen/avatar-iv (USD per generated second). Used only for margin math. */
export const AVATAR_PROVIDER_COST_USD_PER_SECOND = 0.05;

/** Price charged to the user: 4 credits per second of video (decided by the owner). */
export const AVATAR_CREDITS_PER_SECOND = 4;

export const AVATAR_DURATIONS = [15, 30, 60] as const;
export type AvatarDuration = (typeof AVATAR_DURATIONS)[number];

export type AvatarAspectKey = "9:16" | "1:1" | "16:9";
export const AVATAR_ASPECTS: Record<AvatarAspectKey, string> = {
  "9:16": "Vertical (Reels, TikTok, Shorts)",
  "1:1": "Quadrado (Feed)",
  "16:9": "Horizontal (YouTube)",
};

export type AvatarResolution = "720p" | "1080p";

export const AVATAR_LIMITS = {
  /** Spoken pace used to cap the script so the video cannot run (and cost) longer than what was charged. */
  wordsPerSecond: 2.3,
  maxScriptChars: 1500,
  /** Jobs still unfinished after this are marked failed and refunded. */
  jobTimeoutMinutes: 20,
} as const;

export function isAvatarDuration(v: unknown): v is AvatarDuration {
  return typeof v === "number" && (AVATAR_DURATIONS as readonly number[]).includes(v);
}
export function isAvatarAspect(v: unknown): v is AvatarAspectKey {
  return typeof v === "string" && v in AVATAR_ASPECTS;
}
export function isAvatarResolution(v: unknown): v is AvatarResolution {
  return v === "720p" || v === "1080p";
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function maxWordsFor(duration: AvatarDuration): number {
  return Math.floor(duration * AVATAR_LIMITS.wordsPerSecond);
}

/** Credits for one avatar video, plus what it costs us at the provider. */
export function quoteAvatar(duration: AvatarDuration, costUsdPerSecond: number = AVATAR_PROVIDER_COST_USD_PER_SECOND) {
  const credits = duration * AVATAR_CREDITS_PER_SECOND;
  return {
    credits,
    providerCostBrl: duration * costUsdPerSecond * USD_TO_BRL,
    priceBrl: credits * CREDIT_VALUE_BRL.standard,
  };
}

/** Profit over cost (1 = 100%) of a quote when credits were bought at `creditValueBrl`. */
export function avatarProfit(duration: AvatarDuration, creditValueBrl: number = CREDIT_VALUE_BRL.min): number {
  const { credits, providerCostBrl } = quoteAvatar(duration);
  return (credits * creditValueBrl - providerCostBrl) / providerCostBrl;
}
