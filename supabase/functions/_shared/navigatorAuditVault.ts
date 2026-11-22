// Cofre da auditoria do Vertal Navigator (navigator_audit cifrada em repouso).
//
// Cada linha de navigator_audit guarda em CLARO só o que é preciso para consultar
// (user_id, session_id, kind, created_at e poucos números/motivos: end_reason,
// minutes, limit). Todo o resto (texto da tarefa, URL, host do login, nome do
// segredo usado, loja, total, itens, botão) vai CIFRADO com AES-256-GCM em
// detail_ciphertext/detail_iv/detail_tag, com key_version dizendo qual chave usou:
//
//   key_version 1 → NAVIGATOR_AUDIT_KEY (chave dedicada, a preferida)
//   key_version 0 → fallback: NAVIGATOR_ENC_KEY, senão CONNECTOR_ENC_KEY
//
// O AAD (dados autenticados) amarra o texto cifrado ao dono e ao tipo
// ("navigator_audit:v<ver>:<user_id>:<kind>"): copiar o ciphertext para a linha de
// outro usuário faz a decifragem falhar.
//
// Nunca entra na auditoria, nem cifrado: valor de segredo do cofre (fill_secret),
// senha, código 2FA/OTP, cookie, cabeçalho. Segredo aparece só como marcador
// "[segredo do cofre: NOME]". O texto da tarefa passa por redactCredentials.
//
// Decifra só no servidor (Worker, rota /api/navigator/activity), para o dono.
// Sem dependências de Deno/DOM: roda no Worker, na Edge Function, no Vitest e no
// script de backfill (scripts/navigator-audit-backfill.ts).
import { parseEncKey } from "./encKey.ts";
import { auditDetail } from "./navigatorCore.ts";

/** Chaves do detalhe que podem ficar em claro (não identificam site, conta nem conteúdo). */
export const AUDIT_CLEAR_KEYS = ["end_reason", "minutes", "limit"] as const;
const CLEAR = new Set<string>(AUDIT_CLEAR_KEYS);

export const AUDIT_KEY_DEDICATED = 1;
export const AUDIT_KEY_FALLBACK = 0;

export interface AuditKeyEnv {
  NAVIGATOR_AUDIT_KEY?: string;
  NAVIGATOR_ENC_KEY?: string;
  CONNECTOR_ENC_KEY?: string;
}

export interface AuditKey {
  version: number;
  raw: string;
}

/** Chave para CIFRAR linhas novas: a dedicada se válida; senão o fallback documentado. */
export function auditWriteKey(env: AuditKeyEnv): AuditKey | null {
  if (parseEncKey(env.NAVIGATOR_AUDIT_KEY)) return { version: AUDIT_KEY_DEDICATED, raw: env.NAVIGATOR_AUDIT_KEY! };
  const fb = env.NAVIGATOR_ENC_KEY || env.CONNECTOR_ENC_KEY;
  if (parseEncKey(fb)) return { version: AUDIT_KEY_FALLBACK, raw: fb! };
  return null;
}

/** Chave para DECIFRAR uma linha pela key_version gravada. */
export function auditReadKey(env: AuditKeyEnv, version: number | null | undefined): string | null {
  if (version === AUDIT_KEY_DEDICATED) return parseEncKey(env.NAVIGATOR_AUDIT_KEY) ? env.NAVIGATOR_AUDIT_KEY! : null;
  if (version === AUDIT_KEY_FALLBACK) {
    const fb = env.NAVIGATOR_ENC_KEY || env.CONNECTOR_ENC_KEY;
    return parseEncKey(fb) ? fb! : null;
  }
  return null;
}

export interface SealedAuditColumns {
  detail: Record<string, unknown>;
  detail_ciphertext: string | null;
  detail_iv: string | null;
  detail_tag: string | null;
  key_version: number | null;
}

const TAG_BYTES = 16;
const enc = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function auditAad(version: number, userId: string, kind: string): Uint8Array<ArrayBuffer> {
  const b = enc.encode(`navigator_audit:v${version}:${userId}:${kind}`);
  const out = new Uint8Array(new ArrayBuffer(b.length));
  out.set(b);
  return out;
}

async function importKey(raw: string, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  const bytes = parseEncKey(raw);
  if (!bytes) throw new Error("audit key invalid");
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, [usage]);
}

/** Separa o detalhe (já limpo por auditDetail) em parte clara e parte sensível. */
export function splitAuditDetail(clean: Record<string, unknown>): { clear: Record<string, unknown>; sensitive: Record<string, unknown> } {
  const clear: Record<string, unknown> = {};
  const sensitive: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(clean)) (CLEAR.has(k) ? clear : sensitive)[k] = v;
  return { clear, sensitive };
}

/**
 * Colunas prontas para INSERT em navigator_audit. Sem chave válida, a parte
 * sensível é DESCARTADA (nunca gravada em claro).
 */
export async function sealAuditDetail(key: AuditKey | null, userId: string, kind: string, raw: Record<string, unknown>): Promise<SealedAuditColumns> {
  const { clear, sensitive } = splitAuditDetail(auditDetail(raw));
  const none: SealedAuditColumns = { detail: clear, detail_ciphertext: null, detail_iv: null, detail_tag: null, key_version: null };
  if (!Object.keys(sensitive).length || !key) return none;
  const k = await importKey(key.raw, "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const all = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: auditAad(key.version, userId, kind) }, k, enc.encode(JSON.stringify(sensitive))),
  );
  return {
    detail: clear,
    detail_ciphertext: toB64(all.slice(0, all.length - TAG_BYTES)),
    detail_iv: toB64(iv),
    detail_tag: toB64(all.slice(all.length - TAG_BYTES)),
    key_version: key.version,
  };
}

export interface AuditRowLike {
  user_id: string;
  kind: string;
  detail?: Record<string, unknown> | null;
  detail_ciphertext?: string | null;
  detail_iv?: string | null;
  detail_tag?: string | null;
  key_version?: number | null;
}

/**
 * Detalhe completo para o DONO ver na aba Atividade (só no servidor). Linha antiga
 * (antes do backfill) volta como está; ciphertext que não decifra vira { sealed: true }.
 */
export async function openAuditDetail(env: AuditKeyEnv, row: AuditRowLike): Promise<Record<string, unknown>> {
  const clear = row.detail && typeof row.detail === "object" ? row.detail : {};
  if (!row.detail_ciphertext || !row.detail_iv || !row.detail_tag) return { ...clear };
  const raw = auditReadKey(env, row.key_version);
  if (!raw) return { ...clear, sealed: true };
  try {
    const k = await importKey(raw, "decrypt");
    const ct = fromB64(row.detail_ciphertext);
    const tag = fromB64(row.detail_tag);
    const full = new Uint8Array(new ArrayBuffer(ct.length + tag.length));
    full.set(ct, 0);
    full.set(tag, ct.length);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(row.detail_iv), additionalData: auditAad(Number(row.key_version), row.user_id, row.kind) },
      k,
      full,
    );
    const parsed = JSON.parse(new TextDecoder().decode(plain));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...clear, ...parsed } : { ...clear };
  } catch {
    return { ...clear, sealed: true };
  }
}

/** A linha ainda tem conteúdo sensível em claro (precisa de backfill)? */
export function needsAuditBackfill(row: AuditRowLike): boolean {
  if (row.detail_ciphertext) return false;
  const d = row.detail && typeof row.detail === "object" ? row.detail : {};
  return Object.keys(d).some((k) => !CLEAR.has(k));
}
