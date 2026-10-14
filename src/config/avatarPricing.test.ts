import { describe, expect, it } from "vitest";
import { AVATAR_VOICES, avatarVideoCredits, avatarVoiceCredits, isAvatarVoice, quoteAvatar } from "./avatarPricing";
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
      expect(margin(avatarVideoCredits(seconds), seconds * 0.0562)).toBeGreaterThanOrEqual(MIN_MARGIN);
    }
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
});
