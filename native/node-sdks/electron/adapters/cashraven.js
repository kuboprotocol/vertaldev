// Adapter Cash Raven SDK 4.1.4 (Electron / Node.js). Docs: https://cashraven.io/docs
//   Pacote @cashraven/electron — vem no cr-sdk-electron.zip do portal (com o core nativo) e é
//   instalado por scripts/fetch-sdk.sh. NUNCA commitar o zip nem a developer key.
//
// API pública documentada (cashraven.io/docs, aba Electron / Node):
//   const { CashRaven, showConsent } = require("@cashraven/electron");
//   const cr = new CashRaven({ developerKey, uid });
//   if (await showConsent(cr, { parent: mainWindow })) cr.start();   // só depois de aceitar
//   cr.optOut()  // OBRIGATÓRIO: controle de opt-out visível (checado na revisão de compliance)
//
// Regras: a tela de consentimento é a DO SDK (texto e links fixos da Cash Raven; dá para mudar só
// cores/parágrafos extras no portal). O SDK também faz opt-out sozinho quando bate limite de
// proteção (dados/CPU) — por isso o estado é sempre relido do SDK quando ele expõe getters.
//
// TODO(cashraven): a doc pública não lista getters de estado nem stop(). O código abaixo usa
// cr.isOptedIn / cr.isRunning / cr.stop() quando existem (função ou propriedade) e, se não,
// um estado local persistido. Conferir no README.md / AGENTS.md do cr-sdk-electron.zip.
"use strict";

const STORE_KEY = "cashraven.optedIn";

function readFlag(target, name) {
  if (!target) return undefined;
  const v = target[name];
  if (typeof v === "function") return v.call(target);
  if (typeof v === "boolean") return v;
  return undefined;
}

function createCashRavenAdapter({ loadModule = require } = {}) {
  let cr = null;
  let showConsent = null;
  let store = null;
  let localRunning = false;
  const listeners = new Set();

  const need = () => {
    if (!cr) throw new Error("[vertal-node] cashraven: chame init() antes");
    return cr;
  };
  const localOptedIn = () => Boolean(store && store.get(STORE_KEY));
  const setLocalOptedIn = (v) => store && store.set(STORE_KEY, Boolean(v));

  async function optedIn() {
    const v = await readFlag(need(), "isOptedIn");
    return typeof v === "boolean" ? v : localOptedIn();
  }
  async function running() {
    const v = await readFlag(need(), "isRunning");
    return typeof v === "boolean" ? v : localRunning;
  }
  async function emit() {
    if (!cr) return;
    const state = { optedIn: await optedIn(), running: await running() };
    for (const cb of listeners) cb(state);
  }

  return {
    id: "cashraven",
    vendor: "Cash Raven",
    enabled: true,

    async init({ apiKey, uid, store: kv }) {
      if (!apiKey) throw new Error("[vertal-node] cashraven: developer key ausente");
      if (!uid) throw new Error("[vertal-node] cashraven: uid ausente");
      const mod = loadModule("@cashraven/electron");
      showConsent = mod.showConsent;
      store = kv || null;
      // uid = id pseudônimo do dispositivo Vertal (nunca e-mail ou dado pessoal).
      cr = new mod.CashRaven({ developerKey: apiKey, uid });
      if (typeof cr.on === "function") {
        // Eventos opcionais (ex.: opt-out automático por proteção). Nomes a confirmar no AGENTS.md.
        for (const ev of ["opted-out", "optout", "state", "status"]) {
          try {
            cr.on(ev, () => {
              void emit();
            });
          } catch {
            /* evento não suportado */
          }
        }
      }
    },
    async requestConsent({ parent } = {}) {
      need();
      if (await optedIn()) return true;
      const accepted = Boolean(await showConsent(cr, parent ? { parent } : {}));
      setLocalOptedIn(accepted);
      void emit();
      return accepted;
    },
    isOptedIn: optedIn,
    isRunning: running,
    async start() {
      const c = need();
      if (!(await optedIn())) throw new Error("[vertal-node] sem consentimento: não é permitido iniciar");
      if (await running()) return;
      await c.start();
      localRunning = true;
      void emit();
    },
    async stop() {
      const c = need();
      if (typeof c.stop === "function") await c.stop();
      localRunning = false;
      void emit();
    },
    async optOut() {
      await need().optOut();
      localRunning = false;
      setLocalOptedIn(false);
      void emit();
    },
    onChange(cb) {
      listeners.add(cb);
    },
  };
}

module.exports = { createCashRavenAdapter };
