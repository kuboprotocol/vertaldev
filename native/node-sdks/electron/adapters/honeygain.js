// Adapter Honeygain SDK (Electron). Guia: https://developers.honeygain.com/docs/integration-guides/electron
//   npm install ./vendor/honeygain-electron-sdk.tgz   (baixado do dashboard; NUNCA commitar)
// Consentimento: janela NATIVA do SDK (requestConsent), que nomeia o Honeygain SDK, explica o exit
// node e tem "I accept". Tela própria só com aprovação do Honeygain.
"use strict";

function createHoneygainAdapter({ loadModule = require } = {}) {
  let sdk = null;
  const listeners = new Set();

  const need = () => {
    if (!sdk) throw new Error("[vertal-node] honeygain: chame init() antes");
    return sdk;
  };
  const emit = () => {
    if (!sdk) return;
    const state = { optedIn: Boolean(sdk.isOptedIn), running: Boolean(sdk.isRunning) };
    for (const cb of listeners) cb(state);
  };

  return {
    id: "honeygain",
    vendor: "Honeygain",
    enabled: true,

    async init({ apiKey, enableLogging = false }) {
      if (!apiKey) throw new Error("[vertal-node] honeygain: API key ausente");
      const { HgSdk } = loadModule("@honeygain/electron-sdk");
      sdk = new HgSdk({ apiKey, enableLogging });
      if (typeof sdk.on === "function") {
        sdk.on("is-running", emit);
        sdk.on("is-opted-in", emit);
      }
    },
    async requestConsent() {
      const s = need();
      if (!s.isOptedIn) await s.requestConsent();
      return Boolean(s.isOptedIn);
    },
    async isOptedIn() {
      return Boolean(need().isOptedIn);
    },
    async isRunning() {
      return Boolean(need().isRunning);
    },
    async start() {
      const s = need();
      if (!s.isOptedIn) throw new Error("[vertal-node] sem consentimento: não é permitido iniciar");
      if (!s.isRunning) await s.start();
    },
    async stop() {
      await need().stop();
    },
    async optOut() {
      await need().optOut();
      emit();
    },
    onChange(cb) {
      listeners.add(cb);
    },
  };
}

module.exports = { createHoneygainAdapter };
