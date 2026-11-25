import { describe, expect, it, vi } from 'vitest';
import { handleGrowth, type GrowthDeps } from '../../../supabase/functions/_shared/vertalGrowth/handler';
import { handleProspector } from '../../../supabase/functions/_shared/vertalProspector/handler';
import { createFakeDb } from '../vertalProspector/fakeDb';

const U = '5441b397-7be8-44fc-87e8-8057fdb79a0e';
const P = '60000000-0000-4000-8000-000000000001';
const G = '70000000-0000-4000-8000-000000000001';
const PC = '10000000-0000-4000-8000-000000000001';
const L = '20000000-0000-4000-8000-000000000001';
const C = '80000000-0000-4000-8000-000000000001';
const M = '90000000-0000-4000-8000-000000000001';
const ACCT = '40000000-0000-4000-8000-000000000001';
const KEY = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const NOW = new Date('2026-11-25T15:00:00Z');
const ENV = { VERTAL_GROWTH_TEAM_ENABLED: 'true', VERTAL_GROWTH_TEAM_CHARGE: 'true', VERTAL_PROSPECTOR_DAILY_CAP: '20' };
const ICP_JSON = JSON.stringify({ profile: { offer: 'App de treinos curtos' }, icp: { summary: 'academias', osmTags: [{ key: 'leisure', value: 'fitness_centre' }], area: 'Campinas, SP' } });

function setup(o: { seed?: Record<string, Record<string, unknown>[]>; env?: Record<string, string>; model?: string | null; debit?: GrowthDeps['credits']['debit']; stripe?: unknown } = {}) {
  const db = createFakeDb({
    projects: [{ id: P, user_id: U, title: 'Crie um app de treino', generated_code: '<title>FitVertal</title><h1>Treinos para você. Assine o plano mensal. Teste grátis.</h1>', is_published: true, published_url: 'https://fit.pages.dev' }],
    gmail_accounts: [{ id: ACCT, user_id: U, email: 'kuboprotocol@gmail.com' }],
    fluxos_connections: [{ user_id: U, app_key: 'todoist', status: 'connected' }, { user_id: U, app_key: 'notion', status: 'pending' }],
    connector_activity_logs: [],
    ...(o.seed ?? {}),
  });
  const debits: Array<{ amount: number; key: string }> = [];
  const refunds: Array<{ amount: number; key: string }> = [];
  const charged = new Set<string>();
  const gmailCalls: string[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/messages/send')) {
      gmailCalls.push(String(init?.body ?? ''));
      return new Response(JSON.stringify({ id: 'gm1', threadId: 'th1' }), { status: 200 });
    }
    if (url.startsWith('https://api.stripe.com/v1/subscriptions')) return new Response(JSON.stringify(o.stripe ?? { data: [] }), { status: 200 });
    if (url.startsWith('https://api.stripe.com/v1/charges')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    return new Response('<html></html>', { status: 404 });
  });
  const callModel = vi.fn(async () => {
    if (o.model === null) throw new Error('model down');
    return { content: o.model ?? ICP_JSON };
  });
  const deps: GrowthDeps = {
    admin: db, userId: U, env: { ...ENV, ...(o.env ?? {}) }, fetch: fetchImpl as unknown as typeof fetch, callModel,
    gmailToken: async () => ({ token: 'tok', email: 'kuboprotocol@gmail.com' }),
    credits: {
      debit: o.debit ?? (async (amount, key) => {
        if (charged.has(key)) return { ok: false, error: 'duplicate_request' };
        charged.add(key);
        debits.push({ amount, key });
        return { ok: true, charged: amount };
      }),
      refund: async (amount, key) => {
        refunds.push({ amount, key });
        return true;
      },
    },
    stripeKey: async () => (o.stripe ? 'sk_test_x' : null),
    hasSecrets: async () => true,
    prospector: (b) => handleProspector(b as Record<string, unknown>, { admin: db, userId: U, env: ENV, fetch: fetchImpl as unknown as typeof fetch, callModel, gmailToken: async () => ({ token: 'tok', email: 'k@x.com' }), now: () => NOW, log: () => {} }),
    now: () => NOW, log: () => {},
  };
  return { db, deps, debits, refunds, gmailCalls, callModel };
}

const launchBody = { op: 'launch', projectId: P, name: 'FitVertal', description: 'Treinos curtos', model: 'b2c', subscription: true, acceptCost: true, idempotencyKey: KEY, lang: 'pt-BR' };

describe('Vertal Growth · leitura do projeto', () => {
  it('analyze_project lê o projeto do próprio dev e sugere o modelo (sem cobrar)', async () => {
    const { deps, debits } = setup();
    const r = await handleGrowth({ op: 'analyze_project', projectId: P }, deps);
    expect(r.status).toBe(200);
    expect(r.body.prefill).toMatchObject({ name: 'FitVertal', website: 'https://fit.pages.dev' });
    expect((r.body.inference as { model: string; subscription: boolean })).toMatchObject({ model: 'b2c', subscription: true });
    expect(debits).toHaveLength(0);
  });
  it('projeto de outro usuário = não encontrado', async () => {
    const { deps } = setup({ seed: { projects: [{ id: P, user_id: 'outro', title: 'x' }] } });
    expect((await handleGrowth({ op: 'analyze_project', projectId: P }, deps)).status).toBe(404);
  });
});

describe('Vertal Growth · cobrança de 20 créditos', () => {
  it('sem aceitar o custo não lança nem cobra', async () => {
    const { deps, debits } = setup();
    const r = await handleGrowth({ ...launchBody, acceptCost: false }, deps);
    expect(r.status).toBe(400);
    expect(debits).toHaveLength(0);
  });
  it('lança: debita 20 uma vez (chave idempotente), cria a captação com teto de leads e a campanha', async () => {
    const { deps, debits, db } = setup();
    const r = await handleGrowth(launchBody, deps);
    expect(r.status).toBe(200);
    expect(debits).toEqual([{ amount: 20, key: `growth:${KEY}` }]);
    expect(db.tables.prospector_campaigns[0].settings).toMatchObject({ maxLeads: 200, growth: true });
    expect(db.tables.growth_campaigns[0]).toMatchObject({ model: 'b2c', charge_key: KEY, project_id: P });
    expect(db.tables.growth_events.map((e) => e.kind)).toContain('launch');
    // Repetição do mesmo pedido: devolve a mesma campanha e NÃO cobra de novo.
    const again = await handleGrowth(launchBody, deps);
    expect(again.body.replayed).toBe(true);
    expect(debits).toHaveLength(1);
    expect(db.tables.growth_campaigns).toHaveLength(1);
  });
  it('IA fora: devolve os 20 créditos e não cria nada', async () => {
    const { deps, debits, refunds, db } = setup({ model: null });
    const r = await handleGrowth(launchBody, deps);
    expect(r.status).toBe(502);
    expect(debits).toHaveLength(1);
    expect(refunds).toEqual([{ amount: 20, key: `growth:${KEY}` }]);
    expect(db.tables.growth_campaigns ?? []).toHaveLength(0);
  });
  it('sem créditos: 402 e nada criado', async () => {
    const { deps, db } = setup({ debit: async () => ({ ok: false, error: 'insufficient_credits' }) });
    expect((await handleGrowth(launchBody, deps)).status).toBe(402);
    expect(db.tables.prospector_campaigns ?? []).toHaveLength(0);
  });
  it('cobrança desligada: lança sem debitar', async () => {
    const { deps, debits } = setup({ env: { VERTAL_GROWTH_TEAM_CHARGE: 'false' } });
    expect((await handleGrowth(launchBody, deps)).status).toBe(200);
    expect(debits).toHaveLength(0);
  });
  it('conteúdo abusivo é recusado antes de cobrar', async () => {
    const { deps, debits } = setup();
    const r = await handleGrowth({ ...launchBody, description: 'Ganhe dinheiro fácil com aposta esportiva' }, deps);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('blocked_content');
    expect(debits).toHaveLength(0);
  });
});

function seeded(extra: Record<string, Record<string, unknown>[]> = {}, settings: Record<string, unknown> = {}) {
  return {
    growth_campaigns: [{ id: G, user_id: U, project_name: 'FitVertal', model: 'b2c', lang: 'pt', prospector_campaign_id: PC, status: 'active', settings: { inactivityDays: 30, ...settings }, team: {}, profile: { offer: 'treinos' }, created_at: '2026-11-20T00:00:00Z' }],
    prospector_campaigns: [{ id: PC, user_id: U, company_name: 'FitVertal', status: 'icp_confirmed', icp: {}, settings: { maxLeads: 2 } }],
    ...extra,
  };
}

describe('Vertal Growth · nada sai sem aprovação', () => {
  const contact = { id: C, user_id: U, growth_id: G, email: 'ana@cliente.com', email_status: 'verified', name: 'Ana', stage: 'retencao', status: 'active', source: 'manual' };
  const msg = (status: string) => ({ id: M, user_id: U, growth_id: G, contact_id: C, stage: 'retencao', kind: 'onboarding', channel: 'email', subject: 'Bem-vinda', body: 'Que bom ter você.', footer: '\n\nrodapé', status, meta: {} });
  it('rascunho não é enviado (Gmail nem é chamado)', async () => {
    const { deps, gmailCalls } = setup({ seed: seeded({ growth_contacts: [contact], growth_messages: [msg('draft')] }) });
    const r = await handleGrowth({ op: 'send', messageId: M, accountId: ACCT }, deps);
    expect(r.status).toBe(409);
    expect(gmailCalls).toHaveLength(0);
  });
  it('aprovado + verificado: envia uma vez, com rodapé; segundo envio é travado', async () => {
    const { deps, gmailCalls, db } = setup({ seed: seeded({ growth_contacts: [contact], growth_messages: [msg('approved')] }) });
    expect((await handleGrowth({ op: 'send', messageId: M, accountId: ACCT }, deps)).status).toBe(200);
    expect(gmailCalls).toHaveLength(1);
    expect(db.tables.growth_messages[0].status).toBe('sent');
    expect((await handleGrowth({ op: 'send', messageId: M, accountId: ACCT }, deps)).status).toBe(409);
    expect(gmailCalls).toHaveLength(1);
  });
  it('lista de não contatar bloqueia', async () => {
    const { deps, gmailCalls } = setup({ seed: seeded({ growth_contacts: [contact], growth_messages: [msg('approved')], prospector_dnc: [{ user_id: U, kind: 'email', value: 'ana@cliente.com' }] }) });
    const r = await handleGrowth({ op: 'send', messageId: M, accountId: ACCT }, deps);
    expect(r.body.problems).toContain('contato na lista de não contatar');
    expect(gmailCalls).toHaveLength(0);
  });
  it('limite diário é o mesmo do Prospector (soma os dois)', async () => {
    const sent = Array.from({ length: 20 }, (_, i) => ({ id: `5${String(i).padStart(7, '0')}-0000-4000-8000-000000000000`, user_id: U, campaign_id: PC, lead_id: L, direction: 'out', channel: 'email', kind: 'first', status: 'sent', sent_at: NOW.toISOString() }));
    const { deps, gmailCalls } = setup({ seed: seeded({ growth_contacts: [contact], growth_messages: [msg('approved')], prospector_messages: sent }) });
    const r = await handleGrowth({ op: 'send', messageId: M, accountId: ACCT }, deps);
    expect(r.body.problems).toContain('limite diário atingido (20 envios)');
    expect(gmailCalls).toHaveLength(0);
  });
  it('piloto automático: configurações comuns não ligam; agente/pedido sem a frase não liga', async () => {
    const { deps, db } = setup({ seed: seeded() });
    expect((await handleGrowth({ op: 'update_settings', growthId: G, settings: { autopilot: true } }, deps)).status).toBe(400);
    expect((await handleGrowth({ op: 'set_autopilot', growthId: G, enabled: true }, deps)).status).toBe(403);
    expect(db.tables.growth_campaigns[0].settings.autopilot).toBeFalsy();
    expect((await handleGrowth({ op: 'set_autopilot', growthId: G, enabled: true, confirmText: 'AUTOPILOT', origin: 'growth_settings' }, deps)).status).toBe(200);
    expect(db.tables.growth_campaigns[0].settings).toMatchObject({ autopilot: true, autopilotBy: 'user' });
  });
  it('contato manual exige declaração de relação (LGPD) e cria rascunhos para aprovar', async () => {
    const { deps, db } = setup({ seed: seeded() });
    expect((await handleGrowth({ op: 'add_contact', growthId: G, email: 'joao@x.com', stage: 'conversao' }, deps)).status).toBe(400);
    const r = await handleGrowth({ op: 'add_contact', growthId: G, email: 'joao@x.com', name: 'João', stage: 'conversao', consent: true }, deps);
    expect(r.status).toBe(200);
    expect(db.tables.growth_messages.map((m) => [m.kind, m.status])).toEqual([['conversion1', 'draft'], ['conversion2', 'draft']]);
  });
});

describe('Vertal Growth · etapas', () => {
  it('sync: lead contatado entra na Captação; resposta interessada vai para Conversão com lembrete; evento para a equipe', async () => {
    const leads = [
      { id: L, user_id: U, campaign_id: PC, name: 'Academia Forte', email: 'contato@forte.com', email_status: 'verified', status: 'replied', decision_maker: {}, signals: {} },
      { id: '20000000-0000-4000-8000-000000000002', user_id: U, campaign_id: PC, name: 'Box Cross', email: 'oi@box.com', email_status: 'verified', status: 'contacted', decision_maker: {}, signals: {} },
    ];
    const replyDraft = { id: '30000000-0000-4000-8000-000000000009', user_id: U, campaign_id: PC, lead_id: L, direction: 'out', channel: 'email', kind: 'reply', status: 'draft', meta: { intent: 'interessado' } };
    const { deps, db } = setup({ seed: seeded({ prospector_leads: leads, prospector_messages: [replyDraft] }, {}) });
    db.tables.growth_campaigns[0].team = { webhookAgentId: 5, agents: [{ event: 'new_lead', agentId: 6, triggerAgentId: 7 }, { event: 'reply_positive', agentId: 8, triggerAgentId: 9 }] };
    const r = await handleGrowth({ op: 'sync', growthId: G }, deps);
    expect(r.status).toBe(200);
    const contacts = db.tables.growth_contacts;
    expect(contacts.map((c) => [c.company, c.stage, c.status])).toEqual([['Academia Forte', 'conversao', 'engaged'], ['Box Cross', 'captacao', 'lead']]);
    expect(db.tables.growth_messages.map((m) => m.kind)).toEqual(['conversion2']);
    expect((r.body.events as Array<{ type: string }>).map((e) => e.type).sort()).toEqual(['new_lead', 'new_lead', 'reply_positive']);
    // Painel por etapa
    const d = await handleGrowth({ op: 'get', growthId: G }, deps);
    expect(d.body.dashboard).toMatchObject({ captacao: { leads: 2, contacted: 2, replies: 1 }, conversao: { engaged: 1 } });
  });
  it('sync com Stripe (só leitura): assinatura nova vira cliente com boas-vindas; cancelada vira recuperação', async () => {
    const stripe = { data: [
      { id: 'sub_1', status: 'active', created: Math.floor(NOW.getTime() / 1000), customer: { email: 'novo@cliente.com', name: 'Bia' } },
      { id: 'sub_2', status: 'canceled', created: 1, customer: { email: 'ana@cliente.com', name: 'Ana' } },
    ] };
    const old = { id: C, user_id: U, growth_id: G, email: 'ana@cliente.com', email_status: 'verified', name: 'Ana', stage: 'retencao', status: 'active', source: 'stripe', last_activity_at: NOW.toISOString() };
    const { deps, db, gmailCalls } = setup({ stripe, seed: seeded({ growth_contacts: [old] }) });
    const r = await handleGrowth({ op: 'sync', growthId: G }, deps);
    expect(r.body.summary).toMatchObject({ customers: 1, churned: 1, stripe: true });
    expect(db.tables.growth_contacts.find((c) => c.email === 'novo@cliente.com')).toMatchObject({ status: 'converted', stage: 'retencao' });
    expect(db.tables.growth_contacts.find((c) => c.email === 'ana@cliente.com')?.status).toBe('churned');
    expect(db.tables.growth_messages.map((m) => [m.kind, m.status]).sort()).toEqual([['onboarding', 'draft'], ['winback', 'draft']]);
    expect(gmailCalls).toHaveLength(0); // sem piloto automático, nada é enviado
  });
  it('captação: teto de leads por campanha vale no Prospector', async () => {
    const leads = [1, 2].map((i) => ({ id: `2000000${i}-0000-4000-8000-000000000000`, user_id: U, campaign_id: PC, name: `L${i}`, status: 'new' }));
    const { deps } = setup({ seed: seeded({ prospector_leads: leads }) });
    const r = await deps.prospector({ op: 'find_leads', campaignId: PC, elements: [] });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('lead_cap_reached');
  });
  it('plano da equipe usa só apps conectados (todoist sim; notion pendente não)', async () => {
    const { deps } = setup({ seed: seeded() });
    const r = await handleGrowth({ op: 'plan_team', growthId: G }, deps);
    expect(r.body.crmApp).toBe('todoist');
    expect((r.body.presets as unknown[]).length).toBe(4);
    expect(r.body.runCost).toBe(2);
  });
});
