import { describe, expect, it } from "vitest";
import {
  MODEL_CATALOG,
  applyOverrides,
  creditsFor,
  failRate,
  healthFromRuns,
  parsePolicy,
  rankModels,
} from "../../supabase/functions/_shared/modelRouter";

const ALL = new Set(["DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY"]);
const ids = (r: ReturnType<typeof rankModels>) => r.map((x) => x.profile.id);

describe("rankModels", () => {
  it("só usa modelos com chave configurada", () => {
    const r = rankModels({ kind: "code", tier: "flash", policy: "balanced", availableKeys: new Set(["DEEPSEEK_API_KEY"]) });
    expect(ids(r).every((id) => id.startsWith("deepseek"))).toBe(true);
    expect(rankModels({ kind: "code", tier: "flash", policy: "balanced", availableKeys: new Set() })).toEqual([]);
  });

  it("na economia, tarefa simples vai para um modelo barato", () => {
    const [top] = rankModels({ kind: "chat", tier: "flash", policy: "economy", availableKeys: ALL });
    expect(top.typicalCost).toBeLessThan(1);
  });

  it("tarefa complexa exige modelo forte e deixa de fora os fracos", () => {
    const r = rankModels({ kind: "architecture", tier: "pro", policy: "balanced", availableKeys: ALL });
    expect(r.every((m) => m.quality >= 4)).toBe(true);
    expect(ids(r)).not.toContain("groq-llama-3.3-70b");
    expect(ids(r)).not.toContain("deepseek-chat");
  });

  it("na política de qualidade, o premium entra e lidera o código complexo", () => {
    const [top] = rankModels({ kind: "code", tier: "pro", policy: "quality", availableKeys: ALL });
    expect(top.profile.id).toBe("claude-opus-5-5");
    const balanced = rankModels({ kind: "code", tier: "pro", policy: "balanced", availableKeys: ALL });
    expect(ids(balanced)).not.toContain("claude-opus-5-5");
  });

  it("o agente de código nunca recebe modelo sem JSON confiável", () => {
    const r = rankModels({ kind: "chat", tier: "flash", policy: "economy", availableKeys: ALL, needJson: true });
    expect(ids(r)).not.toContain("groq-llama-3.3-70b");
  });

  it("aprende com os erros: um modelo que vem falhando perde o primeiro lugar", () => {
    const input = { kind: "code" as const, tier: "flash" as const, policy: "balanced" as const, availableKeys: ALL, needJson: true };
    const [before] = rankModels(input);
    const [after] = rankModels({ ...input, health: { [before.profile.id]: { ok: 0, fail: 12 } } });
    expect(after.profile.id).not.toBe(before.profile.id);
  });

  it("sem candidato forte o bastante, usa o melhor disponível em vez de travar", () => {
    const r = rankModels({ kind: "architecture", tier: "pro", policy: "balanced", availableKeys: new Set(["GROQ_API_KEY"]) });
    expect(ids(r)).toEqual(["groq-llama-3.3-70b"]);
  });

  it("explica a escolha em português", () => {
    const [top] = rankModels({ kind: "code", tier: "flash", policy: "economy", availableKeys: ALL, needJson: true });
    expect(top.reason).toMatch(/código/);
    expect(top.reason.length).toBeGreaterThan(20);
  });
});

describe("failRate", () => {
  it("sem dados ou só sucessos não penaliza; falhas repetidas penalizam mais que uma isolada", () => {
    expect(failRate(undefined)).toBe(0);
    expect(failRate({ ok: 50, fail: 0 })).toBe(0);
    expect(failRate({ ok: 0, fail: 1 })).toBeLessThan(failRate({ ok: 0, fail: 5 }));
  });
});

describe("healthFromRuns", () => {
  it("conta sucessos pelo modelo e falhas pelas tentativas", () => {
    const h = healthFromRuns([
      { status: "ok", model: "deepseek-chat", attempts: ["deepseek-chat:429", "deepseek-chat:ok"] },
      { status: "error", attempts: ["claude-sonnet-5-5:500", "claude-sonnet-5-5:network"] },
      { status: "ok", model: "deepseek-chat", attempts: ["cache:hit"] },
    ]);
    expect(h["deepseek-chat"]).toEqual({ ok: 2, fail: 1 });
    expect(h["claude-sonnet-5-5"]).toEqual({ ok: 0, fail: 2 });
  });
});

describe("políticas, créditos e ajustes", () => {
  it("lê a política do env, com padrão equilibrado", () => {
    expect(parsePolicy("deepseek_only")).toBe("deepseek_only");
    expect(parsePolicy("QUALITY")).toBe("quality");
    expect(parsePolicy(undefined)).toBe("balanced");
    expect(parsePolicy("qualquer")).toBe("balanced");
  });

  it("cobra créditos proporcionais ao modelo escolhido", () => {
    const sonnet = MODEL_CATALOG.find((p) => p.id === "claude-sonnet-5-5");
    const deepseek = MODEL_CATALOG.find((p) => p.id === "deepseek-chat");
    expect(creditsFor(2, deepseek)).toBe(2);
    expect(creditsFor(2, sonnet)).toBe(6);
    expect(creditsFor(0, null)).toBe(1);
  });

  it("aceita ajuste de notas e preços por env, ignorando JSON inválido", () => {
    const tuned = applyOverrides(MODEL_CATALOG, JSON.stringify({ "deepseek-chat": { priceIn: 9, quality: { code: 1 } } }));
    const ds = tuned.find((p) => p.id === "deepseek-chat")!;
    expect(ds.priceIn).toBe(9);
    expect(ds.quality.code).toBe(1);
    expect(ds.quality.chat).toBe(3.5);
    expect(applyOverrides(MODEL_CATALOG, "{nope")).toBe(MODEL_CATALOG);
  });

  it("todos os modelos do catálogo têm id único", () => {
    const all = MODEL_CATALOG.map((p) => p.id);
    expect(new Set(all).size).toBe(all.length);
  });
});
