// API pública do Vertal Clock — para uso em qualquer site/app
import { defineVertalClock } from './element';
import {
  addCity, removeCity, saveAlarm, removeAlarm, setAlarmEnabled,
  startTimer, removeTimer, getClockState, updateSettings,
} from '@/lib/clock/store';
import { resolvePlace, searchCities } from '@/lib/clock/zones';

// Registra o elemento
defineVertalClock();

// API global
declare global {
  interface Window {
    VertalClock?: typeof VertalClockAPI;
  }
}

const VertalClockAPI = {
  // Cidades
  addCity: (query: string): boolean => {
    const city = resolvePlace(query);
    return city ? addCity(city.tz, city.city) : false;
  },
  removeCity: (index: number): void => removeCity(index),
  searchCities: (query: string, limit?: number) => searchCities(query, limit),

  // Alarmes
  setAlarm: (time: string, label?: string, days?: number[], place?: string) => {
    const tz = place ? resolvePlace(place)?.tz : undefined;
    return saveAlarm({ time, label, days, tz }, undefined);
  },
  listAlarms: () => getClockState().alarms,
  removeAlarm: (id: string): void => removeAlarm(id),
  enableAlarm: (id: string, enabled: boolean): void => setAlarmEnabled(id, enabled),

  // Timers
  startTimer: (seconds: number, label?: string) => startTimer(seconds * 1000, label),
  cancelTimer: (id: string): void => removeTimer(id),

  // Configurações
  setTimeFormat: (hour12: boolean): void => updateSettings({ hour12 }),
  setSnoozeDuration: (minutes: number): void => updateSettings({ snoozeMinutes: minutes }),
  setSound: (sound: 'classic' | 'digital' | 'gentle'): void => updateSettings({ sound }),

  // Estado
  getState: () => getClockState(),
};

export { VertalClockAPI };
if (typeof window !== 'undefined') {
  window.VertalClock = VertalClockAPI;
}

// Re-exporta componentes para uso React interno
export { VertalClockElement, defineVertalClock } from './element';
