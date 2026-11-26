import { describe, expect, it } from 'vitest';
import {
  checkNewAddress, companyFromEmail, crmNoteText, htmlToText, inboundRow, isMailboxEnabled, mailboxConfig,
  parseAddress, parseAddressList, replySubject, splitName, threadKeyOf, toCrmItem,
} from '../../../supabase/functions/_shared/vertalMailbox/core';

const U = '5441b397-7be8-44fc-87e8-8057fdb79a0e';
const cfgJson = (o: Record<string, unknown>) => JSON.stringify({ VERTAL_MAILBOX: o });

describe('Vertal Mail · flag (dentro de VERTAL_GPU_CONFIG)', () => {
  it('desligado por padrão e só para a lista', () => {
    expect(mailboxConfig({})).toBeNull();
    expect(isMailboxEnabled({}, U)).toBe(false);
    expect(isMailboxEnabled({ VERTAL_GPU_CONFIG: cfgJson({ enabled: true, userIds: [] }) }, U)).toBe(false);
    expect(isMailboxEnabled({ VERTAL_GPU_CONFIG: cfgJson({ enabled: false, userIds: [U] }) }, U)).toBe(false);
    expect(isMailboxEnabled({ VERTAL_GPU_CONFIG: cfgJson({ enabled: true, userIds: [U] }) }, U)).toBe(true);
    expect(isMailboxEnabled({ VERTAL_GPU_CONFIG: cfgJson({ enabled: true, userIds: [U] }) }, 'outro')).toBe(false);
    expect(isMailboxEnabled({ VERTAL_GPU_CONFIG: cfgJson({ enabled: true, userIds: ['*'] }) }, U)).toBe(true);
  });
  it('segredo avulso vence; domínios inválidos caem; limite diário com teto', () => {
    const c = mailboxConfig({
      VERTAL_MAILBOX: JSON.stringify({ enabled: 'true', userIds: [U], aliasDomains: ['Mail.Vertal.dev', 'x', 'bad domain'], dailySendCap: 9999 }),
      VERTAL_GPU_CONFIG: cfgJson({ enabled: false }),
    })!;
    expect(c.aliasDomains).toEqual(['mail.vertal.dev']);
    expect(c.dailySendCap).toBe(500);
    expect(c.crmFeedDefault).toBe(true);
  });
});

describe('Vertal Mail · endereços', () => {
  const cfg = mailboxConfig({ VERTAL_MAILBOX: JSON.stringify({ enabled: true, userIds: [U], aliasDomains: ['mail.vertal.dev'] }) })!;
  it('valida nome e domínio', () => {
    expect(checkNewAddress('ana.silva', undefined, cfg)).toEqual({ ok: true, localPart: 'ana.silva', domain: 'mail.vertal.dev', address: 'ana.silva@mail.vertal.dev' });
    expect(checkNewAddress('Ana', 'mail.vertal.dev', cfg)).toMatchObject({ ok: true, address: 'ana@mail.vertal.dev' });
    expect(checkNewAddress('ab', null, cfg)).toEqual({ ok: false, error: 'invalid_local_part' });
    expect(checkNewAddress('a..b', null, cfg)).toEqual({ ok: false, error: 'invalid_local_part' });
    expect(checkNewAddress('postmaster', null, cfg)).toEqual({ ok: false, error: 'reserved_local_part' });
    expect(checkNewAddress('ana', 'gmail.com', cfg)).toEqual({ ok: false, error: 'domain_not_allowed' });
    expect(checkNewAddress('ana', null, { ...cfg, aliasDomains: [] })).toEqual({ ok: false, error: 'no_alias_domain' });
  });
  it('lê endereços e listas', () => {
    expect(parseAddress('Ana Silva <ANA@Acme.com>')).toEqual({ name: 'Ana Silva', email: 'ana@acme.com' });
    expect(parseAddress('"Ana" <ana@acme.com>')).toEqual({ name: 'Ana', email: 'ana@acme.com' });
    expect(parseAddress('nada')).toBeNull();
    expect(parseAddressList('a@x.com, B <b@y.com>; a@x.com, ruim').map((a) => a.email)).toEqual(['a@x.com', 'b@y.com']);
    expect(replySubject('Re: Oi')).toBe('Re: Oi');
    expect(replySubject('Oi\r\nBcc: x@y.com')).toBe('Re: Oi Bcc: x@y.com');
    expect(threadKeyOf('<c>', '<b>', '<a> <b>')).toBe('<a>');
    expect(threadKeyOf('<c>', null, null)).toBe('<c>');
    expect(htmlToText('<p>Olá&nbsp;<b>mundo</b></p><script>x()</script>')).toBe('Olá mundo');
  });
});

describe('Vertal Mail · CRM (sem IA)', () => {
  it('empresa pelo domínio, nunca de e-mail pessoal', () => {
    expect(companyFromEmail('ana@acme-tech.com.br')).toEqual({ name: 'Acme Tech', domain: 'acme-tech.com.br' });
    expect(companyFromEmail('joe@sub.globex.com')).toEqual({ name: 'Globex', domain: 'sub.globex.com' });
    expect(companyFromEmail('ana@gmail.com')).toBeNull();
    expect(companyFromEmail('ana@hotmail.com')).toBeNull();
  });
  it('nome em primeiro/último', () => {
    expect(splitName('Ana Maria Silva', 'a@x.com')).toEqual({ first_name: 'Ana Maria', last_name: 'Silva' });
    expect(splitName('', 'joao.souza@x.com')).toEqual({ first_name: 'Joao souza', last_name: '' });
  });
  it('item do CRM: recebido usa o remetente; enviado usa o destinatário; ignora automático e o próprio', () => {
    const base = { ref: 'm1', source: 'gmail' as const, account: 'eu@gmail.com', subject: 'Proposta', text: 'Olá', date: '2026-11-26T10:00:00Z', ownEmails: ['eu@gmail.com'] };
    expect(toCrmItem({ ...base, direction: 'in', from: 'Ana <ana@acme.com>', to: 'eu@gmail.com' })?.counterpart).toEqual({ name: 'Ana', email: 'ana@acme.com' });
    expect(toCrmItem({ ...base, direction: 'out', from: 'eu@gmail.com', to: 'Bob <bob@globex.com>' })?.counterpart.email).toBe('bob@globex.com');
    expect(toCrmItem({ ...base, direction: 'in', from: 'no-reply@acme.com', to: '' })).toBeNull();
    expect(toCrmItem({ ...base, direction: 'in', from: 'eu@gmail.com', to: '' })).toBeNull();
    const it = toCrmItem({ ...base, direction: 'in', from: 'Ana <ana@acme.com>', to: '' })!;
    expect(crmNoteText(it)).toContain('Proposta');
    expect(crmNoteText(it)).toContain('Gmail · eu@gmail.com');
  });
});

describe('Vertal Mail · recebimento', () => {
  it('monta a linha da caixa a partir do e-mail decodificado', () => {
    const row = inboundRow({
      userId: U, addressId: 'a1', envelopeFrom: 'bounce@x.com', envelopeTo: 'ana@mail.vertal.dev', rawSize: 1234,
      parsed: {
        from: { name: 'Bob', address: 'Bob@Globex.com' }, to: [{ name: '', address: 'ana@mail.vertal.dev' }],
        subject: 'Oi\nBcc: hack', html: '<p>Olá</p>', messageId: '<m1@globex.com>', references: '<r0@x> <r1@x>',
        attachments: [{ filename: 'a.pdf', mimeType: 'application/pdf', content: new Uint8Array(10) }],
      },
    });
    expect(row).toMatchObject({
      user_id: U, address_id: 'a1', direction: 'in', folder: 'inbox', from_address: 'bob@globex.com', from_name: 'Bob',
      subject: 'Oi Bcc: hack', text_body: 'Olá', thread_key: '<r0@x>', has_attachments: true, size_bytes: 1234,
    });
    expect(row.attachments).toEqual([{ filename: 'a.pdf', mimeType: 'application/pdf', size: 10 }]);
  });
});
