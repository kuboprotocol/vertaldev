import { describe, expect, it } from 'vitest';
import {
  computeMetrics, csvToContacts, defaultStages, extractJson, getDealsByStage, growthContactToCrm, isCrmEnabled, isSafeWebhookUrl,
  moveDeal, normalizeEvents, normalizeStages, parseCsv, parseNextAction, parseScore, plainSyncCost, prospectorLeadToCrm, pulledToContacts,
  pushParameters, sanitizeSearchFilter, toCsv, CRM_AI_COST, CRM_SYNC_ACTIVATE_COST, CRM_SYNC_AI_RUN_COST,
} from '../../../supabase/functions/_shared/vertalCrm/core';

const U = '5441b397-7be8-44fc-87e8-8057fdb79a0e';

describe('Vertal CRM · flags e preços', () => {
  it('liga só com a flag e o usuário na lista (vazia = ninguém; * = todos)', () => {
    expect(isCrmEnabled({ VERTAL_CRM_ENABLED: 'true', VERTAL_CRM_USER_IDS: U }, U)).toBe(true);
    expect(isCrmEnabled({ VERTAL_CRM_ENABLED: 'true', VERTAL_CRM_USER_IDS: '' }, U)).toBe(false);
    expect(isCrmEnabled({ VERTAL_CRM_ENABLED: 'false', VERTAL_CRM_USER_IDS: U }, U)).toBe(false);
    expect(isCrmEnabled({ VERTAL_CRM_ENABLED: 'true', VERTAL_CRM_USER_IDS: 'outro' }, U)).toBe(false);
    expect(isCrmEnabled({ VERTAL_CRM_ENABLED: 'true', VERTAL_CRM_USER_IDS: '*' }, U)).toBe(true);
    expect(isCrmEnabled({}, U)).toBe(false);
  });
  it('preços das regras do Laércio', () => {
    expect([CRM_AI_COST, CRM_SYNC_ACTIVATE_COST, CRM_SYNC_AI_RUN_COST]).toEqual([1, 4, 2]);
    expect(plainSyncCost({})).toBe(0);
    expect(plainSyncCost({ VERTAL_CRM_PLAIN_SYNC_COST: '1' })).toBe(1);
  });
});

describe('Vertal CRM · funis e Kanban', () => {
  it('etapas padrão em 3 idiomas e validação', () => {
    expect(defaultStages('en').map((s) => s.kind)).toEqual(['open', 'open', 'open', 'open', 'won', 'lost']);
    expect(normalizeStages([{ label: 'Ganho', kind: 'won' }])).toBeNull();
    expect(normalizeStages([{ label: 'Proposta Enviada', probability: 150 }, { label: 'Proposta Enviada' }])).toEqual([
      { id: 'proposta-enviada', label: 'Proposta Enviada', probability: 100, kind: 'open' },
      { id: 'proposta-enviada-2', label: 'Proposta Enviada', probability: 0, kind: 'open' },
    ]);
  });
  it('agrupa por etapa (etapa desconhecida vai para a primeira) e move com índices', () => {
    const stages = [{ id: 'a' }, { id: 'b' }];
    const by = getDealsByStage([{ id: '1', stage: 'a', index: 1 }, { id: '2', stage: 'a', index: 0 }, { id: '3', stage: 'zz', index: 5 }], stages);
    expect(by.a.map((d) => d.id)).toEqual(['2', '1', '3']);
    const { next, updates } = moveDeal(by, '2', 'b', 0);
    expect(next.a.map((d) => d.id)).toEqual(['1', '3']);
    expect(next.b.map((d) => [d.id, d.stage, d.index])).toEqual([['2', 'b', 0]]);
    expect(updates).toContainEqual({ id: '2', stage: 'b', index: 0 });
    expect(updates).toContainEqual({ id: '1', stage: 'a', index: 0 });
    expect(moveDeal(by, 'nada', 'b', 0).updates).toEqual([]);
  });
  it('métricas: valor aberto, previsão ponderada, taxa de ganho, por mês', () => {
    const p = { id: 'p', name: 'Vendas', stages: defaultStages('pt') };
    const m = computeMetrics([
      { pipeline_id: 'p', stage: 'proposta', amount: 1000, expected_closing_date: '2026-12-10' },
      { pipeline_id: 'p', stage: 'lead', amount: '500' },
      { pipeline_id: 'p', stage: 'ganho', status: 'won', amount: 2000 },
      { pipeline_id: 'p', stage: 'perdido', status: 'lost', amount: 300 },
      { pipeline_id: 'p', stage: 'lead', amount: 999, archived_at: '2026-01-01' },
    ], [p]);
    expect(m).toMatchObject({ openCount: 2, openValue: 1500, weightedForecast: 550, wonValue: 2000, winRate: 0.5 });
    expect(m.forecastByMonth.map((x) => x.month)).toEqual(['2026-12', 'sem-data']);
  });
});

describe('Vertal CRM · CSV', () => {
  it('lê aspas, ponto e vírgula e cabeçalhos em português', () => {
    expect(parseCsv('a;b\n"x;1";"y ""z"""\n')).toEqual([['a', 'b'], ['x;1', 'y "z"']]);
    const r = csvToContacts('nome;e-mail;empresa;cargo;tags\nAna Maria Souza;ANA@ACME.COM.BR;Acme;CEO;vip, sp\n;;;\n;nao-e-email;;;\n');
    expect(r.contacts).toHaveLength(1);
    expect(r.contacts[0]).toMatchObject({ first_name: 'Ana', last_name: 'Maria Souza', company: 'Acme', title: 'CEO', tags: ['vip', 'sp'], emails: [{ email: 'ana@acme.com.br', type: 'Work' }] });
    expect(r.skipped).toBe(1);
  });
  it('formato do Atomic CRM e exportação protegida contra fórmula', () => {
    const r = csvToContacts('first_name,last_name,status,email_work,phone_home\nJohn,Doe,in-contract,john@doe.example,123');
    expect(r.contacts[0]).toMatchObject({ status: 'in-contract', phones: [{ number: '123', type: 'Home' }] });
    expect(toCsv(['a', 'b'], [{ a: '=SUM(A1)', b: 'x,y' }])).toBe('a,b\r\n\'=SUM(A1),"x,y"');
  });
});

describe('Vertal CRM · IA (saídas do modelo)', () => {
  it('extrai JSON e limita valores', () => {
    expect(extractJson('```json\n{"score": 120, "reasons": ["a"]}\n```')).toEqual({ score: 120, reasons: ['a'] });
    expect(parseScore('{"score": 120}')).toEqual({ score: 100, reasons: [] });
    expect(parseScore('sem json')).toBeNull();
    expect(parseNextAction('{"action":"Ligar","task_type":"hack","due_in_days":99}')).toMatchObject({ task_type: 'follow-up', due_in_days: 30 });
  });
  it('filtro da busca: só chaves permitidas, sem caracteres de filtro', () => {
    const f = sanitizeSearchFilter({ entity: 'contacts', text: 'ana%,or(id.eq.1)', status: 'hot', min_score: 500, created_after: '2026-01-01', evil: 'drop table' });
    expect(f).toEqual({ entity: 'contacts', text: 'ana  or id.eq.1', status: 'hot', min_score: 100, created_after: '2026-01-01' });
    expect(sanitizeSearchFilter(null)).toEqual({ entity: 'contacts' });
  });
});

describe('Vertal CRM · webhooks, integrações e sync', () => {
  it('webhook só https público', () => {
    expect(isSafeWebhookUrl('https://hooks.zapier.com/x')).toBe(true);
    for (const u of ['http://a.com', 'https://localhost/x', 'https://10.0.0.1/x', 'https://100.64.0.1/x', 'https://a.com:8443/x', 'https://user:p@a.com', 'ftp://a.com']) expect(isSafeWebhookUrl(u)).toBe(false);
    expect(normalizeEvents(['deal.won', 'x'])).toEqual(['deal.won']);
    expect(normalizeEvents([])).toEqual(['*']);
  });
  it('Prospector e Growth → contatos do CRM', () => {
    const m = prospectorLeadToCrm({ id: 'l1', name: 'Clínica Boa', email: 'oi@clinicaboa.com.br', email_status: 'verified', status: 'replied', decision_maker: { name: 'Dra. Paula Lima', role: 'Sócia' }, cnpj: '123' });
    expect(m.company).toMatchObject({ name: 'Clínica Boa', tax_id: '123', source: 'prospector' });
    expect(m.contact).toMatchObject({ first_name: 'Dra.', last_name: 'Paula Lima', title: 'Sócia', status: 'hot' });
    expect(prospectorLeadToCrm({ id: 'l2', name: 'Sem contato', email: 'x@y.com', email_status: 'invalid', decision_maker: {} }).contact).toBeNull();
    expect(growthContactToCrm({ id: 'g', email: 'a@b.com', stage: 'retencao', status: 'active' })?.contact.status).toBe('in-contract');
    expect(growthContactToCrm({ id: 'g', email: 'a@b.com', status: 'opted_out' })?.contact.background).toMatch(/NÃO CONTATAR/);
  });
  it('parâmetros de push e leitura de pull', () => {
    const flat = { full_name: 'Ana Souza', first_name: 'Ana', last_name: 'Souza', email: 'ana@x.com', phone: '11 9', title: '', company: 'Acme', website: '', background: '' };
    expect(pushParameters('pipedrive', { name: 'full_name', emails: 'email', phones: 'phone' }, flat)).toEqual({ name: 'Ana Souza', emails: [{ email: 'ana@x.com' }], phones: [{ phone: '11 9' }] });
    expect(pushParameters('hubspot', { email: 'email', company: 'company' }, flat)).toEqual({ email: 'ana@x.com', company: 'Acme' });
    const pulled = pulledToContacts('salesforce', [{ Id: '003x', FirstName: 'Bob', LastName: 'Lee', Email: 'BOB@X.COM', Account: { Name: 'Globex' } }, { Id: '' }]);
    expect(pulled).toHaveLength(1);
    expect(pulled[0]).toMatchObject({ first_name: 'Bob', company: 'Globex', external_ids: { salesforce: '003x' }, emails: [{ email: 'bob@x.com', type: 'Work' }] });
    expect(pulledToContacts('pipedrive', [{ raw: { person_id: { value: 9, name: 'Caio Dias', email: [{ value: 'caio@d.com' }] }, org_name: 'Dias ME' } }])[0]).toMatchObject({ external_ids: { pipedrive: '9' }, company: 'Dias ME' });
  });
});
