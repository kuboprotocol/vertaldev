// Motor do Vertal Clock: confere a cada segundo se algum alarme ou timer venceu,
// toca, avisa por notificação e cuida de soneca e de dispensar.
//
// Um site não acorda um aparelho fechado: o alarme toca enquanto o Vertal (ou a
// página com o widget) estiver aberto, em primeiro plano ou em outra aba.
import { nextRing } from './alarms';
import { installAudioUnlock, startAlarmSound, stopAlarmSound } from './sound';
import {
  getClockState, refreshClockState, resetTimer, updateClockState, type ClockState,
} from './store';
import { localTimeZone } from './zones';

export interface Ring {
  kind: 'alarm' | 'timer';
  id: string;
  label: string;
  /** Instante em que deveria tocar. */
  at: number;
  /** Alarme: a hora marcada ("07:00"). */
  time?: string;
  tzLabel?: string;
}

/** Atraso máximo para ainda tocar (aba dormindo, aparelho suspenso). Depois disso o alarme é pulado. */
export const RING_GRACE_MS = 15 * 60_000;

/** Alarmes e timers vencidos entre `since` (exclusivo) e `now`. Função pura, para teste. */
export function dueRings(state: ClockState, since: number, now: number, deviceTz: string): Ring[] {
  const rings: Ring[] = [];
  for (const a of state.alarms) {
    const at = a.snoozeUntil ?? (a.enabled ? nextRing(a, since, deviceTz) : null);
    if (at === null || at > now) continue;
    rings.push({ kind: 'alarm', id: a.id, label: a.label, at, time: a.time, ...(a.tzLabel ? { tzLabel: a.tzLabel } : {}) });
  }
  for (const t of state.timers) {
    if (t.endsAt !== null && !t.done && t.endsAt <= now) rings.push({ kind: 'timer', id: t.id, label: t.label, at: t.endsAt });
  }
  return rings;
}

type RingListener = (rings: Ring[]) => void;

let ringing: Ring[] = [];
const ringListeners = new Set<RingListener>();
let users = 0;
let interval: ReturnType<typeof setInterval> | null = null;
let lastTick = 0;

const firedKey = (r: Ring) => `${r.kind}:${r.id}`;

function emitRings(): void {
  for (const fn of [...ringListeners]) fn(ringing);
}

async function notify(ring: Ring): Promise<void> {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) return;
    const title = ring.kind === 'alarm' ? `⏰ ${ring.time ?? 'Alarme'}${ring.label ? ` · ${ring.label}` : ''}` : `⏳ ${ring.label || 'Timer'}`;
    const options: NotificationOptions = {
      body: ring.kind === 'alarm' ? 'Alarme do Vertal Clock' : 'O timer terminou',
      tag: `vertal-clock-${firedKey(ring)}`,
      requireInteraction: true,
    };
    // Android só aceita notificação pelo service worker; no computador o construtor basta.
    const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
    if (registration) await registration.showNotification(title, options);
    else new Notification(title, options);
  } catch {
    /* notificação é um extra: o alarme continua na tela e no som */
  }
}

function fire(ring: Ring, now: number): void {
  // Relê do armazenamento: outra aba pode ter tocado esta mesma ocorrência.
  const fresh = refreshClockState();
  const key = firedKey(ring);
  const alreadyHandled = fresh.fired[key] === ring.at;
  const tooLate = now - ring.at > RING_GRACE_MS;

  updateClockState((s) => ({
    ...s,
    fired: { ...s.fired, [key]: ring.at },
    alarms: ring.kind !== 'alarm' ? s.alarms : s.alarms.map((a) => {
      if (a.id !== ring.id) return a;
      const { snoozeUntil: _snooze, ...rest } = a;
      // Alarme de uma vez só desliga depois de tocar.
      return { ...rest, enabled: a.days.length > 0 ? a.enabled : false };
    }),
    timers: ring.kind !== 'timer' ? s.timers : s.timers.map((t) => (t.id === ring.id ? { ...t, endsAt: null, remainingMs: 0, done: true } : t)),
  }));

  if (alreadyHandled || tooLate || ringing.some((r) => firedKey(r) === key)) return;
  ringing = [...ringing, ring];
  startAlarmSound(getClockState().settings.sound);
  void notify(ring);
  try {
    window.dispatchEvent(new CustomEvent('vertal-clock:ring', { detail: ring }));
  } catch {
    /* fora do navegador */
  }
  emitRings();
}

function tick(): void {
  const now = Date.now();
  const state = getClockState();
  if (state.alarms.length > 0 || state.timers.length > 0) {
    for (const ring of dueRings(state, lastTick, now, localTimeZone())) fire(ring, now);
  }
  lastTick = now;
}

/** Liga o motor. Devolve a função que desliga (o motor para quando ninguém mais usa). */
export function startClockEngine(): () => void {
  users += 1;
  if (!interval) {
    lastTick = Date.now();
    installAudioUnlock();
    interval = setInterval(tick, 1000);
    // Ao voltar para a aba, confere na hora (o navegador atrasa timers em segundo plano).
    document.addEventListener('visibilitychange', tick);
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    users -= 1;
    if (users <= 0 && interval) {
      clearInterval(interval);
      interval = null;
      document.removeEventListener('visibilitychange', tick);
    }
  };
}

export const getRinging = (): Ring[] => ringing;

export function subscribeRinging(fn: RingListener): () => void {
  ringListeners.add(fn);
  return () => {
    ringListeners.delete(fn);
  };
}

function drop(ring: Ring): void {
  ringing = ringing.filter((r) => r !== ring);
  if (ringing.length === 0) stopAlarmSound();
  emitRings();
}

/** Para de tocar. O timer volta ao início, pronto para repetir. */
export function dismissRing(ring: Ring): void {
  if (ring.kind === 'timer') resetTimer(ring.id);
  drop(ring);
}

/** Soneca: o alarme toca de novo daqui a alguns minutos (preferência do usuário). */
export function snoozeRing(ring: Ring, now = Date.now()): void {
  if (ring.kind === 'alarm') {
    const minutes = getClockState().settings.snoozeMinutes;
    updateClockState((s) => ({
      ...s,
      alarms: s.alarms.map((a) => (a.id === ring.id ? { ...a, snoozeUntil: now + minutes * 60_000 } : a)),
    }));
  }
  drop(ring);
}

/** Pede permissão de notificação (precisa vir de um clique). */
export async function requestClockNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}
