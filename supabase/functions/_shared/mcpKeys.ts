// Chaves de acesso do servidor MCP (formato vtl_mcp_<43 caracteres base64url>).
// Usado pela função `mcp` (validação e rota /keys, em keys.ts).

export const MCP_KEY_PREFIX = "vtl_mcp_";
export const MCP_SCOPES = ["read", "write"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

const KEY_RE = /^vtl_mcp_[A-Za-z0-9_-]{43}$/;

/** Verdadeiro quando o token tem o formato de chave de acesso (não é JWT). */
export function isMcpAccessKey(token: string): boolean {
  return token.startsWith(MCP_KEY_PREFIX);
}

/** Confere o formato sem tocar no banco. */
export function hasValidMcpKeyShape(token: string): boolean {
  return KEY_RE.test(token);
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Gera uma chave nova com 256 bits de aleatoriedade. */
export function generateMcpKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return MCP_KEY_PREFIX + base64url(bytes);
}

/** SHA-256 em hexadecimal: é isso que vai para o banco. */
export async function hashMcpKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Identificador exibido na lista de chaves (nunca a chave inteira). */
export function mcpKeyPrefix(key: string): string {
  return key.slice(0, 12);
}

/**
 * Normaliza os escopos pedidos. `write` sempre inclui `read`: quem escreve
 * também precisa enxergar o que escreve. Escopo desconhecido é erro.
 */
export function normalizeScopes(input: unknown): McpScope[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("Escolha pelo menos um nível de acesso");
  }
  const set = new Set<McpScope>();
  for (const s of input) {
    if (s !== "read" && s !== "write") throw new Error("Nível de acesso inválido");
    set.add(s);
  }
  if (set.has("write")) set.add("read");
  return MCP_SCOPES.filter((s) => set.has(s));
}

/** Validade em dias aceita pela interface. `null` = sem prazo. */
export const ALLOWED_EXPIRY_DAYS = [7, 30, 90, 365, null] as const;

export function expiresAtFromDays(days: number | null): string | null {
  if (days === null) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** A chave está ativa agora? (não revogada e dentro do prazo) */
export function isKeyActive(
  row: { revoked_at: string | null; expires_at: string | null },
  now: number = Date.now(),
): boolean {
  if (row.revoked_at) return false;
  if (row.expires_at && Date.parse(row.expires_at) <= now) return false;
  return true;
}
