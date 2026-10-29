import { describe, expect, it } from "vitest";
import {
  AVATAR_VIDEO_USD_PER_SECOND,
  AVATAR_VOICES,
  HEYGEN_BASE_SECONDS,
  HEYGEN_CREDITS_PER_SECOND,
  HEYGEN_OVER_BASE_SURCHARGE,
  HEYGEN_PRICE_MULTIPLIER,
  HEYGEN_USD_PER_SECOND,
  avatarVideoCredits,
  avatarVoiceCredits,
  heygenVideoCredits,
  isAvatarVoice,
  quoteAvatar,
  quoteAvatarFal,
} from "./avatarPricing";
import { CREDIT_VALUE_BRL, MIN_MARGIN, USD_TO_BRL } from "./videoStudio";

const margin = (credits: number, costUsd: number) => {
  const revenue = credits * CREDIT_VALUE_BRL.min;
  return (revenue - costUsd * USD_TO_BRL) / revenue;
};

describe("avatar pricing", () => {
  it("keeps the voice above the margin floor", () => {
    for (const chars of [1, 250, 999, 1000]) {
      expect(margin(avatarVoiceCredits(chars), (chars / 1000) * 0.1)).toBeGreaterThanOrEqual(MIN_MARGIN);
    }
  });

  it("keeps the lip-sync video above the margin floor", () => {
    for (const seconds of [1, 10, 30, 67.4, 120]) {
      expect(margin(avatarVideoCredits(seconds), seconds * AVATAR_VIDEO_USD_PER_SECOND)).toBeGreaterThanOrEqual(MIN_MARGIN);
    }
  });

  it("charges the lip-sync video at 4 credits per second", () => {
    expect(avatarVideoCredits(15)).toBe(60);
    expect(avatarVideoCredits(30)).toBe(120);
    expect(avatarVideoCredits(67.4)).toBe(270);
    expect(avatarVideoCredits(0.5)).toBe(5);
  });

  it("charges only the voice without a photo", () => {
    const text = "Olá, bem-vindo ao futuro da criação de conteúdo.";
    expect(quoteAvatar(text, false).credits).toBe(avatarVoiceCredits(text.length));
    expect(quoteAvatar(text, true).credits).toBeGreaterThan(quoteAvatar(text, false).credits);
  });

  it("maps the panel voices", () => {
    expect(Object.keys(AVATAR_VOICES)).toEqual(["Male", "Female", "Neutral"]);
    expect(isAvatarVoice("Female")).toBe(true);
    expect(isAvatarVoice("toString")).toBe(false);
  });

  describe("HeyGen Avatar IV", () => {
    const costBrl = (seconds: number) => seconds * HEYGEN_USD_PER_SECOND * USD_TO_BRL;

    it("stays in sync with the credit value and exchange rate used by the Video Studio", () => {
      expect(HEYGEN_CREDITS_PER_SECOND).toBeCloseTo((HEYGEN_USD_PER_SECOND * HEYGEN_PRICE_MULTIPLIER * USD_TO_BRL) / CREDIT_VALUE_BRL.min, 10);
    });

    it("charges cost x 2.85 (185% profit) up to 60 seconds", () => {
      expect(HEYGEN_PRICE_MULTIPLIER).toBe(2.85);
      expect(heygenVideoCredits(60)).toBe(Math.ceil(60 * HEYGEN_CREDITS_PER_SECOND));
      for (const seconds of [5, 10, 30, 60]) {
        expect(heygenVideoCredits(seconds) * CREDIT_VALUE_BRL.min).toBeGreaterThanOrEqual(costBrl(seconds) * HEYGEN_PRICE_MULTIPLIER - 1e-9);
      }
    });

    it("charges 20% more per second beyond 60 seconds", () => {
      expect(HEYGEN_BASE_SECONDS).toBe(60);
      expect(HEYGEN_OVER_BASE_SURCHARGE).toBe(1.2);
      const extra = heygenVideoCredits(90) - heygenVideoCredits(60);
      expect(extra).toBeGreaterThanOrEqual(Math.floor(30 * HEYGEN_CREDITS_PER_SECOND * 1.2));
      expect(extra).toBeLessThanOrEqual(Math.ceil(30 * HEYGEN_CREDITS_PER_SECOND * 1.2) + 1);
      for (const seconds of [61, 90, 120]) {
        expect(heygenVideoCredits(seconds) * CREDIT_VALUE_BRL.min).toBeGreaterThanOrEqual(costBrl(seconds) * HEYGEN_PRICE_MULTIPLIER);
      }
    });

    it("quotes a photo video with HeyGen (voice included) and keeps the fal quote available", () => {
      const text = "Olá, bem-vindo ao futuro da criação de conteúdo com inteligência artificial.";
      const { seconds, credits } = quoteAvatar(text, true);
      expect(credits).toBe(heygenVideoCredits(seconds));
      expect(quoteAvatarFal(text, true).credits).toBe(avatarVoiceCredits(text.length) + avatarVideoCredits(seconds));
    });
  });
});
