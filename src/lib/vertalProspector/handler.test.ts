import { describe, expect, it, vi } from 'vitest';
import { handleProspector, startOfDaySp, type ProspectorDeps } from '../../../supabase/functions/_shared/vertalProspector/handler';
import { createFakeDb } from './fakeDb';

const U = '5441b397-7be8-44fc-87e8-8057fdb79a0e';
const C = '10000000-0000-4000-8000-000000000001';
const L = '20000000-0000-4000-8000-000000000001';
const M = '30000000-0000-4000-8000-000000000001';
const W = '30000000-0000-4000-8000-000000000002';
const ACCT = '40000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-11-25T15:00:00Z');

function setup(over: { msgStatus?: string; emailStatus?: string; dnc?: unknown[]; sentToday?: number; icpStatus?: string } = {}) {
  const sentRows = Array.from({ length: over.sentToday ?? 0 }, (_, i) => ({
    id: `5${String(i).padStart(7, '0')}-0000-4000-8000-000000000000`, user_id: U, campaign_id: C, lead_id: L, direction: 'out', channel: 'email', kind: 'first', status: 'sent', sent_at: NOW.toISOString(), meta: {},
  }));
  const db = createFakeDb({
    prospector_campaigns: [{ id: C, user_id: U, company_name: 'Vertal Company', status: over.icpStatus ?? 'icp_confirmed', icp: { area: 'Campinas, SP', osmTags: [{ key: 'amenity', value: 'dentist' }] }, profile: { offer: 'apps' }, settings: { senderName: 'Laércio' } }],
    prospector_leads: [{ id: L, user_id: U, campaign_id: C, name: 'Clínica Sorriso', domain: 'sorriso.com.br', email: 'contato@sorriso.com.br', email_status: over.emailStatus ?? 'verified', phone: '(19) 99999-8888', status: 'drafted' }],
    prospector_messages: [
      { id: M, user_id: U, campaign_id: C, lead_id: L, direction: 'out', channel: 'email', kind: 'first', subject: 'agenda da clínica', body: 'Olá! Vi que a clínica não tem agendamento online. Hoje os pacientes marcam só por telefone?', footer: '\n\nLaércio · Vertal Company\n\nEncontrei este contato em fonte pública da sua empresa. Se preferir não receber mais mensagens, é só responder "parar".', status: over.msgStatus ?? 'draft', meta: {} },
      { id: W, user_id: U, campaign_id: C, lead_id: L, direction: 'out', channel: 'whatsapp', kind: 'first', subject: '', body: 'Oi! Aqui é o Laércio da Vertal. Posso te mostrar uma ideia?', footer: '', status: 'draft', meta: {} },
      ...sentRows,
    ],
    prospector_dnc: (over.dnc ?? []) as Record<string, unknown>[],
    connector_activity_logs: [],
    gmail_accounts: [{ id: ACCT, user_id: U, email: 'kuboprotocol@gmail.com' }],
  });
  const gmailCalls: Array<{ url: string; body: string }> = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/messages/send')) {
      gmailCalls.push({ url, body: String(init?.body ?? '') });
      return new Response(JSON.stringify({ id: 'gm1', threadId: 'th1' }), { status: 200 });
    }
    if (url.includes('format=metadata')) return new Response(JSON.stringify({ payload: { headers: [{ name: 'Message-ID', value: '<abc@mail>' }] } }), { status: 200 });
    if (url.includes('/threads/')) {
      const text = btoa('Por favor, pare de me mandar e-mail.').replace(/\+/g, '-').replace(/\//g, '_');
      return new Response(JSON.stringify({ messages: [
        { id: 'gm1', payload: { headers: [{ name: 'From', value: 'Laércio <kuboprotocol@gmail.com>' }] } },
        { id: 'gm2', payload: { mimeType: 'text/plain', body: { data: text }, headers: [{ name: 'From', value: 'Ana <contato@sorriso.com.br>' }, { name: 'Subject', value: 'Re: agenda da clínica' }] } },
      ] }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  });
  const callModel = vi.fn(async () => ({ content: '{"intent":"outro","reply":"ok"}' }));
  const deps: ProspectorDeps = {
    admin: db, userId: U, env: { VERTAL_PROSPECTOR_DAILY_CAP: '20' }, fetch: fetchImpl as unknown as typeof fetch, callModel,
    gmailToken: async () => ({ token: 'tok', email: 'kuboprotocol@gmail.com' }), now: () => NOW, log: () => {},
  };
  return { db, deps, gmailCalls, fetchImpl, callModel };
}

const msg = (db: ReturnType<typeof createFakeDb>, id: string) => db.tables.prospector_messages.find((m) => m.id === id)!;

describe('Vertal Prospector · nada sai sem aprovação', () => {
  it('rascunho não é enviado (e o Gmail nem é chamado)', async () => {
    const { deps, gmailCalls } = setup();
    const r = await handleProspector({ op: 'send', messageId: M, accountId: ACCT }, deps);
    expect(r.status).toBe(409);
    expect(r.body.problems).toContain('mensagem não aprovada');
    expect(gmailCalls).toHaveLength(0);
  });

  it('aprovar e depois enviar: 1 e-mail pelo Gmail conectado, com a linha de descadastro', async () => {
    const { db, deps, gmailCalls } = setup();
    const a = await handleProspector({ op: 'approve', messageIds: [M] }, deps);
    expect(a.body.approved).toEqual([M]);
    expect(gmailCalls).toHaveLength(0); // aprovar não envia
    const r = await handleProspector({ op: 'send', messageId: M, accountId: ACCT }, deps);
    expect(r.status).toBe(200);
    expect(gmailCalls).toHaveLength(1);
    const raw = JSON.parse(gmailCalls[0].body).raw as string;
    const mime = decodeURIComponent(escape(atob(raw.replace(/-/g, '+').replace(/_/g, '/'))));
    expect(mime).toContain('To: contato@sorriso.com.br');
    expect(mime).toContain('responder "parar"');
    expect(msg(db, M).status).toBe('sent');
    expect(db.tables.connector_activity_logs[0].metadata.source).toBe('vertal_prospector');
    // De novo: já foi, não sai duas vezes.
    const again = await handleProspector({ op: 'send', messageId: M, accountId: ACCT }, deps);
    expect(again.status).toBe(409);
    expect(gmailCalls).toHaveLength(1);
  });

  it('editar um aprovado volta para rascunho (precisa aprovar de novo)', async () => {
    const { db, deps } = setup({ msgStatus: 'approved' });
    await handleProspector({ op: 'update_message', messageId: M, body: 'Olá! Pergunta rápida: vocês agendam por telefone?' }, deps);
    expect(msg(db, M).status).toBe('draft');
  });

  it('lista de não contatar, limite diário e e-mail palpite bloqueiam', async () => {
    let s = setup({ msgStatus: 'approved', dnc: [{ id: 'd', user_id: U, kind: 'domain', value: 'sorriso.com.br' }] });
    expect((await handleProspector({ op: 'send', messageId: M, accountId: ACCT }, s.deps)).body.problems).toContain('contato na lista de não contatar');
    s = setup({ msgStatus: 'approved', sentToday: 20 });
    expect((await handleProspector({ op: 'send', messageId: M, accountId: ACCT }, s.deps)).body.problems).toContain('limite diário atingido (20 envios)');
    s = setup({ msgStatus: 'approved', emailStatus: 'guess' });
    expect((await handleProspector({ op: 'send', messageId: M, accountId: ACCT }, s.deps)).status).toBe(409);
    expect(s.gmailCalls).toHaveLength(0);
  });

  it('WhatsApp nunca é enviado pelo sistema: só link wa.me depois de aprovado', async () => {
    const { deps, fetchImpl } = setup();
    expect((await handleProspector({ op: 'send', messageId: W, accountId: ACCT }, deps)).body.error).toBe('whatsapp_is_manual');
    expect((await handleProspector({ op: 'whatsapp_link', messageId: W }, deps)).status).toBe(409);
    await handleProspector({ op: 'approve', messageIds: [W] }, deps);
    const r = await handleProspector({ op: 'whatsapp_link', messageId: W }, deps);
    expect(String(r.body.link)).toMatch(/^https:\/\/wa\.me\/5519999998888\?text=/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('Vertal Prospector · respostas e LGPD', () => {
  it('pedido para parar: entra na lista, lead vira "não contatar" e o resto é cancelado', async () => {
    const { db, deps, callModel } = setup({ msgStatus: 'approved' });
    await handleProspector({ op: 'send', messageId: M, accountId: ACCT }, deps);
    await handleProspector({ op: 'approve', messageIds: [W] }, deps);
    const r = await handleProspector({ op: 'check_replies', campaignId: C }, deps);
    expect((r.body.summary as { optOuts: number }).optOuts).toBe(1);
    expect(db.tables.prospector_dnc.map((d) => d.value)).toContain('contato@sorriso.com.br');
    expect(db.tables.prospector_leads[0].status).toBe('opted_out');
    expect(msg(db, W).status).toBe('cancelled');
    expect(callModel).not.toHaveBeenCalled(); // descadastro não gasta modelo
  });

  it('apagar lead remove dados e mensagens (e lembra de não contatar)', async () => {
    const { db, deps } = setup();
    await handleProspector({ op: 'delete_lead', leadId: L, addToDnc: true }, deps);
    expect(db.tables.prospector_leads).toHaveLength(0);
    expect(db.tables.prospector_messages.filter((m) => m.lead_id === L)).toHaveLength(0);
    expect(db.tables.prospector_dnc.map((d) => d.kind).sort()).toEqual(['domain', 'email']);
  });

  it('buscar empresas exige ICP confirmado; operação desconhecida é recusada', async () => {
    const { deps, fetchImpl } = setup({ icpStatus: 'icp_pending' });
    expect((await handleProspector({ op: 'find_leads', campaignId: C }, deps)).body.error).toBe('icp_not_confirmed');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await handleProspector({ op: 'drop_table' }, deps)).status).toBe(400);
  });

  it('não lê campanha de outro usuário', async () => {
    const { deps } = setup();
    const r = await handleProspector({ op: 'get_campaign', campaignId: C }, { ...deps, userId: '99999999-0000-4000-8000-000000000000' });
    expect(r.status).toBe(404);
  });

  it('dia começa à meia-noite de Brasília', () => {
    expect(startOfDaySp(new Date('2026-11-25T02:00:00Z'))).toBe('2026-11-24T03:00:00.000Z');
  });
});
