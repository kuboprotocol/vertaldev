#!/usr/bin/env node
// Grava as chaves do Vertal Node desktop NO BUILD (CI: secrets do GitHub Actions) em
// native/node-sdks/electron/build-config.json (gitignored), que vai dentro do pacote do app.
// Nunca imprime valores: só diz quais variáveis entraram e quais faltaram.
//   CASHRAVEN_API_KEY_DESKTOP=... VERTAL_SUPABASE_URL=... VERTAL_SUPABASE_ANON_KEY=... node scripts/inject-build-config.js
// Aviso: uma chave de SDK distribuída dentro de um app pode ser extraída (normal nesses SDKs de parceiro);
// a Cash Raven amarra a chave ao Application ID (VERTAL_NODE_APP_ID) para limitar o reaproveitamento.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const KEYS = [
  "NODE_SDK_PROVIDER",
  "CASHRAVEN_API_KEY_DESKTOP",
  "VERTAL_NODE_APP_ID",
  "VERTAL_SUPABASE_URL",
  "VERTAL_SUPABASE_ANON_KEY",
];

function buildConfig(env = process.env) {
  const out = {};
  for (const k of KEYS) {
    const v = env[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

function writeBuildConfig(file, env = process.env) {
  const data = buildConfig(env);
  fs.writeFileSync(file, JSON.stringify(data), { encoding: "utf8", mode: 0o600 });
  return { present: Object.keys(data), missing: KEYS.filter((k) => !(k in data)) };
}

if (require.main === module) {
  const file = path.join(__dirname, "..", "build-config.json");
  const { present, missing } = writeBuildConfig(file);
  console.log(`[vertal-node] build-config.json: ${present.join(", ") || "(vazio)"}`);
  if (missing.length) console.log(`[vertal-node] ausentes: ${missing.join(", ")}`);
  if (!present.includes("CASHRAVEN_API_KEY_DESKTOP")) {
    console.log("[vertal-node] sem CASHRAVEN_API_KEY_DESKTOP: o app sai com o Vertal Node desligado.");
  }
}

module.exports = { buildConfig, writeBuildConfig, KEYS };
