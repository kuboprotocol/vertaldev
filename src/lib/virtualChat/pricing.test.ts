import { describe, expect, it } from "vitest";
import {
  CREDIT_VALUE_USD,
  MIN_CHARGE_CREDITS,
  MIN_GROSS_MARGIN,
  TARGET_GROSS_MARGIN,
  costUsd,
  fileReadUsage,
  meetsMarginFloor,
  quote,
} from "./pricing";

describe("pricing: custo", () => {
  it("soma LLM, OCR e mensagens com as taxas", () => {
    const c = costUsd({ llmInputTokens: 1_000_000, llmOutputTokens: 1_000_000, pagesExtracted: 100 });
    // 1 USD de entrada + 5 USD de saída + 100 * 0,002 USD de OCR
    expect(c).toBeCloseTo(6.2, 6);
  });

  it("uso vazio custa zero", () => {
    expect(costUsd({})).toBe(0);
  });
});

describe("pricing: cotação", () => {
  it("nunca cobra menos que o mínimo de créditos", () => {
    const q = quote({});
    expect(q.credits).toBe(MIN_CHARGE_CREDITS);
    expect(q.priceUsd).toBeCloseTo(CREDIT_VALUE_USD, 6);
  });

  it("preço cobre o custo com a margem alvo, sem ficar abaixo do piso", () => {
    const usages = [
      { llmInputTokens: 2_500, llmOutputTokens: 800 },
      { pagesExtracted: 37, llmInputTokens: 9_000, llmOutputTokens: 1_200 },
      { llmInputTokens: 123_456, llmOutputTokens: 40_000, pagesExtracted: 1 },
    ];
    for (const u of usages) {
      const q = quote(u);
      expect(q.priceUsd).toBeGreaterThanOrEqual(q.costUsd / (1 - TARGET_GROSS_MARGIN) - 1e-9);
      expect(meetsMarginFloor(q)).toBe(true);
      expect(q.grossMargin).toBeGreaterThanOrEqual(MIN_GROSS_MARGIN);
    }
  });

  it("créditos são inteiros e arredondam para cima (a Vibe Dev não perde centavos)", () => {
    const q = quote({ llmInputTokens: 30_000 });
    expect(Number.isInteger(q.credits)).toBe(true);
    expect(q.priceUsd).toBeGreaterThanOrEqual(q.costUsd / (1 - TARGET_GROSS_MARGIN));
  });
});

describe("pricing: leitura de arquivo com cache", () => {
  it("arquivo já indexado não paga extração de novo", () => {
    const first = quote(fileReadUsage({ pages: 200, alreadyIndexed: false, questionTokens: 300, answerTokens: 400, contextTokens: 6_000 }));
    const again = quote(fileReadUsage({ pages: 200, alreadyIndexed: true, questionTokens: 300, answerTokens: 400, contextTokens: 6_000 }));
    expect(again.credits).toBeLessThan(first.credits);
    expect(again.costUsd).toBeLessThan(first.costUsd);
    expect(meetsMarginFloor(again)).toBe(true);
  });
});
