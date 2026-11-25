// Camada de provedores do Vertal Node (desktop / Electron).
//
// Cada SDK de compartilhamento de banda é um "adapter" com a MESMA interface:
//
//   interface NodeSdkAdapter {
//     id: string;            // "honeygain" | "cashraven" | "pawns" | "bright" | "infatica" | "earnfm"
//     vendor: string;        // nome do fornecedor (só para logs/consentimento; a UI usa a marca Vertal)
//     enabled: boolean;      // false = stub aguardando aprovação do parceiro
//     init({ apiKey, uid, store, enableLogging }): Promise<void>
//     requestConsent({ parent }): Promise<boolean>   // tela de consentimento DO SDK (nomeia o fornecedor)
//     isOptedIn(): Promise<boolean>
//     isRunning(): Promise<boolean>
//     start(): Promise<void>  // só depois de isOptedIn() === true
//     stop(): Promise<void>
//     optOut(): Promise<void> // retira o consentimento e para na hora
//     onChange?(cb: ({ optedIn, running }) => void): void
//   }
//
// Só UM provedor roda por dispositivo (NODE_SDK_PROVIDER). Os outros nem são carregados, o que
// evita dois SDKs disputando a mesma conexão e problemas de exclusividade com os parceiros.
"use strict";

const { createHoneygainAdapter } = require("./honeygain");
const { createCashRavenAdapter } = require("./cashraven");
const { createDisabledAdapter } = require("./disabled");

/** Provedores conhecidos. `enabled: false` = aguardando aprovação/contrato do parceiro. */
// `pending`: adapter implementado mas aguardando aprovação do parceiro — continua selecionável por
// NODE_SDK_PROVIDER, só não é o padrão (config.js usa cashraven).
const PROVIDERS = Object.freeze({
  honeygain: { enabled: true, pending: "aguardando aprovação", create: createHoneygainAdapter },
  cashraven: { enabled: true, create: createCashRavenAdapter },
  // TODO(pawns): aguardando aprovação do parceiro. Docs: https://business.pawns.app/sdk
  pawns: {
    enabled: false,
    create: () => createDisabledAdapter({ id: "pawns", vendor: "Pawns.app", docsUrl: "https://business.pawns.app/sdk" }),
  },
  // Bright SDK: NÃO existe SDK Electron/Node (a Bright só tem Windows .NET / C/C++ no desktop).
  // O adapter Android está em android/app/src/bright (desligado até a aprovação). Desktop = stub.
  bright: {
    enabled: false,
    create: () =>
      createDisabledAdapter({
        id: "bright",
        vendor: "Bright SDK",
        docsUrl: "https://docs.bright-sdk.com (sem SDK Electron; só Windows .NET/C++)",
      }),
  },
  // TODO(infatica): aguardando aprovação do parceiro. Docs: https://infatica-sdk.io
  infatica: {
    enabled: false,
    create: () => createDisabledAdapter({ id: "infatica", vendor: "Infatica SDK", docsUrl: "https://infatica-sdk.io" }),
  },
  // TODO(earnfm): aguardando aprovação do parceiro. Docs: https://earn.fm/en/business/apps
  earnfm: {
    enabled: false,
    create: () =>
      createDisabledAdapter({ id: "earnfm", vendor: "EarnFM", docsUrl: "https://earn.fm/en/business/apps" }),
  },
});

const PROVIDER_IDS = Object.freeze(Object.keys(PROVIDERS));

/**
 * Cria o adapter do provedor escolhido. `loadModule` (padrão: require) é injetável para testes,
 * e só o pacote do provedor escolhido é carregado.
 */
function createAdapter(providerId, { loadModule = require } = {}) {
  const id = String(providerId || "").trim().toLowerCase();
  const entry = PROVIDERS[id];
  if (!entry) {
    throw new Error(`[vertal-node] NODE_SDK_PROVIDER inválido: "${providerId}" (use: ${PROVIDER_IDS.join(", ")})`);
  }
  return entry.create({ loadModule });
}

module.exports = { createAdapter, PROVIDERS, PROVIDER_IDS };
