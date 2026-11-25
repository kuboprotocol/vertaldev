// Preload (contextIsolation: true) — expõe ao renderer só a API genérica do Vertal Node
// (window.vertalNode). Não importa qual SDK está por baixo.
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const vertalNode = {
  /** Abre a tela de consentimento do SDK (se preciso) e inicia só se o usuário aceitou. */
  activate: () => ipcRenderer.invoke("vertal-node:activate"),
  start: () => ipcRenderer.invoke("vertal-node:start"),
  stop: () => ipcRenderer.invoke("vertal-node:stop"),
  /** Opt-out: retira o consentimento e para na hora. */
  optOut: () => ipcRenderer.invoke("vertal-node:opt-out"),
  /** { provider, enabled, deviceId, optedIn, running, signedIn } */
  status: () => ipcRenderer.invoke("vertal-node:status"),
  /** Passe o access_token da sessão Supabase depois do login (ou null ao sair). */
  setAccessToken: (token) => ipcRenderer.invoke("vertal-node:set-token", token),
  onStateChange: (callback) => {
    ipcRenderer.on("vertal-node:state", (_event, state) => callback(state));
  },
  onHeartbeat: (callback) => {
    ipcRenderer.on("vertal-node:heartbeat-result", (_event, result) => callback(result));
  },
};

contextBridge.exposeInMainWorld("vertalNode", vertalNode);
