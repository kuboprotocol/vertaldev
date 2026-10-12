// Worker do vertal.dev: serve o build estático (env.ASSETS) e liga a
// monetização da Cloudflare — Pay Per Crawl (crawlers de IA pagam por
// página) e Monetization Gateway (agentes pagam via x402 nas rotas pagas).
// Configuração no painel: docs/CLOUDFLARE_MONETIZATION.md.
import { crawlPriceFor, formatCrawlerPrice, isInBandPricing } from './payPerCrawl';
import { isPaidPath, parsePaidPrefixes, verifyPaymentContext } from './monetizationGateway';

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Prefixos protegidos pelo Monetization Gateway, separados por vírgula. */
  MONETIZATION_GATEWAY_PATHS?: string;
}

// Com o Worker rodando antes dos assets, o public/_headers não vale para as
// respostas dele — repetimos aqui os headers de segurança.
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), payment=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const paid = isPaidPath(url.pathname, parsePaidPrefixes(env.MONETIZATION_GATEWAY_PATHS));
    if (paid) {
      const check = await verifyPaymentContext(request);
      // Sem contexto válido a requisição não passou pelo Gateway (ou o JWT é
      // forjado/expirado): nunca servir o conteúdo pago.
      if (!check.ok) return json(402, { error: 'payment_required', reason: check.reason });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const response = new Response(assetResponse.body, assetResponse);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (!response.headers.has(name)) response.headers.set(name, value);
    }
    if (paid) response.headers.set('Cache-Control', 'private, no-store');

    if (isInBandPricing(request)) {
      const price = crawlPriceFor(url.pathname);
      if (price !== null) response.headers.set('Crawler-Price', formatCrawlerPrice(price));
    }
    return response;
  },
};
