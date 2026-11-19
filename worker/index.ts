// Worker do vertal.dev: serve o build estático (env.ASSETS) e liga a
// monetização da Cloudflare — Pay Per Crawl (crawlers de IA pagam por
// página) e Monetization Gateway (agentes pagam via x402 nas rotas pagas).
// Configuração no painel: docs/CLOUDFLARE_MONETIZATION.md.
// Também atende a API do conector Spotify em /api/spotify/* (docs/SPOTIFY_CONNECTOR.md)
// e o navegador na nuvem do Vertal Chat em /api/browser/* (docs/BROWSER_FORM_AGENT.md).
import { crawlPriceFor, formatCrawlerPrice, isInBandPricing } from './payPerCrawl';
import { isPaidPath, parsePaidPrefixes, verifyPaymentContext } from './monetizationGateway';
import { siteVerificationResponse } from './siteVerification';
import { legacyRedirect } from './legacyRedirects';
import { handleSpotify, SPOTIFY_API_PREFIX, type SpotifyRoutesEnv } from './spotifyRoutes';
import { BROWSER_API_PREFIX, handleBrowserForm, type BrowserFormEnv } from './browserFormRoutes';

export interface Env extends SpotifyRoutesEnv, BrowserFormEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Prefixos protegidos pelo Monetization Gateway, separados por vírgula. */
  MONETIZATION_GATEWAY_PATHS?: string;
}

// Com o Worker rodando antes dos assets, o public/_headers não vale para as
// respostas dele — repetimos aqui os headers de segurança.
// Em vez de X-Frame-Options (que só aceita SAMEORIGIN), o CSP frame-ancestors
// libera o iframe apenas para os apps do Ecossistema Vertal (vertal.app e
// vertalrun.com), que abrem o Vertal Dev pelo botão "Abrir aqui".
export const FRAME_ANCESTORS =
  "frame-ancestors 'self' https://vertal.app https://*.vertal.app https://vertalrun.com https://www.vertalrun.com";

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': FRAME_ANCESTORS,
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(self), payment=()',
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

    const verification = siteVerificationResponse(url.pathname);
    if (verification) return verification;

    // Rotas antigas do Vertal Vibe Pay (/vibe-bank, /<idioma>/vibe-bank, /bank…) → 301.
    const moved = legacyRedirect(url);
    if (moved) return moved;

    if (url.pathname === SPOTIFY_API_PREFIX || url.pathname.startsWith(`${SPOTIFY_API_PREFIX}/`)) {
      const res = await handleSpotify(request, env, url);
      res.headers.set('X-Robots-Tag', 'noindex');
      return res;
    }

    if (url.pathname === BROWSER_API_PREFIX || url.pathname.startsWith(`${BROWSER_API_PREFIX}/`)) {
      return handleBrowserForm(request, env, url);
    }

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
