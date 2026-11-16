import { describe, it, expect, vi } from 'vitest';
import { parseAgentAction, buildAgentSystemPrompt } from './contract';
import { getCryptoQuotes, getSecurityQuotes, formatCrypto, formatSecurities } from '../../../supabase/functions/_shared/marketData';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('market_quote', () => {
  it('valida a ação', () => {
    expect(parseAgentAction({ tool: 'market_quote', market: 'crypto', assets: ['btc', 'BTC', 'eth'] }))
      .toEqual({ tool: 'market_quote', market: 'crypto', assets: ['btc', 'eth'], currency: 'brl' });
    expect(parseAgentAction({ tool: 'market_quote', market: 'securities', assets: 'PETR4, HGLG11' }))
      .toEqual({ tool: 'market_quote', market: 'securities', assets: ['PETR4', 'HGLG11'] });
    expect(parseAgentAction({ tool: 'market_quote', market: 'forex', assets: ['usd'] })).toBeNull();
    expect(parseAgentAction({ tool: 'market_quote', market: 'crypto', assets: [] })).toBeNull();
    expect(buildAgentSystemPrompt({ secretNames: [] })).toContain('"tool":"market_quote"');
  });

  it('CoinGecko: resolve apelidos e formata', async () => {
    const f = vi.fn(async (url: string) => {
      expect(url).toContain('ids=bitcoin%2Cethereum');
      expect(url).toContain('x_cg_demo_api_key=CG-x');
      return json({ bitcoin: { brl: 500000, brl_24h_change: 1.5, brl_market_cap: 1 }, ethereum: { brl: 20000, brl_24h_change: -2 } });
    });
    const r = await getCryptoQuotes(['btc', 'eth', 'naoexiste'], 'brl', 'CG-x', f);
    expect(r.quotes.map((q) => q.asset)).toEqual(['bitcoin', 'ethereum']);
    expect(r.missing).toEqual(['naoexiste']);
    expect(formatCrypto(r)).toContain('+1,50%');
  });

  it('CoinGecko: chave pro cai para a base pro', async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) =>
      url.includes('pro-api') ? (expect((init?.headers as Record<string, string>)['x-cg-pro-api-key']).toBe('CG-p'), json({ bitcoin: { usd: 90000 } })) : json({}, 400));
    const r = await getCryptoQuotes(['bitcoin'], 'usd', 'CG-p', f);
    expect(r.quotes[0].price).toBe(90000);
  });

  it('Mais Retorno: busca o identificador e pega o último fechamento', async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['X-Api-Key']).toBe('mr_k');
      if (url.includes('/search/')) return json([{ identifier: 'petr4:b3', has_quotes: true }]);
      return json({ currency: 'BRL', shortname: 'PETR4', quotes: [{ d: '2026-11-12', c: 40 }, { d: '2026-11-13', c: 41 }] });
    });
    const r = await getSecurityQuotes(['PETR4'], 'mr_k', f, new Date('2026-11-14T00:00:00Z'));
    expect(r.quotes[0]).toMatchObject({ identifier: 'petr4:b3', close: 41, date: '2026-11-13' });
    expect(r.quotes[0].changePct).toBeCloseTo(2.5);
    expect(formatSecurities(r)).toContain('PETR4 (petr4:b3)');
  });

  it('Mais Retorno: sem chave avisa', async () => {
    const r = await getSecurityQuotes(['PETR4'], undefined, vi.fn());
    expect(r.error).toContain('MAISRETORNO_API_KEY');
  });
});
