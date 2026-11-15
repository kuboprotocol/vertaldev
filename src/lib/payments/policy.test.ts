import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAILY_LIMIT_MINOR,
  buildConfirmationText,
  containsSecret,
  evaluatePaymentRequest,
  type PaymentRequest,
} from "./policy";

const base: PaymentRequest = {
  actor: "owner",
  amountMinor: 10_000,
  currency: "BRL",
  spentTodayMinor: 0,
  dailyLimitMinor: DEFAULT_DAILY_LIMIT_MINOR,
  confirmed: true,
  extraConfirmed: false,
};

describe("quem pode pagar", () => {
  it("cliente de canal nunca dispara pagamento, mesmo confirmado", () => {
    const d = evaluatePaymentRequest({ ...base, actor: "customer", confirmed: true, extraConfirmed: true });
    expect(d).toEqual({ status: "deny", reason: "customer_cannot_pay" });
  });

  it("o agente, sozinho, também não paga sem o dono confirmar", () => {
    expect(evaluatePaymentRequest({ ...base, actor: "agent", confirmed: false })).toEqual({ status: "needs_confirmation" });
  });

  it("pedido do dono sem confirmação pede confirmação", () => {
    expect(evaluatePaymentRequest({ ...base, confirmed: false })).toEqual({ status: "needs_confirmation" });
  });

  it("pedido do dono confirmado dentro do limite é liberado", () => {
    expect(evaluatePaymentRequest(base)).toEqual({ status: "allow" });
  });
});

describe("limite diário", () => {
  it("passar do limite exige confirmação extra", () => {
    const d = evaluatePaymentRequest({ ...base, spentTodayMinor: DEFAULT_DAILY_LIMIT_MINOR - 5_000, amountMinor: 10_000 });
    expect(d).toEqual({ status: "needs_extra_confirmation" });
  });

  it("com confirmação extra, passa do limite", () => {
    const d = evaluatePaymentRequest({
      ...base,
      spentTodayMinor: DEFAULT_DAILY_LIMIT_MINOR - 5_000,
      amountMinor: 10_000,
      extraConfirmed: true,
    });
    expect(d).toEqual({ status: "allow" });
  });

  it("exatamente no limite ainda é permitido", () => {
    const d = evaluatePaymentRequest({ ...base, spentTodayMinor: 0, amountMinor: DEFAULT_DAILY_LIMIT_MINOR });
    expect(d).toEqual({ status: "allow" });
  });
});

describe("valores inválidos", () => {
  it("rejeita valor zero, negativo, fracionário e moeda malformada", () => {
    expect(evaluatePaymentRequest({ ...base, amountMinor: 0 })).toEqual({ status: "deny", reason: "invalid_amount" });
    expect(evaluatePaymentRequest({ ...base, amountMinor: -5 })).toEqual({ status: "deny", reason: "invalid_amount" });
    expect(evaluatePaymentRequest({ ...base, amountMinor: 10.5 })).toEqual({ status: "deny", reason: "invalid_amount" });
    expect(evaluatePaymentRequest({ ...base, currency: "real" })).toEqual({ status: "deny", reason: "invalid_currency" });
  });
});

describe("texto de confirmação", () => {
  it("mostra valor e destinatário", () => {
    const t = buildConfirmationText({ amountMinor: 12_345, currency: "BRL", recipient: "Fornecedor X", description: "frete" });
    expect(t).toBe("Confirmar pagamento de 123,45 BRL para Fornecedor X (frete)?");
  });
});

describe("detecção de segredo em texto de pasta", () => {
  it("pega chaves e tokens comuns", () => {
    expect(containsSecret("use sk_live_" + "a".repeat(24))).toBe(true);
    expect(containsSecret("whsec_" + "b".repeat(20))).toBe(true);
    expect(containsSecret("AKIA" + "C".repeat(16))).toBe(true);
    expect(containsSecret("Authorization: Bearer " + "d".repeat(30))).toBe(true);
    expect(containsSecret("-----BEGIN RSA PRIVATE KEY-----")).toBe(true);
  });

  it("não acusa texto comum", () => {
    expect(containsSecret("Sabonete artesanal de lavanda, 100g, R$ 25,00")).toBe(false);
    expect(containsSecret("sk_live_curto")).toBe(false);
  });
});
