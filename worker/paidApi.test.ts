// @vitest-environment node
import { describe, expect, it } from 'vitest';
import worker from './index';
import { handlePaidApi } from './paidApi';
import { ALTERNATIVES } from '../src/config/alternatives';

const assets = { fetch: async () => new Response('<html></html>') };
const get = (path: string, init?: RequestInit) => new Request(`https://vertal.dev${path}`, init);

describe('API paga (/api/paid)', () => {
  it('lista os recursos e entrega o dataset de comparações', async () => {
    const index = await handlePaidApi(get('/api/paid')).json();
    expect(index.resources.length).toBeGreaterThan(0);

    const all = await handlePaidApi(get('/api/paid/alternatives/')).json();
    expect(all.alternatives).toHaveLength(ALTERNATIVES.length);
    expect(all.vertalFeatures.length).toBeGreaterThan(0);

    const slug = ALTERNATIVES[0].slug;
    const one = await handlePaidApi(get(`/api/paid/alternatives/${slug}`)).json();
    expect(one.alternative.slug).toBe(slug);
  });

  it('404 para slug ou caminho desconhecido e 405 para POST', () => {
    expect(handlePaidApi(get('/api/paid/alternatives/nao-existe')).status).toBe(404);
    expect(handlePaidApi(get('/api/paid/outra-coisa')).status).toBe(404);
    expect(handlePaidApi(get('/api/paid', { method: 'POST' })).status).toBe(405);
  });

  it('o Worker exige pagamento em /api/paid mesmo com a variável vazia', async () => {
    const res = await worker.fetch(get('/api/paid/alternatives'), { ASSETS: assets, MONETIZATION_GATEWAY_PATHS: '' });
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe('payment_required');
  });
});
