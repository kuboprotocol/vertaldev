import { describe, expect, it, vi } from 'vitest';
import { welcomeConfig } from '../../../../supabase/functions/_shared/vertalWelcome/welcomeEmail';
import { runWelcomeV2, type WelcomeDeps, type WelcomeUser } from '../../../../supabase/functions/_shared/vertalWelcome/welcomeFlow';

const NOW = Date.parse('2026-11-26T15:00:00Z');
const cfg = welcomeConfig({ VERTAL_GPU_CONFIG: JSON.stringify({ VERTAL_WELCOME_EMAIL: { enabled: true } }) })!;
const user = (over: Partial<WelcomeUser> = {}): WelcomeUser => ({
  id: '11111111-2222-4333-8444-555555555555',
  email: 'ana@example.test',
  createdAt: '2026-11-26T14:00:00Z',
  emailConfirmedAt: '2026-11-26T14:05:00Z',
  meta: { display_name: 'Ana Souza' },
  ...over,
});

/** Dublês: nada sai para a rede, o "envio" só fica registrado na memória. */
function fakeDeps(sentLog: Set<string> = new Set()) {
  const sends: Parameters<WelcomeDeps['send']>[0][] = [];
  const logs: Parameters<WelcomeDeps['log']>[0][] = [];
  const deps: WelcomeDeps = {
    alreadySent: vi.fn(async (r: string) => sentLog.has(r)),
    send: vi.fn(async (input) => {
      sends.push(input);
      return { sent: true };
    }),
    log: vi.fn(async (e) => {
      logs.push(e);
      if (e.status === 'sent') sentLog.add(e.recipient);
    }),
    now: () => NOW,
  };
  return { deps, sends, logs };
}

describe('welcome v2 · fluxo', () => {
  it('envia uma vez com assunto, reply-to, remetente "Vertal" e chave de idempotência por usuário', async () => {
    const { deps, sends, logs } = fakeDeps();
    expect(await runWelcomeV2(cfg, user(), deps)).toEqual({ status: 'sent' });
    expect(sends).toHaveLength(1);
    expect(sends[0]).toMatchObject({
      to: 'ana@example.test',
      fromName: 'Vertal',
      replyTo: 'support@kubovibe.dev',
      idempotencyKey: 'vertal-welcome-11111111-2222-4333-8444-555555555555',
      label: 'vertal_welcome',
    });
    expect(sends[0].email.subject).toBe('Welcome to Vertal Dev, Ana');
    expect(logs).toEqual([{ status: 'sent', recipient: 'ana@example.test' }]);
  });

  it('dedupe: segunda chamada (cadastro + confirmação, duas abas…) não envia de novo', async () => {
    const shared = new Set<string>();
    const a = fakeDeps(shared);
    const b = fakeDeps(shared);
    expect((await runWelcomeV2(cfg, user(), a.deps)).status).toBe('sent');
    expect(await runWelcomeV2(cfg, user(), b.deps)).toEqual({ status: 'skipped', reason: 'already_sent' });
    expect(b.sends).toHaveLength(0);
  });

  it('dedupe também contra o "welcome" antigo', async () => {
    const { deps, sends } = fakeDeps(new Set(['ana@example.test']));
    expect(await runWelcomeV2(cfg, user(), deps)).toEqual({ status: 'skipped', reason: 'already_sent' });
    expect(deps.alreadySent).toHaveBeenCalledWith('ana@example.test', ['vertal_welcome', 'welcome']);
    expect(sends).toHaveLength(0);
  });

  it('espera a confirmação do e-mail', async () => {
    const { deps, sends } = fakeDeps();
    expect(await runWelcomeV2(cfg, user({ emailConfirmedAt: null }), deps)).toEqual({ status: 'skipped', reason: 'awaiting_confirmation' });
    expect(sends).toHaveLength(0);
  });

  it('não envia para conta antiga (fora da janela de 7 dias) nem sem e-mail', async () => {
    const { deps, sends } = fakeDeps();
    expect((await runWelcomeV2(cfg, user({ createdAt: '2026-11-10T00:00:00Z' }), deps)).status).toBe('skipped');
    expect((await runWelcomeV2(cfg, user({ createdAt: null }), deps)).status).toBe('skipped');
    expect((await runWelcomeV2(cfg, user({ email: null }), deps)).status).toBe('skipped');
    expect(sends).toHaveLength(0);
  });

  it('suprimido e falha ficam no log, sem exceção', async () => {
    const s = fakeDeps();
    s.deps.send = vi.fn(async () => ({ sent: false, reason: 'recipient_suppressed' }));
    expect(await runWelcomeV2(cfg, user(), s.deps)).toEqual({ status: 'skipped', reason: 'suppressed' });
    expect(s.logs).toEqual([{ status: 'suppressed', recipient: 'ana@example.test' }]);
    const f = fakeDeps();
    f.deps.send = vi.fn(async () => {
      throw new Error('boom');
    });
    expect(await runWelcomeV2(cfg, user(), f.deps)).toEqual({ status: 'failed', error: 'boom' });
    expect(f.logs).toEqual([{ status: 'failed', recipient: 'ana@example.test', error: 'boom' }]);
  });
});
