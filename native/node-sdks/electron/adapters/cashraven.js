// Adapter Cash Raven SDK 4.1.4 (Electron / Node.js). Docs: https://cashraven.io/docs
//   Pacote @cashraven/electron 4.1.4 — vem no cr-sdk-electron.zip do portal (com o core nativo
//   para Windows x64 / macOS universal / Linux x64, via koffi) e é instalado por
//   scripts/fetch-sdk.sh. NUNCA commitar o zip nem a developer key.
//
// API conferida no index.d.ts / AGENTS.md / src/client.js do cr-sdk-electron.zip 4.1.4
// (SHA-256 96037001…f028), em 2026-11-24:
//   const { CashRaven, showConsent } = require("@cashraven/electron");
//   const cr = new CashRaven({ developerKey, uid, appId?, dataDir? });   // começa OPTED-OUT
//   await showConsent(cr, { parent })  // tela DO SDK; no aceite ela mesma chama cr.optIn()
//   cr.start() / cr.stop()             // idempotentes, síncronos (o core roda no runtime dele)
//   cr.optOut()                        // OBRIGATÓRIO: controle de opt-out visível
//   cr.consentStatus()                 // "not_responded" | "accepted" | "declined" | "revoked"
//   cr.isOptedIn() / cr.isRunning() / cr.status() / cr.authStatus() / cr.onEvent(cb) / cr.dispose()
//
// Regras do SDK (compliance da Cash Raven):
//   * consentimento só pela tela do SDK; nunca chamar optIn() fora do aceite;
//   * o estado de consentimento é do SDK (persistido em dataDir) — não guardar cópia própria;
//   * isOptedIn() fica false enquanto pausado; para "o usuário aceitou" vale consentStatus();
//   * status "ERROR" = só chave recusada pelo backend (authStatus().code: unknown_key,
//     key_disabled, device_cap, not_consented, app_identity) — erro de configuração, não de rede;
//   * dispose() ao sair do app.
"use strict";

function createCashRavenAdapter({ loadModule = require } = {}) {
  let cr = null;
  let showConsent = null;
  let stopEvents = null;
  const listeners = new Set();

  const need = () => {
    if (!cr) throw new Error("[vertal-node] cashraven: chame init() antes");
    return cr;
  };

  /** "O usuário aceitou" (inclui pausado). Fonte da verdade: consentStatus() do SDK. */
  function optedIn() {
    const c = need();
    if (typeof c.consentStatus === "function") return c.consentStatus() === "accepted";
    return Boolean(c.isOptedIn());
  }
  function running() {
    return Boolean(need().isRunning());
  }
  function emit() {
    if (!cr) return;
    let state;
    try {
      state = { optedIn: optedIn(), running: running() };
    } catch {
      return; // cliente já liberado (dispose)
    }
    for (const cb of listeners) cb(state);
  }

  return {
    id: "cashraven",
    vendor: "Cash Raven",
    enabled: true,

    async init({ apiKey, uid, appId, dataDir }) {
      if (!apiKey) throw new Error("[vertal-node] cashraven: developer key ausente");
      if (!uid) throw new Error("[vertal-node] cashraven: uid ausente");
      const mod = loadModule("@cashraven/electron");
      showConsent = mod.showConsent;
      // uid = id pseudônimo do dispositivo Vertal (nunca e-mail ou dado pessoal).
      // appId (opcional) = Application ID registrado no portal: chave copiada para outro app para de funcionar.
      // dataDir: padrão do SDK é userData/cashraven (onde ficam device id e consentimento).
      const opts = { developerKey: apiKey, uid };
      if (appId) opts.appId = appId;
      if (dataDir) opts.dataDir = dataDir;
      cr = new mod.CashRaven(opts);
      // Eventos (conectou, opt-out automático por proteção, chave recusada…): o SDK faz polling do
      // log do core; nunca registrar callback nativo via koffi (thread fora do V8).
      if (typeof cr.onEvent === "function") stopEvents = cr.onEvent(() => emit());
    },
    async requestConsent({ parent } = {}) {
      const c = need();
      if (optedIn()) return true;
      // showConsent chama optIn() no aceite; recusar/fechar/Esc = false e continua opted-out.
      const accepted = Boolean(await showConsent(c, parent ? { parent } : {}));
      emit();
      return accepted;
    },
    async isOptedIn() {
      return optedIn();
    },
    async isRunning() {
      return running();
    },
    /** Diagnóstico: status do SDK e, se a chave foi recusada, o motivo (para o desenvolvedor). */
    async status() {
      const c = need();
      const status = typeof c.status === "function" ? c.status() : null;
      const auth = typeof c.authStatus === "function" ? c.authStatus() : null;
      return { status, authCode: auth && auth.state === "rejected" ? auth.code : null };
    },
    async start() {
      const c = need();
      if (!optedIn()) throw new Error("[vertal-node] sem consentimento: não é permitido iniciar");
      c.start(); // idempotente
      emit();
    },
    async stop() {
      need().stop(); // idempotente; consentimento e device id continuam
      emit();
    },
    async optOut() {
      const c = need();
      c.optOut(); // retira o consentimento e para de compartilhar
      c.stop(); // libera o engine (o cliente continua reutilizável)
      emit();
    },
    async dispose() {
      if (stopEvents) stopEvents();
      stopEvents = null;
      if (cr && typeof cr.dispose === "function") cr.dispose();
      cr = null;
    },
    onChange(cb) {
      listeners.add(cb);
    },
  };
}

module.exports = { createCashRavenAdapter };
