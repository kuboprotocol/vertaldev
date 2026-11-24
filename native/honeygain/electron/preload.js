// Preload (contextIsolation: true) — expõe o SDK ao renderer como no guia oficial (window.hgSdk)
// e os extras do Vertal Node (window.vertalNode).
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const hgSdk = {
  start: () => ipcRenderer.invoke("hg-sdk:start"),
  stop: () => ipcRenderer.invoke("hg-sdk:stop"),
  requestConsent: () => ipcRenderer.invoke("hg-sdk:request-consent"),
  isRunning: () => ipcRenderer.invoke("hg-sdk:is-running"),
  isOptedIn: () => ipcRenderer.invoke("hg-sdk:is-opted-in"),
  optIn: () => ipcRenderer.invoke("hg-sdk:opt-in"),
  optOut: () => ipcRenderer.invoke("hg-sdk:opt-out"),
  onIsRunningChange: (callback) => {
    ipcRenderer.on("hg-sdk:is-running", (_event, isRunning) => callback(isRunning));
  },
  onIsOptedInChange: (callback) => {
    ipcRenderer.on("hg-sdk:is-opted-in", (_event, isOptedIn) => callback(isOptedIn));
  },
};

const vertalNode = {
  /** Abre a janela de consentimento nativa (se preciso) e inicia só se o usuário aceitou. */
  activate: () => ipcRenderer.invoke("vertal-node:activate"),
  /** Passe o access_token da sessão Supabase depois do login (ou null ao sair). */
  setAccessToken: (token) => ipcRenderer.invoke("vertal-node:set-token", token),
  status: () => ipcRenderer.invoke("vertal-node:status"),
  onHeartbeat: (callback) => {
    ipcRenderer.on("vertal-node:heartbeat-result", (_event, result) => callback(result));
  },
};

contextBridge.exposeInMainWorld("hgSdk", hgSdk);
contextBridge.exposeInMainWorld("vertalNode", vertalNode);
