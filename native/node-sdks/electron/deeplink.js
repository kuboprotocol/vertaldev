// Deep link do Vertal Node no computador (Windows, macOS, Linux): vertalnode://open?appId&ref&source
//
// Aberto pelo loader vertal.js (Vertal.node.openApp() no site). O link SÓ traz a janela para a frente
// e avisa o renderer; nunca liga o compartilhamento (isso continua exigindo "Ativar" + a tela de
// consentimento do parceiro). Mesmas regras do app Android (DeepLink.kt): lista branca appId/app_id,
// ref, source; valores [A-Za-z0-9._-]{1,64}; o resto é ignorado.
//
// Uso no main, ANTES de app "ready" (o macOS entrega o link cedo, no evento open-url):
//   const { setupDeepLink } = require("./node-sdks/electron/deeplink");
//   const link = setupDeepLink({ app, ipcMain, getWindow: () => mainWindow });
//   if (!link.primary) return; // outra instância já está aberta; esta sai
//
// Registro do esquema no sistema (feito pelo instalador; ver native/node-sdks/README.md):
//   electron-builder: protocols: [{ name: "Vertal Node", schemes: ["vertalnode"] }]
//   → Windows: HKCU\Software\Classes\vertalnode (URL Protocol); macOS: CFBundleURLTypes no Info.plist;
//     Linux: MimeType=x-scheme-handler/vertalnode; no .desktop.
"use strict";

const path = require("node:path");

const SCHEME = "vertalnode";
const HOST = "open";
const SAFE_VALUE = /^[A-Za-z0-9._-]{1,64}$/;
const KEYS = Object.freeze({ appId: "appId", app_id: "appId", ref: "ref", source: "source" });
const CH = Object.freeze({ event: "vertal-node:deep-link", pending: "vertal-node:deep-link-pending" });

/** Devolve { appId, ref, source } (campos ausentes = null) para vertalnode://open; null para o resto. */
function parseDeepLink(raw) {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 2048) return null;
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol.toLowerCase() !== `${SCHEME}:`) return null;
  // WHATWG: em esquema não especial, "vertalnode://open" tem host "open" e caminho vazio.
  if (url.hostname.toLowerCase() !== HOST) return null;
  if (url.pathname && url.pathname !== "/") return null;
  if (url.username || url.password || url.port) return null;
  const out = { appId: null, ref: null, source: null };
  if (url.search.length <= 1025) {
    for (const [key, value] of url.searchParams) {
      const field = Object.prototype.hasOwnProperty.call(KEYS, key) ? KEYS[key] : null;
      if (!field || out[field] !== null) continue; // desconhecido ignora; repetido vale o primeiro
      const v = value.trim();
      if (SAFE_VALUE.test(v)) out[field] = v;
    }
  }
  return out;
}

/** O primeiro argumento que é um vertalnode:// (Windows e Linux passam o link na linha de comando). */
function findLinkArg(argv) {
  return (Array.isArray(argv) ? argv : []).find((a) => typeof a === "string" && /^vertalnode:/i.test(a)) || null;
}

function setupDeepLink({ app, ipcMain, getWindow, onLink, argv = process.argv, proc = process } = {}) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return { primary: false, pending: () => null };
  }

  // Em desenvolvimento (electron .) o Windows precisa do caminho do script para reabrir o app.
  if (proc.defaultApp && argv.length >= 2) {
    app.setAsDefaultProtocolClient(SCHEME, proc.execPath, [path.resolve(argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(SCHEME);
  }

  let pending = null;

  const focus = () => {
    const win = getWindow && getWindow();
    if (!win || win.isDestroyed()) return null;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return win;
  };

  const handle = (raw) => {
    const link = parseDeepLink(raw);
    if (!link) return null;
    pending = link;
    const win = focus();
    if (win && win.webContents && !win.webContents.isDestroyed()) win.webContents.send(CH.event, link);
    if (typeof onLink === "function") {
      try {
        onLink(link);
      } catch {
        /* erro do app, não do link */
      }
    }
    return link;
  };

  // Windows/Linux: o sistema abre uma 2ª instância com o link no argv; ela sai e o link chega aqui.
  app.on("second-instance", (_event, otherArgv) => {
    if (!handle(findLinkArg(otherArgv))) focus();
  });
  // macOS: link chega por open-url (também na abertura a frio, antes de "ready").
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handle(url);
  });
  // Windows/Linux, abertura a frio: o link vem no próprio argv.
  const initial = findLinkArg(argv);
  if (initial) pending = parseDeepLink(initial);

  // O renderer pergunta ao montar (a janela pode não existir quando o link chegou).
  if (ipcMain) ipcMain.handle(CH.pending, () => pending);

  return { primary: true, pending: () => pending, handle };
}

module.exports = { setupDeepLink, parseDeepLink, findLinkArg, SCHEME, CHANNELS: CH };
