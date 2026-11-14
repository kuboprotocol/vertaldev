import { beforeEach, describe, expect, it } from 'vitest';
import { scheduleChatAlarm } from '@/lib/clock/chatAlarm';
import { CLOCK_STORAGE_KEY, addCustomSound, getClockState, resetClockCache, soundRef } from '@/lib/clock/store';

// Ambiente sem navegador: um localStorage em memória basta para o estado do relógio.
const memory = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => (memory.has(k) ? memory.get(k)! : null),
  setItem: (k: string, v: string) => void memory.set(k, String(v)),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
  key: () => null,
  length: 0,
} as unknown as Storage;

beforeEach(() => {
  memory.clear();
  (globalThis as any).localStorage = fakeStorage;
  (globalThis as any).window ??= { dispatchEvent: () => true, addEventListener: () => undefined, removeEventListener: () => undefined };
  resetClockCache();
});

describe('alarme pedido pelo Vertal Chat', () => {
  it('grava 07:04 no relógio com o som da galeria quando há um só', () => {
    addCustomSound('minhamusica01', 'Minha Música');
    const res = scheduleChatAlarm({ time: '07:04' });
    expect(res.ok).toBe(true);
    expect(res.alarm).toBeDefined();
    if (!res.alarm) return;
    expect(res.alarm.time).toBe('07:04');
    expect(res.alarm.sound).toBe(soundRef('minhamusica01'));
    expect(res.soundName).toBe('Minha Música');
    expect(getClockState().alarms).toHaveLength(1);
    expect(memory.get(CLOCK_STORAGE_KEY)).toContain('07:04');
  });

  it('acha o som da galeria pelo nome e aceita repetição', () => {
    addCustomSound('aaa111', 'Bom Dia Sol');
    addCustomSound('bbb222', 'Chuva Calma');
    const res = scheduleChatAlarm({ time: '7h04', soundId: 'chuva calma', repeatDays: [1, 2, 3, 4, 5] });
    expect(res.alarm?.sound).toBe(soundRef('bbb222'));
    expect(res.alarm?.days).toEqual([1, 2, 3, 4, 5]);
  });

  it('avisa quando o som pedido não existe e toca o padrão se a galeria tem vários', () => {
    addCustomSound('aaa111', 'Bom Dia Sol');
    addCustomSound('bbb222', 'Chuva Calma');
    const res = scheduleChatAlarm({ time: '07:04', soundId: 'alarm-1' });
    expect(res.ok).toBe(true);
    if (!res.alarm) return;
    expect(res.alarm.sound).toBeUndefined();
    expect(res.soundNote).toMatch(/Não achei/);
  });

  it('recusa horário inválido', () => {
    expect(scheduleChatAlarm({ time: '25:00' }).ok).toBe(false);
  });
});
