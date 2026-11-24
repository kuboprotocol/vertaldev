// VERTAL AI API — chaves por desenvolvedor (formato vtl_ai_<43 base64url>).
// Mesmo padrão das chaves MCP (mcpKeys.ts) e do Cofre: só o SHA-256 vai para o
// banco, a chave inteira aparece uma única vez na criação. Módulo puro.

export const AI_KEY_PREFIX = "vtl_ai_";
const KEY_RE = /^vtl_ai_[A-Za-z0-9_-]{43}$/;

export function hasValidAiKeyShape(token: string): boolean {
  return KEY_RE.test(token);
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateAiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return AI_KEY_PREFIX + base64url(bytes);
}

export async function hashAiKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** O que aparece na lista (nunca a chave inteira). */
export function aiKeyPrefix(key: string): string {
  return key.slice(0, 14);
}

/** Lê "Authorization: Bearer vtl_ai_..." (ou x-api-key). Formato errado = null, sem ir ao banco. */
export function bearerFrom(headers: { get(name: string): string | null }): string | null {
  const auth = headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(\S+)$/i);
  const token = m?.[1] ?? headers.get("x-api-key") ?? "";
  return hasValidAiKeyShape(token) ? token : null;
}

export interface AiKeyRow {
  id: string;
  owner_id: string;
  revoked_at: string | null;
  expires_at: string | null;
  monthly_cap_credits: number | null;
  rpm: number | null;
  spent_micro: number;
  /** "YYYY-MM" do mês a que spent_micro se refere. */
  spent_period: string | null;
}

export function periodOf(now: Date): string {
  return now.toISOString().slice(0, 7);
}

export type KeyCheck =
  | { ok: true; spentThisMonthMicro: number }
  | { ok: false; status: 401 | 403; code: "invalid_api_key" | "revoked_api_key" | "expired_api_key"; message: string };

/** Chave ativa? Devolve o gasto do mês corrente (zera na virada do mês). */
export function checkKeyRow(row: AiKeyRow | null, now: Date = new Date()): KeyCheck {
  if (!row) return { ok: false, status: 401, code: "invalid_api_key", message: "Chave de API inválida." };
  if (row.revoked_at) return { ok: false, status: 401, code: "revoked_api_key", message: "Esta chave foi revogada." };
  if (row.expires_at && Date.parse(row.expires_at) <= now.getTime()) {
    return { ok: false, status: 401, code: "expired_api_key", message: "Esta chave expirou." };
  }
  const spent = row.spent_period === periodOf(now) ? Math.max(0, row.spent_micro) : 0;
  return { ok: true, spentThisMonthMicro: spent };
}

/**
 * Isolamento entre clientes: qualquer operação de gestão (listar, revogar,
 * mudar teto, ler uso) só vale para o dono da chave. Admin NÃO ganha acesso
 * por aqui; o agente de operação tem ferramenta própria, com aprovação.
 */
export function assertOwner(row: { owner_id: string } | null, userId: string): asserts row is { owner_id: string } {
  if (!row || row.owner_id !== userId) throw new Error("not_found");
}

export interface NewKeyInput {
  name?: unknown;
  monthlyCapCredits?: unknown;
  rpm?: unknown;
  expiresInDays?: unknown;
}

export function parseNewKey(input: NewKeyInput, defaults: { monthlyCapCredits: number; rpm: number }, now = new Date()) {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 60) : "";
  if (!name) throw new Error("Dê um nome à chave.");
  const cap = input.monthlyCapCredits === null ? null : input.monthlyCapCredits === undefined ? defaults.monthlyCapCredits : Number(input.monthlyCapCredits);
  if (cap !== null && (!Number.isFinite(cap) || cap < 0 || cap > 1_000_000)) throw new Error("Teto mensal inválido.");
  const rpm = input.rpm === undefined ? defaults.rpm : Number(input.rpm);
  if (!Number.isInteger(rpm) || rpm < 1 || rpm > 600) throw new Error("Limite por minuto inválido (1 a 600).");
  let expires_at: string | null = null;
  if (input.expiresInDays !== undefined && input.expiresInDays !== null) {
    const d = Number(input.expiresInDays);
    if (![7, 30, 90, 365].includes(d)) throw new Error("Validade inválida.");
    expires_at = new Date(now.getTime() + d * 86_400_000).toISOString();
  }
  return { name, monthly_cap_credits: cap, rpm, expires_at };
}
