// Regressões do "Buscar empresas" que girava sem fim em produção (25/11/2026, depois do PR #257):
// consulta pesada por área tentada primeiro e em fila (30 s por servidor), corpo da resposta sem prazo,
// geocodificador único (Nominatim recusando) e nenhum erro visível ao fim.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));

import {
  callProspector, fetchJsonWithTimeout, geocodeAreaInBrowser, MAP_ENDPOINTS, MAP_TOTAL_TIMEOUT_MS, prospectorErrorText, ProspectorError,
  runMapQueryInBrowser, searchCompaniesInBrowser, withDeadline,
} from './client';

const ICP = { summary: 'lojas de informática', osmTags: [{ key: 'shop', value: 'computer' }], area: 'Campinas, SP' };
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status });
const hang = (_u: string, init?: RequestInit) => new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
const IBGE_LIST = [{ id: 3509502, nome: 'Campinas' }, { id: 3550308, nome: 'São Paulo' }];
const IBGE_META = [{ id: '3509502', 'regiao-limitrofe': [{ longitude: -47.2468, latitude: -22.7292 }, { longitude: -46.8153, latitude: -23.0612 }] }];
const Q = '[out:json][timeout:25];';

describe('Prospector · prazo da busca no mapa', () => {
  it('prazo total padrão cabe em 1 minuto', () => {
    expect(MAP_TOTAL_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
    expect(MAP_ENDPOINTS[0]).toContain('maps.mail.ru');
  });

  it('cabeçalho chega mas o corpo pendura → aborta no prazo da tentativa', async () => {
    let aborted = false;
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      init?.signal?.addEventListener('abort', () => { aborted = true; });
      return { ok: true, status: 200, json: () => new Promise(() => {}) } as unknown as Response;
    });
    const t0 = Date.now();
    const r = await fetchJsonWithTimeout(f as unknown as typeof fetch, 'https://x', {}, 40);
    expect(r.ok).toBe(false);
    expect(aborted).toBe(true);
    expect(Date.now() - t0).toBeLessThan(1_000);
  });

  it('leque: o 2º servidor entra sem esperar o 1º estourar o prazo', async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => (url.includes('maps.mail.ru') ? hang(url, init) : json({ elements: [{ id: 1 }] })));
    const t0 = Date.now();
    const els = await runMapQueryInBrowser(Q, f as unknown as typeof fetch, { attemptMs: 10_000, hedgeMs: 20 });
    expect(els).toEqual([{ id: 1 }]);
    expect(Date.now() - t0).toBeLessThan(2_000);
  });

  it('vencedor cancela os outros pedidos em voo', async () => {
    const signals: AbortSignal[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('overpass-api.de')) return json({ elements: [{ id: 2 }] });
      signals.push(init!.signal!);
      return hang(url, init);
    });
    await runMapQueryInBrowser(Q, f as unknown as typeof fetch, { attemptMs: 10_000, hedgeMs: 5 });
    expect(signals.length).toBeGreaterThanOrEqual(1);
    expect(signals.every((s) => s.aborted)).toBe(true);
  });

  it('servidor ocupado (504 rápido) é tentado de novo e responde', async () => {
    let n = 0;
    const f = vi.fn(async () => (++n === 1 ? new Response('busy', { status: 504 }) : json({ elements: [{ id: 3 }] })));
    const els = await runMapQueryInBrowser(Q, f as unknown as typeof fetch, { endpoints: ['https://maps.mail.ru/osm/tools/overpass/api/interpreter'], attemptMs: 3_000, retryDelayMs: 10 });
    expect(els).toEqual([{ id: 3 }]);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('todos pendurados → devolve null exatamente no prazo (não depois)', async () => {
    const f = vi.fn(hang);
    const t0 = Date.now();
    const els = await runMapQueryInBrowser(Q, f as unknown as typeof fetch, { attemptMs: 10_000, hedgeMs: 5, deadline: Date.now() + 150 });
    expect(els).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1_000);
  });

  it('Nominatim recusando (bloqueio 629/403) → IBGE acha o retângulo de Campinas', async () => {
    sessionStorage.clear();
    const f = vi.fn(async (url: string) => {
      if (url.startsWith('https://nominatim')) return new Response('blocked', { status: 403 });
      if (url.includes('/localidades/estados/SP/municipios')) return json(IBGE_LIST);
      if (url.includes('/malhas/municipios/3509502/metadados')) return json(IBGE_META);
      return new Response('', { status: 404 });
    });
    const p = await geocodeAreaInBrowser('Campinas, SP', f as unknown as typeof fetch, 1_000);
    expect(p?.bbox).toEqual([-23.0612, -47.2468, -22.7292, -46.8153]);
  });

  it('caso real (Campinas, SP): Nominatim fora, espelhos pendurados, 1 espelho responde → empresas em segundos', async () => {
    sessionStorage.clear();
    const bodies: string[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://nominatim')) return hang(url, init);
      if (url.includes('/localidades/estados/SP/municipios')) return json(IBGE_LIST);
      if (url.includes('/metadados')) return json(IBGE_META);
      if (url.includes('/malhas/municipios/')) return new Response('', { status: 503 }); // contorno é opcional
      bodies.push(decodeURIComponent(String(init?.body ?? '')));
      if (!url.includes('maps.mail.ru')) return hang(url, init);
      return json({ elements: [
        { type: 'node', id: 1, tags: { name: 'Infotech Campinas', shop: 'computer', 'addr:city': 'Campinas' } },
        { type: 'node', id: 2, tags: { name: 'Loja Valinhos', shop: 'computer', 'addr:city': 'Valinhos' } },
      ] });
    });
    const t0 = Date.now();
    const r = await searchCompaniesInBrowser(ICP, f as unknown as typeof fetch, { totalMs: 3_000, attemptMs: 2_000, hedgeMs: 10, geocoderMs: 200 });
    expect(Date.now() - t0).toBeLessThan(1_500);
    expect(r.via).toBe('região do município');
    expect((r.elements as Array<{ id: number }>).map((e) => e.id)).toEqual([1]);
    expect(bodies[0]).toContain('(-23.061200,-47.246800,-22.729200,-46.815300)');
  });

  it('nada responde → map_timeout dentro do prazo total, com texto em português', async () => {
    sessionStorage.clear();
    const f = vi.fn(hang);
    const t0 = Date.now();
    const e = await searchCompaniesInBrowser(ICP, f as unknown as typeof fetch, { totalMs: 300, attemptMs: 100, hedgeMs: 5 }).catch((x) => x);
    expect(Date.now() - t0).toBeLessThan(1_500);
    expect(e).toBeInstanceOf(ProspectorError);
    expect(e.code).toBe('map_timeout');
    expect(prospectorErrorText(e)).toMatch(/demorou demais/);
  });

  it('rede de segurança da tela: passou do prazo → search_slow em português', async () => {
    const e = await withDeadline(new Promise(() => {}), 20).catch((x) => x);
    expect(e).toBeInstanceOf(ProspectorError);
    expect(prospectorErrorText(e)).toMatch(/passou de 1 minuto/);
  });

  it('gravação no servidor pendurada → server_timeout em português', async () => {
    const e = await callProspector('find_leads', {}, { token: 't', url: 'https://x', fetchImpl: hang as unknown as typeof fetch, timeoutMs: 20 }).catch((x) => x);
    expect(e).toBeInstanceOf(ProspectorError);
    expect(e.code).toBe('server_timeout');
    expect(prospectorErrorText(e)).toMatch(/demorou demais/);
  });
});
