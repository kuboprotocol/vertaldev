// Cotações de mercado para o Vertal Chat.
// - Cripto: CoinGecko (chave em COINGECKO_API_KEY; demo ou pro, detectada sozinha).
// - Valores mobiliários (B3, fundos, EUA, Londres, índices, Tesouro): API REST da Mais Retorno
//   (chave em MAISRETORNO_API_KEY, header X-Api-Key). Buscar é grátis; cada cotação custa 1 crédito do plano.
//
// Módulo puro (sem APIs do Deno): as chaves e o fetch entram por parâmetro, então o vitest testa direto.

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const MARKET_LIMITS = { maxAssets: 10, maxAssetChars: 80 } as const;
export const COINGECKO_DEMO_BASE = "https://api.coingecko.com/api/v3";
export const COINGECKO_PRO_BASE = "https://pro-api.coingecko.com/api/v3";
export const MAISRETORNO_BASE = "https://data.maisretorno.com/mr-data/v4/api";

export interface CryptoQuote {
  asset: string;
  currency: string;
  price: number;
  change24h: number | null;
  marketCap: number | null;
}

export interface SecurityQuote {
  asset: string;
  identifier: string;
  name: string;
  currency: string;
  date: string;
  close: number;
  changePct: number | null;
}

export interface MarketResult<T> {
  quotes: T[];
  missing: string[];
  error?: string;
}

/** Nomes comuns que o usuário digita → id da CoinGecko (evita ambiguidade de símbolos). */
const CRYPTO_ALIASES: Record<string, string> = {
  btc: "bitcoin", bitcoin: "bitcoin",
  eth: "ethereum", ethereum: "ethereum", ether: "ethereum",
  sol: "solana", solana: "solana",
  usdt: "tether", tether: "tether",
  usdc: "usd-coin",
  bnb: "binancecoin",
  xrp: "ripple", ripple: "ripple",
  ada: "cardano", cardano: "cardano",
  doge: "dogecoin", dogecoin: "dogecoin",
  dot: "polkadot", polkadot: "polkadot",
  matic: "matic-network", pol: "polygon-ecosystem-token",
  avax: "avalanche-2", avalanche: "avalanche-2",
  link: "chainlink", chainlink: "chainlink",
  ltc: "litecoin", litecoin: "litecoin",
  trx: "tron", tron: "tron",
  ton: "the-open-network",
};

export function cleanAssets(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const v = item.trim().slice(0, MARKET_LIMITS.maxAssetChars);
    if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
    if (out.length >= MARKET_LIMITS.maxAssets) break;
  }
  return out;
}

async function coingeckoGet(path: string, apiKey: string | undefined, fetchFn: FetchLike): Promise<Response> {
  const sep = path.includes("?") ? "&" : "?";
  if (!apiKey) return fetchFn(`${COINGECKO_DEMO_BASE}${path}`);
  const demo = await fetchFn(`${COINGECKO_DEMO_BASE}${path}${sep}x_cg_demo_api_key=${encodeURIComponent(apiKey)}`);
  // Chave pro na URL demo responde 400/401: tenta a base pro.
  if (demo.status === 400 || demo.status === 401) {
    return fetchFn(`${COINGECKO_PRO_BASE}${path}`, { headers: { "x-cg-pro-api-key": apiKey } });
  }
  return demo;
}

export async function getCryptoQuotes(
  assets: string[],
  currency: string,
  apiKey: string | undefined,
  fetchFn: FetchLike = fetch,
): Promise<MarketResult<CryptoQuote>> {
  const vs = (currency || "brl").toLowerCase();
  const wanted = assets.map((a) => ({ asset: a, id: CRYPTO_ALIASES[a.toLowerCase()] ?? a.toLowerCase().replace(/\s+/g, "-") }));
  const ids = [...new Set(wanted.map((w) => w.id))].join(",");
  const res = await coingeckoGet(
    `/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${encodeURIComponent(vs)}&include_24hr_change=true&include_market_cap=true`,
    apiKey,
    fetchFn,
  );
  if (res.status === 429) return { quotes: [], missing: assets, error: "Limite da CoinGecko atingido. Tente em um minuto." };
  if (!res.ok) return { quotes: [], missing: assets, error: `CoinGecko respondeu HTTP ${res.status}.` };
  const data = (await res.json()) as Record<string, Record<string, number>>;
  const quotes: CryptoQuote[] = [];
  const missing: string[] = [];
  for (const w of wanted) {
    const row = data[w.id];
    if (!row || typeof row[vs] !== "number") {
      missing.push(w.asset);
      continue;
    }
    quotes.push({
      asset: w.id,
      currency: vs.toUpperCase(),
      price: row[vs],
      change24h: typeof row[`${vs}_24h_change`] === "number" ? row[`${vs}_24h_change`] : null,
      marketCap: typeof row[`${vs}_market_cap`] === "number" ? row[`${vs}_market_cap`] : null,
    });
  }
  return { quotes, missing };
}

function isoDaysAgo(days: number, now: Date): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

/** "PETR4", "petr4:b3", "Verde FIC", "aapl.us:us". Sem ":" faz a busca (grátis) e usa o 1º ativo com cotações. */
async function resolveIdentifier(asset: string, apiKey: string, fetchFn: FetchLike): Promise<string | null> {
  if (/^[^\s:]+:[a-z]{2,4}$/i.test(asset)) return asset.toLowerCase();
  const res = await fetchFn(`${MAISRETORNO_BASE}/search/${encodeURIComponent(asset)}?has_quotes=true`, {
    headers: { "X-Api-Key": apiKey },
  });
  if (!res.ok) return null;
  const hits = (await res.json()) as Array<{ identifier?: string; has_quotes?: boolean }>;
  const plain = asset.toLowerCase();
  const exact = hits.find((h) => h.identifier?.toLowerCase().startsWith(`${plain}:`));
  return (exact ?? hits.find((h) => h.has_quotes !== false))?.identifier ?? null;
}

export async function getSecurityQuotes(
  assets: string[],
  apiKey: string | undefined,
  fetchFn: FetchLike = fetch,
  now: Date = new Date(),
): Promise<MarketResult<SecurityQuote>> {
  if (!apiKey) return { quotes: [], missing: assets, error: "MAISRETORNO_API_KEY não configurada no servidor." };
  const quotes: SecurityQuote[] = [];
  const missing: string[] = [];
  for (const asset of assets) {
    const identifier = await resolveIdentifier(asset, apiKey, fetchFn);
    if (!identifier) {
      missing.push(asset);
      continue;
    }
    const res = await fetchFn(
      `${MAISRETORNO_BASE}/quotes/${encodeURIComponent(identifier)}?start_date=${isoDaysAgo(15, now)}&adjusted=false`,
      { headers: { "X-Api-Key": apiKey } },
    );
    if (res.status === 429) return { quotes, missing: [...missing, ...assets.slice(assets.indexOf(asset))], error: "Créditos do plano Mais Retorno esgotados neste mês." };
    if (res.status === 401 || res.status === 403) return { quotes, missing: [...missing, ...assets.slice(assets.indexOf(asset))], error: "A chave da Mais Retorno foi recusada (ou o plano não cobre este ativo)." };
    if (!res.ok) {
      missing.push(asset);
      continue;
    }
    const d = (await res.json()) as {
      currency?: string; nicename?: string; shortname?: string;
      quotes?: Array<{ d: string; c: number }>;
    };
    const series = (d.quotes ?? []).filter((q) => typeof q.c === "number");
    const last = series[series.length - 1];
    if (!last) {
      missing.push(asset);
      continue;
    }
    const prev = series[series.length - 2];
    quotes.push({
      asset,
      identifier,
      name: d.shortname || d.nicename || identifier,
      currency: d.currency || "BRL",
      date: last.d,
      close: last.c,
      changePct: prev && prev.c ? ((last.c - prev.c) / prev.c) * 100 : null,
    });
  }
  return { quotes, missing };
}

function fmt(n: number, currency: string): string {
  const digits = Math.abs(n) >= 1 ? 2 : 6;
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: digits }).format(n);
  } catch {
    return `${n.toLocaleString("pt-BR", { maximumFractionDigits: digits })} ${currency}`;
  }
}

function pct(n: number | null): string {
  if (n === null) return "";
  const s = n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return ` (${n >= 0 ? "+" : ""}${s}%)`;
}

export function formatCrypto(r: MarketResult<CryptoQuote>): string {
  const lines = r.quotes.map((q) => `- ${q.asset}: ${fmt(q.price, q.currency)}${pct(q.change24h)} em 24h`);
  if (r.missing.length) lines.push(`Não encontrados: ${r.missing.join(", ")}.`);
  if (r.error) lines.push(r.error);
  return ["Cotações cripto (CoinGecko):", ...lines].join("\n");
}

export function formatSecurities(r: MarketResult<SecurityQuote>): string {
  const lines = r.quotes.map((q) => `- ${q.name} (${q.identifier}): ${fmt(q.close, q.currency)}${pct(q.changePct)} no fechamento de ${q.date}`);
  if (r.missing.length) lines.push(`Não encontrados: ${r.missing.join(", ")}.`);
  if (r.error) lines.push(r.error);
  return ["Cotações (Mais Retorno):", ...lines].join("\n");
}
