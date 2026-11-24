// Processo principal (Electron) — Vertal Node com Honeygain SDK.
//
// Segue o guia oficial: https://developers.honeygain.com/docs/integration-guides/electron
//   npm install ./honeygain-electron-sdk.tgz   (baixado do dashboard; NUNCA commitar)
//
// Regras de consentimento (https://developers.honeygain.com/docs/legal):
//   * nada roda sem consentimento: usamos a janela NATIVA do SDK (sdk.requestConsent()), que já
//     nomeia o "Honeygain SDK", explica o exit node e tem o botão "I accept". Tela própria só com
//     aprovação do Honeygain.
//   * opt-out sempre fácil: o renderer mostra um interruptor "Compartilhar internet" que chama optOut().
//
// Uso no seu main:
//   const { setupVertalNode } = require("./honeygain/main");
//   const node = setupVertalNode({ app, ipcMain, getWindow: () => mainWindow });
//   // depois do login no app: node.setAccessToken(session.access_token)
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("./config");

const CH = {
  start: "hg-sdk:start",
  stop: "hg-sdk:stop",
  requestConsent: "hg-sdk:request-consent",
  isRunning: "hg-sdk:is-running",
  isOptedIn: "hg-sdk:is-opted-in",
  optIn: "hg-sdk:opt-in",
  optOut: "hg-sdk:opt-out",
  // Extras do Vertal
  activate: "vertal-node:activate",
  setToken: "vertal-node:set-token",
  status: "vertal-node:status",
  heartbeat: "vertal-node:heartbeat-result",
};

function loadDeviceId(app) {
  const file = path.join(app.getPath("userData"), "vertal-node-device.json");
  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (saved && typeof saved.deviceId === "string") return saved.deviceId;
  } catch {
    /* primeiro uso */
  }
  const deviceId = `desk-${crypto.randomUUID()}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ deviceId }), "utf8");
  return deviceId;
}

function setupVertalNode({ app, ipcMain, getWindow, HgSdkImpl }) {
  const { HgSdk } = HgSdkImpl ? { HgSdk: HgSdkImpl } : require("@honeygain/electron-sdk");
  const sdk = new HgSdk({ apiKey: config.honeygainApiKey(), enableLogging: config.enableLogging });
  const deviceId = loadDeviceId(app);
  let accessToken = null;
  let timer = null;

  const send = (channel, value) => {
    const win = getWindow && getWindow();
    if (!win || win.isDestroyed() || !win.webContents || win.webContents.isDestroyed()) return;
    win.webContents.send(channel, value);
  };

  async function heartbeat() {
    if (!accessToken) return null;
    const body = {
      device_id: deviceId,
      platform: "desktop",
      app_version: config.appVersion,
      opted_in: Boolean(sdk.isOptedIn),
      running: Boolean(sdk.isRunning),
    };
    try {
      const res = await fetch(`${config.supabaseUrl()}/functions/v1/honeygain-node-heartbeat`, {
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

  // Métodos do guia oficial.
  ipcMain.handle(CH.start, () => sdk.start());
  ipcMain.handle(CH.stop, () => sdk.stop());
  ipcMain.handle(CH.requestConsent, () => sdk.requestConsent());
  ipcMain.handle(CH.isRunning, () => sdk.isRunning);
  ipcMain.handle(CH.isOptedIn, () => sdk.isOptedIn);
  ipcMain.handle(CH.optIn, () => sdk.optIn());
  ipcMain.handle(CH.optOut, async () => {
    await sdk.optOut();
    void heartbeat();
  });

  // Fluxo "consentimento primeiro": só inicia se o usuário aceitou na janela nativa.
  ipcMain.handle(CH.activate, async () => {
    if (!sdk.isOptedIn) await sdk.requestConsent();
    if (sdk.isOptedIn && !sdk.isRunning) await sdk.start();
    void heartbeat();
    return { optedIn: Boolean(sdk.isOptedIn), running: Boolean(sdk.isRunning) };
  });
  ipcMain.handle(CH.setToken, (_e, token) => {
    accessToken = typeof token === "string" && token ? token : null;
    if (accessToken) schedule();
    else if (timer) clearInterval(timer);
    return true;
  });
  ipcMain.handle(CH.status, () => ({
    deviceId,
    optedIn: Boolean(sdk.isOptedIn),
    running: Boolean(sdk.isRunning),
    signedIn: Boolean(accessToken),
  }));

  sdk.on("is-running", (isRunning) => {
    send(CH.isRunning, isRunning);
    void heartbeat();
  });
  sdk.on("is-opted-in", (isOptedIn) => {
    send(CH.isOptedIn, isOptedIn);
    void heartbeat();
  });

  // Retoma sozinho se o usuário já tinha aceitado antes (nunca pede consentimento sem clique).
  if (sdk.isOptedIn && !sdk.isRunning) void sdk.start();

  app.on("before-quit", () => {
    if (timer) clearInterval(timer);
  });

  return {
    sdk,
    deviceId,
    heartbeat,
    setAccessToken: (token) => {
      accessToken = token || null;
      if (accessToken) schedule();
    },
  };
}

module.exports = { setupVertalNode, CHANNELS: CH };
