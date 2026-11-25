// Configuração do Vertal Node (desktop). Nada de segredo no repositório: tudo vem do ambiente
// no build/execução. As chaves NUNCA são impressas em log (só o nome da variável que falta).
"use strict";

// Cash Raven por padrão. Honeygain: código intacto, aguardando aprovação do parceiro — religar
// com NODE_SDK_PROVIDER=honeygain quando aprovarem.
const DEFAULT_PROVIDER = "cashraven";

/** Variável da chave DESKTOP de cada provedor (o Android usa outra chave). */
const API_KEY_ENV = Object.freeze({
  honeygain: "HONEYGAIN_API_KEY",
  cashraven: "CASHRAVEN_API_KEY_DESKTOP",
  pawns: "PAWNS_API_KEY_DESKTOP",
  bright: "BRIGHT_API_KEY_DESKTOP",
  infatica: "INFATICA_API_KEY_DESKTOP",
  earnfm: "EARNFM_API_KEY_DESKTOP",
});

function required(env, name) {
  const v = env[name];
  if (!v || !String(v).trim()) throw new Error(`[vertal-node] variável de ambiente ausente: ${name}`);
  return String(v).trim();
}

function makeConfig(env = process.env) {
  return {
    /** Provedor ativo neste dispositivo (só um por vez). */
    provider: () => String(env.NODE_SDK_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase(),
    apiKeyEnvName: (provider) => API_KEY_ENV[provider] || `${String(provider).toUpperCase()}_API_KEY_DESKTOP`,
    apiKey(provider) {
      return required(env, this.apiKeyEnvName(provider));
    },
    // Projeto Supabase do Vertal Dev (o mesmo da web). A chave anon é pública.
    supabaseUrl: () => required(env, "VERTAL_SUPABASE_URL"),
    // Application ID do app desktop registrado no portal do provedor (opcional, não é segredo).
    appId: () => (env.VERTAL_NODE_APP_ID ? String(env.VERTAL_NODE_APP_ID).trim() : undefined),
    supabaseAnonKey: () => required(env, "VERTAL_SUPABASE_ANON_KEY"),
    // Intervalo do heartbeat. O crédito é 1x por dia; o heartbeat só mantém o status em dia.
    heartbeatIntervalMs: Number(env.VERTAL_NODE_HEARTBEAT_MS || 30 * 60 * 1000),
    appVersion: env.npm_package_version || null,
    enableLogging: env.NODE_SDK_LOGGING === "1" || env.HONEYGAIN_LOGGING === "1",
  };
}

module.exports = { ...makeConfig(), makeConfig, API_KEY_ENV, DEFAULT_PROVIDER };
