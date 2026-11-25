import { describe, expect, it, vi } from 'vitest';
import { handleCrm, type CrmDeps, type DebitResult } from '../../../supabase/functions/_shared/vertalCrm/handler';
import { createCrmFakeDb } from './fakeDb';

const U = '5441b397-7be8-44fc-87e8-8057fdb79a0e';
const OTHER = '11111111-2222-4333-8444-555555555555';
const KEY1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1';
const KEY2 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2';

function setup(o: { model?: string | null; fluxos?: Array<Record<string, unknown>>; engineOk?: boolean; env?: Record<string, string>; debit?: (a: number, k: string) => Promise<DebitResult> } = {}) {
  const db = createCrmFakeDb({ fluxos_connections: o.fluxos ?? [], gmail_accounts: [] }, [{ id: U, email: 'kuboprotocol@gmail.com' }, { id: OTHER, email: 'outro@exemplo.com' }]);
  const debits: Array<{ amount: number; key: string }> = [];
  const refunds: Array<{ amount: number; key: string }> = [];
  const charged = new Set<string>();
  const engineCalls: Array<{ method: string; path: string; body: unknown }> = [];
  const deps: CrmDeps = {
    admin: db, userId: U, env: { VERTAL_CRM_ENABLED: 'true', VERTAL_CRM_USER_IDS: U, ...(o.env ?? {}) }, fetch: vi.fn() as unknown as typeof fetch, via: 'user',
    callModel: vi.fn(async () => {
      if (o.model === null) throw new Error('modelo fora');
      return { content: o.model ?? 'Resumo: cliente interessado.', label: 'Vertal Auto' };
    }),
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
    engine: {
      call: vi.fn(async (method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) => {
        engineCalls.push({ method, path, body });
        if (method === 'GET') return { status: 200, data: { key: 'pipedrive', actions: [{ key: 'createPerson', arguments: [{ key: 'name' }, { key: 'emails' }, { key: 'phones' }] }] } };
        return o.engineOk === false ? { status: 502, data: { ok: false, message: 'recusado' } } : { status: 200, data: { ok: true, data: { data: { id: 77 } }, items: [] } };
      }),
    },
  };
  return { db, deps, debits, refunds, engineCalls };
}

async function boot(deps: CrmDeps) {
  const r = await handleCrm({ op: 'bootstrap', lang: 'pt-BR' }, deps);
  return (r.body.workspace as { id: string }).id;
}

describe('Vertal CRM · workspace', () => {
  it('bootstrap cria workspace, dono e funil padrão em pt (uma vez só)', async () => {
    const { deps, db } = setup();
    const ws = await boot(deps);
    expect(db.tables.crm_members).toEqual([expect.objectContaining({ workspace_id: ws, user_id: U, role: 'owner' })]);
    expect(db.tables.crm_pipelines[0].stages.map((s: { id: string }) => s.id)).toEqual(['lead', 'qualificado', 'proposta', 'negociacao', 'ganho', 'perdido']);
    const again = await handleCrm({ op: 'bootstrap' }, deps);
    expect(again.body.created).toBe(false);
    expect(db.tables.crm_workspaces).toHaveLength(1);
  });
  it('quem não é membro não acha o workspace', async () => {
    const { deps } = setup();
    const ws = await boot(deps);
    const r = await handleCrm({ op: 'ai', workspaceId: ws, kind: 'summary', entityId: KEY1, idempotencyKey: KEY1 }, { ...deps, userId: OTHER });
    expect(r.status).toBe(404);
  });
  it('convidar só quem já tem conta (sem e-mail); viewer não escreve pela API', async () => {
    const { deps } = setup();
    const ws = await boot(deps);
    expect((await handleCrm({ op: 'invite_member', workspaceId: ws, email: 'ninguem@x.com' }, deps)).status).toBe(404);
    expect((await handleCrm({ op: 'invite_member', workspaceId: ws, email: 'outro@exemplo.com', role: 'viewer' }, deps)).status).toBe(200);
    const asViewer = { ...deps, userId: OTHER };
    expect((await handleCrm({ op: 'create_contact', workspaceId: ws, name: 'Ana' }, asViewer)).status).toBe(403);
    expect((await handleCrm({ op: 'list_contacts', workspaceId: ws }, asViewer)).status).toBe(200);
  });
});

describe('Vertal CRM · IA (1 crédito, idempotente, devolve se falhar)', () => {
  it('cobra 1 crédito, guarda o resultado e não cobra de novo na repetição', async () => {
    const { deps, debits, db } = setup();
    const ws = await boot(deps);
    const c = await handleCrm({ op: 'create_contact', workspaceId: ws, name: 'Ana Souza', email: 'ana@acme.com.br' }, deps);
    const id = (c.body.contact as { id: string }).id;
    const r = await handleCrm({ op: 'ai', workspaceId: ws, kind: 'summary', entityType: 'contact', entityId: id, idempotencyKey: KEY1 }, deps);
    expect(r.status).toBe(200);
    expect(r.body.credits).toBe(1);
    expect(debits).toEqual([{ amount: 1, key: `crm_ai:${KEY1}` }]);
    const again = await handleCrm({ op: 'ai', workspaceId: ws, kind: 'summary', entityType: 'contact', entityId: id, idempotencyKey: KEY1 }, deps);
    expect(again.body.replayed).toBe(true);
    expect(debits).toHaveLength(1);
    expect(db.tables.crm_ai_runs[0].status).toBe('ok');
  });
  it('modelo fora → devolve o crédito e marca refunded', async () => {
    const { deps, refunds, db } = setup({ model: null });
    const ws = await boot(deps);
    const c = await handleCrm({ op: 'create_contact', workspaceId: ws, name: 'Ana', email: 'ana@acme.com.br' }, deps);
    const r = await handleCrm({ op: 'ai', workspaceId: ws, kind: 'summary', entityType: 'contact', entityId: (c.body.contact as { id: string }).id, idempotencyKey: KEY2 }, deps);
    expect(r.status).toBe(502);
    expect(r.body.refunded).toBe(true);
    expect(refunds).toEqual([{ amount: 1, key: `crm_ai:${KEY2}` }]);
    expect(db.tables.crm_ai_runs[0].status).toBe('refunded');
  });
  it('sem créditos → 402 e nada fica registrado', async () => {
    const { deps, db } = setup({ debit: async () => ({ ok: false, error: 'insufficient_credits' }) });
    const ws = await boot(deps);
    const c = await handleCrm({ op: 'create_contact', workspaceId: ws, name: 'Ana', email: 'ana@acme.com.br' }, deps);
    const r = await handleCrm({ op: 'ai', workspaceId: ws, kind: 'score', entityType: 'contact', entityId: (c.body.contact as { id: string }).id, idempotencyKey: KEY1 }, deps);
    expect(r.status).toBe(402);
    expect(db.tables.crm_ai_runs).toHaveLength(0);
  });
  it('pontuação grava score no contato', async () => {
    const { deps, db } = setup({ model: '{"score": 82, "reasons": ["respondeu", "orçamento"]}' });
    const ws = await boot(deps);
    const c = await handleCrm({ op: 'create_contact', workspaceId: ws, name: 'Ana', email: 'ana@acme.com.br' }, deps);
    const r = await handleCrm({ op: 'ai', workspaceId: ws, kind: 'score', entityType: 'contact', entityId: (c.body.contact as { id: string }).id, idempotencyKey: KEY1 }, deps);
    expect(r.body.result).toMatchObject({ score: 82 });
    expect(db.tables.crm_contacts[0].score).toBe(82);
  });
  it('pedido sem chave idempotente é recusado antes de cobrar', async () => {
    const { deps, debits } = setup();
    const ws = await boot(deps);
    expect((await handleCrm({ op: 'ai', workspaceId: ws, kind: 'summary', entityId: KEY1 }, deps)).status).toBe(400);
    expect(debits).toHaveLength(0);
  });
});

describe('Vertal CRM · CRMs externos (4 para ativar, 2 por sincronização com IA)', () => {
  it('sem conexão no Vertal Fluxos: não cobra', async () => {
    const { deps, debits } = setup();
    const ws = await boot(deps);
    const r = await handleCrm({ op: 'sync_activate', workspaceId: ws, provider: 'pipedrive', idempotencyKey: KEY1 }, deps);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('provider_not_connected');
    expect(debits).toHaveLength(0);
  });
  it('Zoho/RD Station: em breve (sem app no Fluxos), sem cobrança', async () => {
    const { deps, debits } = setup();
    const ws = await boot(deps);
    expect((await handleCrm({ op: 'sync_activate', workspaceId: ws, provider: 'zoho', idempotencyKey: KEY1 }, deps)).body.error).toBe('provider_coming_soon');
    expect(debits).toHaveLength(0);
  });
  it('ativa uma vez (4), sincroniza com IA (2) e sem IA (grátis por padrão)', async () => {
    const { deps, debits, engineCalls, db } = setup({ fluxos: [{ user_id: U, app_key: 'pipedrive', status: 'connected', fluxos_connection_id: 'fx1' }], model: '{"mapping": {"name": "full_name", "emails": "email"}}' });
    const ws = await boot(deps);
    await handleCrm({ op: 'create_contact', workspaceId: ws, name: 'Ana Souza', email: 'ana@acme.com.br' }, deps);
    const a = await handleCrm({ op: 'sync_activate', workspaceId: ws, provider: 'pipedrive', idempotencyKey: KEY1 }, deps);
    expect(a.status).toBe(200);
    const a2 = await handleCrm({ op: 'sync_activate', workspaceId: ws, provider: 'pipedrive', idempotencyKey: KEY2 }, deps);
    expect(a2.body.alreadyActive).toBe(true);
    expect(debits).toEqual([{ amount: 4, key: `crm_sync_activate:${KEY1}` }]);

    const s = await handleCrm({ op: 'sync_run', workspaceId: ws, provider: 'pipedrive', mode: 'ai', direction: 'push', idempotencyKey: KEY1 }, deps);
    expect(s.status).toBe(200);
    expect(s.body.stats).toMatchObject({ pushed: 1 });
    expect(debits[1]).toEqual({ amount: 2, key: `crm_sync_run:${KEY1}` });
    const push = engineCalls.find((c) => c.path === '/run') as { body: { parameters: Record<string, unknown> } };
    expect(push.body.parameters).toEqual({ name: 'Ana Souza', emails: [{ email: 'ana@acme.com.br' }] });
    expect(db.tables.crm_contacts[0].external_ids.pipedrive).toBe('77');

    const p = await handleCrm({ op: 'sync_run', workspaceId: ws, provider: 'pipedrive', mode: 'plain', direction: 'push', idempotencyKey: KEY2 }, deps);
    expect(p.status).toBe(200);
    expect(p.body.credits).toBe(0);
    expect(debits).toHaveLength(2);
  });
  it('sincronização com IA que falha inteira devolve os 2 créditos', async () => {
    const { deps, refunds } = setup({ fluxos: [{ user_id: U, app_key: 'pipedrive', status: 'connected', fluxos_connection_id: 'fx1' }], engineOk: false });
    const ws = await boot(deps);
    await handleCrm({ op: 'create_contact', workspaceId: ws, name: 'Ana', email: 'ana@acme.com.br' }, deps);
    await handleCrm({ op: 'sync_activate', workspaceId: ws, provider: 'pipedrive', idempotencyKey: KEY1 }, deps);
    const s = await handleCrm({ op: 'sync_run', workspaceId: ws, provider: 'pipedrive', mode: 'ai', direction: 'push', idempotencyKey: KEY2 }, deps);
    expect(s.status).toBe(502);
    expect(refunds).toEqual([{ amount: 2, key: `crm_sync_run:${KEY2}` }]);
  });
  it('preço da sincronização sem IA vem de VERTAL_CRM_PLAIN_SYNC_COST (decisão pendente)', async () => {
    const { deps, debits } = setup({ fluxos: [{ user_id: U, app_key: 'pipedrive', status: 'connected', fluxos_connection_id: 'fx1' }], env: { VERTAL_CRM_PLAIN_SYNC_COST: '1' } });
    const ws = await boot(deps);
    await handleCrm({ op: 'sync_activate', workspaceId: ws, provider: 'pipedrive', idempotencyKey: KEY1 }, deps);
    await handleCrm({ op: 'sync_run', workspaceId: ws, provider: 'pipedrive', mode: 'plain', direction: 'push', idempotencyKey: KEY2 }, deps);
    expect(debits.map((d) => d.amount)).toEqual([4, 1]);
  });
});

describe('Vertal CRM · API, webhooks e integrações', () => {
  it('chave da API: só ops de API; chave só leitura não escreve', async () => {
    const { deps } = setup();
    const ws = await boot(deps);
    const k = await handleCrm({ op: 'api_key_create', workspaceId: ws, readOnly: true }, deps);
    expect(String(k.body.key)).toMatch(/^vcrm_/);
    const api = { ...deps, via: 'api' as const, apiWorkspaceId: ws, apiScopes: ['read'] };
    expect((await handleCrm({ op: 'ai', kind: 'summary' }, api)).status).toBe(403);
    expect((await handleCrm({ op: 'create_contact', name: 'X' }, api)).status).toBe(403);
    expect((await handleCrm({ op: 'list_contacts' }, api)).status).toBe(200);
  });
  it('webhook só https público', async () => {
    const { deps } = setup();
    const ws = await boot(deps);
    expect((await handleCrm({ op: 'webhook_create', workspaceId: ws, url: 'http://example.com/x' }, deps)).status).toBe(400);
    expect((await handleCrm({ op: 'webhook_create', workspaceId: ws, url: 'https://169.254.169.254/x' }, deps)).status).toBe(400);
    const ok = await handleCrm({ op: 'webhook_create', workspaceId: ws, url: 'https://hooks.example.com/crm', events: ['deal.stage_changed', 'xx'] }, deps);
    expect(ok.status).toBe(200);
    expect((ok.body.webhook as { events: string[] }).events).toEqual(['deal.stage_changed']);
    expect(String(ok.body.secret)).toMatch(/^whsec_/);
  });
  it('Vertal Fluxos: criar negócio e mover de etapa (só etapas do funil)', async () => {
    const { deps } = setup();
    await boot(deps);
    const fx = { ...deps, via: 'fluxos' as const };
    const d = await handleCrm({ op: 'create_deal', name: 'Site novo', amount: '1500' }, fx);
    expect(d.status).toBe(200);
    const id = (d.body.deal as { id: string; stage: string }).id;
    expect((d.body.deal as { stage: string }).stage).toBe('lead');
    expect((await handleCrm({ op: 'move_deal', id, stage: 'inexistente' }, fx)).status).toBe(400);
    expect((await handleCrm({ op: 'move_deal', id, stage: 'proposta' }, fx)).status).toBe(200);
  });
  it('importa leads do Prospector sem duplicar e respeita opt-out', async () => {
    const { deps, db } = setup();
    const ws = await boot(deps);
    db.tables.prospector_leads = [
      { id: 'l1', user_id: U, campaign_id: 'c1', name: 'Padaria Sol', email: 'contato@padariasol.com.br', email_status: 'verified', status: 'contacted', decision_maker: {} },
      { id: 'l2', user_id: U, campaign_id: 'c1', name: 'Saiu', email: 'x@saiu.com', status: 'opted_out', decision_maker: {} },
    ];
    const r1 = await handleCrm({ op: 'import_prospector', workspaceId: ws }, deps);
    expect(r1.body.result).toMatchObject({ contactsCreated: 1 });
    const r2 = await handleCrm({ op: 'import_prospector', workspaceId: ws }, deps);
    expect(r2.body.result).toMatchObject({ contactsCreated: 0 });
    expect(db.tables.crm_contacts).toHaveLength(1);
    expect(db.tables.crm_contacts[0]).toMatchObject({ source: 'prospector', status: 'warm' });
  });
});
