// Estado do Vertal Clock: cidades, alarmes, timers, cronômetro e preferências.
//
// Fica no aparelho (localStorage), como o relógio de um celular. O painel, o
// Vertal Chat e o widget incorporável leem e gravam aqui; quem estiver aberto
// (inclusive em outra aba) é avisado na hora.
import { isClockTime, parseDays, type Alarm } from './alarms';
import { findCityByTz, isValidTimeZone } from './zones';
import { CLOCK_CHANGE_EVENT, CLOCK_STORAGE_KEY } from './keys';

export { CLOCK_STORAGE_KEY, CLOCK_CHANGE_EVENT };

export const CLOCK_LIMITS = { cities: 30, alarms: 50, timers: 10, laps: 200, labelChars: 60, maxTimerMs: 100 * 3_600_000 } as const;

export interface CityRef {
  tz: string;
  label: string;
}

export interface Timer {
  id: string;
  label: string;
  durationMs: number;
  /** Rodando: instante em que termina. Pausado: null. */
  endsAt: number | null;
  /** Quanto falta quando está pausado. */
  remainingMs: number;
  /** Terminou e ainda não foi dispensado. */
  done: boolean;
}

export interface Stopwatch {
  /** Rodando: instante da última partida. Parado: null. */
  startedAt: number | null;
  /** Tempo acumulado antes da última partida. */
  elapsedMs: number;
  /** Tempo total em cada volta marcada. */
  laps: number[];
}

export const ALARM_SOUNDS = ['classic', 'digital', 'gentle'] as const;
export type AlarmSound = (typeof ALARM_SOUNDS)[number];

export interface ClockSettings {
  hour12: boolean;
  sound: AlarmSound;
  snoozeMinutes: number;
}

export interface ClockState {
  v: 1;
  cities: CityRef[];
  alarms: Alarm[];
  timers: Timer[];
  stopwatch: Stopwatch;
  settings: ClockSettings;
  /** Última ocorrência já tocada de cada alarme/timer: evita tocar em duas abas. */
  fired: Record<string, number>;
}

const DEFAULT_CITIES = ['America/Sao_Paulo', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];

export function defaultState(): ClockState {
  return {
    v: 1,
    cities: DEFAULT_CITIES.map((tz) => ({ tz, label: findCityByTz(tz).city })),
    alarms: [],
    timers: [],
    stopwatch: { startedAt: null, elapsedMs: 0, laps: [] },
    settings: { hour12: false, sound: 'classic', snoozeMinutes: 9 },
    fired: {},
  };
}

// ─── Validação do que vem do armazenamento ───────────────────────────────

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max) : '');
const finite = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : fallback;
const idOf = (v: unknown): string => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : '');
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const record = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function sanitizeAlarm(raw: unknown): Alarm | null {
  const a = record(raw);
  const id = idOf(a.id);
  if (!id || !isClockTime(a.time)) return null;
  const tz = isValidTimeZone(a.tz) ? a.tz : undefined;
  const snooze = typeof a.snoozeUntil === 'number' && Number.isFinite(a.snoozeUntil) ? a.snoozeUntil : undefined;
  return {
    id,
    time: a.time,
    label: text(a.label, CLOCK_LIMITS.labelChars),
    days: parseDays(a.days),
    enabled: a.enabled !== false,
    ...(tz ? { tz, tzLabel: text(a.tzLabel, 60) || findCityByTz(tz).city } : {}),
    ...(snooze ? { snoozeUntil: snooze } : {}),
    createdAt: finite(a.createdAt, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

function sanitizeTimer(raw: unknown): Timer | null {
  const t = record(raw);
  const id = idOf(t.id);
  const durationMs = finite(t.durationMs, 0, CLOCK_LIMITS.maxTimerMs, 0);
  if (!id || durationMs < 1000) return null;
  const endsAt = typeof t.endsAt === 'number' && Number.isFinite(t.endsAt) ? t.endsAt : null;
  return {
    id,
    label: text(t.label, CLOCK_LIMITS.labelChars),
    durationMs,
    endsAt,
    remainingMs: finite(t.remainingMs, 0, durationMs, durationMs),
    done: t.done === true,
  };
}

/** Qualquer coisa lida do armazenamento vira um estado válido (ou o padrão). */
export function sanitizeState(raw: unknown): ClockState {
  const base = defaultState();
  const s = record(raw);
  if (s.v !== 1) return base;
  const cities: CityRef[] = [];
  for (const item of list(s.cities).slice(0, CLOCK_LIMITS.cities)) {
    const c = record(item);
    if (isValidTimeZone(c.tz) && !cities.some((x) => x.tz === c.tz && x.label === text(c.label, 60))) {
      cities.push({ tz: c.tz, label: text(c.label, 60) || findCityByTz(c.tz).city });
    }
  }
  const sw = record(s.stopwatch);
  const settings = record(s.settings);
  const fired: Record<string, number> = {};
  for (const [k, v] of Object.entries(record(s.fired)).slice(0, 200)) {
    if (typeof v === 'number' && Number.isFinite(v)) fired[k] = v;
  }
  return {
    v: 1,
    cities,
    alarms: list(s.alarms).map(sanitizeAlarm).filter((a): a is Alarm => a !== null).slice(0, CLOCK_LIMITS.alarms),
    timers: list(s.timers).map(sanitizeTimer).filter((t): t is Timer => t !== null).slice(0, CLOCK_LIMITS.timers),
    stopwatch: {
      startedAt: typeof sw.startedAt === 'number' && Number.isFinite(sw.startedAt) ? sw.startedAt : null,
      elapsedMs: finite(sw.elapsedMs, 0, Number.MAX_SAFE_INTEGER, 0),
      laps: list(sw.laps).filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0).slice(0, CLOCK_LIMITS.laps),
    },
    settings: {
      hour12: settings.hour12 === true,
      sound: (ALARM_SOUNDS as readonly unknown[]).includes(settings.sound) ? (settings.sound as AlarmSound) : base.settings.sound,
      snoozeMinutes: Math.round(finite(settings.snoozeMinutes, 1, 60, base.settings.snoozeMinutes)),
    },
    fired,
  };
}

// ─── Leitura, gravação e avisos ──────────────────────────────────────────

type Listener = (state: ClockState) => void;

let cache: ClockState | null = null;
const listeners = new Set<Listener>();
let watching = false;

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // iframe isolado ou navegador com armazenamento bloqueado
  }
}

function readStorage(): ClockState {
  try {
    const raw = storage()?.getItem(CLOCK_STORAGE_KEY);
    return raw ? sanitizeState(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}

/** Estado atual (em memória; vem do armazenamento na primeira leitura). */
export function getClockState(): ClockState {
  if (!cache) cache = readStorage();
  return cache;
}

/** Relê do armazenamento (outra aba pode ter mudado). */
export function refreshClockState(): ClockState {
  cache = readStorage();
  return cache;
}

function emit(): void {
  const state = getClockState();
  for (const fn of [...listeners]) fn(state);
}

/** Aplica uma mudança, grava e avisa quem está ouvindo. */
export function updateClockState(change: (state: ClockState) => ClockState): ClockState {
  cache = change(getClockState());
  try {
    storage()?.setItem(CLOCK_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* sem armazenamento: vale só enquanto a página estiver aberta */
  }
  emit();
  try {
    window.dispatchEvent(new Event(CLOCK_CHANGE_EVENT));
  } catch {
    /* fora do navegador */
  }
  return cache;
}

export function subscribeClock(fn: Listener): () => void {
  listeners.add(fn);
  if (!watching && typeof window !== 'undefined') {
    watching = true;
    window.addEventListener('storage', (e) => {
      if (e.key !== CLOCK_STORAGE_KEY) return;
      refreshClockState();
      emit();
    });
  }
  return () => {
    listeners.delete(fn);
  };
}

/** Só para testes: esquece o que está em memória. */
export function resetClockCache(): void {
  cache = null;
}

// ─── Ações ───────────────────────────────────────────────────────────────

export const newClockId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
};

export function addCity(tz: string, label: string): boolean {
  if (!isValidTimeZone(tz)) return false;
  const name = text(label, 60) || findCityByTz(tz).city;
  const state = getClockState();
  if (state.cities.length >= CLOCK_LIMITS.cities || state.cities.some((c) => c.tz === tz && c.label === name)) return false;
  updateClockState((s) => ({ ...s, cities: [...s.cities, { tz, label: name }] }));
  return true;
}

export function removeCity(index: number): void {
  updateClockState((s) => ({ ...s, cities: s.cities.filter((_, i) => i !== index) }));
}

export interface AlarmInput {
  time: string;
  label?: string;
  days?: number[];
  tz?: string;
  tzLabel?: string;
  enabled?: boolean;
}

/** Cria (ou, com `id`, altera) um alarme. Devolve o alarme gravado, ou null se o horário for inválido ou a lista estiver cheia. */
export function saveAlarm(input: AlarmInput, id?: string): Alarm | null {
  const state = getClockState();
  const previous = id ? state.alarms.find((a) => a.id === id) : undefined;
  if (!previous && state.alarms.length >= CLOCK_LIMITS.alarms) return null;
  const alarm = sanitizeAlarm({
    id: previous?.id ?? newClockId(),
    time: input.time,
    label: input.label ?? previous?.label ?? '',
    days: input.days ?? previous?.days ?? [],
    enabled: input.enabled ?? true,
    tz: input.tz,
    tzLabel: input.tzLabel,
    createdAt: previous?.createdAt ?? Date.now(),
  });
  if (!alarm) return null;
  updateClockState((s) => ({
    ...s,
    alarms: previous ? s.alarms.map((a) => (a.id === alarm.id ? alarm : a)) : [...s.alarms, alarm],
  }));
  return alarm;
}

export function setAlarmEnabled(id: string, enabled: boolean): void {
  updateClockState((s) => ({
    ...s,
    alarms: s.alarms.map((a) => {
      if (a.id !== id) return a;
      const { snoozeUntil: _snooze, ...rest } = a;
      return { ...rest, enabled };
    }),
  }));
}

export function removeAlarm(id: string): void {
  updateClockState((s) => ({ ...s, alarms: s.alarms.filter((a) => a.id !== id) }));
}

export function startTimer(durationMs: number, label = '', now = Date.now()): Timer | null {
  const ms = Math.round(durationMs);
  if (!Number.isFinite(ms) || ms < 1000 || ms > CLOCK_LIMITS.maxTimerMs) return null;
  if (getClockState().timers.length >= CLOCK_LIMITS.timers) return null;
  const timer: Timer = { id: newClockId(), label: text(label, CLOCK_LIMITS.labelChars), durationMs: ms, endsAt: now + ms, remainingMs: ms, done: false };
  updateClockState((s) => ({ ...s, timers: [...s.timers, timer] }));
  return timer;
}

const patchTimer = (id: string, fn: (t: Timer) => Timer) =>
  updateClockState((s) => ({ ...s, timers: s.timers.map((t) => (t.id === id ? fn(t) : t)) }));

export function pauseTimer(id: string, now = Date.now()): void {
  patchTimer(id, (t) => (t.endsAt === null ? t : { ...t, endsAt: null, remainingMs: Math.max(0, t.endsAt - now) }));
}

export function resumeTimer(id: string, now = Date.now()): void {
  patchTimer(id, (t) => (t.endsAt !== null || t.done ? t : { ...t, endsAt: now + (t.remainingMs || t.durationMs) }));
}

/** Volta o timer ao início, parado. */
export function resetTimer(id: string): void {
  patchTimer(id, (t) => ({ ...t, endsAt: null, remainingMs: t.durationMs, done: false }));
}

export function removeTimer(id: string): void {
  updateClockState((s) => ({ ...s, timers: s.timers.filter((t) => t.id !== id) }));
}

/** Quanto falta num timer agora. */
export const timerRemaining = (t: Timer, now: number): number => (t.endsAt === null ? t.remainingMs : Math.max(0, t.endsAt - now));

/** Tempo total do cronômetro agora. */
export const stopwatchElapsed = (sw: Stopwatch, now: number): number => sw.elapsedMs + (sw.startedAt === null ? 0 : Math.max(0, now - sw.startedAt));

export function stopwatchStart(now = Date.now()): void {
  updateClockState((s) => (s.stopwatch.startedAt !== null ? s : { ...s, stopwatch: { ...s.stopwatch, startedAt: now } }));
}

export function stopwatchStop(now = Date.now()): void {
  updateClockState((s) =>
    s.stopwatch.startedAt === null ? s : { ...s, stopwatch: { ...s.stopwatch, startedAt: null, elapsedMs: stopwatchElapsed(s.stopwatch, now) } });
}

export function stopwatchLap(now = Date.now()): void {
  updateClockState((s) =>
    s.stopwatch.startedAt === null || s.stopwatch.laps.length >= CLOCK_LIMITS.laps
      ? s
      : { ...s, stopwatch: { ...s.stopwatch, laps: [...s.stopwatch.laps, stopwatchElapsed(s.stopwatch, now)] } });
}

export function stopwatchReset(): void {
  updateClockState((s) => ({ ...s, stopwatch: { startedAt: null, elapsedMs: 0, laps: [] } }));
}

export function updateSettings(patch: Partial<ClockSettings>): void {
  updateClockState((s) => sanitizeState({ ...s, settings: { ...s.settings, ...patch } }));
}

/** "01:05:09", "05:09". */
export function formatDuration(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Cronômetro: "05:09.37", "1:05:09.37". */
export function formatStopwatch(ms: number): string {
  const cs = Math.floor(ms / 10);
  const h = Math.floor(cs / 360_000);
  const m = Math.floor((cs % 360_000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h > 0 ? `${h}:` : ''}${pad(m)}:${pad(s)}.${pad(cs % 100)}`;
}
