// Blockchain Engine Registry: planeja um build a partir do catálogo (blockchainEngines.ts).
// Esta etapa só monta o plano: escolhe engines por camada, valida, calcula o custo em créditos e
// aponta o que precisa de revisão humana. Não gera código, não cria nós e não implanta nada.
// Os adaptadores (um por engine) ainda não existem: o registro está vazio de propósito.

import {
  BLOCKCHAIN_ENGINES,
  blockchainCreditCost,
  engineById,
  type BlockchainEngine,
  type BlockchainLayer,
  type BlockchainTier,
} from "./blockchainEngines";

export type BuildNetwork = "testnet" | "mainnet";

export interface BuildRequest {
  /** Camadas que a rede precisa (ex.: [1] para blockchain independente, [2] para rollup). */
  layers: BlockchainLayer[];
  tier: BlockchainTier;
  /** Custo base em créditos da ação de build, antes do multiplicador da faixa. */
  baseCredits: number;
  /** Engines escolhidos pelo dev. Se omitido, usa o engine padrão de cada camada. */
  engineIds?: string[];
  /** Engines complementares (REVM, Foundry, etc.). */
  componentIds?: string[];
  network: BuildNetwork;
}

export interface BuildPlan {
  status: "planned";
  network: BuildNetwork;
  tier: BlockchainTier;
  credits: number;
  engines: BlockchainEngine[];
  components: BlockchainEngine[];
  /** Ids de engines do plano que ainda não têm adaptador de geração. */
  missingAdapters: string[];
  /** Avisos que o dev precisa ler antes de seguir. */
  warnings: string[];
  /** true em mainnet, ou quando há ativo real: nada é implantado sem revisão humana. */
  requiresHumanReview: boolean;
}

/** Engine padrão por camada, usado quando o dev não escolhe um. */
export const DEFAULT_ENGINE_BY_LAYER: Partial<Record<BlockchainLayer, string>> = {
  0: "hyperlane",
  1: "cosmos-sdk",
  2: "op-stack",
  3: "arbitrum-nitro",
};

/**
 * Adaptadores de geração, um por engine. Vazio até que cada engine tenha o seu.
 * Um adaptador recebe o plano e devolve os arquivos do projeto gerado.
 */
export interface EngineAdapter {
  engineId: string;
  generate(plan: BuildPlan): Promise<{ path: string; content: string }[]>;
}
export const ENGINE_ADAPTERS: Record<string, EngineAdapter> = {};

export class BuildRequestError extends Error {}

export function planBlockchainBuild(req: BuildRequest): BuildPlan {
  if (!Array.isArray(req.layers) || req.layers.length === 0) {
    throw new BuildRequestError("Escolha pelo menos uma camada.");
  }
  if (!(req.baseCredits > 0)) {
    throw new BuildRequestError("O custo base precisa ser maior que zero.");
  }
  const layers = [...new Set(req.layers)].sort((a, b) => a - b);
  const warnings: string[] = [];

  const experimental = layers.filter((l) => l === 4 || l === 5);
  if (experimental.length) {
    warnings.push(`Camada ${experimental.join(" e ")} é arquitetura experimental do Kubo, sem padrão de mercado.`);
  }

  const engines: BlockchainEngine[] = [];
  const chosen = new Set<string>();

  for (const layer of layers) {
    if (layer === 4 || layer === 5) continue; // sem engine próprio ainda
    const wanted = req.engineIds?.find((id) => engineById(id)?.layers.includes(layer));
    const id = wanted ?? DEFAULT_ENGINE_BY_LAYER[layer];
    if (!id) {
      warnings.push(`Nenhum engine padrão para a camada ${layer}: escolha um.`);
      continue;
    }
    if (chosen.has(id)) continue;
    const engine = engineById(id);
    if (!engine) throw new BuildRequestError(`Engine desconhecido: ${id}.`);
    if (!engine.layers.includes(layer)) {
      throw new BuildRequestError(`${engine.name} não atende a camada ${layer}.`);
    }
    chosen.add(id);
    engines.push(engine);
  }

  // Engines pedidos que não entraram por nenhuma camada não são aceitos em silêncio.
  for (const id of req.engineIds ?? []) {
    if (!engineById(id)) throw new BuildRequestError(`Engine desconhecido: ${id}.`);
    if (!chosen.has(id)) {
      const engine = engineById(id)!;
      if (!engine.layers.some((l) => layers.includes(l))) {
        throw new BuildRequestError(`${engine.name} não atende nenhuma camada escolhida.`);
      }
    }
  }

  const components: BlockchainEngine[] = [];
  for (const id of req.componentIds ?? []) {
    const c = engineById(id);
    if (!c) throw new BuildRequestError(`Componente desconhecido: ${id}.`);
    if (!components.includes(c)) components.push(c);
  }

  for (const e of [...engines, ...components]) {
    if (!e.verified) warnings.push(`${e.name}: repositório e licença ainda não conferidos.`);
    if (e.note) warnings.push(`${e.name}: ${e.note}`);
  }

  const missingAdapters = [...engines, ...components]
    .map((e) => e.id)
    .filter((id) => !ENGINE_ADAPTERS[id]);
  if (missingAdapters.length) {
    warnings.push("Sem adaptador de geração ainda: " + missingAdapters.join(", ") + ".");
  }

  const requiresHumanReview = req.network === "mainnet";
  if (requiresHumanReview) {
    warnings.push("Mainnet: revisão humana obrigatória antes de qualquer implantação com ativos reais.");
  }

  return {
    status: "planned",
    network: req.network,
    tier: req.tier,
    credits: blockchainCreditCost(req.baseCredits, req.tier),
    engines,
    components,
    missingAdapters,
    warnings,
    requiresHumanReview,
  };
}

export const listEnginesForLayers = (layers: BlockchainLayer[]): BlockchainEngine[] =>
  BLOCKCHAIN_ENGINES.filter((e) => e.layers.some((l) => layers.includes(l)));
