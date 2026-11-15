import { describe, expect, it } from "vitest";
import {
  buildCreatePaymentBody,
  buildCreateSubaccountBody,
  isValidCnpj,
  isValidCpf,
} from "./asaas";

// Documentos de exemplo com dígitos verificadores válidos (gerados pelo algoritmo oficial).
const CPF_OK = "529.982.247-25";
const CNPJ_OK = "11.222.333/0001-81";
const PARENT_CNPJ = "11.222.333/0001-81";

describe("CPF e CNPJ", () => {
  it("aceita documentos com dígitos verificadores corretos", () => {
    expect(isValidCpf(CPF_OK)).toBe(true);
    expect(isValidCnpj(CNPJ_OK)).toBe(true);
  });

  it("rejeita sequência repetida e dígito errado", () => {
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
  });
});

describe("criação de subconta", () => {
  const base = { parentCpfCnpj: PARENT_CNPJ, name: "Loja da Ana", email: "ana@loja.com", cpfCnpj: CPF_OK };

  it("recusa conta-pai CPF: só CNPJ cria subconta", () => {
    const r = buildCreateSubaccountBody({ ...base, parentCpfCnpj: CPF_OK });
    expect(r).toEqual({ ok: false, error: "parent_must_be_cnpj" });
  });

  it("monta body com name, email e cpfCnpj só com dígitos", () => {
    const r = buildCreateSubaccountBody(base);
    expect(r).toEqual({ ok: true, body: { name: "Loja da Ana", email: "ana@loja.com", cpfCnpj: "52998224725" } });
  });

  it("recusa e-mail inválido e nome vazio", () => {
    expect(buildCreateSubaccountBody({ ...base, email: "ana" })).toEqual({ ok: false, error: "invalid_email" });
    expect(buildCreateSubaccountBody({ ...base, name: "  " })).toEqual({ ok: false, error: "name_required" });
  });

  it("recusa CPF do dono com dígito errado", () => {
    expect(buildCreateSubaccountBody({ ...base, cpfCnpj: "529.982.247-26" })).toEqual({ ok: false, error: "invalid_cpf" });
  });
});

describe("cobrança", () => {
  const today = "2026-11-15";
  const base = { customerId: "cus_1", billingType: "PIX" as const, valueBrl: 49.9, dueDate: "2026-11-20" };

  it("monta body de PIX com valor em reais", () => {
    expect(buildCreatePaymentBody(base, today)).toEqual({
      ok: true,
      body: { customer: "cus_1", billingType: "PIX", value: 49.9, dueDate: "2026-11-20" },
    });
  });

  it("recusa forma de pagamento fora da lista oficial", () => {
    expect(buildCreatePaymentBody({ ...base, billingType: "CRYPTO" as never }, today)).toEqual({ ok: false, error: "invalid_billing_type" });
  });

  it("recusa valor zero, negativo ou com mais de 2 casas", () => {
    expect(buildCreatePaymentBody({ ...base, valueBrl: 0 }, today)).toEqual({ ok: false, error: "invalid_value" });
    expect(buildCreatePaymentBody({ ...base, valueBrl: -1 }, today)).toEqual({ ok: false, error: "invalid_value" });
    expect(buildCreatePaymentBody({ ...base, valueBrl: 10.123 }, today)).toEqual({ ok: false, error: "invalid_value" });
  });

  it("recusa vencimento no passado ou formato errado", () => {
    expect(buildCreatePaymentBody({ ...base, dueDate: "2026-11-01" }, today)).toEqual({ ok: false, error: "invalid_due_date" });
    expect(buildCreatePaymentBody({ ...base, dueDate: "20/11/2026" }, today)).toEqual({ ok: false, error: "invalid_due_date" });
  });
});
