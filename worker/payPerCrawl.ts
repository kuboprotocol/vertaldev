// Pay Per Crawl (Cloudflare AI Crawl Control): crawlers de IA pagam por
// página. O preço padrão fica no painel (AI Crawl Control → Payments); com
// "Enable dynamic pricing" ligado, a Cloudflare manda `cf-pay-per-crawl:
// ...pricing=in-band` e o preço que devolvemos em `Crawler-Price` vale no
// lugar do padrão da zona.
// https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/use-pay-per-crawl-as-site-owner/advanced-configuration/

/** Preço mínimo aceito pela Cloudflare, em USD por página. */
export const MIN_CRAWL_PRICE_USD = 0.001;

type PriceRule = { match: (path: string) => boolean; priceUSD: number };

const exact = (p: string) => (path: string) => path === p || path === `${p}/`;
const prefix = (p: string) => (path: string) => path === p || path.startsWith(`${p}/`);

// Primeira regra que casar vence. Sem regra: preço padrão da zona.
const RULES: PriceRule[] = [
  // Grátis: páginas de descoberta e legais — ajudam o crawler a achar o
  // conteúdo pago e não têm valor de treino.
  { match: exact('/'), priceUSD: 0 },
  { match: prefix('/pricing'), priceUSD: 0 },
  { match: prefix('/privacy'), priceUSD: 0 },
  { match: prefix('/terms'), priceUSD: 0 },
  { match: prefix('/support'), priceUSD: 0 },
  { match: prefix('/download'), priceUSD: 0 },
  // Premium: conteúdo editorial e técnico, o que mais vale para IA.
  { match: prefix('/docs'), priceUSD: 0.01 },
  { match: prefix('/alternativas'), priceUSD: 0.005 },
  { match: prefix('/agents'), priceUSD: 0.005 },
  { match: prefix('/connectors'), priceUSD: 0.005 },
];

/** Preço em USD para o caminho, ou null para usar o padrão da zona. */
export function crawlPriceFor(pathname: string): number | null {
  const rule = RULES.find((r) => r.match(pathname));
  if (!rule) return null;
  if (rule.priceUSD === 0) return 0;
  return Math.max(rule.priceUSD, MIN_CRAWL_PRICE_USD);
}

/** `true` quando a zona está com preço dinâmico (in-band) para esta requisição. */
export function isInBandPricing(request: Request): boolean {
  return /\bpricing=in-band\b/.test(request.headers.get('cf-pay-per-crawl') ?? '');
}

/** Valor do header `Crawler-Price` ("USD 0.010"). */
export function formatCrawlerPrice(priceUSD: number): string {
  return `USD ${priceUSD.toFixed(3)}`;
}
