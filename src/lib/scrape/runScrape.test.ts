import { describe, expect, it, vi } from 'vitest';
import { callWithConsent, runScrapeAction } from './runScrape';
import type { ScrapeResponse } from './client';

const ids = (() => { let n = 0; return () => `a${++n}`; })();

describe('coleta no chat: termo, captcha e cartão', () => {
  it('servidor pede o termo: abre o cartão; assinou, repete UMA vez; recusou, não roda', async () => {
    const call = vi.fn(async () => ({ ok: false, status: 'consent_required', category: 'web_scraping', version: 'v1', title: 'Coleta' }) as ScrapeResponse);
    const consent = vi.fn(async () => false);
    const refused = await callWithConsent('page', { url: 'https://a.com' }, { call, consent });
    expect(refused.ok).toBe(false);
    expect(call).toHaveBeenCalledTimes(1);
    expect(consent).toHaveBeenCalledWith({ category: 'web_scraping', version: 'v1', title: 'Coleta' });
    const call2 = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 'consent_required', category: 'web_scraping', version: 'v1' })
      .mockResolvedValueOnce({ ok: true, status: 'ok', pages: [] });
    const ok = await callWithConsent('page', {}, { call: call2, consent: async () => true });
    expect(ok.ok).toBe(true);
    expect(call2).toHaveBeenCalledTimes(2);
  });

  it('captcha PAUSA a coleta, entrega ao usuário no Navigator e continua na sessão dele ao devolver', async () => {
    const call = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 'ok', credits: 2, mode: 'fetch', captchaUrls: ['https://b.com/p'],
        pages: [{ url: 'https://a.com/p', items: { preco: ['R$ 10'] } }, { url: 'https://b.com/p', items: {}, blocked: 'captcha' }],
      })
      .mockResolvedValueOnce({ ok: true, status: 'ok', credits: 3, pages: [{ url: 'https://b.com/p', items: { preco: ['R$ 12'] } }] });
    const solveCaptcha = vi.fn(async () => ({ ok: true, sessionId: 'sess-1' }));
    const out = await runScrapeAction(
      { tool: 'scrape_page', urls: ['https://a.com/p', 'https://b.com/p'], mode: 'fetch', selectors: [{ name: 'preco', css: '.price' }] },
      ids, { call, solveCaptcha },
    );
    expect(solveCaptcha).toHaveBeenCalledWith('https://b.com/p');
    expect(call.mock.calls[1]).toEqual(['page', expect.objectContaining({ urls: ['https://b.com/p'], mode: 'dynamic', sessionId: 'sess-1' })]);
    expect(out.result.ok).toBe(true);
    expect(out.result.summary).toContain('Captcha resolvido por você');
    expect(out.artifact).toMatchObject({ kind: 'scrape', credits: 5, columns: ['preco'] });
    if (out.artifact?.kind === 'scrape') expect(out.artifact.rows.map((r) => r.values.preco)).toEqual(['R$ 10', 'R$ 12']);
  });

  it('captcha não resolvido: a página fica de fora e nada é resolvido automaticamente', async () => {
    const call = vi.fn().mockResolvedValueOnce({ ok: true, status: 'ok', credits: 0, captchaUrls: ['https://b.com/p'], pages: [{ url: 'https://b.com/p', items: {}, blocked: 'captcha' }] });
    const out = await runScrapeAction({ tool: 'scrape_page', urls: ['https://b.com/p'], mode: 'fetch', selectors: [] }, ids, { call, solveCaptcha: async () => ({ ok: false, message: 'não resolvido' }) });
    expect(call).toHaveBeenCalledTimes(1);
    expect(out.result.summary).toContain('não resolvido');
    expect(out.artifact?.kind === 'scrape' && out.artifact.captchaUrls).toEqual(['https://b.com/p']);
  });

  it('monitor: cria e abre o painel; seletor sem resultado explica', async () => {
    const created = await runScrapeAction(
      { tool: 'monitor_page', op: 'create', url: 'https://a.com/p', selector: { name: 'preco', css: '.price' }, mode: 'fetch', frequencyMinutes: 60, name: 'Preço A' },
      ids, { call: async () => ({ ok: true, status: 'ok', value: 'R$ 10', credits: 2 }) },
    );
    expect(created).toMatchObject({ panel: 'monitors', result: { ok: true } });
    const bad = await runScrapeAction(
      { tool: 'monitor_page', op: 'create', url: 'https://a.com/p', selector: { name: 'preco', css: '.x' }, mode: 'fetch', frequencyMinutes: 60, name: 'X' },
      ids, { call: async () => ({ ok: false, status: 'bad_request', detail: 'selector_not_found' }) },
    );
    expect(bad.result.summary).toMatch(/seletor não encontrou/);
  });
});
