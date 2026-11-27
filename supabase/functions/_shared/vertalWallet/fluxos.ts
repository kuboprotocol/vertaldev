// Vertal · conector MetaMask → Vertal Fluxos (app "MetaMask (Vertal Wallet)" no fork kuboprotocol/automatisch).
// SÓ LEITURA. Aditivo, desligado por padrão.
//
// Chamado pelo servidor do Vertal Fluxos com a chave vfk1 do PRÓPRIO usuário (header x-vertal-fluxos-key),
// em POST vertal-code-ai?app=wallet — o mesmo caminho que o Vertal CRM usa (?app=crm). Sem função nova, sem segredo novo.
//
//   {op:"addresses"}                                         → {ok, wallets:[{address, chainId, connectedAt}], setupUrl}
//   {op:"txlist", chainId, tokenAddress?, startBlock?, limit?} → {ok, available:false} sem VERTAL_METAMASK_ETHERSCAN_KEY;
//                                                               com a chave: {ok, available:true, txs:[...]} (Etherscan API v2)
//
// Liberado só com VERTAL_METAMASK_ENABLED + usuário em VERTAL_METAMASK_USER_IDS + VERTAL_METAMASK_FLUXOS_ENABLED (padrão off).
// Quem não está liberado recebe 404 (mesma resposta de "desligado"). Nada aqui assina, guarda chave ou envia transação:
// a chave do Etherscan nunca sai do servidor e só o endereço público já conectado (SIWE) é devolvido.

import { bodyHasSecret, CONNECT_CHAINS, isWalletEnabled, normAddress, type WalletEnv } from "./core.ts";
import type { WalletConnection, WalletResult, WalletStore } from "./handler.ts";

export const WALLET_SETUP_PATH = "/connectors/metamask/setup";
export const WALLET_SETUP_URL = `https://vertal.dev${WALLET_SETUP_PATH}`;

const truthy = (v: string | undefined) => /^(1|true|yes|on|sim)$/i.test((v ?? "").trim());

/** Fluxos liberado para este usuário? Conector liberado + VERTAL_METAMASK_FLUXOS_ENABLED (padrão desligado). */
export function isWalletFluxosEnabled(env: WalletEnv, userId: string | null | undefined): boolean {
  return isWalletEnabled(env, userId) && truthy(env.VERTAL_METAMASK_FLUXOS_ENABLED);
}

export interface WalletFluxosDeps {
  env: WalletEnv;
  userId: string;
  store: Pick<WalletStore, "get">;
  fetch: typeof fetch;
}

const ok = (body: Record<string, unknown>): WalletResult => ({ status: 200, body: { ok: true, ...body } });
const err = (status: number, error: string, extra: Record<string, unknown> = {}): WalletResult => ({
  status,
  body: { ok: false, error, ...extra },
});

const timeout = (ms: number): AbortSignal | undefined =>
  typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined;

const MAX_TX = 50;

/** Formato de saída comum (o Fluxos usa o mesmo formato na varredura por RPC). */
export interface FluxosTx {
  hash: string;
  blockNumber: number;
  timeStamp: number | null;
  from: string;
  to: string | null;
  valueWei: string;
  tokenAddress: string | null;
  tokenSymbol: string | null;
  tokenDecimals: number | null;
  logIndex: number | null;
  status: "ok" | "failed";
}

export async function handleWalletFluxos(body: Record<string, unknown>, deps: WalletFluxosDeps): Promise<WalletResult> {
  const { env, userId } = deps;
  if (!isWalletFluxosEnabled(env, userId)) return err(404, "vertal_metamask_fluxos_disabled");
  if (bodyHasSecret(body)) return err(400, "secret_material_refused");
  const op = String(body.op ?? "addresses");

  const c = await deps.store.get(userId);
  if (c === "missing_table") return err(409, "migration_pending");
  const wallets = c ? [toWallet(c)] : [];

  if (op === "addresses") {
    return ok({ wallets, setupUrl: WALLET_SETUP_URL });
  }

  if (op === "txlist") {
    if (!c) return err(409, "not_connected", { setupUrl: WALLET_SETUP_URL });
    const chainId = Number(body.chainId ?? c.chain_id);
    if (!CONNECT_CHAINS[chainId]) return err(400, "chain_not_allowed");
    const token = body.tokenAddress == null || body.tokenAddress === "" ? null : normAddress(body.tokenAddress);
    if (body.tokenAddress && !token) return err(400, "invalid_token_address");
    const key = (env.VERTAL_METAMASK_ETHERSCAN_KEY ?? "").trim();
    if (!key) return ok({ available: false });
    const startBlock = Math.max(0, Math.floor(Number(body.startBlock) || 0));
    const limit = Math.min(MAX_TX, Math.max(1, Math.floor(Number(body.limit) || 20)));
    const txs = await etherscanList(deps.fetch, key, chainId, c.address, token, startBlock, limit);
    if (!txs) return err(502, "etherscan_unavailable");
    return ok({ available: true, address: c.address.toLowerCase(), chainId, txs });
  }

  return err(400, "invalid_op");
}

function toWallet(c: WalletConnection) {
  return { address: c.address.toLowerCase(), chainId: Number(c.chain_id), connectedAt: c.connected_at };
}

/** Etherscan API v2 (multichain): txlist (ETH) ou tokentx (ERC-20). Mais novo primeiro. null em falha. */
export async function etherscanList(
  f: typeof fetch,
  key: string,
  chainId: number,
  address: string,
  token: string | null,
  startBlock: number,
  limit: number,
): Promise<FluxosTx[] | null> {
  try {
    const u = new URL("https://api.etherscan.io/v2/api");
    const q: Record<string, string> = {
      chainid: String(chainId), module: "account", action: token ? "tokentx" : "txlist", address,
      startblock: String(startBlock), endblock: "99999999", page: "1", offset: String(limit), sort: "desc", apikey: key,
    };
    if (token) q.contractaddress = token;
    u.search = new URLSearchParams(q).toString();
    const r = await f(u.toString(), { signal: timeout(10_000) });
    const d = (await r.json().catch(() => null)) as { status?: string; message?: string; result?: unknown } | null;
    if (!d) return null;
    // "No transactions found" vem com status "0" e result [] — é lista vazia, não erro.
    if (!Array.isArray(d.result)) return d.message === "No transactions found" ? [] : null;
    return (d.result as Array<Record<string, string>>).slice(0, limit).map((t) => ({
      hash: String(t.hash ?? ""),
      blockNumber: Number(t.blockNumber ?? 0),
      timeStamp: t.timeStamp ? Number(t.timeStamp) : null,
      from: String(t.from ?? "").toLowerCase(),
      to: t.to ? String(t.to).toLowerCase() : null,
      valueWei: /^\d+$/.test(String(t.value ?? "")) ? String(t.value) : "0",
      tokenAddress: token ? String(t.contractAddress ?? token).toLowerCase() : null,
      tokenSymbol: token ? (t.tokenSymbol ? String(t.tokenSymbol).slice(0, 16) : null) : null,
      tokenDecimals: token && /^\d+$/.test(String(t.tokenDecimal ?? "")) ? Number(t.tokenDecimal) : null,
      logIndex: token && /^\d+$/.test(String(t.logIndex ?? "")) ? Number(t.logIndex) : null,
      status: t.isError === "1" ? "failed" : "ok",
    }));
  } catch {
    return null;
  }
}
