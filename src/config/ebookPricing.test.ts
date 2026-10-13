import { describe, expect, it } from "vitest";
import { clampChapters, ebookCost, EBOOK_DEFAULT_CHAPTERS, EBOOK_MAX_CHAPTERS, EBOOK_MIN_CHAPTERS } from "./ebookPricing";

describe("ebookPricing", () => {
  it("cobra o preço com 20% de desconto de lançamento por faixa", () => {
    expect(ebookCost(3)).toMatchObject({ listCredits: 60, credits: 48 });
    expect(ebookCost(8)).toMatchObject({ listCredits: 60, credits: 48 });
    expect(ebookCost(9)).toMatchObject({ listCredits: 90, credits: 72 });
    expect(ebookCost(12)).toMatchObject({ listCredits: 90, credits: 72 });
    expect(ebookCost(15)).toMatchObject({ listCredits: 120, credits: 96 });
  });

  it("limita o número de capítulos", () => {
    expect(clampChapters(1)).toBe(EBOOK_MIN_CHAPTERS);
    expect(clampChapters(99)).toBe(EBOOK_MAX_CHAPTERS);
    expect(clampChapters("abc")).toBe(EBOOK_DEFAULT_CHAPTERS);
    expect(ebookCost(99).credits).toBe(96);
  });
});
