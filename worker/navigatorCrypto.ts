// AES-256-GCM do Vertal Navigator no Worker, no MESMO formato e com a MESMA chave
// das edge functions (connectorCrypto.ts / CONNECTOR_ENC_KEY): ciphertext, iv e tag
// em base64 separados. Assim o Worker decifra segredos do cofre kubo-secrets e cifra
// os cookies do navegador por usuário com a chave que já existe.
// A chave aceita base64, base64url ou hex de 32 bytes (encKey.ts).
import { parseEncKey } from '../supabase/functions/_shared/encKey.ts';
import type { EncryptedSecret } from './tokenCrypto';

export type { EncryptedSecret };

const TAG_BYTES = 16;

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class EncKeyMissingError extends Error {}

async function importKey(raw: string | undefined, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const bytes = parseEncKey(raw);
  if (!bytes) throw new EncKeyMissingError('CONNECTOR_ENC_KEY missing or not 32 bytes');
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, [usage]);
}

export async function encryptWithConnectorKey(rawKey: string | undefined, plain: string): Promise<EncryptedSecret> {
  const key = await importKey(rawKey, 'encrypt');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const all = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  return { ciphertext: toB64(all.slice(0, all.length - TAG_BYTES)), iv: toB64(iv), tag: toB64(all.slice(all.length - TAG_BYTES)) };
}

export async function decryptWithConnectorKey(rawKey: string | undefined, parts: EncryptedSecret): Promise<string> {
  const key = await importKey(rawKey, 'decrypt');
  const ct = fromB64(parts.ciphertext);
  const tag = fromB64(parts.tag);
  const full = new Uint8Array(new ArrayBuffer(ct.length + tag.length));
  full.set(ct, 0);
  full.set(tag, ct.length);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(parts.iv) }, key, full);
  return new TextDecoder().decode(plain);
}

/** Senha aleatória [A-Za-z0-9] (VNC aceita no máximo 8 caracteres). */
export function randomPassword(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
  let out = '';
  for (const b of bytes) {
    if (b >= 228) continue; // 228 = 57*4: sem viés de módulo
    out += alphabet[b % alphabet.length];
    if (out.length === length) break;
  }
  return out.length === length ? out : randomPassword(length);
}

/** Token opaco (hex) para autenticar o Worker no navd do sandbox. */
export function randomToken(bytes = 32): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
