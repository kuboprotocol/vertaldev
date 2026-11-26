// Vertal CRM · campo de data/hora no idioma do usuário. O <input type="datetime-local"> nativo segue o idioma do
// NAVEGADOR (AM/PM e "Show date picker" em inglês para um usuário brasileiro com navegador em inglês).
// Aqui o texto é digitado como dd/mm/aaaa hh:mm (pt/es, 24 h) ou mm/dd/yyyy hh:mm (en) e o valor guardado
// continua o mesmo formato do campo nativo: "AAAA-MM-DD" (data) ou "AAAA-MM-DDTHH:mm" (data e hora, horário local).
import type { CrmLang } from './i18n';

export const DATE_INPUT_TEXT: Record<CrmLang, { date: string; dateTime: string; pick: string; invalid: string; clear: string }> = {
  pt: { date: 'dd/mm/aaaa', dateTime: 'dd/mm/aaaa hh:mm', pick: 'Abrir calendário', invalid: 'Data inválida', clear: 'Limpar' },
  es: { date: 'dd/mm/aaaa', dateTime: 'dd/mm/aaaa hh:mm', pick: 'Abrir calendario', invalid: 'Fecha no válida', clear: 'Borrar' },
  en: { date: 'mm/dd/yyyy', dateTime: 'mm/dd/yyyy hh:mm', pick: 'Open calendar', invalid: 'Invalid date', clear: 'Clear' },
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Valor do campo ("AAAA-MM-DD" ou "AAAA-MM-DDTHH:mm") → texto na ordem do idioma. */
export function formatDateInput(value: string | null | undefined, lang: CrmLang, withTime: boolean): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value ?? '');
  if (!m) return '';
  const date = lang === 'en' ? `${m[2]}/${m[3]}/${m[1]}` : `${m[3]}/${m[2]}/${m[1]}`;
  return withTime ? `${date} ${m[4] ?? '00'}:${m[5] ?? '00'}` : date;
}

/**
 * Texto digitado → valor do campo. '' quando vazio; null quando incompleto ou inválido (ex.: 31/02).
 * Hora opcional no modo com hora (sem hora = 00:00). Aceita 1 dígito no dia/mês e ano com 4 dígitos.
 */
export function parseDateInput(text: string, lang: CrmLang, withTime: boolean): string | null {
  const s = (text ?? '').trim();
  if (!s) return '';
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[\s,T]+(\d{1,2})(?::(\d{2}))?)?$/.exec(s);
  if (!m) return null;
  const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [day, month] = lang === 'en' ? [b, a] : [a, b];
  const d = new Date(Date.UTC(y, month - 1, day));
  if (y < 1900 || y > 2200 || d.getUTCFullYear() !== y || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  const date = `${y}-${pad(month)}-${pad(day)}`;
  if (!withTime) return m[4] === undefined ? date : null;
  const hh = m[4] === undefined ? 0 : Number(m[4]);
  const mm = m[5] === undefined ? 0 : Number(m[5]);
  if (hh > 23 || mm > 59) return null;
  return `${date}T${pad(hh)}:${pad(mm)}`;
}

/** Máscara enquanto digita: só dígitos, com "/" e " " e ":" nos lugares certos (dd/mm/aaaa hh:mm). */
export function maskDateInput(text: string, withTime: boolean): string {
  const d = (text ?? '').replace(/\D/g, '').slice(0, withTime ? 12 : 8);
  let out = d.slice(0, 2);
  if (d.length > 2) out += `/${d.slice(2, 4)}`;
  if (d.length > 4) out += `/${d.slice(4, 8)}`;
  if (withTime && d.length > 8) out += ` ${d.slice(8, 10)}`;
  if (withTime && d.length > 10) out += `:${d.slice(10, 12)}`;
  return out;
}

/** Dia escolhido no calendário + hora já digitada (ou 09:00) → valor do campo. */
export function withPickedDay(day: Date, current: string, withTime: boolean): string {
  const date = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
  if (!withTime) return date;
  const t = /T(\d{2}:\d{2})/.exec(current ?? '')?.[1] ?? '09:00';
  return `${date}T${t}`;
}
