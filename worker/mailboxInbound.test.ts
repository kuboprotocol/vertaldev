import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseAddress, handleInboundEmail, type InboundEmail } from './mailboxInbound';

const env = { SUPABASE_URL: 'https://db.example.co', SUPABASE_SECRET_KEY: 'sb_secret_x', MAILBOX_INBOUND_ENABLED: 'true' };
const RAW = 'From: Bob <bob@globex.com>\r\nTo: ana@mail.vertal.dev\r\nSubject: Oi\r\nMessage-ID: <m1@globex.com>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nOlá Ana\r\n';

function msg(to = 'ana+loja@mail.vertal.dev', raw = RAW): InboundEmail & { rejected: string | null } {
  const bytes = new TextEncoder().encode(raw);
  const m = {
    from: 'bounce@globex.com', to, rawSize: bytes.byteLength, headers: new Headers(),
    raw: new Response(bytes).body!, rejected: null as string | null,
    setReject(reason: string) { m.rejected = reason; },
  };
  return m;
}

afterEach(() => vi.unstubAllGlobals());

describe('Vertal Mail · recebimento no Worker', () => {
  it('subendereço cai na mesma caixa', () => {
    expect(baseAddress('Ana+Loja@Mail.Vertal.dev')).toBe('ana@mail.vertal.dev');
  });

  it('desligado por padrão: recusa sem tocar no banco', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const m = msg();
    expect(await handleInboundEmail(m, { ...env, MAILBOX_INBOUND_ENABLED: '' })).toBe('rejected_disabled');
    expect(m.rejected).toBeTruthy();
    expect(f).not.toHaveBeenCalled();
  });

  it('endereço desconhecido: recusa', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
    const m = msg();
    expect(await handleInboundEmail(m, env)).toBe('rejected_unknown');
    expect(m.rejected).toBe('Address not found');
  });

  it('guarda o e-mail decodificado na caixa do dono', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: URL | string, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
      if (String(url).includes('/mailbox_addresses')) return new Response(JSON.stringify([{ id: 'a1', user_id: 'u1' }]), { status: 200 });
      return new Response(null, { status: 201 });
    }));
    const m = msg();
    expect(await handleInboundEmail(m, env)).toBe('stored');
    expect(m.rejected).toBeNull();
    expect(calls[0].url).toContain('address=eq.ana%40mail.vertal.dev');
    const row = calls[1].body as Record<string, unknown>;
    expect(calls[1].method).toBe('POST');
    expect(row).toMatchObject({ user_id: 'u1', address_id: 'a1', from_address: 'bob@globex.com', subject: 'Oi', message_id: '<m1@globex.com>' });
    expect(String(row.text_body)).toContain('Olá Ana');
  });

  it('reentrega do mesmo Message-ID não duplica', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL | string) => {
      if (String(url).includes('/mailbox_addresses')) return new Response(JSON.stringify([{ id: 'a1', user_id: 'u1' }]), { status: 200 });
      return new Response('{"code":"23505","message":"duplicate key"}', { status: 409 });
    }));
    expect(await handleInboundEmail(msg(), env)).toBe('duplicate');
  });

  it('endereço que não é do Vertal Mail segue para o encaminhamento de antes (opcional)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
    const m = msg('contato@vertal.dev') as ReturnType<typeof msg> & { forwarded?: string };
    m.forward = async (to: string) => { m.forwarded = to; };
    expect(await handleInboundEmail(m, { ...env, MAILBOX_FALLBACK_FORWARD: 'dono@gmail.com' })).toBe('forwarded');
    expect(m.forwarded).toBe('dono@gmail.com');
    expect(m.rejected).toBeNull();
  });
});
