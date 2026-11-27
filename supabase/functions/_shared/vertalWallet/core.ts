// Vertal · conector MetaMask (lógica pura: sem Deno, sem rede). Aditivo, desligado por padrão.
//
// Segurança (regra do Laércio, 27/11/2026):
//   - Nunca pedimos, aceitamos ou guardamos frase-semente (seed phrase) ou chave privada. Em lugar nenhum.
//   - A conexão é Sign-In with Ethereum (EIP-4361): a carteira assina uma mensagem; o servidor confere a
//     assinatura (nonce, domínio, validade) e guarda SÓ endereço, chain id e data da conexão.
//   - Nada é assinado no servidor. Toda transação é montada aqui e assinada pelo usuário na MetaMask.
//
// Config: o projeto Supabase está no limite de segredos, então as chaves VERTAL_METAMASK_* vêm dentro do JSON
// que já existe (VERTAL_GPU_CONFIG). Segredo avulso com o mesmo nome vence. Ligado só com
// VERTAL_METAMASK_ENABLED=true E o usuário em VERTAL_METAMASK_USER_IDS (vazia = ninguém).

export type WalletEnv = Record<string, string | undefined>;

export const SEPOLIA_CHAIN_ID = 11155111;
export const MAINNET_CHAIN_ID = 1;

const truthy = (v: string | undefined) => /^(1|true|yes|on|sim)$/i.test((v ?? "").trim());

const WALLET_KEY = /^VERTAL_METAMASK_[A-Z0-9_]+$/;

/** Expande só as chaves VERTAL_METAMASK_* de dentro do VERTAL_GPU_CONFIG (o resto do ambiente fica igual). */
export function expandWalletEnv(env: WalletEnv): WalletEnv {
  const raw = (env.VERTAL_GPU_CONFIG ?? "").trim();
  if (!raw) return env;
  let cfg: unknown;
  try {
    cfg = JSON.parse(raw);
  } catch {
    return env;
  }
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return env;
  const out: WalletEnv = { ...env };
  for (const [k, v] of Object.entries(cfg as Record<string, unknown>)) {
    if (!WALLET_KEY.test(k) || (out[k] ?? "").trim()) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = String(v);
  }
  return out;
}

const idList = (v: string | undefined) =>
  (v ?? "").split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);

/** Conector liberado para este usuário? Exige VERTAL_METAMASK_ENABLED + o id na lista (vazia = ninguém). */
export function isWalletEnabled(env: WalletEnv, userId: string | null | undefined): boolean {
  if (!truthy(env.VERTAL_METAMASK_ENABLED) || !userId) return false;
  return idList(env.VERTAL_METAMASK_USER_IDS).includes(userId.trim().toLowerCase());
}

/** Trader por prompt (testnet). Precisa do conector liberado + VERTAL_METAMASK_TRADER_ENABLED (padrão desligado). */
export function isTraderEnabled(env: WalletEnv, userId: string | null | undefined): boolean {
  return isWalletEnabled(env, userId) && truthy(env.VERTAL_METAMASK_TRADER_ENABLED);
}

/** Mainnet no trader: flag separado, fica DESLIGADO. Mesmo ligado, esta versão ainda não monta ordens na mainnet. */
export function isMainnetTradeAllowed(env: WalletEnv): boolean {
  return truthy(env.VERTAL_METAMASK_MAINNET_ENABLED);
}

/** Dica do template Web3 no VERTAL Code AI (padrão desligado; só para quem tem o conector liberado). */
export function isWeb3HintEnabled(env: WalletEnv, userId: string | null | undefined): boolean {
  return isWalletEnabled(env, userId) && truthy(env.VERTAL_METAMASK_CODE_HINT);
}

/** WalletConnect (celular sem MetaMask): só aparece se houver project id na config. */
export function walletConnectProjectId(env: WalletEnv): string | null {
  const v = (env.VERTAL_METAMASK_WALLETCONNECT_PROJECT_ID ?? "").trim();
  return /^[A-Za-z0-9]{16,64}$/.test(v) ? v : null;
}

/** Domínios aceitos na mensagem SIWE (host[:porta]). */
export function allowedDomains(env: WalletEnv): string[] {
  const list = idList(env.VERTAL_METAMASK_DOMAINS);
  return list.length ? list : ["vertal.dev", "www.vertal.dev", "kubovibe.dev", "www.kubovibe.dev", "localhost:8080", "localhost:5173"];
}

/** Redes aceitas para conectar (leitura): Sepolia sempre; Ethereum mainnet só para ler saldo/rede. */
export const CONNECT_CHAINS: Record<number, { name: string; explorer: string; rpc: string }> = {
  [SEPOLIA_CHAIN_ID]: { name: "Sepolia (testnet)", explorer: "https://sepolia.etherscan.io", rpc: "https://ethereum-sepolia-rpc.publicnode.com" },
  [MAINNET_CHAIN_ID]: { name: "Ethereum", explorer: "https://etherscan.io", rpc: "https://ethereum-rpc.publicnode.com" },
};

export function rpcUrl(env: WalletEnv, chainId: number): string | null {
  const custom = (env[`VERTAL_METAMASK_RPC_${chainId}`] ?? "").trim();
  if (/^https:\/\/[^\s]+$/.test(custom)) return custom;
  return CONNECT_CHAINS[chainId]?.rpc ?? null;
}

// ───────────────────────────── Endereços ─────────────────────────────

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
export function normAddress(a: unknown): string | null {
  return typeof a === "string" && ADDRESS_RE.test(a.trim()) ? a.trim().toLowerCase() : null;
}

/** Recusa qualquer coisa que pareça frase-semente ou chave privada (defesa extra; nunca deve chegar aqui). */
export function looksLikeSecret(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(s)) return true; // chave privada
  const words = s.toLowerCase().split(/\s+/).filter(Boolean);
  return (words.length === 12 || words.length === 15 || words.length === 18 || words.length === 21 || words.length === 24) &&
    words.every((w) => /^[a-z]{3,8}$/.test(w));
}

/** Varre o corpo do pedido: qualquer campo com cara de segredo derruba o pedido inteiro. */
export function bodyHasSecret(body: unknown, depth = 0): boolean {
  if (depth > 4 || body == null) return false;
  if (typeof body === "string") return looksLikeSecret(body);
  if (Array.isArray(body)) return body.some((x) => bodyHasSecret(x, depth + 1));
  if (typeof body === "object") {
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (/seed|mnemonic|private.?key|secret.?phrase|frase.?semente/i.test(k)) return true;
      // a assinatura SIWE é hex de 65 bytes (130 hex), não 64: passa
      if (bodyHasSecret(v, depth + 1)) return true;
    }
  }
  return false;
}

// ───────────────────────────── SIWE (EIP-4361) ─────────────────────────────

export interface SiweFields {
  domain: string;
  address: string; // como veio na mensagem
  statement?: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
}

export const SIWE_TTL_MS = 10 * 60_000;
export const SIWE_STATEMENT = "Conectar esta carteira ao Vertal Dev. Isto não autoriza nenhuma transação nem gasta nada.";

export function buildSiweMessage(f: SiweFields): string {
  const lines = [
    `${f.domain} wants you to sign in with your Ethereum account:`,
    f.address,
    "",
  ];
  if (f.statement) lines.push(f.statement, "");
  lines.push(
    `URI: ${f.uri}`,
    `Version: ${f.version}`,
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
  );
  if (f.expirationTime) lines.push(`Expiration Time: ${f.expirationTime}`);
  return lines.join("\n");
}

export function parseSiweMessage(msg: string): SiweFields | null {
  if (typeof msg !== "string" || msg.length > 2000) return null;
  const lines = msg.split("\n");
  const head = /^(\S+) wants you to sign in with your Ethereum account:$/.exec(lines[0] ?? "");
  if (!head) return null;
  const address = (lines[1] ?? "").trim();
  if (!ADDRESS_RE.test(address)) return null;
  if (lines[2] !== "") return null;
  let i = 3;
  let statement: string | undefined;
  if (lines[i] !== undefined && !lines[i].startsWith("URI: ")) {
    statement = lines[i];
    i++;
    if (lines[i] !== "") return null;
    i++;
  }
  const fields: Record<string, string> = {};
  for (; i < lines.length; i++) {
    const m = /^([A-Za-z ]+): (.+)$/.exec(lines[i]);
    if (!m) return null;
    fields[m[1]] = m[2];
  }
  const chainId = Number(fields["Chain ID"]);
  if (!fields.URI || fields.Version !== "1" || !Number.isInteger(chainId) || !fields.Nonce || !fields["Issued At"]) return null;
  if (!/^[A-Za-z0-9]{8,}$/.test(fields.Nonce)) return null;
  const f: SiweFields = {
    domain: head[1],
    address,
    statement,
    uri: fields.URI,
    version: fields.Version,
    chainId,
    nonce: fields.Nonce,
    issuedAt: fields["Issued At"],
    expirationTime: fields["Expiration Time"],
  };
  // a mensagem precisa ser exatamente a que montamos (sem campos extras escondidos)
  return buildSiweMessage(f) === msg ? f : null;
}

export type Hmac = (msg: string) => Promise<string>;

/** Nonce sem tabela: aleatório + HMAC(usuário, endereço, chain, validade). Vale só para quem pediu, até expirar. */
export async function makeNonce(hmac: Hmac, userId: string, address: string, chainId: number, expirationTime: string, rand: string): Promise<string> {
  const r = rand.replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
  const h = (await hmac(`siwe:${userId}:${address.toLowerCase()}:${chainId}:${expirationTime}:${r}`)).slice(0, 24);
  return `${r}${h}`;
}

export async function checkNonce(hmac: Hmac, userId: string, f: SiweFields): Promise<boolean> {
  if (!f.expirationTime || f.nonce.length !== 40) return false;
  const r = f.nonce.slice(0, 16);
  return (await makeNonce(hmac, userId, f.address, f.chainId, f.expirationTime, r)) === f.nonce;
}

export type SiweError =
  | "invalid_message"
  | "domain_not_allowed"
  | "uri_mismatch"
  | "chain_not_allowed"
  | "expired"
  | "not_yet_valid"
  | "bad_nonce"
  | "bad_signature";

/** Resultado da checagem (forma única: o front compila sem strictNullChecks). */
export interface SiweCheck {
  ok: boolean;
  fields?: SiweFields;
  error?: SiweError;
}

/** Confere tudo menos a criptografia da assinatura (essa vem por `recover`). */
export async function validateSiwe(
  message: string,
  opts: { env: WalletEnv; userId: string; hmac: Hmac; now: number },
): Promise<SiweCheck> {
  const f = parseSiweMessage(message);
  if (!f) return { ok: false, error: "invalid_message" };
  const domain = f.domain.toLowerCase();
  if (!allowedDomains(opts.env).includes(domain)) return { ok: false, error: "domain_not_allowed" };
  let uriHost = "";
  try {
    uriHost = new URL(f.uri).host.toLowerCase();
  } catch {
    return { ok: false, error: "uri_mismatch" };
  }
  if (uriHost !== domain) return { ok: false, error: "uri_mismatch" };
  if (!CONNECT_CHAINS[f.chainId]) return { ok: false, error: "chain_not_allowed" };
  const issued = Date.parse(f.issuedAt);
  const exp = Date.parse(f.expirationTime ?? "");
  if (!Number.isFinite(issued) || !Number.isFinite(exp) || exp - issued > SIWE_TTL_MS + 1000) return { ok: false, error: "invalid_message" };
  if (issued - opts.now > 60_000) return { ok: false, error: "not_yet_valid" };
  if (opts.now > exp) return { ok: false, error: "expired" };
  if (!(await checkNonce(opts.hmac, opts.userId, f))) return { ok: false, error: "bad_nonce" };
  return { ok: true, fields: f };
}

/** Assinatura personal_sign: 65 bytes em hex. */
export function isSignatureShape(sig: unknown): sig is string {
  return typeof sig === "string" && /^0x[0-9a-fA-F]{130}$/.test(sig);
}
