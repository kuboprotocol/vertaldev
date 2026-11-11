// Alarmes do Vertal Clock: modelo, próxima vez que toca e leitura de horários em texto.
// Módulo puro: recebe o instante atual por parâmetro, para o teste não depender do relógio.
import { zoneParts, zonedToUtc } from './zones';

export interface Alarm {
  id: string;
  /** Hora de parede "HH:MM" (24 h). */
  time: string;
  label: string;
  /** Dias em que repete (0 = domingo … 6 = sábado). Vazio = toca uma vez. */
  days: number[];
  enabled: boolean;
  /** Fuso em que a hora vale. Sem ele, vale o fuso do aparelho. */
  tz?: string;
  /** Nome do lugar do fuso, para mostrar ("Tóquio"). */
  tzLabel?: string;
  /** Soneca: toca de novo neste instante (ms). */
  snoozeUntil?: number;
  createdAt: number;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isClockTime = (v: unknown): v is string => typeof v === 'string' && TIME_RE.test(v);

/**
 * Lê um horário escrito por gente ou pelo agente: "7", "07:00", "7h30", "7:30 pm",
 * "19h", "meio-dia", "meia-noite". Devolve "HH:MM" ou null.
 */
export function parseClockTime(input: unknown): string | null {
  if (typeof input === 'number' && Number.isInteger(input) && input >= 0 && input <= 23) {
    return `${String(input).padStart(2, '0')}:00`;
  }
  if (typeof input !== 'string') return null;
  const text = input.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!text) return null;
  if (/^meio[- ]?dia$|^noon$|^midday$/.test(text)) return '12:00';
  if (/^meia[- ]?noite$|^midnight$/.test(text)) return '00:00';
  const m = /^(\d{1,2})(?:\s*(?::|h|\.)\s*(\d{1,2}))?\s*(?:h|hs|hrs|horas?|min)?\s*(am|pm|a\.m\.|p\.m\.)?$/.exec(text);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] === undefined ? 0 : Number(m[2]);
  const half = m[3]?.replace(/\./g, '');
  if (minute > 59) return null;
  if (half) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (half === 'pm' ? 12 : 0);
  }
  if (hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Dias válidos, sem repetição e em ordem. Aceita atalhos ("daily", "weekdays", "weekends"). */
export function parseDays(input: unknown): number[] {
  if (typeof input === 'string') {
    const key = input.trim().toLowerCase();
    if (/^(daily|everyday|todos|diario|diariamente|todo dia|todos os dias)$/.test(key)) return [0, 1, 2, 3, 4, 5, 6];
    if (/^(weekdays|dias uteis|uteis|semana)$/.test(key)) return [1, 2, 3, 4, 5];
    if (/^(weekends?|fim de semana|fins de semana)$/.test(key)) return [0, 6];
    return [];
  }
  if (!Array.isArray(input)) return [];
  const days = new Set<number>();
  for (const v of input) {
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d$/.test(v.trim()) ? Number(v) : NaN;
    if (Number.isInteger(n) && n >= 0 && n <= 6) days.add(n);
  }
  return [...days].sort((a, b) => a - b);
}

/**
 * Próximo instante (ms) em que o alarme toca depois de `after`, ou null.
 * A soneca não entra aqui: quem dispara confere `snoozeUntil` à parte.
 */
export function nextRing(alarm: Pick<Alarm, 'time' | 'days' | 'tz'>, after: number, deviceTz: string): number | null {
  const m = TIME_RE.exec(alarm.time);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const tz = alarm.tz ?? deviceTz;
  const today = zoneParts(tz, after);
  for (let i = 0; i <= 7; i++) {
    // Date.UTC normaliza o dia além do fim do mês; só a data de parede interessa aqui.
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
    if (alarm.days.length > 0 && !alarm.days.includes(date.getUTCDay())) continue;
    const at = zonedToUtc(tz, date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour, minute);
    if (at > after) return at;
  }
  return null;
}

const DAY_NAMES = {
  pt: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
} as const;

export type ClockLang = keyof typeof DAY_NAMES;

export const dayNames = (lang: ClockLang): readonly string[] => DAY_NAMES[lang];

/** "Uma vez", "Todos os dias", "Seg a Sex", "Fim de semana", "Seg, Qua, Sex". */
export function describeDays(days: number[], lang: ClockLang = 'pt'): string {
  const d = [...new Set(days)].sort((a, b) => a - b);
  const key = d.join('');
  const pt = lang === 'pt';
  if (d.length === 0) return pt ? 'Uma vez' : 'Once';
  if (d.length === 7) return pt ? 'Todos os dias' : 'Every day';
  if (key === '12345') return pt ? 'Seg a Sex' : 'Weekdays';
  if (key === '06') return pt ? 'Fim de semana' : 'Weekends';
  return d.map((n) => DAY_NAMES[lang][n]).join(', ');
}

/** "em 7 h 32 min", "em 2 d 3 h", "em menos de 1 min". */
export function describeWait(ms: number, lang: ClockLang = 'pt'): string {
  const pt = lang === 'pt';
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return pt ? 'em menos de 1 min' : 'in less than 1 min';
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const min = totalMin % 60;
  const parts = d > 0 ? [`${d} d`, h ? `${h} h` : ''] : [h ? `${h} h` : '', min ? `${min} min` : ''];
  return `${pt ? 'em' : 'in'} ${parts.filter(Boolean).join(' ')}`;
}
