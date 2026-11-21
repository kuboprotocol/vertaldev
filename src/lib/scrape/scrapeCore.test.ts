import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAPTCHA_MARKERS, SCRAPE_BASE_SERVICES, SCRAPE_LIMITS, SCRAPE_PRICE_TABLE, billablePages, captchaUrls, createWindowLimiter, detectCaptcha,
  diffMonitorValue, isAllowedByRobots, parseCrawlBody, parseMonitorBody, parseNumber, parseRobots, parseScrapeBody, rateLimitDecision,
  redactPersonalData, robotsCrawlDelay, robotsFromResponse, sanitizePages, scrapeCost, scrapeFirstCandidate, scrapePrice, scraplingPrice, wantsScrape,
} from '../../../supabase/functions/_shared/scrapeCore';
import { BROWSER_FORM_LIMITS } from '../../../supabase/functions/_shared/browserForm';
import { NAVIGATOR_LIMITS } from '../../../supabase/functions/_shared/navigatorCore';
import { OFFICE_AI_CREDIT_COST } from '../../../supabase/functions/_shared/officeAi';
import { CLOUD_CREDIT_COSTS, LOCAL_CREDIT_COSTS } from '@/lib/anywhereConfig';

describe('créditos do Scrapling: serviço vigente × 1,45, arredondado para cima', () => {
  it('calcula ×1,45 com arredondamento para cima e sem erro de ponto flutuante', () => {
    expect(scraplingPrice(0)).toBe(0);
    expect(scraplingPrice(1)).toBe(2); // 1,45 → 2
    expect(scraplingPrice(2)).toBe(3); // 2,9 → 3
    expect(scraplingPrice(4)).toBe(6); // 5,8 → 6
    expect(scraplingPrice(10)).toBe(15); // 14,5 → 15
    expect(scraplingPrice(20)).toBe(29); // 29 exato (float daria 28,999…)
    expect(scraplingPrice(100)).toBe(145);
    for (let base = 0; base <= 200; base++) {
      const p = scraplingPrice(base);
      expect(p).toBeGreaterThanOrEqual(base * 1.45 - 1e-9);
      expect(p - base * 1.45).toBeLessThan(1);
    }
  });

  it('os valores base são os mesmos das fontes vigentes do código', () => {
    expect(SCRAPE_BASE_SERVICES.chat_action.credits).toBe(LOCAL_CREDIT_COSTS.chatMessage);
    expect(SCRAPE_BASE_SERVICES.chat_action.credits).toBe(OFFICE_AI_CREDIT_COST);
    expect(SCRAPE_BASE_SERVICES.cloud_build.credits).toBe(CLOUD_CREDIT_COSTS.build);
    expect(SCRAPE_BASE_SERVICES.browser_form_submit.credits).toBe(BROWSER_FORM_LIMITS.submitCredits);
    expect(SCRAPE_BASE_SERVICES.navigator_minute.credits).toBe(NAVIGATOR_LIMITS.creditsPerMinute);
  });

  it('cada linha da tabela é base × 1,45 para cima; ações de gestão são grátis', () => {
    for (const row of SCRAPE_PRICE_TABLE) {
      expect(row.credits).toBe(scraplingPrice(row.baseCredits));
      if (row.base) expect(row.credits).toBeGreaterThan(row.baseCredits);
    }
    expect(scrapePrice('scrape_fetch')).toBe(2);
    expect(scrapePrice('scrape_dynamic')).toBe(3);
    expect(scrapePrice('scrape_stealth')).toBe(6);
    expect(scrapePrice('monitor_create')).toBe(0);
    expect(scrapeCost('crawl', 'fetch', 10)).toBe(20);
    expect(scrapeCost('scrape', 'stealth', 2)).toBe(12);
  });

  it('só páginas obtidas são cobradas', () => {
    const pages = [{ url: 'https://a.com/', items: {} }, { url: 'https://a.com/x', items: {}, blocked: 'robots' as const }, { url: 'https://a.com/y', items: {}, blocked: 'captcha' as const }];
    expect(billablePages(pages)).toBe(1);
    expect(captchaUrls(pages)).toEqual(['https://a.com/y']);
  });
});

describe('rate limit', () => {
  it('janela deslizante por chave, com relógio injetável', () => {
    const lim = createWindowLimiter(3, 1_000);
    expect(lim.take('u1', 1, 0)).toBe(true);
    expect(lim.take('u1', 2, 10)).toBe(true);
    expect(lim.take('u1', 1, 20)).toBe(false); // passou do limite
    expect(lim.take('u2', 1, 20)).toBe(true); // outra chave
    expect(lim.remaining('u1', 20)).toBe(0);
    expect(lim.take('u1', 1, 1_001)).toBe(true); // o 1º saiu da janela
    expect(lim.take('u1', 5, 5_000)).toBe(false); // pedido maior que o limite não consome
    expect(lim.remaining('u1', 5_000)).toBe(3);
  });

  it('decisão com as contagens do banco: por usuário e por domínio', () => {
    const base = { userPages10m: 0, userTasks10m: 0, domainPages1m: {}, wantPages: 1, hosts: ['a.com'] };
    expect(rateLimitDecision(base)).toEqual({ ok: true });
    expect(rateLimitDecision({ ...base, userTasks10m: SCRAPE_LIMITS.userTasksPer10Min })).toEqual({ ok: false, reason: 'user_tasks' });
    expect(rateLimitDecision({ ...base, userPages10m: SCRAPE_LIMITS.userPagesPer10Min - 5, wantPages: 10 })).toEqual({ ok: false, reason: 'user_pages' });
    expect(rateLimitDecision({ ...base, domainPages1m: { 'a.com': SCRAPE_LIMITS.domainPagesPerMinute } })).toEqual({ ok: false, reason: 'domain', host: 'a.com' });
    expect(rateLimitDecision({ ...base, domainPages1m: { 'b.com': 999 } })).toEqual({ ok: true });
  });
});

describe('robots.txt (respeitado por padrão)', () => {
  const txt = [
    'User-agent: *', 'Disallow: /privado', 'Allow: /privado/publico', 'Disallow: /*.pdf$', 'Crawl-delay: 2', '',
    'User-agent: VertalBot', 'Disallow: /sem-vertal', '', 'User-agent: OutroBot', 'Disallow: /',
  ].join('\n');

  it('grupo específico do VertalBot vence o "*"; regra mais longa vence; Allow vence empate', () => {
    const p = parseRobots(txt);
    expect(isAllowedByRobots(p, '/sem-vertal/x')).toBe(false);
    // O grupo do VertalBot substitui o "*": /privado fica liberado para ele.
    expect(isAllowedByRobots(p, '/privado')).toBe(true);
    const star = parseRobots('User-agent: *\nDisallow: /privado\nAllow: /privado/publico\nDisallow: /*.pdf$\nCrawl-delay: 2');
    expect(isAllowedByRobots(star, '/privado/x')).toBe(false);
    expect(isAllowedByRobots(star, '/privado/publico/1')).toBe(true);
    expect(isAllowedByRobots(star, '/doc.pdf')).toBe(false);
    expect(isAllowedByRobots(star, '/doc.pdf?x=1')).toBe(true);
    expect(isAllowedByRobots(star, '/')).toBe(true);
    expect(isAllowedByRobots(star, '/robots.txt')).toBe(true);
    expect(robotsCrawlDelay(star)).toBe(2);
  });

  it('"Disallow: /" bloqueia tudo; "Disallow:" vazio libera', () => {
    expect(isAllowedByRobots(parseRobots('User-agent: *\nDisallow: /'), '/qualquer')).toBe(false);
    expect(isAllowedByRobots(parseRobots('User-agent: *\nDisallow:'), '/qualquer')).toBe(true);
    expect(isAllowedByRobots(parseRobots(''), '/x')).toBe(true);
  });

  it('resposta HTTP: 4xx libera, 5xx/erro de rede bloqueia tudo (conservador)', () => {
    expect(isAllowedByRobots(robotsFromResponse(404, ''), '/x')).toBe(true);
    expect(isAllowedByRobots(robotsFromResponse(503, ''), '/x')).toBe(false);
    expect(isAllowedByRobots(robotsFromResponse(null, ''), '/x')).toBe(false);
    expect(isAllowedByRobots(robotsFromResponse(200, 'User-agent: *\nDisallow: /a'), '/a/b')).toBe(false);
  });
});

describe('validação e dados pessoais', () => {
  it('scrape: só URLs públicas, até 5, modos conhecidos', () => {
    expect(parseScrapeBody({ url: 'http://localhost/x' })).toMatchObject({ ok: false, status: 'blocked_url' });
    expect(parseScrapeBody({ url: 'https://10.0.0.1/x' })).toMatchObject({ ok: false, status: 'blocked_url' });
    expect(parseScrapeBody({ urls: Array.from({ length: 6 }, (_, i) => `https://a.com/${i}`) })).toMatchObject({ ok: false, detail: 'urls' });
    expect(parseScrapeBody({ url: 'https://a.com', mode: 'hack' })).toMatchObject({ ok: false, detail: 'mode' });
    const ok = parseScrapeBody({ url: 'a.com/p', selectors: [{ name: 'preço', css: '.price' }] });
    expect(ok.ok && ok.data).toMatchObject({ urls: ['https://a.com/p'], mode: 'fetch', selectors: [{ name: 'preço', css: '.price', all: false }] });
  });

  it('recusa seletores de contato pessoal (sem coleta em massa)', () => {
    expect(parseScrapeBody({ url: 'https://a.com', selectors: [{ name: 'email', css: 'a[href^="mailto:"]' }] })).toMatchObject({ ok: false, status: 'personal_data' });
    expect(parseScrapeBody({ url: 'https://a.com', selectors: [{ name: 'x', css: 'a[href^=tel:]' }] })).toMatchObject({ ok: false, status: 'personal_data' });
  });

  it('crawl: sem stealth, páginas e profundidade com teto', () => {
    expect(parseCrawlBody({ url: 'https://a.com', mode: 'stealth' })).toMatchObject({ ok: false, detail: 'crawl_stealth' });
    const c = parseCrawlBody({ url: 'https://a.com', maxPages: 999, maxDepth: 9 });
    expect(c.ok && [c.data.maxPages, c.data.maxDepth]).toEqual([SCRAPE_LIMITS.maxPagesPerTask, SCRAPE_LIMITS.maxDepth]);
  });

  it('monitor: frequência permitida e seletor obrigatório', () => {
    expect(parseMonitorBody({ url: 'https://a.com', selector: '.price', frequencyMinutes: 5 })).toMatchObject({ ok: false, detail: 'frequency' });
    const m = parseMonitorBody({ url: 'https://loja.com/p', selector: '.price', frequencyMinutes: 60 });
    expect(m.ok && m.data).toMatchObject({ name: 'loja.com', selector: { css: '.price', all: false }, frequencyMinutes: 60 });
  });

  it('mascara e-mail, CPF e telefone e mantém preço', () => {
    const out = redactPersonalData('Contato: ana@x.com, CPF 123.456.789-09, tel (11) 98765-4321. Preço R$ 1.299,90');
    expect(out).not.toMatch(/ana@x\.com|123\.456|98765/);
    expect(out).toContain('R$ 1.299,90');
    const pages = sanitizePages([{ url: 'https://a.com', items: { contato: ['ana@x.com'] }, text: 'ligue 11 99999-0000' }], 5);
    expect(pages[0].items.contato[0]).toBe('[e-mail oculto]');
    expect(pages[0].text).not.toContain('99999');
  });
});

describe('monitor: diff e números', () => {
  it('lê preços BR e US', () => {
    expect(parseNumber('R$ 1.299,90')).toBe(1299.9);
    expect(parseNumber('$1,299.90')).toBe(1299.9);
    expect(parseNumber('R$ 49,90')).toBe(49.9);
    expect(parseNumber('1.234')).toBe(1234);
    expect(parseNumber('sem número')).toBeNull();
  });

  it('diff com variação percentual; 1ª leitura não é mudança', () => {
    expect(diffMonitorValue(null, 'R$ 100,00').changed).toBe(false);
    const d = diffMonitorValue('R$ 100,00', 'R$ 90,00');
    expect(d).toMatchObject({ changed: true, numericBefore: 100, numericAfter: 90, deltaPct: -10 });
    expect(diffMonitorValue('Em estoque', ' Em   estoque ').changed).toBe(false);
  });
});

describe('captcha: detectar e pausar (nunca resolver)', () => {
  it('detecta reCAPTCHA, hCaptcha, Turnstile e desafio do Cloudflare', () => {
    expect(detectCaptcha('<div class="g-recaptcha"></div>')).toBe('g-recaptcha');
    expect(detectCaptcha('<iframe src="https://challenges.cloudflare.com/x">')).toBe('challenges.cloudflare.com');
    expect(detectCaptcha('', 'Just a moment...')).toBe('just a moment...');
    expect(detectCaptcha('<p>Não sou um robô</p>')).toBe('nao sou um robo');
    expect(detectCaptcha('<p>loja normal</p>')).toBeNull();
  });

  it('a lista é a mesma no navd.py e no scraped.py (sandbox)', () => {
    for (const file of ['navd.py', 'scraped.py']) {
      const py = readFileSync(resolve(__dirname, `../../../infra/vertal-browser/${file}`), 'utf8');
      const m = /CAPTCHA_MARKERS = \[([\s\S]*?)\]/.exec(py);
      expect(m && [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])).toEqual([...CAPTCHA_MARKERS]);
      // Nunca resolver captcha automaticamente.
      if (file === 'scraped.py') {
        expect(py).toContain('solve_cloudflare=False');
        expect(py).not.toMatch(/solve_cloudflare=True/);
      }
    }
  });
});

describe('quando usar', () => {
  it('wantsScrape e Scrapling antes do Chromium só para leitura pública', () => {
    expect(wantsScrape([{ content: 'monitore o preço do concorrente' }])).toBe(true);
    expect(wantsScrape([{ content: 'faça um post' }])).toBe(false);
    expect(scrapeFirstCandidate('qual o preço do plano?', 'https://a.com/precos')).toBe(true);
    expect(scrapeFirstCandidate('entre na minha conta e veja o saldo', 'https://banco.com')).toBe(false);
    expect(scrapeFirstCandidate('qual o preço?', undefined)).toBe(false);
  });
});
