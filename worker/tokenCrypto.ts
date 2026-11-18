// Criptografia dos tokens do Spotify no banco (AES-256-GCM, RFC 6749 §10.3).
// Mesmo formato das edge functions (ciphertext, iv e tag em base64 separados),
// mas com chave própria do Worker: SPOTIFY_TOKEN_ENC_KEY (32 bytes em base64).

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

const TAG_BYTES = 16;

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(rawB64: string | undefined, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  if (!rawB64) throw new Error('SPOTIFY_TOKEN_ENC_KEY not configured');
  const raw = fromB64(rawB64);
  if (raw.length !== 32) throw new Error('SPOTIFY_TOKEN_ENC_KEY must be 32 bytes base64');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [usage]);
}

export async function encryptSecret(keyB64: string | undefined, plain: string): Promise<EncryptedSecret> {
  const key = await importKey(keyB64, 'encrypt');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const all = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  return {
    ciphertext: toB64(all.slice(0, all.length - TAG_BYTES)),
    iv: toB64(iv),
    tag: toB64(all.slice(all.length - TAG_BYTES)),
  };
}

export async function decryptSecret(keyB64: string | undefined, parts: EncryptedSecret): Promise<string> {
  const key = await importKey(keyB64, 'decrypt');
  const ct = fromB64(parts.ciphertext);
  const tag = fromB64(parts.tag);
  const full = new Uint8Array(new ArrayBuffer(ct.length + tag.length));
  full.set(ct, 0);
  full.set(tag, ct.length);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(parts.iv) }, key, full);
  return new TextDecoder().decode(plain);
}
