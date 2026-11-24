import { describe, expect, it } from "vitest";
import {
  aiKeyPrefix,
  assertOwner,
  bearerFrom,
  checkKeyRow,
  completionResponse,
  completionSse,
  CompatError,
  generateAiKey,
  hashAiKey,
  hasValidAiKeyShape,
  parseChatRequest,
  parseNewKey,
  periodOf,
  requestIdFrom,
  callChain,
  type AiKeyRow,
  type ResolvedBackend,
} from "../core";

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

describe("chaves da API", () => {
  it("formato, hash e prefixo", async () => {
    const k = generateAiKey();
    expect(hasValidAiKeyShape(k)).toBe(true);
    expect(k).not.toBe(generateAiKey());
    const h = await hashAiKey(k);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(await hashAiKey(k));
    expect(aiKeyPrefix(k)).toHaveLength(14);
    expect(h).not.toContain(k.slice(7));
  });

  it("lê só Bearer com formato válido (sem ir ao banco à toa)", () => {
    const k = generateAiKey();
    expect(bearerFrom(headers({ authorization: `Bearer ${k}` }))).toBe(k);
    expect(bearerFrom(headers({ "x-api-key": k }))).toBe(k);
    expect(bearerFrom(headers({ authorization: "Bearer eyJhbGciOi.jwt.qualquer" }))).toBeNull();
    expect(bearerFrom(headers({ authorization: "Bearer vtl_mcp_xxx" }))).toBeNull();
    expect(bearerFrom(headers({}))).toBeNull();
  });

  const row = (over: Partial<AiKeyRow> = {}): AiKeyRow => ({
    id: "k1",
    owner_id: "u1",
    revoked_at: null,
    expires_at: null,
    monthly_cap_credits: 10,
    rpm: 20,
    spent_micro: 5_000_000,
    spent_period: "2026-11",
    ...over,
  });
  const now = new Date("2026-11-24T12:00:00Z");

  it("chave inexistente, revogada ou expirada é recusada", () => {
    expect(checkKeyRow(null, now)).toMatchObject({ ok: false, code: "invalid_api_key" });
    expect(checkKeyRow(row({ revoked_at: "2026-11-01" }), now)).toMatchObject({ ok: false, code: "revoked_api_key" });
    expect(checkKeyRow(row({ expires_at: "2026-11-24T11:59:59Z" }), now)).toMatchObject({ ok: false, code: "expired_api_key" });
  });

  it("gasto do mês zera na virada", () => {
    expect(checkKeyRow(row(), now)).toEqual({ ok: true, spentThisMonthMicro: 5_000_000 });
    expect(checkKeyRow(row({ spent_period: "2026-10" }), now)).toEqual({ ok: true, spentThisMonthMicro: 0 });
    expect(periodOf(now)).toBe("2026-11");
  });

  it("isolamento: só o dono gerencia a chave", () => {
    expect(() => assertOwner({ owner_id: "u1" }, "u1")).not.toThrow();
    expect(() => assertOwner({ owner_id: "u1" }, "u2")).toThrow("not_found");
    expect(() => assertOwner(null, "u1")).toThrow("not_found");
  });

  it("criação de chave valida nome, teto, rpm e validade", () => {
    const d = { monthlyCapCredits: 100, rpm: 20 };
    expect(parseNewKey({ name: "meu app" }, d)).toMatchObject({ name: "meu app", monthly_cap_credits: 100, rpm: 20, expires_at: null });
    expect(parseNewKey({ name: "x", monthlyCapCredits: null }, d).monthly_cap_credits).toBeNull();
    expect(() => parseNewKey({ name: "" }, d)).toThrow();
    expect(() => parseNewKey({ name: "x", rpm: 0 }, d)).toThrow();
    expect(() => parseNewKey({ name: "x", monthlyCapCredits: -1 }, d)).toThrow();
    expect(() => parseNewKey({ name: "x", expiresInDays: 3 }, d)).toThrow();
  });
});

describe("compatibilidade OpenAI", () => {
  it("aceita só modelos VERTAL e limita max_tokens", () => {
    const r = parseChatRequest({ model: "vertal-code-ai-coder", messages: [{ role: "user", content: "oi" }], max_tokens: 99999 }, 8192);
    expect(r.model.profile).toBe("codigo");
    expect(r.maxTokens).toBe(8192);
    expect(() => parseChatRequest({ model: "gpt-4o", messages: [{ role: "user", content: "oi" }] }, 8192)).toThrow(CompatError);
    expect(() => parseChatRequest({ model: "vertal-code-ai", messages: [] }, 8192)).toThrow();
    expect(() => parseChatRequest({ model: "vertal-code-ai", messages: [{ role: "tool", content: "x" }] }, 8192)).toThrow();
    expect(() => parseChatRequest({ model: "vertal-code-ai", messages: [{ role: "user", content: "x" }], tools: [] }, 8192)).toThrow(/tools/);
  });

  it("imagens: só https ou data:image", () => {
    const ok = parseChatRequest({ model: "vertal-code-ai-vision", messages: [{ role: "user", content: [{ type: "text", text: "o que é" }, { type: "image_url", image_url: { url: "https://x.com/a.png" } }] }] }, 8192);
    expect(ok.hasImages).toBe(true);
    expect(() =>
      parseChatRequest({ model: "vertal-code-ai-vision", messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "file:///etc/passwd" } }] }] }, 8192),
    ).toThrow();
  });

  it("resposta não vaza o provedor e traz o custo em créditos", () => {
    const out = { id: "chatcmpl-vtl-1", model: "vertal-code-ai", created: 1, content: "olá", finishReason: "stop", promptTokens: 10, completionTokens: 2, costCredits: 0.001 };
    const body = completionResponse(out);
    expect(body).toMatchObject({ object: "chat.completion", model: "vertal-code-ai", usage: { total_tokens: 12 }, vertal: { cost_credits: 0.001 } });
    expect(JSON.stringify(body)).not.toMatch(/openrouter|nvidia|gemini|groq/i);
    const sse = completionSse(out);
    expect(sse.endsWith("data: [DONE]\n\n")).toBe(true);
    expect(sse.split("data: ").length - 1).toBe(3);
  });

  it("Idempotency-Key do cliente vira o id do pedido", () => {
    expect(requestIdFrom(headers({ "idempotency-key": "pedido-123456" }), "novo")).toBe("pedido-123456");
    expect(requestIdFrom(headers({ "idempotency-key": "x" }), "novo")).toBe("novo");
  });
});

describe("cadeia de modelos (fetch falso)", () => {
  const b = (name: string, cost: ResolvedBackend["cost"] = "free"): ResolvedBackend => ({
    name, url: `https://${name}.test/v1/chat/completions`, model: name, keyEnvs: [], vision: false, reasoning: "none", cost, maxTokens: 100, key: "k",
  });

  it("cai para o próximo em 429 e em resposta vazia; lê o uso", async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      if (url.includes("a.test")) return new Response("lim", { status: 429 });
      if (url.includes("b.test")) return new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { status: 200 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 7, completion_tokens: 1 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await callChain({ chain: [b("a"), b("b"), b("c")], messages: [{ role: "user", content: "oi" }], effort: "off", parse: (x) => x, fetchImpl: fake, log: () => {} });
    expect(r.value).toBe("ok");
    expect(r.attempts).toBe(3);
    expect(r.usage).toEqual({ promptTokens: 7, completionTokens: 1, estimated: false });
  });

  it("pago só cobra depois de responder", async () => {
    const paid: string[] = [];
    const fake = (async () => new Response(JSON.stringify({ choices: [{ message: { content: "x" } }] }), { status: 200 })) as unknown as typeof fetch;
    const r = await callChain({ chain: [b("p", "paid")], messages: [{ role: "user", content: "oi" }], effort: "off", parse: (x) => x, fetchImpl: fake, onPaid: async (bb) => void paid.push(bb.name), log: () => {} });
    expect(paid).toEqual(["p"]);
    expect(r.usage.estimated).toBe(true);
  });

  it("cadeia esgotada: erro sem nome de provedor", async () => {
    const fake = (async () => new Response("x", { status: 503 })) as unknown as typeof fetch;
    await expect(callChain({ chain: [b("openrouter")], messages: [{ role: "user", content: "oi" }], effort: "off", parse: (x) => x, fetchImpl: fake, log: () => {} })).rejects.toThrow(/ocupados/);
  });
});
