import { describe, expect, it } from "vitest";
import { AVATAR_DURATIONS, AVATAR_MARKUP, avatarProfit, maxWordsFor, quoteAvatar } from "./avatar";
import { CREDIT_VALUE_BRL } from "./videoStudio";

describe("avatar pricing", () => {
  it("charges 4.2 credits per second (US$0,05/s × 4,5 at R$0,30/credit)", () => {
    expect(quoteAvatar(15).credits).toBe(63);
    expect(quoteAvatar(30).credits).toBe(126);
    expect(quoteAvatar(60).credits).toBe(252);
  });

  it("keeps at least 350% profit over provider cost even at the cheapest credit package", () => {
    for (const d of AVATAR_DURATIONS) {
      expect(avatarProfit(d, CREDIT_VALUE_BRL.min)).toBeGreaterThanOrEqual(AVATAR_MARKUP - 1e-9);
      expect(avatarProfit(d, CREDIT_VALUE_BRL.standard)).toBeGreaterThan(AVATAR_MARKUP);
    }
  });

  it("follows the provider price when it changes", () => {
    expect(quoteAvatar(30, 0.1).credits).toBe(252);
  });

  it("caps the script so the video cannot outrun what was charged", () => {
    expect(maxWordsFor(15)).toBe(34);
    expect(maxWordsFor(60)).toBe(138);
  });
});
