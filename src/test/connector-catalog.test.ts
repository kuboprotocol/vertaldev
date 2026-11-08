import { describe, expect, it } from "vitest";
import {
  applyConnectionStatus,
  applyVaultStatus,
  safeExternalUrl,
  detectRequirements,
  extractEnvVarNames,
  formatConnectorsForPrompt,
  mergeDeclaredRequirements,
} from "@/config/connectorCatalog";

const slugs = (r: Array<{ slug: string }>) => r.map((x) => x.slug);

describe("detectRequirements", () => {
  it("detecta Stripe e Gmail a partir do pedido, com os segredos certos", () => {
    const r = detectRequirements("Crie um SaaS com assinaturas via Stripe e envio pelo Gmail");
    expect(slugs(r)).toEqual(expect.arrayContaining(["stripe", "gmail"]));
    const stripe = r.find((x) => x.slug === "stripe")!;
    expect(stripe.secrets).toEqual(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
    expect(stripe.connectPath).toBe("/connect");
    expect(stripe.status).toBe("needed");
  });

  it("detecta pelo código gerado: imports, URLs de API e variáveis", () => {
    const code = `
      import { createClient } from "@supabase/supabase-js";
      const r = await fetch("https://api.resend.com/emails", { headers: { Authorization: "Bearer " + Deno.env.get("RESEND_API_KEY") } });
    `;
    const r = detectRequirements("", { "src/mail.ts": code });
    expect(slugs(r)).toEqual(expect.arrayContaining(["supabase", "resend"]));
    expect(r.find((x) => x.slug === "resend")!.reason).toContain("código");
  });

  it("transforma variável de chave desconhecida em API genérica com o nome exato", () => {
    const code = `const k = process.env.ACME_API_KEY; const s = import.meta.env.VITE_ACME_SECRET;`;
    const r = detectRequirements("", { "a.ts": code });
    const custom = r.find((x) => x.slug === "custom:acme")!;
    expect(custom.kind).toBe("api");
    expect(custom.secrets).toEqual(["ACME_API_KEY", "VITE_ACME_SECRET"]);
  });

  it("ignora variáveis da própria plataforma", () => {
    const code = `const u = import.meta.env.VITE_SUPABASE_URL; const m = import.meta.env.MODE;`;
    expect(detectRequirements("", { "a.ts": code }).filter((x) => x.slug.startsWith("custom:"))).toEqual([]);
  });

  it("pedido sem integração não gera requisito", () => {
    expect(detectRequirements("Mude a cor do botão para azul")).toEqual([]);
  });

  it("builtin (Cloud e IA) já vem conectado", () => {
    const r = detectRequirements("quero login de usuários e um chatbot com IA");
    expect(r.find((x) => x.slug === "supabase")!.status).toBe("connected");
    expect(r.find((x) => x.slug === "ai-gateway")!.status).toBe("connected");
  });

  it("não confunde a palavra token do código com blockchain", () => {
    expect(slugs(detectRequirements("", { "a.ts": "const token = getAuthToken();" }))).not.toContain("web3");
  });
});

describe("extractEnvVarNames", () => {
  it("lê process.env, import.meta.env e Deno.env.get", () => {
    expect(extractEnvVarNames(`process.env.A_KEY import.meta.env.VITE_B_TOKEN Deno.env.get("C_SECRET")`).sort())
      .toEqual(["A_KEY", "C_SECRET", "VITE_B_TOKEN"]);
  });
});

describe("mergeDeclaredRequirements", () => {
  it("usa o catálogo quando o slug existe e valida APIs novas", () => {
    const merged = mergeDeclaredRequirements([], [
      { slug: "twilio", reason: "SMS de confirmação" },
      { name: "API de Frete", secrets: ["FRETE_API_KEY", "nao valido", "ok"], reason: "calcular frete" },
      { slug: "inexistente" },
      null,
      "texto",
    ]);
    expect(slugs(merged)).toEqual(["twilio", "custom:api-de-frete"]);
    expect(merged[0].secrets).toEqual(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]);
    expect(merged[1].secrets).toEqual(["FRETE_API_KEY"]);
  });

  it("não duplica o que já foi detectado e respeita o limite", () => {
    const detected = detectRequirements("usar Stripe");
    const merged = mergeDeclaredRequirements(detected, [{ slug: "stripe", reason: "cobrança mensal" }]);
    expect(merged.filter((r) => r.slug === "stripe")).toHaveLength(1);
    expect(merged[0].reason).toBe("cobrança mensal");
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `API ${i}` }));
    expect(mergeDeclaredRequirements([], many).length).toBeLessThanOrEqual(8);
  });

  it("entrada que não é lista é ignorada", () => {
    expect(mergeDeclaredRequirements([], undefined)).toEqual([]);
    expect(mergeDeclaredRequirements([], "x")).toEqual([]);
  });
});

describe("applyConnectionStatus / formatConnectorsForPrompt", () => {
  it("marca como conectado o que o usuário já conectou", () => {
    const r = applyConnectionStatus(detectRequirements("Stripe e Slack"), ["slack"]);
    expect(r.find((x) => x.slug === "slack")!.status).toBe("connected");
    expect(r.find((x) => x.slug === "stripe")!.status).toBe("needed");
  });

  it("o prompt lista cada conector com seu estado", () => {
    const text = formatConnectorsForPrompt(["github"]);
    expect(text).toContain("- github (GitHub): conectado");
    expect(text).toContain("- stripe (Stripe (pagamentos)): não conectado");
    expect(text).toContain("- supabase (Cloud (banco, login e arquivos)): da plataforma");
  });
});

describe("links de chave e status pelo cofre", () => {
  it("leva para a página oficial de chaves do serviço do catálogo", () => {
    const [stripe] = detectRequirements("cobrar com Stripe");
    expect(stripe.keyUrl).toBe("https://dashboard.stripe.com/apikeys");
    expect(stripe.siteUrl).toContain("stripe.com");
    expect(stripe.linkSource).toBe("catalog");
  });

  it("usa link conhecido para chave de provedor comum lida no código", () => {
    const [req] = detectRequirements("", { "a.ts": "const k = process.env.OPENAI_API_KEY;" });
    expect(req.keyUrl).toBe("https://platform.openai.com/api-keys");
  });

  it("aceita link sugerido pelo modelo só se for https, e marca como sugestão", () => {
    const merged = mergeDeclaredRequirements([], [
      { name: "API de Frete", secrets: ["FRETE_API_KEY"], key_url: "https://frete.example.com/keys" },
      { name: "API Ruim", secrets: ["RUIM_API_KEY"], key_url: "http://ruim.example.com" },
      { name: "API IP", secrets: ["IP_API_KEY"], key_url: "https://10.0.0.1/keys" },
    ]);
    expect(merged[0]).toMatchObject({ keyUrl: "https://frete.example.com/keys", linkSource: "agent" });
    expect(merged[1].keyUrl).toBeUndefined();
    expect(merged[2].keyUrl).toBeUndefined();
  });

  it("safeExternalUrl recusa credencial embutida e esquemas perigosos", () => {
    expect(safeExternalUrl("https://user:pw@x.com")).toBeUndefined();
    expect(safeExternalUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeExternalUrl("https://resend.com/api-keys")).toBe("https://resend.com/api-keys");
  });

  it("API sem conector fica pronta quando todas as chaves estão no cofre", () => {
    const reqs = detectRequirements("enviar e-mail com Resend");
    const [partial] = applyVaultStatus(reqs, []);
    expect(partial.status).toBe("needed");
    const [ready] = applyVaultStatus(reqs, ["RESEND_API_KEY"]);
    expect(ready.status).toBe("connected");
    expect(ready.inVault).toEqual(["RESEND_API_KEY"]);
  });

  it("conector continua valendo pela conexão, não pelo cofre", () => {
    const reqs = detectRequirements("cobrar com Stripe");
    const [stripe] = applyVaultStatus(reqs, ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
    expect(stripe.status).toBe("needed");
  });
});
