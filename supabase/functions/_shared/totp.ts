// TOTP (RFC 6238) para o Vertal Navigator — 2FA por app autenticador, opcional.
//
// Convenção do cofre kubo-secrets: um segredo cujo env_key termina em `_TOTP`
// (ex.: GITHUB_TOTP) guarda a SEMENTE do autenticador (base32, como o site mostra
// em "não consigo ler o QR code", ou a URI otpauth://totp/... inteira) e precisa
// de `bound_to` (o site). O código de 6 dígitos é gerado NO SERVIDOR (edge
// function kubo-secrets, op "totp", canal interno x-navigator-token) e digitado
// direto no campo pelo navd. A semente nunca vai ao modelo, ao cliente nem ao
// sandbox; o código também não passa pelo modelo.
//
// Puro: só Web Crypto (crypto.subtle). Roda no Deno, no Worker e no Vitest.

export const TOTP_SUFFIX = "_TOTP";

/** O nome do segredo segue a convenção de semente TOTP? */
export function isTotpSecretName(name: unknown): boolean {
  return typeof name === "string" && /^[A-Z][A-Z0-9_]{0,58}_TOTP$/.test(name.trim().toUpperCase());
}

export type TotpAlgorithm = "SHA-1" | "SHA-256" | "SHA-512";

export interface TotpParams {
  secret: Uint8Array;
  digits: 6 | 7 | 8;
  period: number;
  algorithm: TotpAlgorithm;
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 (RFC 4648) sem padding, tolerante a espaços, hífens e minúsculas. null se inválido. */
export function base32Decode(input: string): Uint8Array | null {
  const clean = input.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  if (!clean || !/^[A-Z2-7]+$/.test(clean)) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/**
 * Lê a semente guardada no cofre: base32 puro ou `otpauth://totp/...?secret=...`.
 * Exige pelo menos 80 bits (16 caracteres base32), como os sites usam.
 */
export function parseTotpSeed(raw: unknown): TotpParams | null {
  const text = String(raw ?? "").trim();
  if (!text || text.length > 1024) return null;
  let secretText = text;
  let digits = 6;
  let period = 30;
  let algorithm: TotpAlgorithm = "SHA-1";
  if (/^otpauth:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    if (url.host.toLowerCase() !== "totp") return null; // HOTP (contador) não é suportado
    secretText = url.searchParams.get("secret") ?? "";
    if (url.searchParams.has("digits")) digits = Number(url.searchParams.get("digits"));
    if (url.searchParams.has("period")) period = Number(url.searchParams.get("period"));
    const alg = (url.searchParams.get("algorithm") ?? "SHA1").toUpperCase().replace("-", "");
    if (alg === "SHA1") algorithm = "SHA-1";
    else if (alg === "SHA256") algorithm = "SHA-256";
    else if (alg === "SHA512") algorithm = "SHA-512";
    else return null;
  }
  if (![6, 7, 8].includes(digits) || !Number.isInteger(period) || period < 15 || period > 120) return null;
  const secret = base32Decode(secretText);
  if (!secret || secret.length < 10) return null;
  return { secret, digits: digits as 6 | 7 | 8, period, algorithm };
}

/** Semente válida para guardar? (mensagem em português, ou null se ok) */
export function totpSeedError(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return "Cole a chave do autenticador.";
  return parseTotpSeed(text) ? null : "Chave inválida: use a chave em texto (base32) que o site mostra, ou a URI otpauth://totp/…";
}

/** HOTP(K, C) — RFC 4226. */
export async function hotp(params: Omit<TotpParams, "period">, counter: number): Promise<string> {
  const msg = new Uint8Array(8);
  let c = Math.floor(counter);
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const key = await crypto.subtle.importKey("raw", params.secret.slice().buffer as ArrayBuffer, { name: "HMAC", hash: params.algorithm }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** params.digits).padStart(params.digits, "0");
}

/**
 * Código TOTP de agora. Se faltarem menos de `minValiditySeconds` para o código
 * expirar, devolve o do próximo período (o agente leva alguns segundos para digitar).
 */
export async function totpNow(params: TotpParams, nowMs: number = Date.now(), minValiditySeconds = 5): Promise<{ code: string; expiresIn: number }> {
  const seconds = nowMs / 1000;
  let counter = Math.floor(seconds / params.period);
  let expiresIn = Math.ceil((counter + 1) * params.period - seconds);
  if (expiresIn < minValiditySeconds) {
    counter += 1;
    expiresIn += params.period;
  }
  return { code: await hotp(params, counter), expiresIn };
}
