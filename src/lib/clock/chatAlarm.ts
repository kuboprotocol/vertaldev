// Alarme pedido pelo Vertal Chat: grava no mesmo relógio do painel "Vertal Clock",
// então toca no horário certo, com o som da galeria ("Meus sons") quando houver.
import { describeDays, parseClockTime, parseDays, parseRingTimes, type Alarm } from './alarms';
import { CLOCK_LIMITS, customSoundId, getClockState, isBuiltinSound, saveAlarm, soundRef } from './store';

const normalize = (v: string): string =>
  v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export interface ChatAlarmRequest {
  time: unknown;
  soundId?: string;
  label?: string;
  repeatDays?: unknown;
  /** Quantas vezes o toque toca: 1, 2, 3, 4, 5 ou 10. */
  ringTimes?: unknown;
}

export interface ChatAlarmResult {
  ok: boolean;
  /** Preenchido quando ok. */
  alarm?: Alarm;
  soundName?: string;
  soundNote?: string;
  /** Preenchido quando não ok. */
  reason?: string;
}

/**
 * Escolhe o toque: id "custom:<id>", nome de um som da galeria, toque embutido ou,
 * sem pedido, o único som da galeria (se só houver um). Sem nada disso, vale o toque padrão.
 */
function resolveSound(requested: string | undefined): { ref?: string; name: string; note?: string } {
  const custom = getClockState().customSounds;
  const single = custom.length === 1 ? custom[0] : undefined;
  const fallback = (note?: string) =>
    single ? { ref: soundRef(single.id), name: single.name, note } : { name: 'toque padrão', note };

  const raw = requested?.trim() ?? '';
  if (!raw) return fallback();
  if (isBuiltinSound(raw)) return { ref: raw, name: raw };

  const id = customSoundId(raw);
  const byId = id ? custom.find((c) => c.id === id) : undefined;
  if (byId) return { ref: soundRef(byId.id), name: byId.name };

  const key = normalize(raw);
  const byName = custom.find((c) => {
    const name = normalize(c.name);
    return name !== '' && (name === key || name.includes(key) || key.includes(name));
  });
  if (byName) return { ref: soundRef(byName.id), name: byName.name };

  return fallback(`Não achei "${raw}" na sua galeria de sons.`);
}

export function scheduleChatAlarm(req: ChatAlarmRequest): ChatAlarmResult {
  const time = parseClockTime(req.time);
  if (!time) return { ok: false, reason: 'Não entendi o horário. Diga algo como "07:04".' };

  const sound = resolveSound(req.soundId);
  const label = (req.label ?? '').trim();
  const days = parseDays(req.repeatDays);
  const repeat = parseRingTimes(req.ringTimes);
  const alarm = saveAlarm({ time, label: label || `Alarme às ${time}`, days, sound: sound.ref, repeat });
  if (!alarm) return { ok: false, reason: `A lista de alarmes está cheia (máximo ${CLOCK_LIMITS.alarms}).` };

  return { ok: true, alarm, soundName: sound.name, soundNote: sound.note };
}

/** Texto curto para o resumo do alarme ("07:04 · Seg a Sex · Minha música"). */
export const describeChatAlarm = (alarm: Alarm, soundName: string): string =>
  `${alarm.time} · ${describeDays(alarm.days)} · ${soundName}`;
