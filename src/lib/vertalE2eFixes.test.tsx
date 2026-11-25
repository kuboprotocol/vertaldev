// Regressões dos bugs achados no teste ponta a ponta de 25/11/2026 (Prospector, Growth, CRM, atalhos do /builder).
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));

import {
  buildOverpassQueryByBbox, fetchWithTimeout, keepSameCity, prospectorErrorText, ProspectorError, runMapQueryInBrowser, searchCompaniesInBrowser,
} from './vertalProspector/client';
import { GrowthError, launchGrowth } from './vertalGrowth/client';
import { preferredUiLang, rememberUiLang, storedUiLang, VERTAL_UI_LANG_KEY, GROWTH_UI } from './vertalGrowth/i18n';
import { callCrmAi, CrmError } from './vertalCrm/client';
import { CRM_UI, crmActivityText, crmDate, crmDateTime, crmSourceText, ellipsis } from './vertalCrm/i18n';
import { CRM_COMMAND_RE, isVertalBuilderShortcutsEnabled, matchVertalShortcut } from './vertalCrm/builderShortcut';
import { isVertalCodeAiChatAliasesEnabled } from './vertalCodeAi/chatAliases';
import { handleGrowth, reconcileOrphanLaunches, type GrowthDeps } from '../../supabase/functions/_shared/vertalGrowth/handler';
import { reconcileStuckAiRuns, type CrmDeps } from '../../supabase/functions/_shared/vertalCrm/handler';
import { createFakeDb } from './vertalProspector/fakeDb';

const U = '5441b397-7be8-44fc-87e8-8057fdb79a0e';
const ICP = { summary: 'lojas de informática', osmTags: [{ key: 'shop', value: 'computer' }], area: 'Campinas, SP' };
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status });
const NOMINATIM = [{ osm_type: 'relation', osm_id: 298227, display_name: 'Campinas, São Paulo, Brasil', boundingbox: ['-23.06', '-22.72', '-47.24', '-46.81'] }];
const hang = (_u: string, init?: RequestInit) => new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));

describe('Prospector · busca de empresas no navegador (antes girava para sempre)', () => {
  it('fetchWithTimeout aborta uma requisição pendurada', async () => {
    await expect(fetchWithTimeout(hang as unknown as typeof fetch, 'https://x', {}, 30)).rejects.toThrow('timeout');
  });

  it('servidor do mapa pendurado → tenta o espelho dentro do prazo e devolve as empresas', async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('overpass-api.de')) return hang(url, init);
      return json({ elements: [{ type: 'node', id: 1, tags: { name: 'Infotech Campinas', shop: 'computer' } }] });
    });
    const els = await runMapQueryInBrowser('[out:json][timeout:25];', f as unknown as typeof fetch, { attemptMs: 30 });
    expect(els).toEqual([{ type: 'node', id: 1, tags: { name: 'Infotech Campinas', shop: 'computer' } }]);
    expect(f.mock.calls[1][0]).toContain('maps.mail.ru');
  });

  it('ICP da campanha "Vertal Company" (shop=computer, Campinas SP): geocodificador → área oficial do município', async () => {
    sessionStorage.clear();
    const bodies: string[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://nominatim.openstreetmap.org/search')) return json(NOMINATIM);
      bodies.push(decodeURIComponent(String(init?.body ?? '')));
      return json({ elements: [{ type: 'node', id: 7, tags: { name: 'Abacenter Informática', shop: 'computer' } }] });
    });
    const r = await searchCompaniesInBrowser(ICP, f as unknown as typeof fetch);
    expect(r.elements).toHaveLength(1);
    expect(r.via).toBe('área do município');
    expect(bodies[0]).toContain('area(id:3600298227)');
    expect(bodies[0]).toContain('nwr["shop"="computer"]["name"](area.a)');
  });

  it('consulta por área não responde → retângulo do município, descartando outra cidade declarada', async () => {
    sessionStorage.clear();
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://nominatim')) return json(NOMINATIM);
      const body = decodeURIComponent(String(init?.body ?? ''));
      if (body.includes('area(id:')) return new Response('busy', { status: 504 });
      return json({ elements: [
        { type: 'node', id: 1, tags: { name: 'Loja A', shop: 'computer', 'addr:city': 'Campinas' } },
        { type: 'node', id: 2, tags: { name: 'Loja B', shop: 'computer', 'addr:city': 'Valinhos' } },
        { type: 'node', id: 3, tags: { name: 'Loja C', shop: 'computer' } },
      ] });
    });
    const r = await searchCompaniesInBrowser(ICP, f as unknown as typeof fetch);
    expect(r.via).toBe('região do município');
    expect((r.elements as Array<{ id: number }>).map((e) => e.id)).toEqual([1, 3]);
  });

  it('nada responde → erro claro em português (e não um spinner eterno)', async () => {
    sessionStorage.clear();
    const f = vi.fn(async (url: string, init?: RequestInit) => (url.startsWith('https://nominatim') ? json(NOMINATIM) : hang(url, init)));
    const p = searchCompaniesInBrowser(ICP, f as unknown as typeof fetch, { totalMs: 400, attemptMs: 40 });
    await expect(p).rejects.toBeInstanceOf(ProspectorError);
    await p.catch((e) => {
      expect(e.code).toBe('map_timeout');
      expect(prospectorErrorText(e)).toMatch(/demorou demais/);
    });
  });

  it('geocodificador fora → busca o município pelo nome no próprio mapa', async () => {
    sessionStorage.clear();
    const bodies: string[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://nominatim')) return new Response('', { status: 403 });
      bodies.push(decodeURIComponent(String(init?.body ?? '')));
      return json({ elements: [] });
    });
    const r = await searchCompaniesInBrowser(ICP, f as unknown as typeof fetch);
    expect(r.via).toBe('nome do município');
    expect(bodies[0]).toContain('"name"="Campinas"');
    expect(bodies[0]).toContain('BR-SP');
  });

  it('retângulo: formato do Overpass (sul, oeste, norte, leste) e filtro de cidade sem acento', () => {
    expect(buildOverpassQueryByBbox([{ key: 'shop', value: 'computer' }], [-23.06, -47.24, -22.72, -46.81])).toContain('(-23.060000,-47.240000,-22.720000,-46.810000)');
    expect(keepSameCity([{ tags: { 'addr:city': 'São Paulo' } }, { tags: { 'addr:city': 'Sao Paulo' } }, { tags: {} }], 'São Paulo')).toHaveLength(3);
  });
});

describe('Growth · lançamento resistente a conexão longa (antes sumia sem campanha nem erro)', () => {
  const sleep = async () => {};
  it('resposta não chega (prazo) → repete com a MESMA chave e recebe a campanha (replayed)', async () => {
    const call = vi.fn()
      .mockRejectedValueOnce(new GrowthError('timeout'))
      .mockRejectedValueOnce(new GrowthError('duplicate_request'))
      .mockResolvedValueOnce({ growth: { id: 'g1' }, replayed: true });
    const r = await launchGrowth({ idempotencyKey: 'k-12345678' }, { call, sleep });
    expect(r).toEqual({ growth: { id: 'g1' }, replayed: true });
    expect(call).toHaveBeenCalledTimes(3);
    for (const c of call.mock.calls) expect(c[1]).toEqual({ idempotencyKey: 'k-12345678' });
  });
  it('erro de verdade (sem créditos) sobe na hora', async () => {
    const call = vi.fn().mockRejectedValue(new GrowthError('insufficient_credits'));
    await expect(launchGrowth({}, { call, sleep })).rejects.toMatchObject({ code: 'insufficient_credits' });
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('passou do prazo total → launch_slow com mensagem no idioma do usuário', async () => {
    let t = 0;
    const call = vi.fn(async () => { t += 60_000; throw new GrowthError('timeout'); });
    await expect(launchGrowth({}, { call, sleep, now: () => t, totalMs: 120_000 })).rejects.toMatchObject({ code: 'launch_slow' });
    expect(GROWTH_UI.pt.errors.launch_slow).toMatch(/créditos voltam/);
  });
});

describe('Growth · servidor: idioma salvo e débitos órfãos devolvidos', () => {
  const NOW = new Date('2026-11-25T18:00:00Z');
  function deps(seed: Record<string, Record<string, unknown>[]>) {
    const db = createFakeDb(seed);
    const refunds: Array<{ amount: number; key: string }> = [];
    const d = {
      admin: db, userId: U, env: { VERTAL_GROWTH_TEAM_ENABLED: 'true' }, fetch: vi.fn() as unknown as typeof fetch,
      callModel: vi.fn(), gmailToken: vi.fn(),
      credits: { debit: vi.fn(), refund: vi.fn(async (amount: number, key: string) => { refunds.push({ amount, key }); return true; }) },
      stripeKey: async () => null, hasSecrets: async () => false, prospector: vi.fn(), now: () => NOW, log: () => {},
    } as unknown as GrowthDeps;
    return { db, d, refunds };
  }
  const tx = (key: string, delta: number, at: string, reason = 'vertal_growth_team') => ({ user_id: U, idempotency_key: key, delta, reason, created_at: at });

  it('devolve só o débito sem campanha, sem devolução, sem apagar e com mais de 10 min', async () => {
    const { d, refunds } = deps({
      credit_transactions: [
        tx('growth:orfao', -20, '2026-11-25T17:00:00Z'),
        tx('growth:com-campanha', -20, '2026-11-25T17:00:00Z'),
        tx('growth:ja-devolvido', -20, '2026-11-25T17:00:00Z'),
        tx('refund:growth:ja-devolvido', 20, '2026-11-25T17:01:00Z', 'refund:vertal_growth_team'),
        tx('growth:apagada', -20, '2026-11-25T17:00:00Z'),
        tx('growth:recente', -20, '2026-11-25T17:55:00Z'),
      ],
      growth_campaigns: [{ id: 'g1', user_id: U, charge: { key: 'growth:com-campanha' }, charge_key: 'com-campanha' }],
      growth_events: [{ user_id: U, growth_id: null, kind: 'deleted', detail: { key: 'growth:apagada' } }],
    });
    expect(await reconcileOrphanLaunches(d, NOW)).toBe(1);
    expect(refunds).toEqual([{ amount: 20, key: 'growth:orfao' }]);
  });

  it('status devolve o idioma do workspace do CRM (pt) para a tela não cair no idioma do navegador', async () => {
    const { d } = deps({ crm_workspaces: [{ id: 'w1', owner_id: U, lang: 'pt' }], credit_transactions: [], gmail_accounts: [], fluxos_connections: [], growth_campaigns: [], growth_events: [] });
    const r = await handleGrowth({ op: 'status' }, d);
    expect(r.status).toBe(200);
    expect(r.body.uiLang).toBe('pt');
  });

  it('apagar a campanha registra a cobrança como usada (não vira devolução depois)', async () => {
    const { d, db } = deps({ growth_campaigns: [{ id: '70000000-0000-4000-8000-000000000009', user_id: U, charge: { key: 'growth:x' }, team: {} }], growth_events: [], growth_messages: [], growth_contacts: [], prospector_campaigns: [] });
    const r = await handleGrowth({ op: 'delete', growthId: '70000000-0000-4000-8000-000000000009' }, d);
    expect(r.status).toBe(200);
    const { data } = await db.from('growth_events').select('*').eq('kind', 'deleted');
    expect(data[0].detail.key).toBe('growth:x');
  });
});

describe('CRM · IA resistente a conexão longa e devolução de pedidos travados', () => {
  const sleep = async () => {};
  it('resposta não chega → repete com a mesma chave e mostra o resultado guardado (sem cobrar de novo)', async () => {
    const call = vi.fn()
      .mockRejectedValueOnce(new CrmError('network'))
      .mockRejectedValueOnce(new CrmError('in_progress'))
      .mockResolvedValueOnce({ replayed: true, result: { summary: 'ok' }, credits: 0 });
    const r = await callCrmAi({ idempotencyKey: 'abc-12345678' }, { call, sleep });
    expect(r).toMatchObject({ result: { summary: 'ok' } });
    expect(new Set(call.mock.calls.map((c) => (c[1] as { idempotencyKey: string }).idempotencyKey))).toEqual(new Set(['abc-12345678']));
  });
  it('IA falhou no servidor (crédito devolvido) → não repete', async () => {
    const call = vi.fn().mockRejectedValue(new CrmError('ai_failed', { refunded: true }));
    await expect(callCrmAi({ idempotencyKey: 'abc-12345678' }, { call, sleep })).rejects.toMatchObject({ code: 'ai_failed' });
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('pedido "rodando" há mais de 10 min: devolve só o que foi debitado e marca como devolvido', async () => {
    const db = createFakeDb({
      crm_ai_runs: [
        { user_id: U, idempotency_key: 'crm_ai:velho', status: 'running', created_at: '2026-11-25T15:00:00Z' },
        { user_id: U, idempotency_key: 'crm_ai:gratis', status: 'running', created_at: '2026-11-25T15:00:00Z' },
        { user_id: U, idempotency_key: 'crm_ai:novo', status: 'running', created_at: '2026-11-25T17:58:00Z' },
      ],
      credit_transactions: [{ user_id: U, idempotency_key: 'crm_ai:velho', delta: -1 }],
    });
    const refund = vi.fn(async (_amount: number, _key: string) => true);
    const d = { admin: db, userId: U, credits: { debit: vi.fn(), refund } } as unknown as CrmDeps;
    expect(await reconcileStuckAiRuns(d, new Date('2026-11-25T18:00:00Z'))).toBe(1);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund.mock.calls[0][1]).toBe('crm_ai:velho');
    const { data } = await db.from('crm_ai_runs').select('*');
    expect(Object.fromEntries(data.map((r: { idempotency_key: string; status: string }) => [r.idempotency_key, r.status]))).toEqual({
      'crm_ai:velho': 'refunded', 'crm_ai:gratis': 'failed', 'crm_ai:novo': 'running',
    });
  });
});

describe('CRM · idioma e formatação (pt-BR)', () => {
  it('eventos técnicos viram texto legível', () => {
    expect(crmActivityText('deal.stage_changed', CRM_UI.pt)).toBe('Negócio mudou de etapa');
    expect(crmActivityText('note.created', CRM_UI.pt)).toBe('Nota adicionada');
    expect(crmActivityText('algo.novo', CRM_UI.pt)).toBe('algo novo');
    expect(crmSourceText('manual', CRM_UI.pt)).toBe('manual');
    expect(crmSourceText('ai', CRM_UI.pt)).toBe('IA');
  });
  it('datas em dd/mm/aaaa e 24 h no pt-BR; data sem hora não muda de dia pelo fuso', () => {
    const s = crmDateTime('2026-11-25T15:54:33Z', 'pt');
    expect(s).toMatch(/^\d{2}\/\d{2}\/\d{4}/);
    expect(s).not.toMatch(/AM|PM/);
    expect(crmDate('2026-12-01', 'pt')).toBe('01/12/2026');
  });
  it('plural certo e textos com reticências', () => {
    expect(CRM_UI.pt.openDealsN(1)).toBe('1 negócio aberto');
    expect(CRM_UI.en.openDealsN(1)).toBe('1 open deal');
    expect(CRM_UI.en.openDealsN(2)).toBe('2 open deals');
    expect(ellipsis('abcdefghij', 5)).toBe('abcd…');
    expect(CRM_UI.pt.deleted).toBe('Apagado.');
    expect(CRM_UI.pt.confirmDelete).toMatch(/Apagar de vez/);
  });
  it('idioma salvo do usuário vence o navegador; pedido explícito vence tudo', () => {
    localStorage.removeItem(VERTAL_UI_LANG_KEY);
    rememberUiLang('pt');
    expect(storedUiLang()).toBe('pt');
    expect(preferredUiLang()).toBe('pt');
    expect(preferredUiLang('es')).toBe('es');
    localStorage.removeItem(VERTAL_UI_LANG_KEY);
  });
  it('a tela do CRM usa o idioma do workspace (o mesmo das etapas) antes do navegador', () => {
    const src = readFileSync('src/components/vertal-crm/CrmContext.tsx', 'utf8');
    expect(src).toMatch(/uiLangFrom\(langHint, \(workspace\?\.settings\?\.uiLang as string\) \?\? null, workspace\?\.lang \?\? null, storedUiLang\(\), browserLang\(\)\)/);
  });
});

describe('Atalhos do /builder (só interface, desligados por padrão)', () => {
  const all = { crm: true, growth: true, prospector: true };
  it('flags desligadas por padrão', () => {
    expect(isVertalBuilderShortcutsEnabled({})).toBe(false);
    expect(isVertalBuilderShortcutsEnabled({ VITE_VERTAL_BUILDER_SHORTCUTS: 'true' })).toBe(true);
    expect(isVertalCodeAiChatAliasesEnabled({})).toBe(false);
    expect(isVertalCodeAiChatAliasesEnabled({ VITE_VERTAL_CHAT_ALIASES: 'true' })).toBe(true);
  });
  it('"/crm" abre o Vertal CRM e "buscar clientes para meu app" abre o Growth', () => {
    expect(matchVertalShortcut('/crm', all)).toBe('/crm');
    expect(matchVertalShortcut('abrir o crm', all)).toBe('/crm');
    expect(matchVertalShortcut('buscar clientes para meu app', all)).toMatch(/^\/vertal-code-ai\/growth\?from=builder/);
  });
  it('sem acesso liberado ou pedido de app normal → null (o texto segue para o chat como antes)', () => {
    expect(matchVertalShortcut('/crm', { crm: false, growth: false, prospector: false })).toBeNull();
    expect(matchVertalShortcut('crie um CRM para minha loja', all)).toBeNull();
    expect(matchVertalShortcut('crie um app de treino', all)).toBeNull();
    expect(CRM_COMMAND_RE.test('/crm de vendas')).toBe(false);
  });
});

describe('Telas do Vertal: efeito do React nunca devolve valor (crash "n is not a function")', () => {
  it.each([
    'src/pages/VertalCodeAIPage.tsx', 'src/pages/VertalGrowthPage.tsx', 'src/pages/VertalProspectorPage.tsx', 'src/pages/VertalCrmPage.tsx',
    'src/components/vertal-crm/CrmContext.tsx', 'src/components/vertal-crm/CrmDashboard.tsx', 'src/components/vertal-crm/CrmDeals.tsx',
  ])('%s', (f) => {
    // Corpo sem chaves devolve o valor da expressão (ex.: Promise de scrollIntoView no Chrome novo) e o React o chama na limpeza.
    expect(readFileSync(f, 'utf8')).not.toMatch(/use(Layout)?Effect\(\(\) => [^{\s]/);
  });
});
