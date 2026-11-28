// Processo principal (Electron) — Vertal Node com a camada de provedores (adapters/).
//
// Só UM SDK de compartilhamento roda por dispositivo, escolhido por NODE_SDK_PROVIDER
// (padrão cashraven; honeygain aguardando aprovação, religável por config; pawns/bright/infatica/
// earnfm são stubs desligados). O pacote dos outros provedores nem é carregado.
//
// Regras comuns a todos os provedores:
//   * consentimento primeiro: activate() abre a tela de consentimento DO SDK (que nomeia o
//     fornecedor, como exigem os termos) e só inicia se o usuário aceitar;
//   * opt-out sempre fácil: o renderer mostra o interruptor "Compartilhar internet" → optOut();
//   * nunca abre o consentimento sozinho; só retoma se o usuário já tinha aceitado.
//
// Uso no seu main:
//   const { setupVertalNode } = require("./node-sdks/electron/main");
//   const node = setupVertalNode({ app, ipcMain, getWindow: () => mainWindow });
//   // depois do login no app: node.setAccessToken(session.access_token)
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const defaultConfig = require("./config");
const { createAdapter } = require("./adapters");

const CH = {
  activate: "vertal-node:activate",
  start: "vertal-node:start",
  stop: "vertal-node:stop",
  optOut: "vertal-node:opt-out",
  status: "vertal-node:status",
  setToken: "vertal-node:set-token",
  state: "vertal-node:state",
  heartbeat: "vertal-node:heartbeat-result",
};

/** Arquivo JSON simples em userData: deviceId e estado local dos adapters. */
function createStore(app) {
  const file = path.join(app.getPath("userData"), "vertal-node-device.json");
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8")) || {};
  } catch {
    /* primeiro uso */
  }
  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data), "utf8");
  };
  return {
    get: (k) => data[k],
    set: (k, v) => {
      data[k] = v;
      save();
    },
  };
}

function setupVertalNode({ app, ipcMain, getWindow, config = defaultConfig, adapter, loadModule, store }) {
  const kv = store || createStore(app);
  let deviceId = kv.get("deviceId");
  if (typeof deviceId !== "string") {
    deviceId = `desk-${crypto.randomUUID()}`;
    kv.set("deviceId", deviceId);
  }

  const provider = adapter ? adapter.id : config.provider();
  const sdk = adapter || createAdapter(provider, loadModule ? { loadModule } : undefined);
  const previous = kv.get("provider");
  if (previous && previous !== provider) {
    // Trocou de provedor: o SDK anterior não é mais carregado (logo, não roda). O consentimento
    // do novo provedor é pedido de novo, na tela dele.
    console.info(`[vertal-node] provedor trocado: ${previous} -> ${provider}`);
  }
  kv.set("provider", provider);

  let accessToken = null;
  let timer = null;
  const ready = sdk.enabled
    ? sdk.init({
        apiKey: config.apiKey(provider),
        uid: deviceId,
        store: kv,
        enableLogging: config.enableLogging,
        appId: typeof config.appId === "function" ? config.appId() : undefined,
      })
    : Promise.resolve();

  const send = (channel, value) => {
    const win = getWindow && getWindow();
    if (!win || win.isDestroyed() || !win.webContents || win.webContents.isDestroyed()) return;
    win.webContents.send(channel, value);
  };

  async function state() {
    await ready;
    return {
      provider,
      enabled: Boolean(sdk.enabled),
      deviceId,
      optedIn: await sdk.isOptedIn(),
      running: await sdk.isRunning(),
      // Diagnóstico opcional do adapter (ex.: Cash Raven: STOPPED|CONNECTING|SHARING|PAUSED|ERROR).
      sdkStatus: sdk.enabled && typeof sdk.status === "function" ? await sdk.status().catch(() => null) : null,
      signedIn: Boolean(accessToken),
      // Pausado pelo usuário (Pausar / Desativar): não religa sozinho ao abrir o app.
      paused: kv.get("userPaused") === true,
    };
  }

  const stateListeners = new Set();
  async function publish() {
    let s;
    try {
      s = await state();
    } catch {
      return null;
    }
    for (const cb of stateListeners) {
      try {
        cb(s);
      } catch {
        /* listener com erro não derruba os outros */
      }
    }
    return s;
  }

  async function heartbeat() {
    if (!accessToken) return null;
    let s;
    try {
      s = await state();
    } catch {
      s = { optedIn: false, running: false };
    }
    const body = {
      device_id: deviceId,
      platform: "desktop",
      provider,
      app_version: config.appVersion,
      opted_in: Boolean(s.optedIn),
      running: Boolean(s.running),
    };
    try {
      const res = await fetch(`${config.supabaseUrl()}/functions/v1/vertal-node-heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.supabaseAnonKey(),
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });
      const result = await res.json().catch(() => ({}));
      send(CH.heartbeat, { status: res.status, ...result });
      return result;
    } catch (err) {
      send(CH.heartbeat, { status: 0, error: String(err && err.message ? err.message : err) });
      return null;
    }
  }

  function schedule() {
    if (timer) clearInterval(timer);
    timer = setInterval(heartbeat, config.heartbeatIntervalMs);
    void heartbeat();
  }

  async function activate() {
    await ready;
    if (!sdk.enabled) return state();
    const win = getWindow && getWindow();
    const accepted = (await sdk.isOptedIn()) || (await sdk.requestConsent({ parent: win || undefined }));
    if (accepted) {
      kv.set("userPaused", false);
      if (!(await sdk.isRunning())) await sdk.start();
    }
    void heartbeat();
    return (await publish()) || state();
  }

  /** Pausar: para de compartilhar; o consentimento continua, mas não religa sozinho. */
  async function pause() {
    await ready;
    kv.set("userPaused", true);
    if (sdk.enabled) await sdk.stop();
    void heartbeat();
    return (await publish()) || state();
  }

  async function optOut() {
    await ready;
    kv.set("userPaused", true);
    await sdk.optOut();
    void heartbeat();
    return (await publish()) || state();
  }

  ipcMain.handle(CH.activate, () => activate());
  ipcMain.handle(CH.start, async () => {
    await ready;
    if (await sdk.isOptedIn()) {
      kv.set("userPaused", false);
      await sdk.start();
    }
    void heartbeat();
    return (await publish()) || state();
  });
  ipcMain.handle(CH.stop, () => pause());
  ipcMain.handle(CH.optOut, () => optOut());
  ipcMain.handle(CH.status, () => state());
  ipcMain.handle(CH.setToken, (_e, token) => {
    accessToken = typeof token === "string" && token ? token : null;
    if (accessToken) schedule();
    else if (timer) clearInterval(timer);
    return true;
  });

  if (typeof sdk.onChange === "function") {
    sdk.onChange((s) => {
      send(CH.state, { provider, ...s });
      void publish();
      void heartbeat();
    });
  }

  // Retoma sozinho se o usuário já tinha aceitado e não pausou (nunca pede consentimento sem clique).
  void ready
    .then(async () => {
      if (kv.get("userPaused") === true) return;
      if (sdk.enabled && (await sdk.isOptedIn()) && !(await sdk.isRunning())) await sdk.start();
      void publish();
    })
    .catch((err) => console.error("[vertal-node] falha ao iniciar o SDK:", err && err.message ? err.message : err));

  app.on("before-quit", () => {
    if (timer) clearInterval(timer);
    // Cash Raven exige dispose() ao sair; os outros adapters não precisam.
    if (typeof sdk.dispose === "function") void Promise.resolve(sdk.dispose()).catch(() => {});
  });

  return {
    provider,
    sdk,
    deviceId,
    ready,
    activate,
    pause,
    optOut,
    state,
    /** Estado novo a cada mudança (bandeja: tray.js). */
    onState: (cb) => {
      stateListeners.add(cb);
      return () => stateListeners.delete(cb);
    },
    heartbeat,
    setAccessToken: (token) => {
      accessToken = token || null;
      if (accessToken) schedule();
      else if (timer) clearInterval(timer);
    },
  };
}

module.exports = { setupVertalNode, CHANNELS: CH };
