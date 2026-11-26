// Locais escolhidos pelo usuário (26/11/2026): a busca respeita exatamente onde o cliente pede — qualquer cidade,
// estado ou país, uma ou várias regiões — e a escolha do usuário vence a sugestão da IA.
// Contornos reais: São Paulo (IBGE, malha mínima) e Lisboa (OpenStreetMap/Nominatim, simplificado).
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));

import { searchCompaniesInBrowser } from './vertalProspector/client';
import { isBrazilArea, joinAreas, parseAreas, parseIcp, type AreaGeometry } from '../../supabase/functions/_shared/vertalProspector/core';

const SAO_PAULO = {"type":"Polygon","coordinates":[[[-46.6119,-23.9678],[-46.618,-23.8852],[-46.6326,-23.8511],[-46.6228,-23.7862],[-46.6513,-23.731],[-46.6164,-23.7105],[-46.6339,-23.688],[-46.6163,-23.658],[-46.5834,-23.641],[-46.5793,-23.6045],[-46.548,-23.6061],[-46.4855,-23.623],[-46.4723,-23.6388],[-46.4211,-23.6437],[-46.3948,-23.6125],[-46.3776,-23.5878],[-46.3923,-23.5305],[-46.3664,-23.5122],[-46.3867,-23.4747],[-46.4605,-23.483],[-46.5111,-23.4788],[-46.547,-23.5064],[-46.5705,-23.4588],[-46.5666,-23.4154],[-46.5354,-23.3633],[-46.6002,-23.3882],[-46.6343,-23.4293],[-46.6698,-23.4186],[-46.7004,-23.4225],[-46.7355,-23.3881],[-46.823,-23.401],[-46.8233,-23.4224],[-46.8007,-23.4704],[-46.7995,-23.4714],[-46.7748,-23.4644],[-46.76,-23.5292],[-46.7731,-23.5701],[-46.8064,-23.584],[-46.8078,-23.6091],[-46.7927,-23.6472],[-46.8015,-23.6854],[-46.796,-23.7391],[-46.7774,-23.7672],[-46.8011,-23.8098],[-46.7626,-23.8279],[-46.7766,-23.8926],[-46.8107,-23.9205],[-46.8069,-23.9382],[-46.7148,-23.9962],[-46.6833,-23.9824],[-46.6499,-24.0016],[-46.6119,-23.9678]]]} as AreaGeometry;
const LISBOA = {"type":"Polygon","coordinates":[[[-9.2298356,38.6953276],[-9.2159024,38.6913994],[-9.1252306,38.709869],[-9.0932228,38.7497802],[-9.0863328,38.7962254],[-9.0993972,38.7963702],[-9.0991256,38.7752176],[-9.1450919,38.7881465],[-9.1498877,38.7958538],[-9.1831151,38.7785452],[-9.2090617,38.7549077],[-9.2079549,38.7241641],[-9.222284,38.7140056],[-9.2298356,38.6953276]]]} as AreaGeometry;
// Campinas: contorno real do IBGE (malha mínima).
const CAMPINAS = {"type":"Polygon","coordinates":[[[-47.0486,-23.0514],[-47.0722,-23.0235],[-47.0644,-22.992],[-47.0289,-22.9696],[-46.9821,-22.9042],[-46.9397,-22.9279],[-46.8785,-22.9275],[-46.8785,-22.9271],[-46.8507,-22.8766],[-46.8584,-22.8362],[-46.8908,-22.8171],[-46.9049,-22.7628],[-46.9574,-22.7292],[-46.9665,-22.7453],[-47.069,-22.7296],[-47.1013,-22.7504],[-47.0954,-22.7802],[-47.1199,-22.8103],[-47.1637,-22.8055],[-47.1577,-22.8609],[-47.1786,-22.9117],[-47.2468,-22.9095],[-47.2018,-22.93],[-47.2067,-22.9954],[-47.2331,-23.0072],[-47.1086,-23.0612],[-47.0883,-23.0555],[-47.0486,-23.0514]]]} as AreaGeometry;

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status });
const node = (id: number, name: string, lat: number, lon: number, tags: Record<string, string> = { office: 'it' }) =>
  ({ type: 'node', id, lat, lon, tags: { name, ...tags } });

const PLACES: Record<string, unknown[]> = {
  'São Paulo, SP': [{ osm_type: 'relation', osm_id: 298285, addresstype: 'municipality', display_name: 'São Paulo, Região Sudeste, Brasil', boundingbox: ['-24.0079', '-23.3577', '-46.8263', '-46.3651'], geojson: SAO_PAULO }],
  'Campinas, SP': [{ osm_type: 'relation', osm_id: 298227, addresstype: 'municipality', display_name: 'Campinas, São Paulo, Brasil', boundingbox: ['-23.0612', '-22.7292', '-47.2468', '-46.8507'], geojson: CAMPINAS }],
  'Lisboa, Portugal': [{ osm_type: 'relation', osm_id: 5400890, addresstype: 'city', display_name: 'Lisboa, Portugal', boundingbox: ["38.6913994", "38.7967584", "-9.2298356", "-9.0863328"], geojson: LISBOA }],
};

// O mapa devolve tudo o que cai no retângulo pedido (inclusive vizinhos e outras categorias).
const MAP: Array<{ bbox: string; els: unknown[] }> = [
  { bbox: '-24.007900', els: [
    node(1, 'Codus Tecnologia', -23.5614, -46.6559), // Av. Paulista
    node(2, 'Guarulhos Soft', -23.4538, -46.5333), // Guarulhos (fora da capital)
    node(3, 'Osasco IT', -23.5329, -46.7917), // Osasco
    node(4, 'Padaria Paulista', -23.56, -46.65, { shop: 'bakery' }), // categoria fora do ICP
  ] },
  { bbox: '-23.061200', els: [node(11, 'Campinas Dev', -22.9056, -47.0608), node(12, 'Valinhos Dev', -22.9706, -46.9958)] },
  { bbox: '38.691399', els: [node(21, 'Baixa Software', 38.7108, -9.1366), node(22, 'Amadora Tech', 38.7538, -9.2308)] },
];

function fakeFetch(calls: string[]) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(url);
    if (url.startsWith('https://nominatim.openstreetmap.org/search')) {
      const q = decodeURIComponent(new URL(url).searchParams.get('q') ?? '');
      return json(PLACES[q] ?? []);
    }
    if (url.includes('servicodados.ibge.gov.br')) return new Response('', { status: 503 });
    const body = decodeURIComponent(String(init?.body ?? ''));
    const hit = MAP.find((m) => body.includes(`(${m.bbox},`));
    return json({ elements: hit?.els ?? [] });
  });
}

const names = (r: { elements: unknown[] }) => r.elements.map((e) => (e as { tags: { name: string } }).tags.name);
const ICP = (area: string) => ({ summary: 'empresas de tecnologia', osmTags: [{ key: 'office', value: 'it' }], area });

describe('Prospector · onde o usuário escolher', () => {
  it('regiões: separa por ";", "|", linha ou " + ", mantém a vírgula (cidade, UF/país), sem repetir, até 5', () => {
    expect(parseAreas('São Paulo, SP; Campinas, SP')).toEqual(['São Paulo, SP', 'Campinas, SP']);
    expect(parseAreas('São Paulo, SP + Campinas, SP | Lisboa, Portugal\nsão paulo, sp')).toEqual(['São Paulo, SP', 'Campinas, SP', 'Lisboa, Portugal']);
    expect(parseAreas('a;b;c;d;e;f')).toHaveLength(5);
    expect(joinAreas(['São Paulo, SP', 'Campinas, SP'])).toBe('São Paulo, SP; Campinas, SP');
    expect(parseIcp({ area: 'São Paulo, SP;Campinas, SP' }).area).toBe('São Paulo, SP; Campinas, SP');
  });

  it('Brasil ou não: UF/"Brasil" = sim; "Lisboa, Portugal" = não; só o nome = não dá para saber', () => {
    expect(isBrazilArea('São Paulo, SP')).toBe(true);
    expect(isBrazilArea('Campinas, Brasil')).toBe(true);
    expect(isBrazilArea('Lisboa, Portugal')).toBe(false);
    expect(isBrazilArea('Austin, TX, USA')).toBe(false);
    expect(isBrazilArea('Campinas')).toBeNull();
  });

  it('São Paulo capital: só a capital (Guarulhos e Osasco saem) e só a categoria do ICP', async () => {
    sessionStorage.clear();
    const calls: string[] = [];
    const r = await searchCompaniesInBrowser(ICP('São Paulo, SP'), fakeFetch(calls) as unknown as typeof fetch);
    expect(names(r)).toEqual(['Codus Tecnologia']);
    expect(calls[0]).toContain('countrycodes=br');
  });

  it('Campinas: só Campinas (Valinhos sai)', async () => {
    sessionStorage.clear();
    const r = await searchCompaniesInBrowser(ICP('Campinas, SP'), fakeFetch([]) as unknown as typeof fetch);
    expect(names(r)).toEqual(['Campinas Dev']);
  });

  it('cidade fora do Brasil (Lisboa): busca no mundo, sem IBGE, e Amadora fica fora', async () => {
    sessionStorage.clear();
    const calls: string[] = [];
    const r = await searchCompaniesInBrowser(ICP('Lisboa, Portugal'), fakeFetch(calls) as unknown as typeof fetch);
    expect(names(r)).toEqual(['Baixa Software']);
    const geo = calls.filter((u) => u.includes('nominatim'));
    expect(geo[0]).not.toContain('countrycodes=br');
    expect(calls.some((u) => u.includes('servicodados.ibge.gov.br'))).toBe(false);
  });

  it('várias regiões na mesma busca: São Paulo capital + Campinas', async () => {
    sessionStorage.clear();
    const r = await searchCompaniesInBrowser(ICP('São Paulo, SP; Campinas, SP'), fakeFetch([]) as unknown as typeof fetch);
    expect(names(r).sort()).toEqual(['Campinas Dev', 'Codus Tecnologia']);
    expect(r.areas.map((a) => [a.area, a.count])).toEqual([['São Paulo, SP', 1], ['Campinas, SP', 1]]);
  });

  it('uma região não achada não derruba as outras; todas falhando → erro claro', async () => {
    sessionStorage.clear();
    const r = await searchCompaniesInBrowser(ICP('São Paulo, SP; Xyzlândia, Atlântida'), fakeFetch([]) as unknown as typeof fetch);
    expect(names(r)).toEqual(['Codus Tecnologia']);
    expect(r.areas[1].error).toBe('area_not_found');
    sessionStorage.clear();
    await expect(searchCompaniesInBrowser(ICP('Xyzlândia, Atlântida'), fakeFetch([]) as unknown as typeof fetch)).rejects.toMatchObject({ code: 'area_not_found' });
  });
});
