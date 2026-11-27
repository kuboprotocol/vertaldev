// Vertal · conector MetaMask — ação "wallet" da edge function vertal-code-ai (sem função nova, sem segredo novo).
//
//   POST {action:"wallet", op:"status"}                              → {enabled, trader, mainnetTrade, walletConnectProjectId, chains, connection}
//   POST {action:"wallet", op:"nonce", address, chainId}             → {message}   (mensagem SIWE para a MetaMask assinar)
//   POST {action:"wallet", op:"verify", message, signature}          → {connection}  (guarda só endereço, chain id, data)
//   POST {action:"wallet", op:"disconnect"}                          → {ok}
//   POST {action:"wallet", op:"read", chainId?}                      → {network, balance, txCount, recentTx|null}   (só leitura)
//   POST {action:"wallet", op:"template"}                            → {id, files}  (Starter Web3)
//   POST {action:"wallet", op:"trade", prompt|intent, address, chainId, slippageBps?, basePrice?} → ordem (transações NÃO assinadas)
//
// Quem não está liberado recebe 404 (mesma resposta de "desligado"). Nada aqui assina, guarda chave ou executa transação.

import {
  allowedDomains, bodyHasSecret, buildSiweMessage, CONNECT_CHAINS, type Hmac, isMainnetTradeAllowed, isSignatureShape, isTraderEnabled,
  isWalletEnabled, makeNonce, MAINNET_CHAIN_ID, normAddress, rpcUrl, SEPOLIA_CHAIN_ID, SIWE_STATEMENT, SIWE_TTL_MS,
  validateSiwe, walletConnectProjectId, type WalletEnv,
} from "./core.ts";
import {
  buildOrderTxs, decodeQuote, decodeUint, encodeAllowance, encodeQuote, FUTURE_DELEGATION_NOTE, fromUnits, parseTradeIntent,
  priceEthPerToken, SEPOLIA_DEX, SEPOLIA_TOKENS, SELECTORS, targetPrice, type TokenInfo, toUnits, type TradeIntent, triggerMet,
} from "./trade.ts";
import { WEB3_TEMPLATE_FILES, WEB3_TEMPLATE_ID } from "./web3Template.ts";
import { isWalletFluxosEnabled } from "./fluxos.ts";

export const WALLET_TABLE = "vertal_wallet_connections";

export interface WalletConnection {
  address: string;
  chain_id: number;
  connected_at: string;
}

/** Acesso ao banco reduzido ao mínimo (fácil de simular nos testes). */
export interface WalletStore {
  get(userId: string): Promise<WalletConnection | null | "missing_table">;
  upsert(userId: string, c: WalletConnection): Promise<true | "missing_table" | "error">;
  remove(userId: string): Promise<true | "missing_table" | "error">;
}

export interface WalletDeps {
  env: WalletEnv;
  userId: string;
  /** Origem do pedido (header Origin) — o domínio da mensagem SIWE sai daqui. */
  origin: string | null;
  hmac: Hmac;
  /** Recupera o endereço que assinou (personal_sign / EIP-191). Implementado com biblioteca auditada na função. */
  recover: (message: string, signature: string) => Promise<string | null>;
  store: WalletStore;
  fetch: typeof fetch;
  now?: () => number;
  random?: () => string;
}

export interface WalletResult {
  status: number;
  body: Record<string, unknown>;
}

const ok = (body: Record<string, unknown>): WalletResult => ({ status: 200, body });
const err = (status: number, error: string, extra: Record<string, unknown> = {}): WalletResult => ({ status, body: { error, ...extra } });

const DISCLAIMER = "not_investment_advice";
const timeout = (ms: number): AbortSignal | undefined =>
  typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined;

async function rpc(deps: WalletDeps, chainId: number, method: string, params: unknown[]): Promise<unknown> {
  const url = rpcUrl(deps.env, chainId);
  if (!url) throw new Error("no_rpc");
  const r = await deps.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: timeout(8_000),
  });
  const d = (await r.json().catch(() => null)) as { result?: unknown; error?: { message?: string } } | null;
  if (!r.ok || !d || d.error) throw new Error(`rpc_error:${d?.error?.message ?? r.status}`);
  return d.result;
}

const ethCall = (deps: WalletDeps, chainId: number, to: string, data: string) =>
  rpc(deps, chainId, "eth_call", [{ to, data }, "latest"]) as Promise<string>;

function originHost(origin: string | null): { host: string; uri: string } | null {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && u.hostname === "localhost")) return null;
    return { host: u.host.toLowerCase(), uri: u.origin };
  } catch {
    return null;
  }
}

export async function handleWallet(body: Record<string, unknown>, deps: WalletDeps): Promise<WalletResult> {
  const { env, userId } = deps;
  if (!isWalletEnabled(env, userId)) return err(404, "vertal_metamask_disabled");
  // Defesa extra: nada com cara de frase-semente ou chave privada entra aqui.
  if (bodyHasSecret(body)) return err(400, "secret_material_refused");
  const now = deps.now ?? Date.now;
  const op = String(body.op ?? "status");

  if (op === "status") {
    const c = await deps.store.get(userId);
    return ok({
      enabled: true,
      trader: isTraderEnabled(env, userId),
      fluxos: isWalletFluxosEnabled(env, userId), // app só-leitura no Vertal Fluxos (VERTAL_METAMASK_FLUXOS_ENABLED)
      mainnetTrade: false, // esta versão nunca monta ordem na mainnet
      mainnetFlag: isMainnetTradeAllowed(env),
      walletConnectProjectId: walletConnectProjectId(env),
      chains: Object.entries(CONNECT_CHAINS).map(([id, c]) => ({ chainId: Number(id), name: c.name, explorer: c.explorer })),
      connection: c === "missing_table" ? null : c,
      migrationPending: c === "missing_table",
    });
  }

  if (op === "nonce") {
    const address = typeof body.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(body.address) ? body.address : null;
    const chainId = Number(body.chainId);
    if (!address) return err(400, "invalid_address");
    if (!CONNECT_CHAINS[chainId]) return err(400, "chain_not_allowed");
    const o = originHost(deps.origin);
    if (!o) return err(400, "invalid_origin");
    if (!allowedDomains(env).includes(o.host)) return err(400, "domain_not_allowed");
    const issued = new Date(now());
    const exp = new Date(issued.getTime() + SIWE_TTL_MS);
    const rand = (deps.random ?? (() => crypto.randomUUID().replace(/-/g, "")))();
    const expirationTime = exp.toISOString();
    const nonce = await makeNonce(deps.hmac, userId, address, chainId, expirationTime, rand);
    const message = buildSiweMessage({
      domain: o.host,
      address,
      statement: SIWE_STATEMENT,
      uri: o.uri,
      version: "1",
      chainId,
      nonce,
      issuedAt: issued.toISOString(),
      expirationTime,
    });
    return ok({ message });
  }

  if (op === "verify") {
    const message = typeof body.message === "string" ? body.message : "";
    const signature = body.signature;
    if (!isSignatureShape(signature)) return err(400, "bad_signature");
    const v = await validateSiwe(message, { env, userId, hmac: deps.hmac, now: now() });
    if (!v.ok || !v.fields) return err(400, v.error ?? "invalid_message");
    const o = originHost(deps.origin);
    if (o && o.host !== v.fields.domain.toLowerCase()) return err(400, "domain_not_allowed");
    let signer: string | null = null;
    try {
      signer = await deps.recover(message, signature);
    } catch {
      signer = null;
    }
    if (!signer || signer.toLowerCase() !== v.fields.address.toLowerCase()) return err(400, "bad_signature");
    const conn: WalletConnection = { address: v.fields.address.toLowerCase(), chain_id: v.fields.chainId, connected_at: new Date(now()).toISOString() };
    const saved = await deps.store.upsert(userId, conn);
    if (saved === "missing_table") return err(503, "migration_pending", { verified: true });
    if (saved !== true) return err(500, "save_failed");
    return ok({ connection: conn });
  }

  if (op === "disconnect") {
    const r = await deps.store.remove(userId);
    if (r === "missing_table") return ok({ ok: true, migrationPending: true });
    if (r !== true) return err(500, "disconnect_failed");
    return ok({ ok: true });
  }

  if (op === "template") {
    return ok({ id: WEB3_TEMPLATE_ID, files: WEB3_TEMPLATE_FILES });
  }

  if (op === "read") {
    const c = await deps.store.get(userId);
    if (!c || c === "missing_table") return err(409, c === "missing_table" ? "migration_pending" : "not_connected");
    const chainId = Number(body.chainId ?? c.chain_id);
    if (!CONNECT_CHAINS[chainId]) return err(400, "chain_not_allowed");
    try {
      const [bal, count, block] = await Promise.all([
        rpc(deps, chainId, "eth_getBalance", [c.address, "latest"]) as Promise<string>,
        rpc(deps, chainId, "eth_getTransactionCount", [c.address, "latest"]) as Promise<string>,
        rpc(deps, chainId, "eth_blockNumber", []) as Promise<string>,
      ]);
      const recentTx = await recentTransactions(deps, chainId, c.address);
      return ok({
        address: c.address,
        network: { chainId, name: CONNECT_CHAINS[chainId].name, explorer: CONNECT_CHAINS[chainId].explorer, blockNumber: Number(BigInt(block)) },
        balance: { wei: BigInt(bal).toString(), eth: fromUnits(BigInt(bal), 18, 6) },
        txCount: Number(BigInt(count)),
        recentTx,
      });
    } catch {
      return err(502, "rpc_unavailable");
    }
  }

  if (op === "trade") {
    if (!isTraderEnabled(env, userId)) return err(404, "vertal_trader_disabled");
    const chainId = Number(body.chainId ?? SEPOLIA_CHAIN_ID);
    if (chainId === MAINNET_CHAIN_ID) {
      return err(403, isMainnetTradeAllowed(env) ? "mainnet_not_supported_yet" : "mainnet_blocked");
    }
    if (chainId !== SEPOLIA_CHAIN_ID) return err(400, "testnet_only");
    const recipient = normAddress(body.address);
    if (!recipient) return err(400, "invalid_address");
    const intent: TradeIntent | null = typeof body.prompt === "string" ? parseTradeIntent(body.prompt) : sanitizeIntent(body.intent);
    if (!intent) return err(422, "not_understood");
    const token = await resolveToken(deps, intent.token);
    if (!token) return err(422, "unknown_token");
    const amountIn = intent.side === "buy" ? toUnits(intent.amount, 18) : toUnits(intent.amount, token.decimals);
    if (!amountIn) return err(422, "invalid_amount");
    const tokenIn = intent.side === "buy" ? SEPOLIA_DEX.weth : token.address;
    const tokenOut = intent.side === "buy" ? token.address : SEPOLIA_DEX.weth;

    // Melhor cotação entre as faixas de taxa (eth_call no QuoterV2: só leitura).
    let best: { fee: number; amountOut: bigint } | null = null;
    for (const fee of SEPOLIA_DEX.fees) {
      try {
        const q = decodeQuote(await ethCall(deps, chainId, SEPOLIA_DEX.quoterV2, encodeQuote(tokenIn, tokenOut, amountIn, fee)));
        if (q && q.amountOut > 0n && (!best || q.amountOut > best.amountOut)) best = { fee, amountOut: q.amountOut };
      } catch {
        /* sem pool nessa faixa */
      }
    }
    if (!best) return err(422, "no_liquidity", { intent });

    const price = priceEthPerToken(intent.side, amountIn, best.amountOut, token.decimals);
    const basePrice = Number(body.basePrice) > 0 ? Number(body.basePrice) : price;
    const target = targetPrice(intent.trigger, intent.pct, basePrice);
    const met = triggerMet(intent.trigger, price, target);

    let allowance: bigint | null = null;
    if (intent.side === "sell") {
      try {
        allowance = decodeUint(await ethCall(deps, chainId, token.address, encodeAllowance(recipient, SEPOLIA_DEX.swapRouter02)));
      } catch {
        allowance = 0n;
      }
    }
    const slippageBps = Number(body.slippageBps) || 100;
    const txs = met
      ? buildOrderTxs({
        side: intent.side,
        token,
        recipient,
        amountIn,
        amountOut: best.amountOut,
        fee: best.fee,
        slippageBps,
        deadline: Math.floor(now() / 1000) + 20 * 60,
        allowance,
      })
      : [];
    return ok({
      chainId,
      intent,
      token,
      quote: {
        fee: best.fee,
        amountIn: amountIn.toString(),
        amountOut: best.amountOut.toString(),
        amountInText: intent.side === "buy" ? `${fromUnits(amountIn, 18)} ETH` : `${fromUnits(amountIn, token.decimals)} ${token.symbol}`,
        amountOutText: intent.side === "buy" ? `${fromUnits(best.amountOut, token.decimals)} ${token.symbol}` : `${fromUnits(best.amountOut, 18)} WETH`,
        priceEthPerToken: price,
      },
      trigger: { kind: intent.trigger, pct: intent.pct, basePrice, targetPrice: target, met },
      txs, // NÃO assinadas: a MetaMask pede a assinatura de cada uma
      signer: "user_metamask",
      custody: "none",
      disclaimer: DISCLAIMER,
      futureNote: FUTURE_DELEGATION_NOTE,
    });
  }

  return err(400, "unknown_op");
}

function sanitizeIntent(v: unknown): TradeIntent | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const side = o.side === "buy" || o.side === "sell" ? o.side : null;
  const trigger = o.trigger === "now" || o.trigger === "drop" || o.trigger === "rise" ? o.trigger : null;
  const token = typeof o.token === "string" ? o.token.trim() : "";
  const amount = typeof o.amount === "string" ? o.amount.trim() : "";
  const pct = Number(o.pct ?? 0);
  if (!side || !trigger || !token || !/^\d+(\.\d+)?$/.test(amount)) return null;
  if (trigger !== "now" && !(pct > 0 && pct < 90)) return null;
  return { side, token, amount, amountUnit: side === "buy" ? "ETH" : "TOKEN", trigger, pct: trigger === "now" ? 0 : pct };
}

async function resolveToken(deps: WalletDeps, t: string): Promise<TokenInfo | null> {
  const known = SEPOLIA_TOKENS[t.toUpperCase()];
  if (known && known.symbol !== "WETH") return known;
  const addr = normAddress(t);
  if (!addr || addr === SEPOLIA_DEX.weth.toLowerCase()) return null;
  try {
    const dec = decodeUint(await ethCall(deps, SEPOLIA_CHAIN_ID, addr, SELECTORS.decimals));
    if (dec === null || dec > 36n) return null;
    return { symbol: `${addr.slice(0, 6)}…${addr.slice(-4)}`, address: addr, decimals: Number(dec) };
  } catch {
    return null;
  }
}

/** Últimas transações: só com VERTAL_METAMASK_ETHERSCAN_KEY no VERTAL_GPU_CONFIG (API v2 multichain). Sem chave: null. */
async function recentTransactions(deps: WalletDeps, chainId: number, address: string): Promise<Array<Record<string, unknown>> | null> {
  const key = (deps.env.VERTAL_METAMASK_ETHERSCAN_KEY ?? "").trim();
  if (!key) return null;
  try {
    const u = new URL("https://api.etherscan.io/v2/api");
    u.search = new URLSearchParams({
      chainid: String(chainId), module: "account", action: "txlist", address, page: "1", offset: "10", sort: "desc", apikey: key,
    }).toString();
    const r = await deps.fetch(u.toString(), { signal: timeout(8_000) });
    const d = (await r.json().catch(() => null)) as { result?: unknown } | null;
    if (!Array.isArray(d?.result)) return [];
    return (d!.result as Array<Record<string, string>>).slice(0, 10).map((t) => ({
      hash: t.hash, from: t.from, to: t.to, valueEth: fromUnits(BigInt(t.value || "0"), 18, 6),
      timeStamp: Number(t.timeStamp), status: t.isError === "1" ? "failed" : "ok",
    }));
  } catch {
    return null;
  }
}
