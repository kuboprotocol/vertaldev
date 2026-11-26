import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_BILLING, type NoticeMessage } from '../../../../supabase/functions/_shared/vertalCodeAi/billing';
import {
  crmParams,
  type LowCreditDeps,
  logNoticeToCrm,
  maybeNotifyLowCredit,
} from '../../../../supabase/functions/_shared/vertalCodeAi/lowCreditNotice';

// Tudo falso: nenhum e-mail real sai daqui.
function fakeDeps(over: Partial<LowCreditDeps> = {}) {
  const claimed = new Set<string>();
  const sent: Array<{ to: string; msg: NoticeMessage; key: string }> = [];
  const crmLogged: NoticeMessage[] = [];
  const deps: LowCreditDeps = {
    lastTopUp: async () => ({ id: 'top1', credits: 100 }),
    alreadyNotified: async (u, k) => claimed.has(`${u}:${k}`),
    claim: async (u, k) => {
      if (claimed.has(`${u}:${k}`)) return false;
      claimed.add(`${u}:${k}`);
      return true;
    },
    account: async () => ({ email: 'dev@example.com', name: 'Dev', localeHints: ['pt-BR'] }),
    email: async (to, msg, key) => {
      sent.push({ to, msg, key });
    },
    crm: async (_u, msg) => {
      crmLogged.push(msg);
      return 'logged';
    },
    ...over,
  };
  return { deps, sent, crmLogged, claimed };
}

const ALL = { enabled: true, email: true, crm: true };

describe('aviso de crédito baixo', () => {
  it('desligado por padrão: nada acontece', async () => {
    const { deps, sent } = fakeDeps();
    const r = await maybeNotifyLowCredit(DEFAULT_BILLING, { enabled: false, email: true, crm: true }, deps, { userId: 'u', balanceCredits: 1 });
    expect(r.status).toBe('disabled');
    expect(sent).toHaveLength(0);
  });

  it('acima de 30%: não avisa', async () => {
    const { deps, sent } = fakeDeps();
    const r = await maybeNotifyLowCredit(DEFAULT_BILLING, ALL, deps, { userId: 'u', balanceCredits: 31 });
    expect(r.status).toBe('skipped');
    expect(sent).toHaveLength(0);
  });

  it('a 30%: in-app + e-mail + CRM, em pt-BR, UMA vez por recarga', async () => {
    const { deps, sent, crmLogged } = fakeDeps();
    const r1 = await maybeNotifyLowCredit(DEFAULT_BILLING, ALL, deps, { userId: 'u', balanceCredits: 30 });
    expect(r1.status).toBe('sent');
    expect(r1.locale).toBe('pt-BR');
    expect(r1.channels).toEqual({ inApp: 'sent', email: 'sent', crm: 'logged' });
    expect(sent[0].to).toBe('dev@example.com');
    expect(sent[0].msg.subject).toBe('Seus créditos da Vertal estão acabando');
    expect(sent[0].key).toBe('vertal-low-credit-u-topup:top1');
    expect(crmLogged).toHaveLength(1);
    // continua gastando no mesmo ciclo: nada novo
    const r2 = await maybeNotifyLowCredit(DEFAULT_BILLING, ALL, deps, { userId: 'u', balanceCredits: 5 });
    expect(r2.status).toBe('skipped');
    expect(sent).toHaveLength(1);
  });

  it('nova recarga = novo ciclo = pode avisar de novo', async () => {
    let top = { id: 'top1', credits: 100 };
    const { deps, sent } = fakeDeps({ lastTopUp: async () => top });
    await maybeNotifyLowCredit(DEFAULT_BILLING, ALL, deps, { userId: 'u', balanceCredits: 10 });
    top = { id: 'top2', credits: 500 };
    await maybeNotifyLowCredit(DEFAULT_BILLING, ALL, deps, { userId: 'u', balanceCredits: 150 });
    expect(sent.map((s) => s.key)).toEqual(['vertal-low-credit-u-topup:top1', 'vertal-low-credit-u-topup:top2']);
  });

  it('corrida: se outro pedido reservou o ciclo, não manda e-mail', async () => {
    const { deps, sent } = fakeDeps({ claim: async () => false });
    const r = await maybeNotifyLowCredit(DEFAULT_BILLING, ALL, deps, { userId: 'u', balanceCredits: 1 });
    expect(r.status).toBe('skipped');
    expect(sent).toHaveLength(0);
  });

  it('idioma desconhecido → inglês; sem CRM → pula em silêncio; e-mail falhando não derruba', async () => {
    const log = vi.fn();
    const { deps } = fakeDeps({
      account: async () => ({ email: 'x@example.com', name: null, localeHints: [] }),
      email: async () => {
        throw new Error('provider down');
      },
      crm: async () => 'skipped',
      log,
    });
    const r = await maybeNotifyLowCredit(DEFAULT_BILLING, ALL, deps, { userId: 'u', balanceCredits: 2 });
    expect(r.status).toBe('sent');
    expect(r.locale).toBe('en');
    expect(r.channels).toEqual({ inApp: 'sent', email: 'failed', crm: 'skipped' });
    expect(log).toHaveBeenCalled();
  });

  it('e-mail e CRM têm interruptores próprios', async () => {
    const { deps, sent, crmLogged } = fakeDeps();
    const r = await maybeNotifyLowCredit(DEFAULT_BILLING, { enabled: true, email: false, crm: false }, deps, { userId: 'u', balanceCredits: 2 });
    expect(r.channels).toEqual({ inApp: 'sent', email: 'off', crm: 'off' });
    expect(sent).toHaveLength(0);
    expect(crmLogged).toHaveLength(0);
  });

  it('nunca lança, mesmo com dependência quebrada', async () => {
    const { deps } = fakeDeps({ lastTopUp: async () => Promise.reject(new Error('db')) });
    await expect(maybeNotifyLowCredit(DEFAULT_BILLING, ALL, deps, { userId: 'u', balanceCredits: 2 })).resolves.toEqual({ status: 'skipped' });
  });
});

describe('aviso no CRM via Vertal Fluxos', () => {
  const msg = { locale: 'en', subject: 'S', title: 'S', text: 'T', html: '' } as NoticeMessage;

  it('preenche só campos conhecidos; obrigatório desconhecido → pula', () => {
    expect(crmParams([{ key: 'subject', required: true }, { key: 'note' }], msg)).toEqual({ subject: 'S', note: 'T' });
    expect(crmParams([{ key: 'subject' }, { key: 'dealId', required: true }], msg)).toBeNull();
    expect(crmParams([{ key: 'foo' }], msg)).toBeNull();
  });

  it('usa a 1ª ação disponível do CRM conectado; sem conexão → skipped', async () => {
    const calls: unknown[] = [];
    const engine = {
      call: vi.fn(async (method: string, path: string, body?: unknown) => {
        calls.push([method, path, body]);
        if (method === 'GET') return { status: 200, data: { actions: [{ key: 'createActivity', arguments: [{ key: 'subject', required: true }, { key: 'note' }] }] } };
        return { status: 200, data: { ok: true } };
      }),
    };
    const r = await logNoticeToCrm(engine, [{ app_key: 'pipedrive', status: 'connected', fluxos_connection_id: 'c1' }], msg);
    expect(r).toBe('logged');
    expect(calls[1]).toEqual(['POST', '/run', { appKey: 'pipedrive', kind: 'action', key: 'createActivity', connectionId: 'c1', parameters: { subject: 'S', note: 'T' } }]);
    expect(await logNoticeToCrm(engine, [], msg)).toBe('skipped');
    expect(await logNoticeToCrm(null, [{ app_key: 'pipedrive', status: 'connected', fluxos_connection_id: 'c1' }], msg)).toBe('skipped');
    expect(await logNoticeToCrm(engine, [{ app_key: 'pipedrive', status: 'expired', fluxos_connection_id: 'c1' }], msg)).toBe('skipped');
  });
});
