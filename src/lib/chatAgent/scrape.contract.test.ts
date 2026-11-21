import { describe, expect, it } from 'vitest';
import { AGENT_PROMPT_BUDGET, TOOL_COSTS, buildAgentSystemPrompt, parseAgentAction } from '../../../supabase/functions/_shared/chatAgent';
import { canUseScraper, formatScrapeForAgent, parseAgentTurn, parseScraperRequest } from '../../../supabase/functions/_shared/vibeAgentCore';

describe('contrato F5: scrape_page / crawl_site / monitor_page', () => {
  it('ferramentas entram no prompt só quando a conversa fala de coleta, e o prompt cabe no orçamento', () => {
    const off = buildAgentSystemPrompt({ secretNames: [] });
    expect(off).not.toContain('"tool":"scrape_page"');
    const on = buildAgentSystemPrompt({ secretNames: [], scrape: true });
    expect(on).toContain('"tool":"scrape_page"');
    expect(on).toContain('Coleta web:');
    expect(on.length).toBeLessThanOrEqual(AGENT_PROMPT_BUDGET);
    // Conversa muito cheia: a coleta cede espaço primeiro (nunca estoura o orçamento).
    const heavy = buildAgentSystemPrompt({
      secretNames: [], scrape: true, navigator: true, github: true, media: true, memories: 'x'.repeat(2_500), recall: 'y'.repeat(700), summary: 'z'.repeat(2_400), plan: 'p'.repeat(2_500),
    });
    expect(heavy.length).toBeLessThanOrEqual(AGENT_PROMPT_BUDGET);
    expect(TOOL_COSTS.scrape_page).toContain('2 créditos/página');
  });

  it('valida as ações (URL pública, modo, seletores, monitor)', () => {
    expect(parseAgentAction({ tool: 'scrape_page', urls: ['https://loja.com/p'], selectors: [{ name: 'preco', css: '.price' }] }))
      .toMatchObject({ tool: 'scrape_page', mode: 'fetch', urls: ['https://loja.com/p'] });
    expect(parseAgentAction({ tool: 'scrape_page', url: 'http://127.0.0.1/admin' })).toBeNull();
    expect(parseAgentAction({ tool: 'crawl_site', url: 'https://a.com', mode: 'stealth' })).toBeNull();
    expect(parseAgentAction({ tool: 'monitor_page', op: 'create', url: 'https://a.com/p', selector: '.price', frequencyMinutes: 60 }))
      .toMatchObject({ tool: 'monitor_page', op: 'create', frequencyMinutes: 60 });
    expect(parseAgentAction({ tool: 'monitor_page', op: 'delete', id: 'nao-uuid' })).toBeNull();
    expect(parseAgentAction({ tool: 'monitor_page', op: 'list' })).toEqual({ tool: 'monitor_page', op: 'list' });
  });

  it('Vibe Code: ação use_scraper (limite por pedido) e resultado como DADOS', () => {
    const turn = parseAgentTurn('{"summary":"vou ler","actions":[{"type":"use_scraper","path":"https://a.com/precos","reason":"preços","content":".price"}],"final":false}');
    const req = parseScraperRequest(turn.actions[0]);
    expect(req).toEqual({ url: 'https://a.com/precos', purpose: 'preços', css: '.price' });
    expect(parseScraperRequest({ type: 'use_scraper', path: 'javascript:alert(1)' })).toBeNull();
    expect(canUseScraper(0).ok).toBe(true);
    expect(canUseScraper(2).ok).toBe(false);
    expect(formatScrapeForAgent('https://a.com', { ok: true, credits: 2, pages: [{ title: 'Preços', items: { valor: ['R$ 10'] } }] })).toContain('valor: R$ 10');
    expect(formatScrapeForAgent('https://a.com', { ok: false, status: 'consent_required', message: 'assine' })).toContain('NÃO feita');
  });
});
