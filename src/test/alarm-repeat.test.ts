import { beforeEach, describe, expect, it } from 'vitest';
import { RING_TIMES, parseRingTimes } from '@/lib/clock/alarms';
import { clipOffsets, CLIP_SECONDS } from '@/lib/clock/sound';
import { scheduleChatAlarm } from '@/lib/clock/chatAlarm';
import { getClockState, resetClockCache, sanitizeState, saveAlarm } from '@/lib/clock/store';

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  (globalThis as unknown as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (memory.has(k) ? memory.get(k)! : null),
    setItem: (k: string, v: string) => void memory.set(k, String(v)),
    removeItem: (k: string) => void memory.delete(k),
    clear: () => memory.clear(),
    key: () => null,
    length: 0,
  };
  (globalThis as unknown as Record<string, unknown>).window ??= { dispatchEvent: () => true, addEventListener: () => undefined, removeEventListener: () => undefined };
  resetClockCache();
});

describe('toque de 15 s e repetições', () => {
  it('o toque dura 15 s', () => {
    expect(CLIP_SECONDS).toBe(15);
  });

  it('galo (2,85 s, pausa 1,5 s) repete dentro dos 15 s sem cortar o canto', () => {
    const offs = clipOffsets(2.847, 15, 1.5);
    expect(offs.length).toBe(3);
    expect(offs[0]).toBe(0);
    expect(offs[2]).toBeCloseTo(2 * (2.847 + 1.5), 3);
    // Nenhuma repetição termina depois dos 15 s.
    for (const o of offs) expect(o + 2.847).toBeLessThanOrEqual(15);
  });

  it('gravação maior que 15 s é cortada e não repete', () => {
    expect(clipOffsets(20.9, 15, 0)).toEqual([0]);
  });

  it('valores de repetição aceitos e leitura do chat', () => {
    expect(RING_TIMES).toEqual([1, 2, 3, 4, 5, 10]);
    expect(parseRingTimes('5x')).toBe(5);
    expect(parseRingTimes('10×')).toBe(10);
    expect(parseRingTimes(3)).toBe(3);
    expect(parseRingTimes(7)).toBe(1);
    expect(parseRingTimes(undefined)).toBe(1);
  });

  it('salva a escolha de repetição no alarme e rejeita valor inválido ao ler', () => {
    const a = saveAlarm({ time: '07:04', repeat: 10 });
    expect(a?.repeat).toBe(10);
    expect(getClockState().alarms[0].repeat).toBe(10);
    const clean = sanitizeState({ ...getClockState(), alarms: [{ id: 'abc', time: '07:04', repeat: 7, createdAt: 1 }] });
    expect(clean.alarms[0].repeat).toBeUndefined();
  });

  it('pedido do chat leva a repetição para o alarme', () => {
    const res = scheduleChatAlarm({ time: '07:04', ringTimes: 4 });
    expect(res.ok && res.alarm?.repeat).toBe(4);
  });
});
