import { describe, expect, it } from "vitest";
import { AVATAR_DURATIONS, avatarProfit, maxWordsFor, quoteAvatar } from "./avatar";
import { CREDIT_VALUE_BRL } from "./videoStudio";

describe("avatar pricing", () => {
  it("charges 4 credits per second", () => {
    expect(quoteAvatar(15).credits).toBe(60);
    expect(quoteAvatar(30).credits).toBe(120);
    expect(quoteAvatar(60).credits).toBe(240);
  });

  it("stays well above provider cost (US$0,05/s) at every credit package", () => {
    for (const d of AVATAR_DURATIONS) {
      expect(avatarProfit(d, CREDIT_VALUE_BRL.min)).toBeGreaterThan(3.2);
      expect(avatarProfit(d, CREDIT_VALUE_BRL.standard)).toBeGreaterThan(4.7);
    }
  });

  it("caps the script so the video cannot outrun what was charged", () => {
    expect(maxWordsFor(15)).toBe(34);
    expect(maxWordsFor(60)).toBe(138);
  });
});
