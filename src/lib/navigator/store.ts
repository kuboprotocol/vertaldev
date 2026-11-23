// Estado do Vertal Navigator no navegador do usuário: uma sessão por vez, um
// único "poller" de /status compartilhado pelo painel, pelo cartão de aprovação
// e pelo executor do chat (que espera a tarefa terminar).
import { useSyncExternalStore } from 'react';
import { callNavigator, type NavigatorResponse } from './client';
import { NAVIGATOR_MESSAGES, eventsForTask, isDoneForTask, looksLikeCredentials, type NavigatorEvent, type NavigatorPending } from './navigatorCore';

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
  filling: Array<{ name?: string; host?: string; kind?: string }>;
  screenshot: string | null;
  url: string | null;
  billedMinutes: number;
  creditsPerMinute: number;
  busy: boolean;
  error: string | null;
  /** Painéis montados agora (o cartão global só pede o código 2FA se nenhum estiver aberto). */
  panelsMounted: number;
  /** Cartões no chat do Vibe Code que mostram a aprovação de pagamento inline (fase 4). */
  inlineApprovalHosts: number;
  /** Tarefa em andamento (fase 4): passos e resposta são só desta tarefa. */
  currentTask: CurrentTask | null;
  /** Recibos de ações automáticas (pagamento dentro do teto, envio no modo "automatizar tudo"). */
  receipts: NavigatorReceipt[];
}

export interface NavigatorReceipt {
  kind: 'payment' | 'write';
  store?: string;
  total?: string;
  totalCents?: number;
  currency?: string;
  recurring?: boolean;
  source?: string;
  limit?: string;
  target?: string;
  url?: string;
  at: string;
}

export interface CurrentTask {
  /** Id local da tarefa (o cartão do chat guarda este id). */
  id: string;
  task: string;
  url?: string;
  runId: string | null;
  /** Último seq conhecido antes da tarefa: eventos anteriores são de outra tarefa/conversa. */
  baseSeq: number;
  startedAt: number;
  /** Quem pediu (ex.: 'vibe-code', 'vertal-chat'). */
  origin?: string;
}

const INITIAL: NavigatorState = {
  sessionId: null, liveViewUrl: null, controlUrl: null, takeover: false, agentStatus: 'none', runId: null,
  events: [], lastSeq: 0, pending: [], filling: [], screenshot: null, url: null, billedMinutes: 0, creditsPerMinute: 1,
  busy: false, error: null, panelsMounted: 0, inlineApprovalHosts: 0, currentTask: null, receipts: [],
};

let state: NavigatorState = INITIAL;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let polling = false;
let inflight: Promise<void> | null = null;
interface Waiter { runId: string; baseSeq: number; resolve: (event: NavigatorEvent | null) => void }
const waiters = new Map<string, Waiter>();

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

/** Cartão inline (Vibe Code) que mostra a aprovação de pagamento: o diálogo global não duplica. */
export function inlineApprovalMounted(delta: 1 | -1) {
  set({ inlineApprovalHosts: Math.max(0, state.inlineApprovalHosts + delta) });
}

/** Eventos da tarefa atual (ou de uma tarefa dada). */
export function currentTaskEvents(st: NavigatorState = state, task: CurrentTask | null = st.currentTask): NavigatorEvent[] {
  return eventsForTask(st.events, task);
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
  for (const [, w] of waiters) w.resolve(null);
  waiters.clear();
  set({ ...INITIAL, panelsMounted: state.panelsMounted, inlineApprovalHosts: state.inlineApprovalHosts, error: message });
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
  if (!state.sessionId) return;
  // Já tem uma consulta em andamento: espera ela (quem chamou quer o estado em dia).
  if (polling && inflight) return inflight;
  polling = true;
  inflight = (async () => {
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
        ...(res.receipts?.length ? { receipts: [...state.receipts, ...(res.receipts as unknown as NavigatorReceipt[])].slice(-20) } : {}),
      });
      // Pedido do agente (código, login, telefone, pergunta): o cartão inline do chat mostra. Só abre o
      // painel lateral se não houver nenhum cartão/painel montado para responder.
      if (state.inlineApprovalHosts === 0 && state.panelsMounted === 0 && (res.pending ?? []).some((p) => ['code', 'text', 'login', 'phone'].includes(p.kind))) requestNavigatorPanel();
      // Só o "done" DESTA tarefa resolve quem espera (fase 4: nada de resposta de outra conversa).
      for (const ev of fresh) {
        if (ev.type !== 'done') continue;
        for (const [key, w] of waiters) {
          if (!isDoneForTask(ev, w)) continue;
          w.resolve(ev);
          waiters.delete(key);
        }
      }
    } finally {
      polling = false;
      inflight = null;
      schedule();
    }
  })();
  return inflight;
}

/** Falhas de abertura que valem uma nova tentativa silenciosa (o sandbox não subiu a tempo). */
const RETRYABLE_START = new Set(['sandbox_error', 'error']);

/** Abre (ou reaproveita) o navegador do usuário. Fase 4: tenta de novo, em silêncio, uma vez. */
export async function startNavigator(url?: string, opts: { retryDelayMs?: number } = {}): Promise<NavigatorResponse> {
  set({ busy: true, error: null });
  let res = await callNavigator('start', url ? { url } : {});
  if (!res.ok && RETRYABLE_START.has(res.status)) {
    await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 1_500));
    res = await callNavigator('start', url ? { url } : {});
  }
  set({ busy: false });
  if (!res.ok) {
    set({ error: messageOf(res) });
    return res;
  }
  const changed = res.sessionId !== state.sessionId;
  if (changed) set({ ...INITIAL, panelsMounted: state.panelsMounted, inlineApprovalHosts: state.inlineApprovalHosts });
  applySession(res);
  set({ agentStatus: state.agentStatus === 'none' ? 'idle' : state.agentStatus });
  // Sessão reaproveitada: sincroniza os eventos antigos ANTES de qualquer tarefa nova.
  await poll();
  return res;
}

export interface TaskOutcome {
  ok: boolean;
  message: string;
  result?: string;
  steps: number;
  url?: string | null;
  /** Id local da tarefa (fase 4). */
  taskId?: string;
  runId?: string | null;
  /** Última captura da tela quando a tarefa terminou (data:image/jpeg). */
  screenshot?: string | null;
  receipts?: NavigatorReceipt[];
}

/** Envia uma tarefa e espera ela terminar (passos chegam pelo poller). */
export async function runNavigatorTask(
  task: string,
  url?: string,
  opts: {
    timeoutMs?: number; maxSteps?: number; model?: string; origin?: string; onStart?: (t: CurrentTask) => void;
    /** "Automatizar tudo": só depois do toque do usuário no cartão de confirmação (confirmed: true). */
    automation?: { confirmed: true; paymentMaxCents?: number; periodMaxCents?: number; merchants?: string[]; allowRecurring?: boolean };
  } = {},
): Promise<TaskOutcome> {
  // Em dia com o sandbox antes de marcar o início da tarefa. Se a sessão que existia
  // terminou (expirou, sandbox sumiu, sem créditos), o poll zera o sessionId: aí abrimos
  // outra (ou mostramos o motivo real), em vez de mandar a tarefa com sessionId vazio
  // e cair no "Pedido inválido para o navegador".
  // Senha no texto da tarefa nunca sai do aparelho (iria para o modelo, o buscador e a auditoria).
  if (looksLikeCredentials(task)) {
    set({ error: NAVIGATOR_MESSAGES.credentials_in_task });
    return { ok: false, message: NAVIGATOR_MESSAGES.credentials_in_task, steps: 0 };
  }
  if (state.sessionId) await poll();
  if (!state.sessionId) {
    const started = await startNavigator();
    if (!started.ok) return { ok: false, message: messageOf(started), steps: 0 };
  }
  const baseSeq = state.lastSeq;
  const res = await callNavigator('task', {
    sessionId: state.sessionId, task, ...(url ? { url } : {}), ...(opts.maxSteps ? { maxSteps: opts.maxSteps } : {}), ...(opts.model ? { model: opts.model } : {}),
    ...(opts.automation ? { automation: opts.automation } : {}),
  });
  if (!res.ok) return { ok: false, message: messageOf(res), steps: 0 };
  const runId = res.runId ?? `run-${Date.now().toString(36)}`;
  const current: CurrentTask = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `t-${Date.now().toString(36)}`,
    task, ...(url ? { url } : {}), runId, baseSeq, startedAt: Date.now(), ...(opts.origin ? { origin: opts.origin } : {}),
  };
  set({ agentStatus: 'running', runId, currentTask: current, receipts: [] });
  opts.onStart?.(current);
  const done = await new Promise<NavigatorEvent | null>((resolve) => {
    waiters.set(runId, { runId, baseSeq, resolve });
    void poll();
    setTimeout(() => {
      const w = waiters.get(runId);
      if (w && w.resolve === resolve) {
        waiters.delete(runId);
        resolve(null);
      }
    }, opts.timeoutMs ?? 20 * 60_000);
  });
  const steps = eventsForTask(state.events, current).filter((e) => e.type === 'step').length;
  const base = { steps, url: state.url, taskId: current.id, runId, screenshot: state.screenshot, receipts: state.receipts };
  if (!done) return { ok: false, message: 'A tarefa do navegador não terminou a tempo (ou a sessão foi encerrada).', ...base };
  const result = typeof done.result === 'string' ? done.result : '';
  return { ok: done.success === true, message: result || (done.success ? 'Tarefa concluída.' : 'A tarefa não foi concluída.'), result, ...base };
}

export async function answerNavigator(p: NavigatorPending, answer: { approve: boolean } | { value: string }): Promise<NavigatorResponse> {
  if (!state.sessionId) return { ok: false, status: 'no_session', message: NAVIGATOR_MESSAGES.no_session };
  const body = 'approve' in answer
    // confirmed: true só sai daqui, do clique do usuário no cartão.
    // Uma aprovação = um total: manda o total e a moeda que o usuário viu no cartão (o Worker confere com a página).
    ? {
      sessionId: state.sessionId, requestId: p.id, kind: 'approval', approve: answer.approve,
      ...(answer.approve ? { confirmed: true, ...(typeof p.totalCents === 'number' && p.currency ? { totalCents: p.totalCents, currency: p.currency } : {}) } : {}),
    }
    : { sessionId: state.sessionId, requestId: p.id, kind: p.kind, value: answer.value };
  const res = await callNavigator('input', body);
  // Total mudou: o cartão continua (o poll traz o valor novo) e o usuário aprova de novo.
  if (res.status === 'total_changed') set({ error: messageOf(res) });
  else set({ pending: state.pending.filter((x) => x.id !== p.id) });
  void poll();
  return res;
}

/** Corpo de um cartão seguro (login, senha, código + semente TOTP, telefone, conector, cancelar). */
export type NavigatorAuthAnswer =
  | { kind: 'login'; username?: string; password?: string; save: boolean }
  | { kind: 'code'; value?: string; totpSeed?: string; confirmed?: boolean }
  | { kind: 'phone'; value: string; save: boolean }
  | { kind: 'connector'; connector: 'gmail' }
  | { kind: 'card'; number: string; exp: string; cvv?: string; holder: string; zip: string; save: boolean; saveCvv?: boolean }
  | { kind: 'card'; useSaved: true; cvv: string }
  | { kind: 'login' | 'code' | 'phone' | 'card'; cancel: true };

/**
 * Responde um cartão seguro. Os valores vão direto ao Worker (HTTPS) e saem do estado do
 * cliente aqui: nada vai para o modelo, para a conversa ou para o store.
 */
export async function answerNavigatorAuth(p: NavigatorPending, answer: NavigatorAuthAnswer): Promise<NavigatorResponse & { saved?: string[]; saveError?: string }> {
  if (!state.sessionId) return { ok: false, status: 'no_session', message: NAVIGATOR_MESSAGES.no_session };
  const res = await callNavigator('input', { sessionId: state.sessionId, requestId: p.id, ...answer });
  if (res.ok) set({ pending: state.pending.filter((x) => x.id !== p.id) });
  void poll();
  return res as NavigatorResponse & { saved?: string[]; saveError?: string };
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

// ─── Fase 2: preferências, atividade e consentimento TOTP ────────────────

/** Lê "aprovar automático até R$X" (padrão: desligado, sempre pedir). */
export async function loadNavigatorSettings(): Promise<NavigatorResponse> {
  return callNavigator('settings', {});
}

/**
 * Grava a preferência. Ligar o automático exige `confirmed: true`, que só o clique
 * do usuário no painel envia (o modelo não tem ferramenta para isso).
 */
export async function saveNavigatorSettings(
  enabled: boolean, maxCents: number,
  extras?: { periodMaxCents: number; periodDays: number; merchants: string[]; allowRecurring: boolean },
): Promise<NavigatorResponse> {
  return callNavigator('settings', { autoApproveEnabled: enabled, autoApproveMaxCents: enabled ? maxCents : 0, ...(enabled ? { confirmed: true, ...(extras ?? {}) } : {}) });
}

/** Histórico para a aba Atividade: sessões e auditoria (segredos só por nome). */
export async function loadNavigatorActivity(): Promise<NavigatorResponse> {
  return callNavigator('activity', {});
}

/** Registra na auditoria o consentimento explícito para guardar a semente TOTP. */
export async function recordTotpConsent(name: string, boundTo: string): Promise<NavigatorResponse> {
  return callNavigator('settings', { consent: 'totp', name, boundTo, confirmed: true });
}

/** Só para testes: injeta estado (ex.: um pedido de aprovação chegando pelo poller). */
export function __patchNavigatorStoreForTest(patch: Partial<NavigatorState>) {
  set(patch);
}

/** Só para testes. */
export function __resetNavigatorStore() {
  stopPolling();
  waiters.clear();
  polling = false;
  inflight = null;
  state = INITIAL;
}
