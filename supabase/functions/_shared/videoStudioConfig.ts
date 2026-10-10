// Vertal Video Studio: tiers, pricing, templates and fal.ai inputs.
// Pure TypeScript with no Deno/browser APIs: imported by the edge function and by the frontend
// (src/config/videoStudio.ts re-exports it), so prices shown to users and charged by the server never diverge.

export const VIDEO_LIMITS = {
  minImages: 1,
  maxImages: 10,
  maxCaptionChars: 120,
  maxTitleChars: 80,
  maxPromptChars: 400,
  /** Jobs still unfinished after this are marked failed and refunded. */
  jobTimeoutMinutes: 30,
} as const;

/** Revenue per credit in BRL. MIN is the cheapest bulk package (500 credits for R$150). */
export const CREDIT_VALUE_BRL = { min: 0.3, standard: 0.4 } as const;
/** Conservative FX rate for margin math. */
export const USD_TO_BRL = 5.6;
/** Margin floor every tier must clear even when bought at the cheapest package price. */
export const MIN_MARGIN = 0.5;

export type VideoTierKey = "express" | "realistic" | "ultra";
export type VideoStyleKey = "music" | "meme" | "promo" | "story";
export type VideoAspectKey = "9:16" | "1:1" | "16:9";

export interface VideoTier {
  key: VideoTierKey;
  label: string;
  tagline: string;
  engine: "local" | "fal";
  /** Flat charge per video (Express). */
  creditsPerVideo: number;
  /** Charge per AI-animated image (AI tiers). */
  creditsPerClip: number;
  /** Conservative provider cost per clip, used only for margin checks. */
  providerCostUsdPerClip: number;
  clipSeconds: number;
  /** fal.ai model id; override at runtime with FAL_MODEL_<TIER> env vars. */
  falModel?: string;
  watermark: boolean;
}

export const VIDEO_TIERS: Record<VideoTierKey, VideoTier> = {
  express: {
    key: "express",
    label: "Express",
    tagline: "Movimento cinematográfico, pronto em segundos",
    engine: "local",
    creditsPerVideo: 2,
    creditsPerClip: 0,
    providerCostUsdPerClip: 0,
    clipSeconds: 3,
    watermark: true,
  },
  realistic: {
    key: "realistic",
    label: "Realista",
    tagline: "Cada foto ganha vida com IA (MiniMax Hailuo)",
    engine: "fal",
    creditsPerVideo: 0,
    creditsPerClip: 12,
    providerCostUsdPerClip: 0.3,
    clipSeconds: 6,
    falModel: "fal-ai/minimax/hailuo-02/standard/image-to-video",
    watermark: false,
  },
  ultra: {
    key: "ultra",
    label: "Ultra Realista",
    tagline: "Qualidade de cinema (Kling Pro)",
    engine: "fal",
    creditsPerVideo: 0,
    creditsPerClip: 22,
    providerCostUsdPerClip: 0.55,
    clipSeconds: 5,
    falModel: "fal-ai/kling-video/v2.1/pro/image-to-video",
    watermark: false,
  },
};

export interface VideoStyle {
  key: VideoStyleKey;
  label: string;
  description: string;
  motionPrompt: string;
}

export const VIDEO_STYLES: Record<VideoStyleKey, VideoStyle> = {
  music: {
    key: "music",
    label: "Clipe Musical",
    description: "Cortes no ritmo, letra na tela e capa de abertura",
    motionPrompt:
      "cinematic music video shot, smooth camera movement, dramatic lighting, natural motion, rhythmic energy",
  },
  meme: {
    key: "meme",
    label: "Meme",
    description: "Texto clássico em cima e embaixo, reação exagerada",
    motionPrompt:
      "funny exaggerated reaction, expressive face, quick handheld camera, comedic timing, natural motion",
  },
  promo: {
    key: "promo",
    label: "Anúncio / Produto",
    description: "Título forte, legenda e chamada para ação",
    motionPrompt:
      "premium commercial shot, slow dolly-in, product showcase, soft studio lighting, elegant motion",
  },
  story: {
    key: "story",
    label: "Story / Narrativa",
    description: "Legendas estilo Reels contando uma história",
    motionPrompt:
      "cinematic storytelling shot, gentle parallax camera, natural lifelike motion, warm tones",
  },
};

export const VIDEO_ASPECTS: Record<VideoAspectKey, { width: number; height: number; label: string }> = {
  "9:16": { width: 720, height: 1280, label: "Vertical (TikTok, Reels, Shorts)" },
  "1:1": { width: 720, height: 720, label: "Quadrado (Feed)" },
  "16:9": { width: 1280, height: 720, label: "Horizontal (YouTube)" },
};

export function isVideoTier(v: unknown): v is VideoTierKey {
  return typeof v === "string" && v in VIDEO_TIERS;
}
export function isVideoStyle(v: unknown): v is VideoStyleKey {
  return typeof v === "string" && v in VIDEO_STYLES;
}
export function isVideoAspect(v: unknown): v is VideoAspectKey {
  return typeof v === "string" && v in VIDEO_ASPECTS;
}

export function quoteVideo(tier: VideoTierKey, imageCount: number) {
  const t = VIDEO_TIERS[tier];
  const count = Math.max(0, Math.floor(imageCount));
  const credits = t.creditsPerVideo + t.creditsPerClip * count;
  const providerCostBrl = t.providerCostUsdPerClip * count * USD_TO_BRL;
  return {
    credits,
    priceBrl: credits * CREDIT_VALUE_BRL.standard,
    providerCostBrl,
  };
}

/** Gross margin of one clip (or one Express video) when credits were bought at `creditValueBrl`. */
export function tierMargin(tier: VideoTierKey, creditValueBrl: number = CREDIT_VALUE_BRL.min): number {
  const t = VIDEO_TIERS[tier];
  const revenue = (t.engine === "local" ? t.creditsPerVideo : t.creditsPerClip) * creditValueBrl;
  const cost = t.providerCostUsdPerClip * USD_TO_BRL;
  return revenue === 0 ? 0 : (revenue - cost) / revenue;
}

export function buildMotionPrompt(style: VideoStyleKey, userPrompt?: string, caption?: string): string {
  const parts = [VIDEO_STYLES[style].motionPrompt];
  const extra = [userPrompt, caption].map((s) => (s ?? "").trim()).filter(Boolean).join(". ");
  if (extra) parts.push(extra.slice(0, VIDEO_LIMITS.maxPromptChars));
  return parts.join(". ");
}

export function buildFalInput(tier: VideoTierKey, imageUrl: string, prompt: string): Record<string, unknown> {
  if (tier === "realistic") {
    return { prompt, image_url: imageUrl, duration: "6", prompt_optimizer: true };
  }
  if (tier === "ultra") {
    return {
      prompt,
      image_url: imageUrl,
      duration: "5",
      negative_prompt: "blur, distort, low quality, deformed hands, watermark, text artifacts",
      cfg_scale: 0.5,
    };
  }
  throw new Error(`tier_has_no_ai:${tier}`);
}
