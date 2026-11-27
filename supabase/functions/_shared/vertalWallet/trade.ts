// Vertal · Trader por prompt (lógica pura). SÓ TESTNET (Sepolia) nesta versão.
//
// "compre 10 UNI quando cair 5%" → intenção → cotação no DEX (Uniswap v3 QuoterV2, eth_call, sem assinar nada)
// → ordem pronta (transações não assinadas) → a MetaMask pede a assinatura do usuário para CADA transação.
// Sem custódia, sem assinatura no servidor, sem execução automática. Não é recomendação de investimento.

import { SEPOLIA_CHAIN_ID } from "./core.ts";

export interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
}

/** Uniswap v3 na Sepolia (docs.uniswap.org → Ethereum Deployments, conferido em 27/11/2026). */
export const SEPOLIA_DEX = {
  chainId: SEPOLIA_CHAIN_ID,
  quoterV2: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
  swapRouter02: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
  weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  fees: [500, 3000, 10000] as const,
};

/** Tokens de teste conhecidos na Sepolia. Outro token: o usuário cola o endereço (0x…). */
export const SEPOLIA_TOKENS: Record<string, TokenInfo> = {
  WETH: { symbol: "WETH", address: SEPOLIA_DEX.weth, decimals: 18 },
  USDC: { symbol: "USDC", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", decimals: 6 },
  UNI: { symbol: "UNI", address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
  LINK: { symbol: "LINK", address: "0x779877A7B0D9E8603169DdbD7836e478b4624789", decimals: 18 },
};

export type TradeSide = "buy" | "sell";
export type TriggerKind = "now" | "drop" | "rise";

export interface TradeIntent {
  side: TradeSide;
  /** Símbolo conhecido ou endereço 0x do token negociado (o outro lado é sempre ETH/WETH). */
  token: string;
  /** Quantidade como texto decimal. */
  amount: string;
  /** Unidade da quantidade: "ETH" (quanto gastar/receber em ETH) ou "TOKEN". */
  amountUnit: "ETH" | "TOKEN";
  trigger: TriggerKind;
  /** Percentual do gatilho (5 = 5%). */
  pct: number;
}

const BUY = /\b(compr[aeo]\w*|buy|purchase|compra[rs]?|adquir\w*)\b/i;
const SELL = /\b(vend[aeo]\w*|sell|vender|venda)\b/i;
const DROP = /\b(ca(?:ir|ia|iu|em|ída|ida)|baix(?:ar|e|a)|descer|desça|drops?|falls?|dips?|goes down|baje|caiga|bajar|caer)\b/i;
const RISE = /\b(sub(?:ir|a|ir)|subiu|alta|rises?|goes up|pumps?|suba|subir)\b/i;

/** Lê o pedido em pt-BR, en ou es. Devolve null quando não é uma ordem. */
export function parseTradeIntent(text: string): TradeIntent | null {
  const s = String(text ?? "").trim().slice(0, 300);
  if (!s) return null;
  const buy = BUY.test(s);
  const sell = SELL.test(s);
  if (buy === sell) return null;
  const side: TradeSide = buy ? "buy" : "sell";

  // token: endereço 0x ou símbolo conhecido (ETH é a moeda de pagamento, não o alvo)
  const addr = /0x[0-9a-fA-F]{40}/.exec(s)?.[0];
  let token = addr ?? "";
  if (!token) {
    const syms = Object.keys(SEPOLIA_TOKENS).filter((k) => k !== "WETH");
    const m = new RegExp(`\\b(${syms.join("|")})\\b`, "i").exec(s);
    if (!m) return null;
    token = m[1].toUpperCase();
  }

  // quantidade: "0.01 ETH", "0,01 eth", "10 UNI"
  let amount = "";
  let amountUnit: "ETH" | "TOKEN" = side === "buy" ? "ETH" : "TOKEN";
  const ethAmt = /(\d+(?:[.,]\d+)?)\s*(?:e?eth|ether)\b/i.exec(s);
  const tokAmt = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:${addr ? "tokens?" : `${token}|tokens?`})\\b`, "i").exec(s);
  if (ethAmt) {
    amount = ethAmt[1];
    amountUnit = "ETH";
  } else if (tokAmt) {
    amount = tokAmt[1];
    amountUnit = "TOKEN";
  } else {
    return null;
  }
  amount = amount.replace(",", ".");
  if (!(Number(amount) > 0)) return null;
  // esta versão: compra gastando ETH exato; venda vendendo quantidade exata do token
  if (side === "buy" && amountUnit !== "ETH") return null;
  if (side === "sell" && amountUnit !== "TOKEN") return null;

  let trigger: TriggerKind = "now";
  let pct = 0;
  const pctM = /(\d+(?:[.,]\d+)?)\s*%/.exec(s);
  if (pctM) {
    pct = Number(pctM[1].replace(",", "."));
    if (DROP.test(s)) trigger = "drop";
    else if (RISE.test(s)) trigger = "rise";
    else return null;
    if (!(pct > 0 && pct < 90)) return null;
  }
  return { side, token, amount, amountUnit, trigger, pct };
}

// ───────────────────────────── números ─────────────────────────────

/** "0.015" + 18 casas → 15000000000000000n */
export function toUnits(amount: string, decimals: number): bigint | null {
  const m = /^(\d{1,30})(?:\.(\d{0,36}))?$/.exec(String(amount).trim());
  if (!m) return null;
  const frac = (m[2] ?? "").slice(0, decimals).padEnd(decimals, "0");
  const v = BigInt(m[1] + frac);
  return v > 0n ? v : null;
}

export function fromUnits(v: bigint, decimals: number, maxFrac = 6): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const int = a / base;
  let frac = (a % base).toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  if (!frac && a > 0n && int === 0n) frac = ""; // valor menor que a precisão mostrada
  return `${neg ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

// ───────────────────────────── ABI (manual, sem dependência) ─────────────────────────────

const word = (hex: string) => hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");
const encAddr = (a: string) => word(a);
const encUint = (n: bigint | number) => word(BigInt(n).toString(16));

export const SELECTORS = {
  // keccak256 conferido no sandbox (27/11/2026)
  quoteExactInputSingle: "0xc6a5026a", // quoteExactInputSingle((address,address,uint256,uint24,uint160))
  exactInputSingle: "0x04e45aaf", // exactInputSingle((address,address,uint24,address,uint256,uint256,uint160)) — SwapRouter02
  multicallDeadline: "0x5ae401dc", // multicall(uint256,bytes[])
  approve: "0x095ea7b3", // approve(address,uint256)
  allowance: "0xdd62ed3e", // allowance(address,address)
  balanceOf: "0x70a08231",
  decimals: "0x313ce567",
  symbol: "0x95d89b41",
};

export function encodeQuote(tokenIn: string, tokenOut: string, amountIn: bigint, fee: number): string {
  return SELECTORS.quoteExactInputSingle + encAddr(tokenIn) + encAddr(tokenOut) + encUint(amountIn) + encUint(fee) + encUint(0);
}

/** QuoterV2 devolve (amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate). */
export function decodeQuote(ret: string): { amountOut: bigint; gasEstimate: bigint } | null {
  const h = String(ret ?? "").replace(/^0x/, "");
  if (h.length < 256 || !/^[0-9a-fA-F]+$/.test(h)) return null;
  return { amountOut: BigInt(`0x${h.slice(0, 64)}`), gasEstimate: BigInt(`0x${h.slice(192, 256)}`) };
}

export function encodeExactInputSingle(p: {
  tokenIn: string;
  tokenOut: string;
  fee: number;
  recipient: string;
  amountIn: bigint;
  amountOutMinimum: bigint;
}): string {
  return SELECTORS.exactInputSingle + encAddr(p.tokenIn) + encAddr(p.tokenOut) + encUint(p.fee) + encAddr(p.recipient) +
    encUint(p.amountIn) + encUint(p.amountOutMinimum) + encUint(0);
}

/** multicall(uint256 deadline, bytes[] data) com um único item: a troca falha se for assinada depois do prazo. */
export function encodeMulticallDeadline(deadline: number, inner: string): string {
  const body = inner.replace(/^0x/, "");
  const len = body.length / 2;
  const padded = body.padEnd(Math.ceil(body.length / 64) * 64, "0");
  return SELECTORS.multicallDeadline +
    encUint(deadline) + encUint(0x40) + // deadline, offset do bytes[]
    encUint(1) + encUint(0x20) + // tamanho do array, offset do item 0
    encUint(len) + padded;
}

export function encodeApprove(spender: string, amount: bigint): string {
  return SELECTORS.approve + encAddr(spender) + encUint(amount);
}

export function encodeAllowance(owner: string, spender: string): string {
  return SELECTORS.allowance + encAddr(owner) + encAddr(spender);
}

export function encodeBalanceOf(owner: string): string {
  return SELECTORS.balanceOf + encAddr(owner);
}

export function decodeUint(ret: string): bigint | null {
  const h = String(ret ?? "").replace(/^0x/, "");
  if (h.length < 64 || !/^[0-9a-fA-F]+$/.test(h)) return null;
  return BigInt(`0x${h.slice(0, 64)}`);
}

// ───────────────────────────── preço e gatilho ─────────────────────────────

/** Preço do token em ETH a partir de uma cotação (precisão de float: só para mostrar e comparar gatilho). */
export function priceEthPerToken(side: TradeSide, amountIn: bigint, amountOut: bigint, tokenDecimals: number): number {
  const eth = (v: bigint) => Number(v) / 1e18;
  const tok = (v: bigint) => Number(v) / 10 ** tokenDecimals;
  if (side === "buy") return tok(amountOut) > 0 ? eth(amountIn) / tok(amountOut) : 0; // paga ETH, recebe token
  return tok(amountIn) > 0 ? eth(amountOut) / tok(amountIn) : 0; // paga token, recebe WETH
}

export function targetPrice(trigger: TriggerKind, pct: number, basePrice: number): number | null {
  if (trigger === "drop") return basePrice * (1 - pct / 100);
  if (trigger === "rise") return basePrice * (1 + pct / 100);
  return null;
}

export function triggerMet(trigger: TriggerKind, price: number, target: number | null): boolean {
  if (trigger === "now" || target === null) return true;
  return trigger === "drop" ? price <= target : price >= target;
}

/** Proteção de preço: mínimo a receber = cotação − deslizamento (padrão 1%, teto 5%). */
export function minOut(amountOut: bigint, slippageBps: number): bigint {
  const bps = Math.min(Math.max(Math.floor(slippageBps) || 100, 1), 500);
  return (amountOut * BigInt(10_000 - bps)) / 10_000n;
}

export interface UnsignedTx {
  to: string;
  data: string;
  value: string; // hex
  description: string;
}

/** Monta as transações (não assinadas) da ordem. A venda precisa de "approve" antes, se a permissão não bastar. */
export function buildOrderTxs(p: {
  side: TradeSide;
  token: TokenInfo;
  recipient: string;
  amountIn: bigint;
  amountOut: bigint;
  fee: number;
  slippageBps: number;
  deadline: number;
  allowance?: bigint | null;
}): UnsignedTx[] {
  const txs: UnsignedTx[] = [];
  const tokenIn = p.side === "buy" ? SEPOLIA_DEX.weth : p.token.address;
  const tokenOut = p.side === "buy" ? p.token.address : SEPOLIA_DEX.weth;
  if (p.side === "sell" && (p.allowance ?? 0n) < p.amountIn) {
    txs.push({
      to: p.token.address,
      data: encodeApprove(SEPOLIA_DEX.swapRouter02, p.amountIn),
      value: "0x0",
      description: `approve:${p.token.symbol}`,
    });
  }
  const swap = encodeExactInputSingle({
    tokenIn,
    tokenOut,
    fee: p.fee,
    recipient: p.recipient,
    amountIn: p.amountIn,
    amountOutMinimum: minOut(p.amountOut, p.slippageBps),
  });
  txs.push({
    to: SEPOLIA_DEX.swapRouter02,
    data: encodeMulticallDeadline(p.deadline, swap),
    // compra: manda ETH junto; o SwapRouter02 embrulha em WETH sozinho
    value: p.side === "buy" ? `0x${p.amountIn.toString(16)}` : "0x0",
    description: `swap:${p.side}:${p.token.symbol}`,
  });
  return txs;
}

/** Design futuro (só documentação nesta versão): permissões limitadas e revogáveis por smart account. */
export const FUTURE_DELEGATION_NOTE =
  "Futuro (não implementado): permissões limitadas e revogáveis via MetaMask Delegation / ERC-7715 — teto de valor, tokens permitidos e validade. Hoje cada operação pede a assinatura do usuário.";
