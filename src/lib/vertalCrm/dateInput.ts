// Vertal CRM · campo de data/hora no idioma do usuário. O <input type="datetime-local"> nativo segue o idioma do
// NAVEGADOR (AM/PM e "Show date picker" em inglês para um usuário brasileiro com navegador em inglês).
// Aqui o texto é digitado como dd/mm/aaaa hh:mm (pt/es, 24 h) ou mm/dd/yyyy hh:mm (en) e o valor guardado
// continua o mesmo formato do campo nativo: "AAAA-MM-DD" (data) ou "AAAA-MM-DDTHH:mm" (data e hora, horário local).
import type { CrmLang } from './i18n';

/** Ordem da data digitada: mês/dia/ano (en-US), ano/mês/dia (ja, ko, zh) ou dia/mês/ano (os demais). */
export type DateOrder = 'dmy' | 'mdy' | 'ymd';
export const dateOrder = (lang: CrmLang): DateOrder =>
  lang === 'en' ? 'mdy' : lang === 'ja' || lang === 'ko' || lang === 'zh-CN' || lang === 'zh-TW' ? 'ymd' : 'dmy';

type DateText = { date: string; dateTime: string; pick: string; invalid: string; clear: string };
const T = (date: string, time: string, pick: string, invalid: string, clear: string): DateText => ({ date, dateTime: `${date} ${time}`, pick, invalid, clear });

export const DATE_INPUT_TEXT: Record<CrmLang, DateText> = {
  pt: T('dd/mm/aaaa', 'hh:mm', 'Abrir calendário', 'Data inválida', 'Limpar'),
  'pt-PT': T('dd/mm/aaaa', 'hh:mm', 'Abrir calendário', 'Data inválida', 'Limpar'),
  es: T('dd/mm/aaaa', 'hh:mm', 'Abrir calendario', 'Fecha no válida', 'Borrar'),
  en: T('mm/dd/yyyy', 'hh:mm', 'Open calendar', 'Invalid date', 'Clear'),
  fr: T('jj/mm/aaaa', 'hh:mm', 'Ouvrir le calendrier', 'Date invalide', 'Effacer'),
  de: T('tt/mm/jjjj', 'hh:mm', 'Kalender öffnen', 'Ungültiges Datum', 'Leeren'),
  it: T('gg/mm/aaaa', 'hh:mm', 'Apri il calendario', 'Data non valida', 'Cancella'),
  nl: T('dd/mm/jjjj', 'uu:mm', 'Kalender openen', 'Ongeldige datum', 'Wissen'),
  pl: T('dd/mm/rrrr', 'gg:mm', 'Otwórz kalendarz', 'Nieprawidłowa data', 'Wyczyść'),
  tr: T('gg/aa/yyyy', 'ss:dd', 'Takvimi aç', 'Geçersiz tarih', 'Temizle'),
  ru: T('дд/мм/гггг', 'чч:мм', 'Открыть календарь', 'Неверная дата', 'Очистить'),
  uk: T('дд/мм/рррр', 'гг:хх', 'Відкрити календар', 'Невірна дата', 'Очистити'),
  ar: T('يوم/شهر/سنة', 'ساعة:دقيقة', 'فتح التقويم', 'تاريخ غير صالح', 'مسح'),
  hi: T('dd/mm/yyyy', 'hh:mm', 'कैलेंडर खोलें', 'अमान्य तारीख', 'साफ़ करें'),
  id: T('hh/bb/tttt', 'jj:mm', 'Buka kalender', 'Tanggal tidak valid', 'Hapus'),
  vi: T('dd/mm/yyyy', 'hh:mm', 'Mở lịch', 'Ngày không hợp lệ', 'Xóa'),
  th: T('วว/ดด/ปปปป', 'ชช:นน', 'เปิดปฏิทิน', 'วันที่ไม่ถูกต้อง', 'ล้าง'),
  ja: T('yyyy/mm/dd', 'hh:mm', 'カレンダーを開く', '無効な日付です', 'クリア'),
  ko: T('yyyy/mm/dd', 'hh:mm', '달력 열기', '잘못된 날짜', '지우기'),
  'zh-CN': T('yyyy/mm/dd', 'hh:mm', '打开日历', '日期无效', '清除'),
  'zh-TW': T('yyyy/mm/dd', 'hh:mm', '開啟日曆', '日期無效', '清除'),
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Valor do campo ("AAAA-MM-DD" ou "AAAA-MM-DDTHH:mm") → texto na ordem do idioma. */
export function formatDateInput(value: string | null | undefined, lang: CrmLang, withTime: boolean): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value ?? '');
  if (!m) return '';
  const o = dateOrder(lang);
  const date = o === 'mdy' ? `${m[2]}/${m[3]}/${m[1]}` : o === 'ymd' ? `${m[1]}/${m[2]}/${m[3]}` : `${m[3]}/${m[2]}/${m[1]}`;
  return withTime ? `${date} ${m[4] ?? '00'}:${m[5] ?? '00'}` : date;
}

/**
 * Texto digitado → valor do campo. '' quando vazio; null quando incompleto ou inválido (ex.: 31/02).
 * Hora opcional no modo com hora (sem hora = 00:00). Aceita 1 dígito no dia/mês e ano com 4 dígitos.
 */
export function parseDateInput(text: string, lang: CrmLang, withTime: boolean): string | null {
  const s = (text ?? '').trim();
  if (!s) return '';
  const ymd = dateOrder(lang) === 'ymd';
  const m = ymd
    ? /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[\s,T]+(\d{1,2})(?::(\d{2}))?)?$/.exec(s)
    : /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[\s,T]+(\d{1,2})(?::(\d{2}))?)?$/.exec(s);
  if (!m) return null;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [y, month, day] = ymd ? [a, b, c] : dateOrder(lang) === 'mdy' ? [c, a, b] : [c, b, a];
  const d = new Date(Date.UTC(y, month - 1, day));
  if (y < 1900 || y > 2200 || d.getUTCFullYear() !== y || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  const date = `${y}-${pad(month)}-${pad(day)}`;
  if (!withTime) return m[4] === undefined ? date : null;
  const hh = m[4] === undefined ? 0 : Number(m[4]);
  const mm = m[5] === undefined ? 0 : Number(m[5]);
  if (hh > 23 || mm > 59) return null;
  return `${date}T${pad(hh)}:${pad(mm)}`;
}

/** Máscara enquanto digita: só dígitos, com "/" e " " e ":" nos lugares certos (dd/mm/aaaa hh:mm, ou aaaa/mm/dd em ja/ko/zh). */
export function maskDateInput(text: string, withTime: boolean, lang?: CrmLang): string {
  const d = (text ?? '').replace(/\D/g, '').slice(0, withTime ? 12 : 8);
  const ymd = lang ? dateOrder(lang) === 'ymd' : false;
  const cuts = ymd ? [4, 6] : [2, 4];
  let out = d.slice(0, cuts[0]);
  if (d.length > cuts[0]) out += `/${d.slice(cuts[0], cuts[1])}`;
  if (d.length > cuts[1]) out += `/${d.slice(cuts[1], 8)}`;
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
