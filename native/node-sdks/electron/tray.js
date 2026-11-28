// Ícone na bandeja (Windows / macOS / Linux) do Vertal Node desktop: mostra o estado e deixa
// Ativar, Pausar e Desativar (opt-out) sempre à mão, como os parceiros exigem.
// "Ativar" passa pela tela de consentimento DO PARCEIRO (node.activate); nada liga sozinho.
//
// Uso no main do app:
//   const { Tray, Menu, nativeImage } = require("electron");
//   const node = setupVertalNode({ app, ipcMain, getWindow });
//   createVertalNodeTray({ Tray, Menu, nativeImage, node, iconPath: path.join(__dirname, "tray.png"), onOpen: () => win.show() });
"use strict";

function label(state) {
  if (!state || !state.enabled) return "Vertal Node: indisponível neste build";
  if (!state.optedIn) return "Vertal Node: desligado (sem consentimento)";
  if (state.running) return "Vertal Node: compartilhando";
  return "Vertal Node: pausado";
}

function buildTemplate(state, actions) {
  const enabled = Boolean(state && state.enabled);
  const optedIn = Boolean(state && state.optedIn);
  const running = Boolean(state && state.running);
  const items = [
    { id: "status", label: label(state), enabled: false },
    { type: "separator" },
    { id: "activate", label: optedIn ? "Retomar" : "Ativar…", enabled: enabled && !running, click: actions.activate },
    { id: "pause", label: "Pausar", enabled: enabled && running, click: actions.pause },
    { id: "optOut", label: "Desativar (opt-out)", enabled: enabled && optedIn, click: actions.optOut },
  ];
  if (actions.open) items.push({ type: "separator" }, { id: "open", label: "Abrir", click: actions.open });
  return items;
}

function createVertalNodeTray({ Tray, Menu, nativeImage, node, iconPath, onOpen }) {
  const icon = nativeImage && iconPath ? nativeImage.createFromPath(iconPath) : iconPath;
  const tray = new Tray(icon);
  tray.setToolTip("Vertal Node");
  let last = null;

  const render = (state) => {
    last = state || last;
    tray.setToolTip(label(last));
    tray.setContextMenu(Menu.buildFromTemplate(buildTemplate(last, actions)));
  };
  const run = (fn) => () =>
    Promise.resolve()
      .then(fn)
      .then(render)
      .catch((err) => console.error("[vertal-node] bandeja:", err && err.message ? err.message : err));
  const actions = {
    activate: run(() => node.activate()),
    pause: run(() => node.pause()),
    optOut: run(() => node.optOut()),
    open: onOpen,
  };

  render({ enabled: Boolean(node.sdk && node.sdk.enabled), optedIn: false, running: false });
  Promise.resolve(node.state()).then(render).catch(() => {});
  if (typeof node.onState === "function") node.onState(render);
  return { tray, render, destroy: () => tray.destroy() };
}

module.exports = { createVertalNodeTray, buildTemplate, label };
