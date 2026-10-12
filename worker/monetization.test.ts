// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose';
import worker from './index';
import { crawlPriceFor, formatCrawlerPrice, isInBandPricing } from './payPerCrawl';
import { isPaidPath, parsePaidPrefixes, verifyPaymentContext } from './monetizationGateway';

const assets = {
  fetch: async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }),
};

describe('Pay Per Crawl', () => {
  it('libera descoberta, cobra conteúdo premium e deixa o resto no padrão da zona', () => {
    expect(crawlPriceFor('/')).toBe(0);
    expect(crawlPriceFor('/pricing')).toBe(0);
    expect(crawlPriceFor('/docs/mcp')).toBe(0.01);
    expect(crawlPriceFor('/alternativas/lovable')).toBe(0.005);
    expect(crawlPriceFor('/docsx')).toBeNull();
    expect(crawlPriceFor('/creative')).toBeNull();
  });

  it('formata o header no formato da Cloudflare', () => {
    expect(formatCrawlerPrice(0.01)).toBe('USD 0.010');
    expect(formatCrawlerPrice(0)).toBe('USD 0.000');
  });

  it('só define Crawler-Price quando a zona pede preço in-band', async () => {
    const inBand = new Request('https://vertal.dev/docs', {
      headers: { 'cf-pay-per-crawl': 'protocol=cloudflare, pricing=in-band' },
    });
    expect(isInBandPricing(inBand)).toBe(true);
    const res = await worker.fetch(inBand, { ASSETS: assets });
    expect(res.headers.get('Crawler-Price')).toBe('USD 0.010');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');

    const bypass = new Request('https://vertal.dev/docs', {
      headers: { 'cf-pay-per-crawl': 'protocol=cloudflare, pricing=bypass' },
    });
    expect((await worker.fetch(bypass, { ASSETS: assets })).headers.has('Crawler-Price')).toBe(false);
  });
});

describe('Monetization Gateway', () => {
  it('lê os prefixos pagos da variável', () => {
    const prefixes = parsePaidPrefixes(' /api/paid/ , data, /x ');
    expect(prefixes).toEqual(['/api/paid', '/x']);
    expect(isPaidPath('/api/paid/report', prefixes)).toBe(true);
    expect(isPaidPath('/api/paidx', prefixes)).toBe(false);
    expect(parsePaidPrefixes(undefined)).toEqual([]);
  });

  async function setup() {
    const { publicKey, privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
    const jwk = { ...(await exportJWK(publicKey)), alg: 'EdDSA', kid: 'k1' };
    const keys = createLocalJWKSet({ keys: [jwk] });
    const sign = (aud: string, exp = '2m') =>
      new SignJWT({ scheme: 'exact', amount: '25000' })
        .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
        .setIssuedAt()
        .setNotBefore('0s')
        .setExpirationTime(exp)
        .setAudience(aud)
        .sign(privateKey);
    return { keys, sign };
  }

  it('aceita JWT válido para a URL pedida', async () => {
    const { keys, sign } = await setup();
    const token = await sign('https://vertal.dev/api/paid/report');
    const req = new Request('https://vertal.dev/api/paid/report?x=1', { headers: { 'PAYMENT-CONTEXT': token } });
    const check = await verifyPaymentContext(req, keys);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.claims.amount).toBe('25000');
  });

  it('rejeita ausência, outra audiência, expirado e assinatura alheia', async () => {
    const { keys, sign } = await setup();
    const url = 'https://vertal.dev/api/paid/report';
    expect((await verifyPaymentContext(new Request(url), keys)).ok).toBe(false);

    const otherAud = await sign('https://vertal.dev/api/paid/other');
    expect((await verifyPaymentContext(new Request(url, { headers: { 'PAYMENT-CONTEXT': otherAud } }), keys)).ok).toBe(false);

    const expired = await sign(url, '-1m');
    expect((await verifyPaymentContext(new Request(url, { headers: { 'PAYMENT-CONTEXT': expired } }), keys)).ok).toBe(false);

    const stranger = await setup();
    const forged = await stranger.sign(url);
    expect((await verifyPaymentContext(new Request(url, { headers: { 'PAYMENT-CONTEXT': forged } }), keys)).ok).toBe(false);
  });

  it('o Worker devolve 402 numa rota paga sem pagamento e não toca nas outras', async () => {
    const env = { ASSETS: assets, MONETIZATION_GATEWAY_PATHS: '/api/paid' };
    const paid = await worker.fetch(new Request('https://vertal.dev/api/paid/report'), env);
    expect(paid.status).toBe(402);
    const free = await worker.fetch(new Request('https://vertal.dev/pricing'), env);
    expect(free.status).toBe(200);
  });
});
