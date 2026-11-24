// Configuração do Vertal Node (desktop). Nada de segredo no repositório:
// HONEYGAIN_API_KEY vem do ambiente no build/execução (chave do app DESKTOP no dashboard
// https://sdk.honeygain.com/dashboard — o Android tem outra chave).
"use strict";

function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`[vertal-node] variável de ambiente ausente: ${name}`);
  return v.trim();
}

module.exports = {
  honeygainApiKey: () => required("HONEYGAIN_API_KEY"),
  // Projeto Supabase do Vertal Dev (o mesmo da web). A chave anon é pública.
  supabaseUrl: () => required("VERTAL_SUPABASE_URL"),
  supabaseAnonKey: () => required("VERTAL_SUPABASE_ANON_KEY"),
  // Intervalo do heartbeat. O crédito é 1x por dia; o heartbeat só mantém o status em dia.
  heartbeatIntervalMs: Number(process.env.VERTAL_NODE_HEARTBEAT_MS || 30 * 60 * 1000),
  appVersion: process.env.npm_package_version || null,
  enableLogging: process.env.HONEYGAIN_LOGGING === "1",
};
