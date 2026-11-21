import { describe, expect, it } from "vitest";
import {
  ARCHITECTURE_LAYERS,
  BLOCKCHAIN_ENGINES,
  BLOCKCHAIN_MAX_MULTIPLIER,
  BLOCKCHAIN_MIN_MULTIPLIER,
  BLOCKCHAIN_TIER_MULTIPLIERS,
  blockchainCreditCost,
  enginesForLayer,
  engineById,
} from "@/config/blockchainEngines";

describe("catálogo do KUBO BLOCKCHAIN BUILDER", () => {
  it("tem ids únicos e um repositório https em cada engine", () => {
    const ids = BLOCKCHAIN_ENGINES.map((e) => e.id);
    expect(new Set(ids).size, "ids duplicados").toBe(ids.length);
    for (const e of BLOCKCHAIN_ENGINES) {
      expect(e.repo, e.id).toMatch(/^https:\/\/github\.com\/[^/\s]+(\/[^/\s]+)?$/);
    }
  });

  it("cobre as camadas 0 a 3 com os frameworks pedidos", () => {
    for (const layer of [0, 1, 2, 3] as const) {
      expect(enginesForLayer(layer).length, `layer ${layer}`).toBeGreaterThan(0);
    }
    for (const id of ["cosmos-ibc", "hyperlane", "layerzero", "wormhole", "axelar", "libp2p-go"]) expect(engineById(id), id).toBeDefined();
    for (const id of ["cosmos-sdk", "polkadot-sdk", "avalanchego", "solana", "geth", "besu"]) expect(engineById(id), id).toBeDefined();
    for (const id of ["op-stack", "arbitrum-nitro", "zk-stack", "polygon-cdk", "sovereign-sdk", "rollkit"]) expect(engineById(id), id).toBeDefined();
    for (const id of ["revm", "wasmtime", "cometbft", "rustcrypto", "foundry", "rocksdb", "graph-node", "plonky3"]) expect(engineById(id), id).toBeDefined();
  });

  it("marca camadas 4 e 5 como experimentais, sem tratá-las como padrão de mercado", () => {
    const l4 = ARCHITECTURE_LAYERS.find((l) => l.layer === 4);
    const l5 = ARCHITECTURE_LAYERS.find((l) => l.layer === 5);
    expect(l4?.experimental).toBe(true);
    expect(l5?.experimental).toBe(true);
    expect(ARCHITECTURE_LAYERS.filter((l) => !l.experimental).map((l) => l.layer)).toEqual([0, 1, 2, 3]);
  });

  it("não presume licença nem marca como verificado sem conferir", () => {
    for (const e of BLOCKCHAIN_ENGINES) {
      expect(e.verified, e.id).toBe(false);
      expect(e.license, e.id).toBe("verificar");
    }
  });

  it("sinaliza a condição comercial do Sovereign SDK", () => {
    expect(engineById("sovereign-sdk")?.note).toMatch(/revenue share/i);
  });
});

describe("preço da criação de blockchains", () => {
  it("cada faixa fica entre 10% e 30% acima do custo base", () => {
    expect(BLOCKCHAIN_MIN_MULTIPLIER).toBeCloseTo(1.1);
    expect(BLOCKCHAIN_MAX_MULTIPLIER).toBeCloseTo(1.3);
    for (const t of Object.values(BLOCKCHAIN_TIER_MULTIPLIERS)) {
      expect(t.multiplier).toBeGreaterThanOrEqual(1.1);
      expect(t.multiplier).toBeLessThanOrEqual(1.3);
    }
  });

  it("calcula o custo com arredondamento a 2 casas", () => {
    expect(blockchainCreditCost(10, "basic")).toBe(11);
    expect(blockchainCreditCost(10, "standard")).toBe(12);
    expect(blockchainCreditCost(10, "advanced")).toBe(13);
    expect(blockchainCreditCost(3, "standard")).toBe(3.6);
  });
});
