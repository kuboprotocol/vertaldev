import { describe, expect, it } from "vitest";
import {
  BuildRequestError,
  DEFAULT_ENGINE_BY_LAYER,
  ENGINE_ADAPTERS,
  planBlockchainBuild,
} from "../../supabase/functions/_shared/blockchainRegistry";

const base = { tier: "standard" as const, baseCredits: 10, network: "testnet" as const };

describe("Blockchain Engine Registry: planejamento", () => {
  it("usa o engine padrão de cada camada e calcula o custo pela faixa", () => {
    const plan = planBlockchainBuild({ ...base, layers: [1] });
    expect(plan.engines.map((e) => e.id)).toEqual([DEFAULT_ENGINE_BY_LAYER[1]]);
    expect(plan.credits).toBe(12);
    expect(plan.status).toBe("planned");
    expect(plan.requiresHumanReview).toBe(false);
  });

  it("respeita o engine escolhido pelo dev, desde que atenda a camada", () => {
    const plan = planBlockchainBuild({ ...base, layers: [1], engineIds: ["solana"] });
    expect(plan.engines.map((e) => e.id)).toEqual(["solana"]);
  });

  it("recusa engine que não atende a camada pedida", () => {
    expect(() => planBlockchainBuild({ ...base, layers: [0], engineIds: ["solana"] })).toThrow(BuildRequestError);
  });

  it("recusa engine desconhecido", () => {
    expect(() => planBlockchainBuild({ ...base, layers: [1], engineIds: ["nao-existe"] })).toThrow(/desconhecido/);
  });

  it("recusa pedido sem camada ou com custo base inválido", () => {
    expect(() => planBlockchainBuild({ ...base, layers: [] })).toThrow(BuildRequestError);
    expect(() => planBlockchainBuild({ ...base, layers: [1], baseCredits: 0 })).toThrow(BuildRequestError);
  });

  it("mainnet exige revisão humana e avisa", () => {
    const plan = planBlockchainBuild({ ...base, layers: [1], network: "mainnet" });
    expect(plan.requiresHumanReview).toBe(true);
    expect(plan.warnings.join(" ")).toMatch(/revisão humana/);
  });

  it("camadas 4 e 5 são avisadas como experimentais e não geram engine", () => {
    const plan = planBlockchainBuild({ ...base, layers: [4, 5] });
    expect(plan.engines).toEqual([]);
    expect(plan.warnings.join(" ")).toMatch(/experimental/);
  });

  it("avisa que engines não conferidos e o Sovereign SDK têm condição comercial", () => {
    const plan = planBlockchainBuild({ ...base, layers: [2], engineIds: ["sovereign-sdk"] });
    const text = plan.warnings.join(" ");
    expect(text).toMatch(/não conferidos/);
    expect(text).toMatch(/revenue share/i);
  });

  it("lista os engines sem adaptador, já que o registro começa vazio", () => {
    expect(Object.keys(ENGINE_ADAPTERS)).toEqual([]);
    const plan = planBlockchainBuild({ ...base, layers: [1], componentIds: ["revm"] });
    expect(plan.missingAdapters).toEqual(["cosmos-sdk", "revm"]);
  });

  it("componentes entram no plano sem custo extra além da faixa", () => {
    const plan = planBlockchainBuild({ ...base, layers: [1], componentIds: ["foundry", "foundry"] });
    expect(plan.components.map((c) => c.id)).toEqual(["foundry"]);
    expect(plan.credits).toBe(12);
  });
});
