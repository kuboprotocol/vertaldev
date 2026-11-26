// Regressão do reteste de 26/11/2026: "Buscar empresas" de uma campanha com ICP em Campinas trouxe empresas de
// São Paulo. Causa raiz: duas campanhas com o mesmo nome ("Vertal Company") — uma com ICP "Campinas, SP"
// (shop=computer) e outra "São Paulo, SP" (office=company/it) — e o seletor mostrava só o nome; a busca rodou
// na campanha de São Paulo. Além disso, a consulta por retângulo do município deixava passar empresas das
// cidades vizinhas sem "addr:city" (Valinhos, Hortolândia, Paulínia caem no retângulo de Campinas) e o servidor
// aceitava elementos de outra categoria. Contornos reais do IBGE (malha "mínima") abaixo.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));

import { campaignOptionLabel, geocodeAreaInBrowser, searchCompaniesInBrowser } from './vertalProspector/client';
import {
  elementLatLon, keepIcpCategories, keepInsideMunicipality, parseAreaGeometry, pointInAreaGeometry, type AreaGeometry,
} from '../../supabase/functions/_shared/vertalProspector/core';

const CAMPINAS = {"type":"Polygon","coordinates":[[[-47.0486,-23.0514],[-47.0722,-23.0235],[-47.0644,-22.992],[-47.0289,-22.9696],[-46.9821,-22.9042],[-46.9397,-22.9279],[-46.8785,-22.9275],[-46.8785,-22.9271],[-46.8507,-22.8766],[-46.8584,-22.8362],[-46.8908,-22.8171],[-46.9049,-22.7628],[-46.9574,-22.7292],[-46.9665,-22.7453],[-47.069,-22.7296],[-47.1013,-22.7504],[-47.0954,-22.7802],[-47.1199,-22.8103],[-47.1637,-22.8055],[-47.1577,-22.8609],[-47.1786,-22.9117],[-47.2468,-22.9095],[-47.2018,-22.93],[-47.2067,-22.9954],[-47.2331,-23.0072],[-47.1086,-23.0612],[-47.0883,-23.0555],[-47.0486,-23.0514]]]} as AreaGeometry;
const SOROCABA = {"type":"Polygon","coordinates":[[[-47.3075,-23.561],[-47.3028,-23.5241],[-47.3236,-23.5139],[-47.317,-23.4634],[-47.3264,-23.4399],[-47.3405,-23.4367],[-47.4182,-23.3577],[-47.5044,-23.3597],[-47.565,-23.3827],[-47.5354,-23.4286],[-47.565,-23.4679],[-47.5522,-23.4876],[-47.5565,-23.5735],[-47.4925,-23.5842],[-47.5028,-23.5358],[-47.4286,-23.5223],[-47.3647,-23.524],[-47.3543,-23.5609],[-47.3075,-23.561]]]} as AreaGeometry;

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status });
const node = (id: number, name: string, lat: number, lon: number, tags: Record<string, string> = { shop: 'computer' }) =>
  ({ type: 'node', id, lat, lon, tags: { name, ...tags } });

// Lojas de informática no retângulo de Campinas (o mapa devolve tudo o que cai no retângulo).
const CAMPINAS_BBOX_RESULT = [
  node(1, 'Abacenter Informática', -22.9056, -47.0608), // centro de Campinas
  node(2, 'Barão Info', -22.8206, -47.0794, { shop: 'computer', 'addr:city': 'Barão Geraldo' }), // distrito de Campinas
  node(3, 'Valinhos PC', -22.9706, -46.9958), // Valinhos, sem addr:city
  node(4, 'Horto Micro', -22.8583, -47.22), // Hortolândia, sem addr:city
  node(5, 'Paulínia Tech', -22.7611, -47.1542), // Paulínia
  node(6, 'Codus Tecnologia', -22.91, -47.06, { office: 'it' }), // categoria fora do ICP (software house)
  { type: 'way', id: 7, center: { lat: -22.89, lon: -47.07 }, tags: { name: 'Shopping Info Campinas', shop: 'computer' } },
];

const NOMINATIM_CAMPINAS = [
  { osm_type: 'relation', osm_id: 5684860, addresstype: 'city', display_name: 'Campinas (distrito)', boundingbox: ['-23.0612', '-22.7292', '-47.1785', '-46.8982'] },
  { osm_type: 'relation', osm_id: 298227, addresstype: 'municipality', display_name: 'Campinas, São Paulo, Brasil', boundingbox: ['-23.0612', '-22.7292', '-47.2468', '-46.8507'], geojson: CAMPINAS },
];

describe('Prospector · só empresas do município do ICP', () => {
  it('contorno real: Campinas e Barão Geraldo dentro; Valinhos, Hortolândia, Paulínia e São Paulo fora', () => {
    expect(pointInAreaGeometry(-22.9056, -47.0608, CAMPINAS)).toBe(true);
    expect(pointInAreaGeometry(-22.8206, -47.0794, CAMPINAS)).toBe(true);
    expect(pointInAreaGeometry(-22.9706, -46.9958, CAMPINAS)).toBe(false);
    expect(pointInAreaGeometry(-22.8583, -47.22, CAMPINAS)).toBe(false);
    expect(pointInAreaGeometry(-22.7611, -47.1542, CAMPINAS)).toBe(false);
    expect(pointInAreaGeometry(-23.5505, -46.6333, CAMPINAS)).toBe(false);
  });

  it('outra cidade (Sorocaba): Votorantim cai no retângulo mas fica fora do contorno', () => {
    const els = [node(1, 'Soro Info', -23.5015, -47.4526), node(2, 'Voto Info', -23.5446, -47.4388)];
    expect(keepInsideMunicipality(els, { city: 'Sorocaba', geometry: SOROCABA }).map((e) => (e as { id: number }).id)).toEqual([1]);
  });

  it('sem contorno: quem declara outra cidade sai (São Paulo numa busca de Campinas); sem cidade fica', () => {
    const els = [
      { type: 'node', id: 1, tags: { name: 'AL Web Studio', 'addr:city': 'São Paulo' } },
      { type: 'node', id: 2, tags: { name: 'Loja', 'addr:city': 'campinas' } },
      { type: 'node', id: 3, tags: { name: 'Sem cidade' } },
    ];
    expect(keepInsideMunicipality(els, { city: 'Campinas', geometry: null }).map((e) => (e as { id: number }).id)).toEqual([2, 3]);
  });

  it('só as categorias do ICP (shop=computer); office=company/it saem', () => {
    const els = [node(1, 'Loja', 0, 0), node(2, 'AL Web Studio', 0, 0, { office: 'company' }), node(3, 'Codus', 0, 0, { office: 'it' })];
    expect(keepIcpCategories(els, [{ key: 'shop', value: 'computer' }]).map((e) => (e as { id: number }).id)).toEqual([1]);
  });

  it('contorno inválido vira null; coordenada de via vem do centro', () => {
    expect(parseAreaGeometry({ type: 'Point', coordinates: [1, 2] })).toBeNull();
    expect(parseAreaGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 'x']]] })).toBeNull();
    expect(parseAreaGeometry(CAMPINAS)?.type).toBe('Polygon');
    expect(elementLatLon({ center: { lat: -22.9, lon: -47 } })).toEqual({ lat: -22.9, lon: -47 });
    expect(elementLatLon({ tags: {} })).toBeNull();
  });

  it('busca completa (Nominatim): pega o município, consulta o retângulo e devolve só lojas de informática de Campinas', async () => {
    sessionStorage.clear();
    const urls: string[] = [];
    const f = vi.fn(async (url: string) => {
      urls.push(url);
      if (url.startsWith('https://nominatim.openstreetmap.org/search')) return json(NOMINATIM_CAMPINAS);
      if (url.includes('servicodados.ibge.gov.br')) return new Response('', { status: 503 });
      return json({ elements: CAMPINAS_BBOX_RESULT });
    });
    const icp = { summary: 'lojas de informática', osmTags: [{ key: 'shop', value: 'computer' }], area: 'Campinas, SP' };
    const r = await searchCompaniesInBrowser(icp, f as unknown as typeof fetch);
    expect(r.via).toBe('região do município');
    expect(r.elements.map((e) => (e as { tags: { name: string } }).tags.name)).toEqual(['Abacenter Informática', 'Barão Info', 'Shopping Info Campinas']);
    expect(urls[0]).toContain('polygon_geojson=1');
  });

  it('Nominatim recusado: contorno oficial do IBGE filtra do mesmo jeito', async () => {
    sessionStorage.clear();
    const f = vi.fn(async (url: string) => {
      if (url.startsWith('https://nominatim')) return new Response('', { status: 403 });
      if (url.endsWith('/estados/SP/municipios')) return json([{ id: 3509502, nome: 'Campinas' }, { id: 3550308, nome: 'São Paulo' }]);
      if (url.includes('/metadados')) return json([{ id: '3509502', 'regiao-limitrofe': [{ longitude: -47.2468, latitude: -22.7292 }, { longitude: -46.8507, latitude: -23.0612 }] }]);
      if (url.includes('/malhas/municipios/3509502?')) return json({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: CAMPINAS }] });
      return json({ elements: CAMPINAS_BBOX_RESULT });
    });
    const place = await geocodeAreaInBrowser('Campinas, SP', f as unknown as typeof fetch);
    expect(place?.geometry?.type).toBe('Polygon');
    sessionStorage.clear();
    const r = await searchCompaniesInBrowser({ osmTags: [{ key: 'shop', value: 'computer' }], area: 'Campinas, SP' }, f as unknown as typeof fetch);
    const names = r.elements.map((e) => (e as { tags: { name: string } }).tags.name);
    expect(names).toContain('Abacenter Informática');
    expect(names).not.toContain('Valinhos PC');
    expect(names).not.toContain('Horto Micro');
    expect(names).not.toContain('Codus Tecnologia');
  });

  it('seletor de campanhas: nomes repetidos mostram a cidade do ICP', () => {
    const all = [
      { id: 'b', company_name: 'Vertal Company', area: 'São Paulo, SP' },
      { id: 'a', company_name: 'Vertal Company', area: 'Campinas, SP' },
      { id: 'c', company_name: 'Outra' },
    ];
    expect(campaignOptionLabel(all[0], all)).toBe('Vertal Company · São Paulo, SP');
    expect(campaignOptionLabel(all[1], all)).toBe('Vertal Company · Campinas, SP');
    expect(campaignOptionLabel(all[2], all)).toBe('Outra');
    expect(campaignOptionLabel({ id: 'x', company_name: 'Vertal Company' }, [...all, { id: 'x', company_name: 'Vertal Company' }])).toBe('Vertal Company (3)');
  });
});
