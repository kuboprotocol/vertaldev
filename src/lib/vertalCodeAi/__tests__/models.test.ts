/* eslint-disable @typescript-eslint/no-explicit-any -- testes com dublês */
import { describe, expect, it } from "vitest";
import {
  PROFILES,
  availableProfiles,
  buildChain,
  customBackend,
  ollamaBackend,
  parseOverrides,
  reasoningParams,
  validateCustomProvider,
  FREE_BACKENDS,
} from "../core";

const envOf = (vars: Record<string, string>) => (k: string) => vars[k];

describe("roteamento grátis primeiro", () => {
  it("sem nenhuma chave, cadeia vazia", () => {
    expect(buildChain({ profile: "auto", mode: "build", needsVision: false, env: envOf({}) })).toEqual([]);
  });

  it("com OpenRouter, só backends grátis; pago desligado por padrão", () => {
    const chain = buildChain({ profile: "auto", mode: "build", needsVision: false, env: envOf({ OPENROUTER_API_KEY: "k" }) });
    expect(chain.length).toBeGreaterThan(2);
    expect(chain.every((b) => b.cost === "free")).toBe(true);
    expect(chain[0].model).toBe("particle-ai/particle-1:free");
    expect(chain.at(-1)!.model).toBe("openrouter/free");
  });

  it("aceita a chave NAVIGATOR_OPENROUTER_KEY", () => {
    const chain = buildChain({ profile: "auto", mode: "plan", needsVision: false, env: envOf({ NAVIGATOR_OPENROUTER_KEY: "k" }) });
    expect(chain[0].model).toBe("nvidia/nemotron-3-ultra-550b-a55b:free");
    expect(chain[0].key).toBe("k");
  });

  it("ordem: grátis ─► Ollama ─► pago (só se ligado)", () => {
    const env = envOf({ OPENROUTER_API_KEY: "k", VERTAL_OLLAMA_URL: "https://llm.exemplo.dev", DEEPSEEK_API_KEY: "d", VERTAL_CODE_AI_PAID_ENABLED: "true" });
    const chain = buildChain({ profile: "codigo", mode: "build", needsVision: false, env });
    const costs = chain.map((b) => b.cost);
    const firstSelf = costs.indexOf("self_hosted");
    const firstPaid = costs.indexOf("paid");
    expect(firstSelf).toBeGreaterThan(0);
    expect(firstPaid).toBeGreaterThan(firstSelf);
    expect(costs.slice(0, firstSelf).every((c) => c === "free")).toBe(true);
  });

  it("pago nunca entra sem a flag", () => {
    const env = envOf({ OPENROUTER_API_KEY: "k", DEEPSEEK_API_KEY: "d" });
    for (const p of PROFILES) {
      const chain = buildChain({ profile: p.id, mode: "build", needsVision: false, env });
      expect(chain.some((b) => b.cost === "paid")).toBe(false);
    }
  });

  it("com imagem, só backends com visão", () => {
    const chain = buildChain({ profile: "auto", mode: "build", needsVision: true, env: envOf({ OPENROUTER_API_KEY: "k", GROQ_API_KEY: "g" }) });
    expect(chain.length).toBeGreaterThan(0);
    expect(chain.every((b) => b.vision)).toBe(true);
  });

  it("descarta IDs :free que sumiram da lista pública", () => {
    const live = new Set(["nvidia/nemotron-3-ultra-550b-a55b:free"]);
    const chain = buildChain({ profile: "auto", mode: "build", needsVision: false, env: envOf({ OPENROUTER_API_KEY: "k" }), liveOpenRouterIds: live });
    expect(chain.map((b) => b.model)).toEqual(["nvidia/nemotron-3-ultra-550b-a55b:free", "openrouter/free"]);
  });

  it("perfil Servidor próprio usa Ollama primeiro, com modelo padrão de CPU", () => {
    const env = envOf({ VERTAL_OLLAMA_URL: "https://llm.exemplo.dev/", OPENROUTER_API_KEY: "k" });
    const chain = buildChain({ profile: "local", mode: "build", needsVision: false, env });
    expect(chain[0].name).toBe("ollama");
    expect(chain[0].url).toBe("https://llm.exemplo.dev/v1/chat/completions");
    expect(chain[0].model).toBe("qwen2.5-coder:7b");
    expect(chain[0].key).toBe("");
  });

  it("provedor próprio vai primeiro com a chave resolvida no servidor", () => {
    const v = validateCustomProvider({ label: "Meu", baseUrl: "https://api.exemplo.com/v1", model: "m1", keyEnv: "MEU_KEY" });
    expect(v.ok).toBe(true);
    const cb = customBackend((v as any).provider);
    const chain = buildChain({ profile: "custom", mode: "build", needsVision: false, env: envOf({ OPENROUTER_API_KEY: "k" }), custom: cb }, "segredo");
    expect(chain[0]).toMatchObject({ name: "custom", url: "https://api.exemplo.com/v1/chat/completions", key: "segredo" });
    expect(chain.length).toBeGreaterThan(1);
  });

  it("sobrescrita por env", () => {
    const o = parseOverrides('{"auto.build":["or:qwen/qwen3-coder:free","gemini:gemini-3.8-flash","xx:nada"]}');
    expect(o["auto.build"]!.map((b) => b.name)).toEqual(["or:qwen/qwen3-coder:free", "gemini:gemini-3.8-flash"]);
    expect(parseOverrides("{quebrado")).toEqual({});
  });

  it("perfis disponíveis dependem das chaves", () => {
    expect(availableProfiles(envOf({}))).toEqual([]);
    const ids = availableProfiles(envOf({ OPENROUTER_API_KEY: "k" })).map((p) => p.id);
    expect(ids).toContain("auto");
    expect(ids).not.toContain("pro");
    expect(ids).not.toContain("local");
  });

  it("rótulos da interface só mostram a marca Vertal", () => {
    for (const p of PROFILES) {
      expect(p.label.startsWith("VERTAL Code AI")).toBe(true);
      expect(`${p.label} ${p.description}`).not.toMatch(/openrouter|gemini|groq|nvidia|google|deepseek|ollama|qwen|llama|gpt|claude|cerebras/i);
    }
  });
});

describe("provedor próprio", () => {
  it.each([
    ["http://api.x.com/v1", "https"],
    ["https://localhost:11434/v1", "interno"],
    ["https://10.0.0.5/v1", "interno"],
    ["https://169.254.169.254/latest", "interno"],
    ["https://user:pw@api.x.com/v1", "senha"],
  ])("recusa %s", (baseUrl, msg) => {
    const r = validateCustomProvider({ label: "x", baseUrl, model: "m" });
    expect(r.ok).toBe(false);
    expect((r as any).error.toLowerCase()).toContain(msg);
  });

  it("recusa nome de chave fora do padrão do Cofre", () => {
    expect(validateCustomProvider({ label: "x", baseUrl: "https://a.b/v1", model: "m", keyEnv: "minha-chave" }).ok).toBe(false);
  });
});

describe("esforço de raciocínio", () => {
  it("formato por backend", () => {
    expect(reasoningParams(FREE_BACKENDS.orCoder, "high")).toEqual({ reasoning: { effort: "high", exclude: true } });
    expect(reasoningParams(FREE_BACKENDS.geminiFlash, "low")).toEqual({ reasoning_effort: "low" });
    expect(reasoningParams(FREE_BACKENDS.groqQwen, "high")).toEqual({});
    expect(reasoningParams(FREE_BACKENDS.geminiFlash, "off")).toEqual({});
  });

  it("Ollama sem URL https/http é ignorado", () => {
    expect(ollamaBackend(envOf({ VERTAL_OLLAMA_URL: "ftp://x" }))).toBeNull();
  });
});
