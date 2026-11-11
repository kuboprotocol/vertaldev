import { describe, expect, it } from 'vitest';
import { describeDays, nextRing, parseClockTime } from '@/lib/clock/alarms';
import { dueRings } from '@/lib/clock/engine';
import { ALARM_SOUNDS, defaultState, sanitizeState } from '@/lib/clock/store';
import { resolvePlace, zonedToUtc } from '@/lib/clock/zones';

const SP = 'America/Sao_Paulo';
// Quarta-feira, 11/11/2026, 07:00 em Brasília.
const NOW = zonedToUtc(SP, 2026, 11, 11, 7, 0);

describe('Vertal Clock', () => {
  it('lê horários escritos de vários jeitos', () => {
    expect(parseClockTime('7h30')).toBe('07:30');
    expect(parseClockTime('7:30 pm')).toBe('19:30');
    expect(parseClockTime('meio-dia')).toBe('12:00');
    expect(parseClockTime('25:00')).toBeNull();
  });

  it('calcula o próximo toque no fuso do aparelho e em outro fuso', () => {
    expect(nextRing({ time: '06:30', days: [] }, NOW, SP)).toBe(zonedToUtc(SP, 2026, 11, 12, 6, 30));
    expect(nextRing({ time: '08:00', days: [] }, NOW, SP)).toBe(zonedToUtc(SP, 2026, 11, 11, 8, 0));
    // Segunda e quarta às 06:30 de Londres: já passou hoje (10:00 lá), toca na segunda.
    expect(nextRing({ time: '06:30', days: [1, 3], tz: 'Europe/London' }, NOW, SP)).toBe(zonedToUtc('Europe/London', 2026, 11, 16, 6, 30));
    expect(describeDays([1, 2, 3, 4, 5])).toBe('Seg a Sex');
  });

  it('só dispara alarmes ligados e timers vencidos', () => {
    const state = {
      ...defaultState(),
      alarms: [
        { id: 'a', time: '07:01', label: 'Acordar', days: [], enabled: true, createdAt: 0 },
        { id: 'b', time: '07:01', label: 'Desligado', days: [], enabled: false, createdAt: 0 },
      ],
      timers: [{ id: 't', label: '', durationMs: 5000, endsAt: NOW + 30_000, remainingMs: 5000, done: false }],
    };
    expect(dueRings(state, NOW, NOW + 59_000, SP).map((r) => r.id)).toEqual(['t']);
    expect(dueRings(state, NOW, NOW + 61_000, SP).map((r) => r.id)).toEqual(['a', 't']);
  });

  it('descarta lixo vindo do armazenamento', () => {
    const state = sanitizeState({ v: 1, cities: [{ tz: 'Nao/Existe', label: 'x' }, { tz: 'Asia/Tokyo', label: 'Tóquio' }], alarms: [{ id: 'x', time: '99:99' }] });
    expect(state.cities).toEqual([{ tz: 'Asia/Tokyo', label: 'Tóquio' }]);
    expect(state.alarms).toEqual([]);
  });

  it('acha cidade por texto livre', () => {
    expect(resolvePlace('japão')?.tz).toBe('Asia/Tokyo');
    expect(resolvePlace('hora de brasília')?.tz).toBe(SP);
  });

  it('guarda o toque de cada alarme e descarta som enviado que foi removido', () => {
    const alarm = (id: string, sound: unknown) => ({ id, time: '07:00', label: '', days: [], enabled: true, createdAt: 0, sound });
    const state = sanitizeState({
      ...defaultState(),
      customSounds: [{ id: 'abc', name: 'Minha música' }],
      settings: { hour12: false, sound: 'custom:sumiu', snoozeMinutes: 9 },
      alarms: [alarm('a', 'rooster'), alarm('b', 'custom:abc'), alarm('c', 'custom:sumiu'), alarm('d', 'inventado')],
    });
    expect(state.alarms.map((a) => a.sound)).toEqual(['rooster', 'custom:abc', undefined, undefined]);
    expect(state.settings.sound).toBe('classic');
    expect(ALARM_SOUNDS).toHaveLength(21);
    expect(dueRings(state, NOW - 60_000, NOW, SP).map((r) => r.sound)).toEqual(['rooster', 'custom:abc', undefined, undefined]);
  });
});
