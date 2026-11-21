// Catálogo do KUBO BLOCKCHAIN BUILDER (conceito): frameworks por camada e preço da criação de redes.
// Fonte única: este arquivo. O front-end reexporta em src/config/blockchainEngines.ts.
// Status "reference": a plataforma conhece o engine e o descreve; a geração automática ainda não existe.

export type BlockchainLayer = 0 | 1 | 2 | 3 | 4 | 5;

export type EngineStatus = "reference";

export interface BlockchainEngine {
  id: string;
  name: string;
  /** Camadas em que o engine é usado (ex.: Nitro serve à Layer 2 e à Layer 3 via Orbit). */
  layers: BlockchainLayer[];
  /** Papel do engine, em português, em uma frase. */
  role: string;
  /** Repositório oficial (o link vem da lista do produto; ver `verified`). */
  repo: string;
  /** Linguagem principal do projeto, para o gerador escolher o adaptador. */
  languages: string[];
  status: EngineStatus;
  /** true quando o link foi conferido no GitHub. Hoje nenhum foi: o acesso ao GitHub não estava liberado. */
  verified: boolean;
  /** Licença a conferir antes de habilitar o engine num build. Nunca presumida. */
  license: "verificar" | string;
  /** Observação comercial ou de uso que o build precisa mostrar ao dev. */
  note?: string;
}

export interface ArchitectureLayer {
  layer: BlockchainLayer;
  name: string;
  purpose: string;
  /** Layers 4 e 5 não são padrão de mercado: são arquiteturas próprias do Kubo, extensíveis. */
  experimental: boolean;
}

export const ARCHITECTURE_LAYERS: ArchitectureLayer[] = [
  { layer: 0, name: "Infraestrutura e interoperabilidade", purpose: "Comunicação e conexão entre redes, mensagens e infraestrutura compartilhada.", experimental: false },
  { layer: 1, name: "Blockchain independente", purpose: "Rede com consenso, validadores, regras, taxas e ativos próprios.", experimental: false },
  { layer: 2, name: "Rollups e redes de escalabilidade", purpose: "Execução de transações que usa outra blockchain para liquidação e segurança.", experimental: false },
  { layer: 3, name: "Redes e aplicações especializadas", purpose: "Rede especializada sobre uma Layer 2, ou aplicação com infraestrutura própria: jogos, DeFi, serviços.", experimental: false },
  { layer: 4, name: "Serviços e aplicações distribuídas (proposta Kubo)", purpose: "Redes de serviços, automação, IA, IoT e protocolos especializados.", experimental: true },
  { layer: 5, name: "Ecossistema de ecossistemas (proposta Kubo)", purpose: "Orquestração de múltiplas redes, serviços e infraestruturas.", experimental: true },
];

export const BLOCKCHAIN_ENGINES: BlockchainEngine[] = [
  // Layer 0
  { id: "cosmos-ibc", name: "Cosmos IBC", layers: [0], role: "Protocolo de comunicação entre blockchains.", repo: "https://github.com/cosmos/ibc-go", languages: ["Go"], status: "reference", verified: false, license: "verificar" },
  { id: "hyperlane", name: "Hyperlane", layers: [0], role: "Mensagens e interoperabilidade entre redes.", repo: "https://github.com/hyperlane-xyz/hyperlane-monorepo", languages: ["TypeScript", "Solidity"], status: "reference", verified: false, license: "verificar" },
  { id: "layerzero", name: "LayerZero", layers: [0], role: "Mensagens omnichain entre redes.", repo: "https://github.com/LayerZero-Labs/LayerZero-v2", languages: ["Solidity", "TypeScript"], status: "reference", verified: false, license: "verificar" },
  { id: "wormhole", name: "Wormhole", layers: [0], role: "Mensagens e transferências cross-chain.", repo: "https://github.com/wormhole-foundation/wormhole", languages: ["Rust", "Solidity"], status: "reference", verified: false, license: "verificar" },
  { id: "axelar", name: "Axelar", layers: [0], role: "Rede de interoperabilidade com validadores próprios.", repo: "https://github.com/axelarnetwork/axelar-core", languages: ["Go"], status: "reference", verified: false, license: "verificar" },
  { id: "libp2p-go", name: "libp2p (Go)", layers: [0], role: "Comunicação P2P: descoberta de pares e transporte.", repo: "https://github.com/libp2p/go-libp2p", languages: ["Go"], status: "reference", verified: false, license: "verificar" },

  // Layer 1
  { id: "cosmos-sdk", name: "Cosmos SDK", layers: [1], role: "Framework para blockchains Cosmos com consenso e módulos próprios.", repo: "https://github.com/cosmos/cosmos-sdk", languages: ["Go"], status: "reference", verified: false, license: "verificar" },
  { id: "polkadot-sdk", name: "Polkadot SDK", layers: [1], role: "Framework para blockchains Substrate e parachains.", repo: "https://github.com/paritytech/polkadot-sdk", languages: ["Rust"], status: "reference", verified: false, license: "verificar" },
  { id: "avalanchego", name: "AvalancheGo", layers: [1], role: "Nó e framework para sub-redes do Avalanche.", repo: "https://github.com/ava-labs/avalanchego", languages: ["Go"], status: "reference", verified: false, license: "verificar" },
  { id: "solana", name: "Solana", layers: [1], role: "Blockchain de alta vazão com validadores e runtime próprio.", repo: "https://github.com/solana-labs/solana", languages: ["Rust"], status: "reference", verified: false, license: "verificar" },
  { id: "geth", name: "Geth (go-ethereum)", layers: [1], role: "Cliente de execução compatível com Ethereum (EVM).", repo: "https://github.com/ethereum/go-ethereum", languages: ["Go"], status: "reference", verified: false, license: "verificar" },
  { id: "besu", name: "Hyperledger Besu", layers: [1], role: "Cliente Ethereum para redes públicas e permissionadas.", repo: "https://github.com/hyperledger/besu", languages: ["Java"], status: "reference", verified: false, license: "verificar" },

  // Layer 2 (e 3, quando a rede roda sobre uma L2)
  { id: "op-stack", name: "OP Stack", layers: [2], role: "Optimistic rollups compatíveis com o ecossistema OP.", repo: "https://github.com/ethereum-optimism/optimism", languages: ["Go", "Solidity"], status: "reference", verified: false, license: "verificar" },
  { id: "arbitrum-nitro", name: "Arbitrum Nitro / Orbit", layers: [2, 3], role: "Chains personalizadas: execução, taxas e disponibilidade de dados. Orbit é o uso como Layer 3.", repo: "https://github.com/OffchainLabs/nitro", languages: ["Go", "Solidity"], status: "reference", verified: false, license: "verificar" },
  { id: "zk-stack", name: "ZK Stack (ZKsync Era)", layers: [2, 3], role: "Hyperchains e redes baseadas em provas de conhecimento zero.", repo: "https://github.com/matter-labs/zksync-era", languages: ["Rust", "Solidity"], status: "reference", verified: false, license: "verificar" },
  { id: "polygon-cdk", name: "Polygon CDK", layers: [2], role: "Kit modular para blockchains baseadas em ZK.", repo: "https://github.com/0xPolygon/cdk", languages: ["Go", "Solidity"], status: "reference", verified: false, license: "verificar" },
  { id: "sovereign-sdk", name: "Sovereign SDK", layers: [2, 3], role: "Framework de rollups personalizáveis, com adaptadores para disponibilidade de dados e execução verificável.", repo: "https://github.com/Sovereign-Labs/sovereign-sdk", languages: ["Rust"], status: "reference", verified: false, license: "verificar", note: "Informa condições de revenue share para aplicações comerciais. Confirmar antes de habilitar." },
  { id: "rollkit", name: "Rollkit", layers: [2], role: "Framework modular para rollups soberanos.", repo: "https://github.com/rollkit/rollkit", languages: ["Go"], status: "reference", verified: false, license: "verificar" },
  { id: "dymension", name: "Dymension", layers: [3], role: "Ecossistema de rollups especializados em liquidez e RollApps.", repo: "https://github.com/dymensionxyz/dymension", languages: ["Go"], status: "reference", verified: false, license: "verificar" },

  // Componentes complementares (um construtor de blockchain precisa deles)
  { id: "revm", name: "REVM", layers: [1, 2], role: "Máquina virtual EVM em Rust.", repo: "https://github.com/bluealloy/revm", languages: ["Rust"], status: "reference", verified: false, license: "verificar" },
  { id: "wasmtime", name: "Wasmtime", layers: [1], role: "Runtime WASM para contratos e execução de módulos.", repo: "https://github.com/bytecodealliance/wasmtime", languages: ["Rust"], status: "reference", verified: false, license: "verificar" },
  { id: "cometbft", name: "CometBFT", layers: [1], role: "Consenso BFT com validadores.", repo: "https://github.com/cometbft/cometbft", languages: ["Go"], status: "reference", verified: false, license: "verificar" },
  { id: "rustcrypto", name: "RustCrypto", layers: [1, 2], role: "Primitivas criptográficas em Rust.", repo: "https://github.com/RustCrypto", languages: ["Rust"], status: "reference", verified: false, license: "verificar" },
  { id: "foundry", name: "Foundry", layers: [1, 2, 3], role: "Ferramentas para compilar, testar e implantar contratos inteligentes.", repo: "https://github.com/foundry-rs/foundry", languages: ["Rust"], status: "reference", verified: false, license: "verificar" },
  { id: "rocksdb", name: "RocksDB", layers: [1], role: "Banco de dados de chave-valor para o estado do nó.", repo: "https://github.com/facebook/rocksdb", languages: ["C++"], status: "reference", verified: false, license: "verificar" },
  { id: "rust-libp2p", name: "Rust libp2p", layers: [0, 1], role: "Comunicação P2P em Rust.", repo: "https://github.com/libp2p/rust-libp2p", languages: ["Rust"], status: "reference", verified: false, license: "verificar" },
  { id: "graph-node", name: "Graph Node", layers: [3], role: "Indexação de dados da blockchain para consultas de aplicações.", repo: "https://github.com/graphprotocol/graph-node", languages: ["Rust"], status: "reference", verified: false, license: "verificar" },
  { id: "plonky3", name: "Plonky3", layers: [2, 3], role: "Provas ZK para validar execução fora da cadeia.", repo: "https://github.com/Plonky3/Plonky3", languages: ["Rust"], status: "reference", verified: false, license: "verificar" },
];

// ---- Preço da criação de blockchains -------------------------------------------------------------
// Regra do produto: criar uma blockchain custa de 10% a 30% a mais em créditos que a ação base.
// O custo base é o do build/agente em `vibeAgentsConfig.ts`; o multiplicador aqui é só o adicional.

export type BlockchainTier = "basic" | "standard" | "advanced";

export const BLOCKCHAIN_TIER_MULTIPLIERS: Record<BlockchainTier, { multiplier: number; criteria: string }> = {
  basic: { multiplier: 1.1, criteria: "Uma camada, um engine, sem bridge nem ZK." },
  standard: { multiplier: 1.2, criteria: "Uma camada com validadores, explorador e APIs." },
  advanced: { multiplier: 1.3, criteria: "Várias camadas, bridge, provas ZK ou consenso próprio." },
};

export const BLOCKCHAIN_MIN_MULTIPLIER = 1.1;
export const BLOCKCHAIN_MAX_MULTIPLIER = 1.3;

/** Custo em créditos de criar uma blockchain: custo base × multiplicador da faixa, arredondado a 2 casas. */
export const blockchainCreditCost = (baseCredits: number, tier: BlockchainTier): number =>
  Math.round(baseCredits * BLOCKCHAIN_TIER_MULTIPLIERS[tier].multiplier * 100) / 100;

export const engineById = (id: string): BlockchainEngine | undefined =>
  BLOCKCHAIN_ENGINES.find((e) => e.id === id);

export const enginesForLayer = (layer: BlockchainLayer): BlockchainEngine[] =>
  BLOCKCHAIN_ENGINES.filter((e) => e.layers.includes(layer));
