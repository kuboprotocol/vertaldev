import { describe, expect, it } from "vitest";
import { apiCostMicro, checkSpend, creditsPerM, DEFAULT_PRICING, inAppCredits, loadPricing, MICRO, priceSheet, settleCarry, validatePricing, worstClass } from "../core";

describe("tabela de preços", () => {
  it("padrões derivados do custo real + infra × margem ÷ valor do crédito", () => {
    // grátis: (0 + 0,05) × 1,5 ÷ 0,03 = 2,5 créditos por 1M
    expect(creditsPerM(DEFAULT_PRICING, "free")).toEqual({ inPerM: 2.5, outPerM: 2.5 });
    // pago: (1,10 + 0,05) × 1,5 ÷ 0,03 = 57,5 / (0,27 + 0,05) × 1,5 ÷ 0,03 = 16
    expect(creditsPerM(DEFAULT_PRICING, "paid")).toEqual({ inPerM: 16, outPerM: 57.5 });
    expect(validatePricing(DEFAULT_PRICING)).toEqual([]);
  });

  it("preço nunca abaixo do custo real (margem ≥ 1)", () => {
    for (const row of priceSheet(DEFAULT_PRICING)) {
      const cls = row.cls as keyof typeof DEFAULT_PRICING.api;
      expect(row.usdOutPerM).toBeGreaterThanOrEqual(DEFAULT_PRICING.api[cls].underlyingUsdOutPerM);
      expect(row.usdInPerM).toBeGreaterThanOrEqual(DEFAULT_PRICING.api[cls].underlyingUsdInPerM);
    }
  });

  it("sobrescrita por env: parcial ok, inválida cai no padrão inteira", () => {
    const ok = loadPricing('{"margin":2,"api":{"paid":{"creditsOutPerM":100}}}');
    expect(ok.errors).toEqual([]);
    expect(ok.pricing.margin).toBe(2);
    expect(creditsPerM(ok.pricing, "paid").outPerM).toBe(100);
    expect(ok.pricing.usdPerCredit).toBe(0.03);
    const bad = loadPricing('{"margin":0.5}');
    expect(bad.pricing).toBe(DEFAULT_PRICING);
    expect(bad.errors[0]).toMatch(/margin/);
    expect(loadPricing("{x").errors.length).toBe(1);
    expect(loadPricing('{"inApp":{"build":{"free":1.5}}}').errors[0]).toMatch(/inteiro/);
  });

  it("custo por pedido em microcréditos, arredondado para cima", () => {
    // 3000 in + 1000 out no grátis: 2,5×3000 + 2,5×1000 + 0,001×1e6 = 7500 + 2500 + 1000
    expect(apiCostMicro(DEFAULT_PRICING, "free", 3000, 1000)).toBe(11_000);
    expect(apiCostMicro(DEFAULT_PRICING, "paid", 1, 1)).toBe(Math.ceil(16 + 57.5 + 1000));
    expect(apiCostMicro(DEFAULT_PRICING, "free", -5, 0)).toBe(1000);
  });

  it("pior caso usa a classe mais cara da cadeia", () => {
    expect(worstClass(["free", "self_hosted"])).toBe("self_hosted");
    expect(worstClass(["free", "paid", "self_hosted"])).toBe("paid");
    expect(worstClass([])).toBe("free");
  });

  it("varejo dentro do Vertal em créditos inteiros", () => {
    expect(inAppCredits(DEFAULT_PRICING, "plan", "free")).toBe(0);
    expect(inAppCredits(DEFAULT_PRICING, "build", "free")).toBe(1);
    expect(inAppCredits(DEFAULT_PRICING, "build", "paid")).toBe(4);
    expect(inAppCredits(DEFAULT_PRICING, "sandboxRun", "free")).toBe(0);
  });
});

describe("fração acumulada (carry)", () => {
  it("debita só créditos inteiros e conserva o total", () => {
    let carry = 0;
    let debited = 0;
    let total = 0;
    for (const cost of [11_000, 400_000, 700_000, 999_999, 1, 2_500_000]) {
      total += cost;
      const r = settleCarry(carry, cost);
      debited += r.debitCredits;
      carry = r.carryMicro;
      expect(carry).toBeGreaterThanOrEqual(0);
      expect(carry).toBeLessThan(MICRO);
    }
    expect(debited * MICRO + carry).toBe(total);
  });

  it("recusa valores inválidos", () => {
    expect(() => settleCarry(-1, 0)).toThrow();
    expect(() => settleCarry(0, 1.5)).toThrow();
  });
});

describe("checagem de saldo e teto antes de chamar o modelo", () => {
  const base = { balanceCredits: 1, carryMicro: 0, maxCostMicro: 500_000, keySpentMicroThisMonth: 0, keyMonthlyCapCredits: 10 };
  it("passa com saldo e teto", () => expect(checkSpend(base)).toEqual({ ok: true }));
  it("sem saldo: 402", () => {
    expect(checkSpend({ ...base, balanceCredits: 0, carryMicro: 600_000 })).toMatchObject({ ok: false, status: 402, code: "insufficient_credits" });
  });
  it("teto mensal da chave: 429", () => {
    expect(checkSpend({ ...base, keySpentMicroThisMonth: 9_800_000 })).toMatchObject({ ok: false, status: 429, code: "spend_cap_reached" });
  });
  it("sem teto (null) só olha o saldo", () => {
    expect(checkSpend({ ...base, keyMonthlyCapCredits: null, keySpentMicroThisMonth: 1e12 })).toEqual({ ok: true });
  });
});
