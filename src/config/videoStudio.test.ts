import { describe, expect, it } from "vitest";
import {
  CREDIT_VALUE_BRL,
  MIN_MARGIN,
  VIDEO_TIERS,
  buildFalInput,
  buildMotionPrompt,
  quoteVideo,
  tierMargin,
  type VideoTierKey,
} from "./videoStudio";

const tiers = Object.keys(VIDEO_TIERS) as VideoTierKey[];

describe("video studio pricing", () => {
  it.each(tiers)("%s clears the margin floor at the cheapest credit package", (tier) => {
    expect(tierMargin(tier, CREDIT_VALUE_BRL.min)).toBeGreaterThanOrEqual(MIN_MARGIN);
  });

  it.each(tiers)("%s keeps at least 60%% margin at the standard credit price", (tier) => {
    expect(tierMargin(tier, CREDIT_VALUE_BRL.standard)).toBeGreaterThanOrEqual(0.6);
  });

  it("charges Express a flat fee regardless of image count", () => {
    expect(quoteVideo("express", 1).credits).toBe(2);
    expect(quoteVideo("express", 10).credits).toBe(2);
  });

  it("charges AI tiers per image", () => {
    expect(quoteVideo("realistic", 3).credits).toBe(36);
    expect(quoteVideo("ultra", 10).credits).toBe(220);
  });

  it("only AI tiers have a fal model and Express keeps the watermark", () => {
    expect(VIDEO_TIERS.express.falModel).toBeUndefined();
    expect(VIDEO_TIERS.express.watermark).toBe(true);
    expect(VIDEO_TIERS.realistic.falModel).toMatch(/^fal-ai\//);
    expect(VIDEO_TIERS.ultra.falModel).toMatch(/^fal-ai\//);
  });
});

describe("fal inputs", () => {
  it("builds model-specific payloads", () => {
    expect(buildFalInput("realistic", "https://x/img.png", "p")).toMatchObject({ image_url: "https://x/img.png", duration: "6" });
    expect(buildFalInput("ultra", "https://x/img.png", "p")).toMatchObject({ duration: "5", prompt: "p" });
    expect(() => buildFalInput("express", "https://x/img.png", "p")).toThrow();
  });

  it("combines style prompt with user prompt and caption", () => {
    const p = buildMotionPrompt("meme", "gato dançando", "quando o pix cai");
    expect(p).toContain("comedic");
    expect(p).toContain("gato dançando. quando o pix cai");
    expect(buildMotionPrompt("promo")).not.toMatch(/\.\s*$/);
  });
});
