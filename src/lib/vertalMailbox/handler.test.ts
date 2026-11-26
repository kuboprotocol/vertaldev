import { describe, expect, it } from 'vitest';
import { createCrmFakeDb } from '../vertalCrm/fakeDb';
import { mailboxConfig } from '../../../supabase/functions/_shared/vertalMailbox/core';
import { handleMailbox, type MailboxDeps } from '../../../supabase/functions/_shared/vertalMailbox/handler';
import { feedMailToCrm, type CrmDeps } from '../../../supabase/functions/_shared/vertalCrm/handler';

const U = '5441b397-7be8-44fc-87e8-8057fdb79a0e';
const G = '11111111-2222-4333-8444-555555555555';
const A1 = 'aaaaaaaa-2222-4333-8444-555555555555';
const IN1 = 'bbbbbbbb-2222-4333-8444-555555555555';
const cfg = mailboxConfig({
  VERTAL_MAILBOX: JSON.stringify({ enabled: true, userIds: [U], aliasDomains: ['mail.vertal.dev'], outboundDomains: ['mail.vertal.dev'], dailySendCap: 2 }),
})!;

function setup(extra: Partial<MailboxDeps> = {}, seed: Record<string, Array<Record<string, unknown>>> = {}) {
  const db = createCrmFakeDb({ gmail_accounts: [{ id: G, user_id: U, email: 'eu@gmail.com', created_at: '2026-01-01' }], ...seed }, [{ id: U, email: 'eu@gmail.com' }]);
  const sent: Array<Record<string, unknown>> = [];
  const crmDeps: CrmDeps = {
    admin: db, userId: U, env: {}, fetch, via: 'user',
    callModel: async () => ({ content: '' }),
    credits: { debit: async () => ({ ok: true }), refund: async () => true },
  };
  const deps: MailboxDeps = {
    admin: db, userId: U, cfg, crmEnabled: true,
    resendKey: 're_test',
    fetch: (async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('https://api.resend.com/')) {
        sent.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ id: 'prov-1' }), { status: 200 });
      }
      if (String(url).includes('/messages?')) return new Response(JSON.stringify({ messages: [{ id: 'g1' }, { id: 'g2' }] }), { status: 200 });
      if (String(url).includes('/messages/g1')) {
        return new Response(JSON.stringify({ id: 'g1', snippet: 'Quero uma proposta', labelIds: ['INBOX'], payload: { headers: [
          { name: 'From', value: 'Ana Souza <ana@acme-tech.com.br>' }, { name: 'To', value: 'eu@gmail.com' }, { name: 'Subject', value: 'Orçamento' }, { name: 'Date', value: 'Wed, 25 Nov 2026 10:00:00 -0300' },
        ] } }), { status: 200 });
      }
      if (String(url).includes('/messages/g2')) {
        return new Response(JSON.stringify({ id: 'g2', snippet: 'promo', labelIds: ['INBOX'], payload: { headers: [
          { name: 'From', value: 'no-reply@loja.com' }, { name: 'Subject', value: 'Oferta' },
        ] } }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch,
    gmailToken: async () => ({ token: 't', email: 'eu@gmail.com' }),
    crmFeed: (items) => feedMailToCrm(crmDeps, items),
    ...extra,
  };
  return { db, deps, sent };
}

describe('Vertal Mail · handler', () => {
  it('cria endereço, recusa reservado e repetido no limite', async () => {
    const { deps, db } = setup();
    const r = await handleMailbox({ op: 'address_create', localPart: 'laercio', displayName: 'Laércio' }, deps);
    expect(r.status).toBe(200);
    expect(db.tables.mailbox_addresses[0]).toMatchObject({ address: 'laercio@mail.vertal.dev', crm_feed: true, user_id: U });
    expect((await handleMailbox({ op: 'address_create', localPart: 'abuse' }, deps)).body.error).toBe('reserved_local_part');
  });

  it('envia pelo provedor existente com cabeçalhos de resposta e respeita o limite diário', async () => {
    const { deps, db, sent } = setup({}, {
      mailbox_addresses: [{ id: A1, user_id: U, address: 'laercio@mail.vertal.dev', local_part: 'laercio', domain: 'mail.vertal.dev', display_name: 'Laércio', active: true, crm_feed: true }],
      mailbox_messages: [{ id: IN1, user_id: U, address_id: A1, direction: 'in', folder: 'inbox', subject: 'Oi', message_id: '<x@globex.com>', references_header: null, created_at: '2026-01-01T00:00:00Z' }],
    });
    const r = await handleMailbox({ op: 'send', addressId: A1, to: 'Bob <bob@globex.com>', text: 'Olá Bob', replyToId: IN1 }, deps);
    expect(r.status).toBe(200);
    expect(sent[0]).toMatchObject({ from: 'Laércio <laercio@mail.vertal.dev>', to: ['Bob <bob@globex.com>'], subject: 'Re: Oi', text: 'Olá Bob' });
    expect((sent[0].headers as Record<string, string>)['In-Reply-To']).toBe('<x@globex.com>');
    expect(db.tables.mailbox_messages.find((m) => m.direction === 'out')).toMatchObject({ status: 'sent', provider_message_id: 'prov-1', folder: 'sent' });
    await handleMailbox({ op: 'send', addressId: A1, to: 'c@d.com', subject: 'x', text: 'y' }, deps);
    expect((await handleMailbox({ op: 'send', addressId: A1, to: 'c@d.com', subject: 'x', text: 'y' }, deps)).body.error).toBe('daily_send_cap');
  });

  it('respeita o limite diário global (todos os clientes somados) e a cota do provedor', async () => {
    const other = 'cccccccc-2222-4333-8444-555555555555';
    const { deps, sent } = setup({ cfg: { ...cfg, dailySendCap: 20, globalDailySendCap: 1 } }, {
      mailbox_addresses: [{ id: A1, user_id: U, address: 'laercio@mail.vertal.dev', local_part: 'laercio', domain: 'mail.vertal.dev', active: true }],
      mailbox_messages: [{ id: IN1, user_id: other, direction: 'out', folder: 'sent', status: 'sent', created_at: new Date().toISOString() }],
    });
    const r = await handleMailbox({ op: 'send', addressId: A1, to: 'c@d.com', subject: 's', text: 't' }, deps);
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('global_daily_send_cap');
    expect(sent.length).toBe(0);

    const q = setup({ fetch: (async () => new Response(JSON.stringify({ name: 'daily_quota_exceeded', message: 'You have reached your daily email sending quota.' }), { status: 429 })) as typeof fetch }, {
      mailbox_addresses: [{ id: A1, user_id: U, address: 'laercio@mail.vertal.dev', local_part: 'laercio', domain: 'mail.vertal.dev', active: true }],
    });
    expect((await handleMailbox({ op: 'send', addressId: A1, to: 'c@d.com', subject: 's', text: 't' }, q.deps)).body.error).toBe('global_daily_send_cap');
  });

  it('não envia por domínio não verificado', async () => {
    const { deps } = setup({ cfg: { ...cfg, outboundDomains: [] } }, {
      mailbox_addresses: [{ id: A1, user_id: U, address: 'x@mail.vertal.dev', local_part: 'x', domain: 'mail.vertal.dev', active: true }],
    });
    expect((await handleMailbox({ op: 'send', addressId: A1, to: 'c@d.com', subject: 's', text: 't' }, deps)).body.error).toBe('outbound_domain_not_verified');
  });

  it('só a conta Gmail marcada alimenta o CRM; contato + empresa + nota, sem duplicar', async () => {
    const { deps, db } = setup();
    // Desligada: nada entra.
    let r = await handleMailbox({ op: 'crm_sync' }, deps);
    expect(r.status).toBe(200);
    expect(db.tables.crm_notes ?? []).toHaveLength(0);
    expect((await handleMailbox({ op: 'feed_set', source: 'gmail', accountRef: G, enabled: true }, deps)).status).toBe(200);
    r = await handleMailbox({ op: 'crm_sync', source: 'gmail' }, deps);
    expect(r.status).toBe(200);
    expect(db.tables.crm_contacts).toHaveLength(1);
    expect(db.tables.crm_contacts[0]).toMatchObject({ first_name: 'Ana', last_name: 'Souza', source: 'email' });
    expect(db.tables.crm_companies[0]).toMatchObject({ name: 'Acme Tech' });
    expect(db.tables.crm_notes).toHaveLength(1);
    expect(db.tables.crm_notes[0]).toMatchObject({ source: 'email', external_ref: 'gmail:g1' });
    await handleMailbox({ op: 'crm_sync', source: 'gmail' }, deps);
    expect(db.tables.crm_notes).toHaveLength(1);
  });

  it('caixa profissional alimenta o CRM e marca como sincronizado', async () => {
    const { deps, db } = setup({}, {
      mailbox_addresses: [{ id: A1, user_id: U, address: 'laercio@mail.vertal.dev', domain: 'mail.vertal.dev', active: true, crm_feed: true, created_at: '2026-01-01' }],
      mailbox_messages: [{ id: IN1, user_id: U, address_id: A1, direction: 'in', folder: 'inbox', from_address: 'bob@globex.com', from_name: 'Bob Lee', to_addresses: [], subject: 'Parceria', text_body: 'Vamos?', crm_synced_at: null, created_at: '2026-11-26T10:00:00Z' }],
    });
    const r = await handleMailbox({ op: 'crm_sync', source: 'mailbox' }, deps);
    expect(r.status).toBe(200);
    expect(db.tables.crm_notes[0]).toMatchObject({ external_ref: `mailbox:${IN1}` });
    expect(db.tables.mailbox_messages[0].crm_synced_at).toBeTruthy();
  });

  it('CRM não liberado: não sincroniza', async () => {
    const { deps } = setup({ crmEnabled: false, crmFeed: undefined });
    expect((await handleMailbox({ op: 'crm_sync' }, deps)).body.error).toBe('crm_disabled');
  });

  it('Outlook usa a conexão do Fluxos e devolve as mensagens', async () => {
    const calls: unknown[] = [];
    const { deps } = setup({
      outlook: async (kind, key, parameters) => {
        calls.push({ kind, key, parameters });
        return { ok: true, data: [{ id: 'o1', subject: 'Oi', from: { emailAddress: { name: 'Ana', address: 'ana@acme.com' } } }] };
      },
    });
    const r = await handleMailbox({ op: 'outlook_list', top: 5 }, deps);
    expect(r.status).toBe(200);
    expect((r.body.messages as unknown[]).length).toBe(1);
    expect(calls[0]).toEqual({ kind: 'trigger', key: 'listMessages', parameters: { top: '5', unreadOnly: 'false' } });
  });
});
