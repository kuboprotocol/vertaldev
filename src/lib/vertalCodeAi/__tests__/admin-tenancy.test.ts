import { describe, expect, it } from "vitest";
import {
  ADMIN_TOOLS,
  assertOwner,
  inAppChargeKey,
  aggregate,
  argsHash,
  canonicalJson,
  formatReport,
  gate,
  isOperator,
  prepareIngestedReport,
  reportRecipientAllowed,
  requiresApproval,
  signApproval,
  verifyApproval,
} from "../platform";

const SECRET = "segredo-de-teste-com-32-caracteres!!";
const LAERCIO = "aaaaaaaa-0000-4000-8000-000000000001";

describe("operador (só o Laércio)", () => {
  it("precisa do papel admin E estar na lista", () => {
    expect(isOperator({ userId: LAERCIO, hasAdminRole: true }, [LAERCIO])).toBe(true);
    expect(isOperator({ userId: LAERCIO, hasAdminRole: false }, [LAERCIO])).toBe(false);
    expect(isOperator({ userId: "outro", hasAdminRole: true }, [LAERCIO])).toBe(false);
    expect(isOperator({ userId: LAERCIO, hasAdminRole: true }, [])).toBe(false);
  });
});

describe("portões de aprovação", () => {
  it("leitura roda; o resto pede cartão; cliente é negado", () => {
    expect(gate("metrics_overview", true, false)).toEqual({ kind: "run" });
    expect(gate("revoke_api_key", true, false)).toMatchObject({ kind: "needs_approval" });
    expect(gate("send_report_email", true, false)).toMatchObject({ kind: "needs_approval" });
    expect(gate("set_key_cap", true, true)).toEqual({ kind: "run" });
    expect(gate("metrics_overview", false, true)).toMatchObject({ kind: "deny" });
    expect(gate("rm_rf", true, true)).toMatchObject({ kind: "deny" });
    expect(gate("trigger_deploy", true, true)).toMatchObject({ kind: "deny" });
  });

  it("toda ferramenta que não é leitura exige aprovação", () => {
    for (const t of ADMIN_TOOLS) expect(requiresApproval(t)).toBe(t.risk !== "read");
    expect(ADMIN_TOOLS.filter((t) => ["money", "deploy", "destructive", "user_facing"].includes(t.risk)).every(requiresApproval)).toBe(true);
  });

  it("cartão assinado vale só para o mesmo admin, ferramenta e argumentos", async () => {
    const args = { keyId: "k1", monthlyCapCredits: 50 };
    const exp = Date.now() + 60_000;
    const token = await signApproval(SECRET, { approvalId: "ap1", adminId: LAERCIO, tool: "set_key_cap", argsHash: await argsHash(args), exp });
    expect((await verifyApproval(SECRET, token, { adminId: LAERCIO, tool: "set_key_cap", args: { monthlyCapCredits: 50, keyId: "k1" } })).ok).toBe(true);
    expect(await verifyApproval(SECRET, token, { adminId: LAERCIO, tool: "set_key_cap", args: { keyId: "k1", monthlyCapCredits: 5000 } })).toMatchObject({ ok: false, reason: /argumentos/ });
    expect(await verifyApproval(SECRET, token, { adminId: LAERCIO, tool: "revoke_api_key", args })).toMatchObject({ ok: false, reason: /ferramenta/ });
    expect(await verifyApproval(SECRET, token, { adminId: "intruso", tool: "set_key_cap", args })).toMatchObject({ ok: false, reason: /outro usuário/ });
    expect(await verifyApproval("outra-chave-de-teste-bem-comprida!!", token, { adminId: LAERCIO, tool: "set_key_cap", args })).toMatchObject({ ok: false, reason: /assinatura/ });
    expect(await verifyApproval(SECRET, token, { adminId: LAERCIO, tool: "set_key_cap", args }, exp + 1)).toMatchObject({ ok: false, reason: /expirado/ });
    const [payload, sig] = token.split(".");
    const forged = `${btoa(JSON.stringify({ ...JSON.parse(atob(payload)), exp: exp + 9e9 }))}.${sig}`;
    expect(await verifyApproval(SECRET, forged, { adminId: LAERCIO, tool: "set_key_cap", args })).toMatchObject({ ok: false });
    expect(await verifyApproval(SECRET, "lixo", { adminId: LAERCIO, tool: "set_key_cap", args })).toMatchObject({ ok: false });
  });

  it("hash dos argumentos não depende da ordem das chaves", async () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe('{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}');
    expect(await argsHash({ a: 1, b: 2 })).toBe(await argsHash({ b: 2, a: 1 }));
  });

  it("relatório por e-mail só para o próprio Laércio por padrão", () => {
    expect(reportRecipientAllowed("Laercio@Vertal.dev", "laercio@vertal.dev", [])).toBe(true);
    expect(reportRecipientAllowed("outro@x.com", "laercio@vertal.dev", [])).toBe(false);
    expect(reportRecipientAllowed("socio@x.com", "laercio@vertal.dev", ["socio@x.com"])).toBe(true);
  });
});

describe("isolamento entre clientes", () => {
  it("cobrança de varejo é amarrada ao usuário e ao pedido", () => {
    expect(inAppChargeKey("u1", "build", "pedido-0001")).toBe("vcai-u1-build-pedido-0001");
    expect(inAppChargeKey("u1", "build", "pedido-0001")).not.toBe(inAppChargeKey("u2", "build", "pedido-0001"));
    expect(() => inAppChargeKey("u1", "build", "x")).toThrow();
    expect(() => inAppChargeKey("u1", "build", "a;drop table")).toThrow();
  });
  it("chave de outro desenvolvedor não é encontrada (nem para admin)", () => {
    expect(() => assertOwner({ owner_id: "dev-a" }, "dev-b")).toThrow("not_found");
    expect(() => assertOwner({ owner_id: "dev-a" }, LAERCIO)).toThrow("not_found");
  });
  it("cliente comum nunca usa ferramentas de operação, nem de leitura", () => {
    for (const t of ADMIN_TOOLS) expect(gate(t.name, false, true).kind).toBe("deny");
  });
});

describe("relatórios", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  const m = aggregate({
    period: "daily",
    from: new Date(now.getTime() - 86_400_000),
    to: now,
    txs: [
      { user_id: "u1-aaaaaaaaaaaa", delta: -5, category: "vibe_code", created_at: "" },
      { user_id: "u2-bbbbbbbbbbbb", delta: -2, category: "vertal_ai_api", created_at: "" },
      { user_id: "u1-aaaaaaaaaaaa", delta: 50, category: "bonus", created_at: "" },
    ],
    errors: [{ message: "TypeError: x", severity: "error", created_at: "" }, { message: "TypeError:  x", severity: "error", created_at: "" }],
    api: [{ key_id: "k", prompt_tokens: 100, completion_tokens: 50, cost_micro: 1_500_000 }],
    openPrs: [{ number: 222, title: "VERTAL Code AI" }],
  });
  it("só débitos contam como gasto; top sem dados pessoais", () => {
    expect(m.creditsSpent).toBe(7);
    expect(m.activeUsers).toBe(2);
    expect(m.creditsByCategory[0]).toEqual({ category: "vibe_code", credits: 5 });
    expect(m.errors.top[0]).toEqual({ message: "TypeError: x", count: 2 });
    expect(m.api).toEqual({ requests: 1, tokens: 150, credits: 1.5 });
    const text = formatReport(m);
    expect(text).toContain("Relatório diário");
    expect(text).toContain("u1-aaaaa…");
    expect(text).not.toContain("u1-aaaaaaaaaaaa");
    expect(text).toContain("#222");
  });
  it("relatório enviado é limpo e cortado", () => {
    const r = prepareIngestedReport("", "a\r\nb\u0000c" + "x".repeat(50_000));
    expect(r.name).toBe("relatorio.txt");
    expect(r.text.startsWith("a\nbc")).toBe(true);
    expect(r.truncated).toBe(true);
  });
});
