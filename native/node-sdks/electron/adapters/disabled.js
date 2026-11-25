// Adapter "desligado" para provedores que ainda aguardam aprovação do parceiro.
// Mantém a interface, nunca carrega SDK nenhum e recusa iniciar.
"use strict";

function createDisabledAdapter({ id, vendor, docsUrl }) {
  const fail = async () => {
    throw new Error(`[vertal-node] provedor "${id}" desativado (aguardando aprovação do parceiro; docs: ${docsUrl})`);
  };
  return {
    id,
    vendor,
    docsUrl,
    enabled: false,
    init: fail,
    requestConsent: fail,
    start: fail,
    async isOptedIn() {
      return false;
    },
    async isRunning() {
      return false;
    },
    async stop() {},
    async optOut() {},
    onChange() {},
  };
}

module.exports = { createDisabledAdapter };
