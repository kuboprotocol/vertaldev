/**
 * Virtual Chat — política de acesso a arquivos do dispositivo.
 *
 * Regras (ver docs/VIRTUAL_CHAT_ASSISTANT.md):
 *  - Nada é lido sem uma concessão (grant) explícita de uma pasta específica.
 *    Nunca há acesso ao disco inteiro.
 *  - Caminhos com `..` ou fora da raiz concedida são recusados.
 *  - Arquivos sensíveis (chaves, .env, cofres, perfis de navegador) são sempre bloqueados,
 *    mesmo dentro de uma pasta concedida.
 *  - Cliente externo (quem fala pelo WhatsApp/Telegram com o dono) só lê, e só
 *    em pastas marcadas para ele. Nunca comenta, nunca escreve.
 *
 * Este módulo não toca o disco. O agente local precisa resolver symlinks (realpath)
 * ANTES de montar a requisição; esta função não enxerga links simbólicos.
 */

import type { Audience } from "./types";

export type GrantMode = "read" | "comment" | "write";

export interface FileGrant {
  id: string;
  deviceId: string;
  /** Raiz concedida, no formato do dispositivo (ex.: "C:\\Users\\ana\\Docs" ou "/home/ana/docs"). */
  rootPath: string;
  audiences: Audience[];
  mode: GrantMode;
  expiresAt: number | null;
  revokedAt: number | null;
}

export interface AccessRequest {
  audience: Audience;
  deviceId: string;
  path: string;
  action: GrantMode;
  sizeBytes: number;
  mimeType: string;
  now: number;
}

export type AccessDecision =
  | { allowed: true; grantId: string }
  | { allowed: false; reason: DenyReason };

export type DenyReason =
  | "path_invalid"
  | "sensitive_path"
  | "too_large"
  | "type_not_allowed"
  | "external_read_only"
  | "no_grant";

export const MAX_READ_BYTES = 25 * 1024 * 1024;

const MODE_RANK: Record<GrantMode, number> = { read: 0, comment: 1, write: 2 };

/** Padrões sempre bloqueados, em caminho normalizado com "/". */
const SENSITIVE_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\.[^/]*)?$/i,
  /\.(pem|key|p12|pfx|kdbx|keystore|jks|ovpn)$/i,
  /(^|\/)id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/i,
  /(^|\/)\.(ssh|gnupg|aws|azure|kube|docker)(\/|$)/i,
  /(^|\/)(wallet\.dat|keychain[^/]*|credentials(\.json)?|seed[-_ ]?phrase[^/]*|mnemonic[^/]*)$/i,
  /(^|\/)(Login Data|Cookies|Web Data|Local State|key4\.db|logins\.json)$/i,
  /(^|\/)\.git\/(config|credentials)$/i,
];

const ALLOWED_MIME_EXACT = new Set([
  "application/pdf",
  "application/json",
  "application/xml",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

/** Normaliza para barras "/", sem segmentos vazios, "." ou "..". Retorna null se for inválido. */
export function normalizePath(input: string): string | null {
  if (input.includes("\0")) return null;
  const unified = input.replace(/\\/g, "/");
  const driveMatch = /^([A-Za-z]:)(\/.*)?$/.exec(unified);
  const prefix = driveMatch ? driveMatch[1].toUpperCase() : unified.startsWith("/") ? "" : null;
  if (prefix === null) return null; // caminho relativo: não aceito, o agente manda absoluto
  const body = driveMatch ? (driveMatch[2] ?? "") : unified;
  const segments: string[] = [];
  for (const seg of body.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") return null;
    segments.push(seg);
  }
  return `${prefix}/${segments.join("/")}`.replace(/\/$/, "") || "/";
}

function isUnder(path: string, root: string): boolean {
  if (path === root) return true;
  const base = root.endsWith("/") ? root : `${root}/`;
  return path.startsWith(base);
}

export function isSensitivePath(normalized: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(normalized));
}

export function isAllowedMime(mime: string): boolean {
  const m = mime.toLowerCase().split(";")[0].trim();
  return m.startsWith("text/") || m.startsWith("image/") || ALLOWED_MIME_EXACT.has(m);
}

export function evaluateAccess(grants: FileGrant[], req: AccessRequest): AccessDecision {
  const path = normalizePath(req.path);
  if (path === null) return deny("path_invalid");
  if (isSensitivePath(path)) return deny("sensitive_path");
  if (req.action === "read" && req.sizeBytes > MAX_READ_BYTES) return deny("too_large");
  if (!isAllowedMime(req.mimeType)) return deny("type_not_allowed");
  if (req.audience === "external_contact" && req.action !== "read") return deny("external_read_only");

  for (const grant of grants) {
    if (grant.deviceId !== req.deviceId) continue;
    if (grant.revokedAt !== null) continue;
    if (grant.expiresAt !== null && req.now >= grant.expiresAt) continue;
    if (!grant.audiences.includes(req.audience)) continue;
    if (MODE_RANK[grant.mode] < MODE_RANK[req.action]) continue;

    const root = normalizePath(grant.rootPath);
    if (root === null) continue;
    const comparePath = root.match(/^[A-Z]:/) ? path.toUpperCase() : path;
    const compareRoot = root.match(/^[A-Z]:/) ? root.toUpperCase() : root;
    if (!isUnder(comparePath, compareRoot)) continue;

    return { allowed: true, grantId: grant.id };
  }
  return deny("no_grant");
}

function deny(reason: DenyReason): AccessDecision {
  return { allowed: false, reason };
}
