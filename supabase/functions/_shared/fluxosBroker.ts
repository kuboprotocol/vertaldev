// Corretor de tokens do Vertal Fluxos ("Conta do Vertal").
// O Fluxos guarda só a chave VERTAL_FLUXOS_KEY do usuário; a cada execução pede
// aqui um access token de curta duração do conector. Refresh tokens e o client
// secret OAuth nunca saem do Vertal.

export const FLUXOS_SHARED_APPS = ["gmail", "spotify", "slack", "github", "stripe", "discord"] as const;
export type FluxosSharedApp = (typeof FLUXOS_SHARED_APPS)[number];
export const isFluxosSharedApp = (v: unknown): v is FluxosSharedApp =>
  typeof v === "string" && (FLUXOS_SHARED_APPS as readonly string[]).includes(v);

/** Nome da conexão criada no Fluxos (idempotência por screenName). */
export const FLUXOS_SCREEN_NAME = "Conta do Vertal";
export const FLUXOS_KEY_ENV = "VERTAL_FLUXOS_KEY";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const enc = new TextEncoder();

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg))));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Chave por usuário: vfk1_<userId>_<HMAC>. Trocar o segredo revoga todas. */
export async function makeFluxosKey(userId: string, secret: string): Promise<string> {
  if (!UUID_RE.test(userId) || secret.length < 32) throw new Error("fluxos_key_config");
  return `vfk1_${userId}_${await hmac(secret, `vfk1:${userId}`)}`;
}

/** Devolve o id do usuário dono da chave, ou null. */
export async function verifyFluxosKey(key: unknown, secret: string | undefined): Promise<string | null> {
  if (typeof key !== "string" || !secret || secret.length < 32 || key.length > 200) return null;
  const m = /^vfk1_([0-9a-f-]{36})_([A-Za-z0-9_-]{43})$/i.exec(key);
  if (!m || !UUID_RE.test(m[1])) return null;
  return safeEqual(m[2], await hmac(secret, `vfk1:${m[1]}`)) ? m[1].toLowerCase() : null;
}

export interface BrokerToken { access_token: string; token_type: string; expires_in: number }

export interface BrokerDeps {
  /** Gmail: conta mais recente do usuário, token renovado no servidor. */
  gmail: (userId: string) => Promise<string | null>;
  /** Spotify: token renovado pelo Worker do vertal.dev. */
  spotify: (userId: string) => Promise<{ access_token: string; expires_in?: number } | null>;
  /** Conectores por chave (api_credentials), já decifrada. */
  apiKey: (userId: string, slug: string) => Promise<string | null>;
}

/** Token de curta duração do conector, ou null quando não está conectado no Vertal. */
export async function brokerToken(userId: string, app: FluxosSharedApp, deps: BrokerDeps): Promise<BrokerToken | null> {
  if (app === "gmail") {
    const t = await deps.gmail(userId);
    return t ? { access_token: t, token_type: "Bearer", expires_in: 3000 } : null;
  }
  if (app === "spotify") {
    const t = await deps.spotify(userId);
    return t?.access_token ? { access_token: t.access_token, token_type: "Bearer", expires_in: Math.min(t.expires_in ?? 3000, 3000) } : null;
  }
  const key = await deps.apiKey(userId, app);
  return key ? { access_token: key, token_type: app === "discord" ? "Bot" : "Bearer", expires_in: 3000 } : null;
}
