// Leitura da CONNECTOR_ENC_KEY (AES-256-GCM, 32 bytes).
//
// A chave pode chegar em três formatos, e todos valem:
//   * base64 padrão (44 caracteres, `openssl rand -base64 32`);
//   * base64url (com `-` e `_`, com ou sem `=`);
//   * hexadecimal (64 caracteres, `openssl rand -hex 32`).
//
// Antes, connectorCrypto/gmailCrypto só aceitavam base64: uma chave hex de 64
// caracteres é base64 "válido" e decodifica para 48 bytes, o que derrubava
// toda cifragem com "CONNECTOR_ENC_KEY must be 32 bytes base64" (causa do erro
// no cadastro do Vertal Vibe Pay em 2026-11-19). render.ts já aceitava hex.
//
// Sem dependências e sem APIs de Deno/DOM: roda na Edge Function e no Vitest.

export type EncKeyState = "ok" | "missing" | "invalid";

/** Bytes da chave, ou null se não decodificar para exatamente 32 bytes. */
export function parseEncKey(raw: string | null | undefined): Uint8Array<ArrayBuffer> | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  const b64 = s.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  let bin: string;
  try {
    bin = atob(padded);
  } catch {
    return null;
  }
  if (bin.length !== 32) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Diagnóstico sem expor a chave: ok / missing / invalid. */
export function encKeyState(raw: string | null | undefined): EncKeyState {
  if (!String(raw ?? "").trim()) return "missing";
  return parseEncKey(raw) ? "ok" : "invalid";
}
