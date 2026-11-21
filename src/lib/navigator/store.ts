// Estado do Vertal Navigator no navegador do usuário: uma sessão por vez, um
// único "poller" de /status compartilhado pelo painel, pelo cartão de aprovação
// e pelo executor do chat (que espera a tarefa terminar).
import { useSyncExternalStore } from 'react';
import { callNavigator, type NavigatorResponse } from './client';
import { NAVIGATOR_MESSAGES, type NavigatorEvent, type NavigatorPending } from './navigatorCore';

export type AgentStatus = NonNullable<NavigatorResponse['agentStatus']>;

export interface NavigatorState {
  sessionId: string | null;
  liveViewUrl: string | null;
  controlUrl: string | null;
  takeover: boolean;
  agentStatus: AgentStatus | 'none';
  runId: string | null;
  events: NavigatorEvent[];
  lastSeq: number;
  pending: NavigatorPending[];
  filling: Array<{ name?: string; host?: string }>;
  screenshot: string | null;
  url: string | null;
  billedMinutes: number;
  creditsPerMinute: number;
  busy: boolean;
  error: string | null;
  /** Painéis montados agora (o cartão global só pede o código 2FA se nenhum estiver aberto). */
  panelsMounted: number;
}

const INITIAL: NavigatorState = {
  sessionId: null, liveViewUrl: null, controlUrl: null, takeover: false, agentStatus: 'none', runId: null,
  events: [], lastSeq: 0, pending: [], filling: [], screenshot: null, url: null, billedMinutes: 0, creditsPerMinute: 1,
  busy: false, error: null, panelsMounted: 0,
};

let state: NavigatorState = INITIAL;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let polling = false;
const waiters = new Map<string, (event: NavigatorEvent | null) => void>();

function set(patch: Partial<NavigatorState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function getNavigatorState(): NavigatorState {
  return state;
}

export function subscribeNavigator(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNavigator(): NavigatorState {
  return useSyncExternalStore(subscribeNavigator, getNavigatorState, getNavigatorState);
}

export function panelMounted(delta: 1 | -1) {
  set({ panelsMounted: Math.max(0, state.panelsMounted + delta) });
}

/** Pede ao Vertal Chat para abrir o painel do navegador ao lado. */
export function requestNavigatorPanel() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vertal-navigator:open'));
}

const messageOf = (res: NavigatorResponse) => res.message || NAVIGATOR_MESSAGES[res.status as Exclude<typeof res.status, 'ok'>] || NAVIGATOR_MESSAGES.error;

function applySession(res: NavigatorResponse) {
  set({
    sessionId: res.sessionId ?? state.sessionId,
    liveViewUrl: res.liveViewUrl ?? state.liveViewUrl,
    billedMinutes: res.billedMinutes ?? state.billedMinutes,
    creditsPerMinute: res.creditsPerMinute ?? state.creditsPerMinute,
  });
}

function ended(message: string) {
  stopPolling();
  for (const [, resolve] of waiters) resolve(null);
  waiters.clear();
  set({ ...INITIAL, panelsMounted: state.panelsMounted, error: message });
}

function schedule() {
  if (timer) clearTimeout(timer);
  if (!state.sessionId) return;
  const active = state.agentStatus === 'running' || state.agentStatus === 'waiting' || state.pending.length > 0;
  timer = setTimeout(() => void poll(), active ? 1_500 : state.panelsMounted > 0 ? 5_000 : 15_000);
}

function stopPolling() {
  if (timer) clearTimeout(timer);
  timer = null;
}

export async function poll(): Promise<void> {
  if (!state.sessionId || polling) return;
  polling = true;
  try {
    const res = await callNavigator('status', { sessionId: state.sessionId, after: state.lastSeq });
    if (!res.ok) {
      if (res.status === 'session_ended' || res.status === 'no_session' || res.status === 'insufficient_credits') ended(messageOf(res));
      else set({ error: messageOf(res) });
      return;
    }
    applySession(res);
    const fresh = res.events ?? [];
    const events = [...state.events, ...fresh].slice(-200);
    set({
      events, lastSeq: res.lastSeq ?? state.lastSeq, pending: res.pending ?? [], filling: res.filling ?? [],
      screenshot: res.screenshot ?? state.screenshot, url: res.url ?? state.url, takeover: !!res.takeover,
      agentStatus: res.agentStatus ?? state.agentStatus, runId: res.runId ?? state.runId, error: null,
    });
    if ((res.pending ?? []).some((p) => p.kind === 'code' || p.kind === 'text')) requestNavigatorPanel();
    for (const ev of fresh) {
      if (ev.type !== 'done') continue;
      for (const [runId, resolve] of waiters) {
        resolve(ev);
        waiters.delete(runId);
      }
    }
  } finally {
    polling = false;
    schedule();
  }
}

/** Abre (ou reaproveita) o navegador do usuário. */
export async function startNavigator(url?: string): Promise<NavigatorResponse> {
  set({ busy: true, error: null });
  const res = await callNavigator('start', url ? { url } : {});
  set({ busy: false });
  if (!res.ok) {
    set({ error: messageOf(res) });
    return res;
  }
  const changed = res.sessionId !== state.sessionId;
  if (changed) set({ ...INITIAL, panelsMounted: state.panelsMounted });
  applySession(res);
  set({ agentStatus: state.agentStatus === 'none' ? 'idle' : state.agentStatus });
  void poll();
  return res;
}

export interface TaskOutcome {
  ok: boolean;
  message: string;
  result?: string;
  steps: number;
  url?: string | null;
}

/** Envia uma tarefa e espera ela terminar (passos chegam pelo poller). */
export async function runNavigatorTask(task: string, url?: string, opts: { timeoutMs?: number; maxSteps?: number } = {}): Promise<TaskOutcome> {
  if (!state.sessionId) {
    const started = await startNavigator();
    if (!started.ok) return { ok: false, message: messageOf(started), steps: 0 };
  }
  const res = await callNavigator('task', { sessionId: state.sessionId, task, ...(url ? { url } : {}), ...(opts.maxSteps ? { maxSteps: opts.maxSteps } : {}) });
  if (!res.ok) return { ok: false, message: messageOf(res), steps: 0 };
  const runId = res.runId ?? 'run';
  const firstSeq = state.lastSeq;
  set({ agentStatus: 'running', runId });
  void poll();
  const done = await new Promise<NavigatorEvent | null>((resolve) => {
    waiters.set(runId, resolve);
    setTimeout(() => {
      if (waiters.get(runId) === resolve) {
        waiters.delete(runId);
        resolve(null);
      }
    }, opts.timeoutMs ?? 20 * 60_000);
  });
  const steps = state.events.filter((e) => e.seq > firstSeq && e.type === 'step').length;
  if (!done) return { ok: false, message: 'A tarefa do navegador não terminou a tempo (ou a sessão foi encerrada).', steps, url: state.url };
  const result = typeof done.result === 'string' ? done.result : '';
  return { ok: done.success === true, message: result || (done.success ? 'Tarefa concluída.' : 'A tarefa não foi concluída.'), result, steps, url: state.url };
}

export async function answerNavigator(p: NavigatorPending, answer: { approve: boolean } | { value: string }): Promise<NavigatorResponse> {
  if (!state.sessionId) return { ok: false, status: 'no_session', message: NAVIGATOR_MESSAGES.no_session };
  const body = 'approve' in answer
    // confirmed: true só sai daqui, do clique do usuário no cartão.
    ? { sessionId: state.sessionId, requestId: p.id, kind: 'approval', approve: answer.approve, ...(answer.approve ? { confirmed: true } : {}) }
    : { sessionId: state.sessionId, requestId: p.id, kind: p.kind, value: answer.value };
  const res = await callNavigator('input', body);
  set({ pending: state.pending.filter((x) => x.id !== p.id) });
  void poll();
  return res;
}

export async function takeoverNavigator(): Promise<NavigatorResponse> {
  if (!state.sessionId) return { ok: false, status: 'no_session' };
  const res = await callNavigator('takeover', { sessionId: state.sessionId });
  if (res.ok) set({ takeover: true, controlUrl: res.controlUrl ?? null });
  else set({ error: messageOf(res) });
  return res;
}

export async function releaseNavigator(): Promise<NavigatorResponse> {
  if (!state.sessionId) return { ok: false, status: 'no_session' };
  const res = await callNavigator('release', { sessionId: state.sessionId });
  if (res.ok) set({ takeover: false, controlUrl: null });
  else set({ error: messageOf(res) });
  void poll();
  return res;
}

export async function stopNavigator(): Promise<NavigatorResponse> {
  if (!state.sessionId) return { ok: true, status: 'ok' };
  set({ busy: true });
  const res = await callNavigator('stop', { sessionId: state.sessionId });
  ended('');
  set({ error: null });
  return res;
}

/** Só para testes. */
export function __resetNavigatorStore() {
  stopPolling();
  waiters.clear();
  state = INITIAL;
}
