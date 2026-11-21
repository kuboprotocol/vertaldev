import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { panelStepEvents } from './panelSteps';

const SID = '11111111-2222-4333-8444-555555555555';
const callNavigator = vi.fn();
vi.mock('./client', () => ({ callNavigator: (...args: unknown[]) => callNavigator(...args) }));

describe('Navigator F5: captcha pausa e entrega o controle ao usuário', () => {
  beforeEach(async () => {
    callNavigator.mockReset();
    (await import('./store')).__resetNavigatorStore();
    (await import('@/lib/consent/store')).__resetConsentStore();
  });
  afterEach(async () => {
    (await import('./store')).__resetNavigatorStore();
  });

  it('status com captcha: avisa no chat e chama "Assumir controle" (nunca resolve sozinho); ao devolver, segue', async () => {
    const store = await import('./store');
    const seen: string[] = [];
    const onCaptcha = (e: Event) => seen.push((e as CustomEvent<{ message: string }>).detail.message);
    window.addEventListener('vertal-navigator:captcha', onCaptcha);
    let captchaOn = true;
    callNavigator.mockImplementation(async (route: string) => {
      if (route === 'status') {
        return { ok: true, status: 'ok', agentStatus: captchaOn ? 'paused' : 'running', lastSeq: 2, events: [], sessionId: SID,
          captcha: captchaOn ? { url: 'https://site.com/login', host: 'site.com', since: 1 } : null };
      }
      if (route === 'takeover') return { ok: true, status: 'ok', controlUrl: 'https://6080-x/#ctl' };
      if (route === 'release') return { ok: true, status: 'ok' };
      return { ok: true, status: 'ok' };
    });
    store.__patchNavigatorStoreForTest({ sessionId: SID, agentStatus: 'running' });
    await store.poll();
    await Promise.resolve();
    expect(seen).toEqual(['Apareceu um captcha, resolva na tela ao vivo']);
    expect(callNavigator.mock.calls.some(([r]) => r === 'takeover')).toBe(true);
    await vi.waitFor(() => expect(store.getNavigatorState().takeover).toBe(true));
    expect(store.getNavigatorState().captcha?.host).toBe('site.com');
    // Usuário resolveu e devolveu: captcha some e a tarefa continua.
    captchaOn = false;
    await store.releaseNavigator();
    await store.poll();
    expect(store.getNavigatorState().captcha).toBeNull();
    expect(store.getNavigatorState().takeover).toBe(false);
    window.removeEventListener('vertal-navigator:captcha', onCaptcha);
  });

  it('tarefa pede o termo (consent_required): sem cartão montado não roda; assinado, repete uma vez', async () => {
    const store = await import('./store');
    const consent = await import('@/lib/consent/store');
    store.__patchNavigatorStoreForTest({ sessionId: SID });
    let tasks = 0;
    callNavigator.mockImplementation(async (route: string) => {
      if (route === 'task') {
        tasks++;
        return tasks === 1 ? { ok: false, status: 'consent_required', category: 'third_party_automation', version: 'v' } : { ok: false, status: 'busy' };
      }
      return { ok: true, status: 'ok', events: [], lastSeq: 0 };
    });
    const noHost = await store.runNavigatorTask('abra o site', undefined, { timeoutMs: 50 });
    expect(noHost.ok).toBe(false);
    expect(tasks).toBe(1);
    consent.consentHostMounted(1);
    tasks = 0;
    const p = store.runNavigatorTask('abra o site', undefined, { timeoutMs: 50 });
    await vi.waitFor(() => expect(consent.useConsentRequest).toBeDefined());
    await vi.waitFor(() => expect(tasks).toBe(1));
    consent.resolveConsent(true);
    await p;
    expect(tasks).toBe(2);
    consent.consentHostMounted(-1);
  });
});

describe('painel do Navigator: "Passos do agente" só da tarefa atual', () => {
  const events = [
    { seq: 1, ts: 0, type: 'step', runId: 'old', goal: 'tarefa anterior' },
    { seq: 2, ts: 0, type: 'done', runId: 'old', result: 'resposta anterior' },
    { seq: 3, ts: 0, type: 'step', runId: 'new', goal: 'tarefa nova' },
  ];
  it('ao iniciar a tarefa a lista fica vazia; depois mostra só os eventos do runId atual', () => {
    expect(panelStepEvents(events, { runId: 'old', baseSeq: 0 }, true)).toEqual([]);
    expect(panelStepEvents(events, { runId: 'new', baseSeq: 2 }, false).map((e) => e.seq)).toEqual([3]);
    // Mesmo com baseSeq antigo, o runId filtra a resposta da tarefa anterior.
    expect(panelStepEvents(events, { runId: 'new', baseSeq: 0 }, false).map((e) => e.seq)).toEqual([3]);
    // Sem tarefa nenhuma (painel recém-aberto): histórico da sessão como antes.
    expect(panelStepEvents(events, null, false)).toHaveLength(3);
  });
});
