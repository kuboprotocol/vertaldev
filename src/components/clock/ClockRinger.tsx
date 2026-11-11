import { lazy, Suspense, useEffect, useState } from 'react';
import { CLOCK_CHANGE_EVENT, CLOCK_STORAGE_KEY } from '@/lib/clock/keys';

const ClockRingerActive = lazy(() => import('./ClockRingerActive'));

/** Há alarme ligado, soneca ou timer correndo? Lê direto do armazenamento, sem carregar o relógio. */
function hasPending(): boolean {
  try {
    const state = JSON.parse(window.localStorage.getItem(CLOCK_STORAGE_KEY) ?? 'null') as
      | { alarms?: { enabled?: boolean; snoozeUntil?: number }[]; timers?: { endsAt?: number | null }[] }
      | null;
    return Boolean(
      state?.alarms?.some((a) => a?.enabled !== false || typeof a?.snoozeUntil === 'number') ||
      state?.timers?.some((t) => typeof t?.endsAt === 'number'),
    );
  } catch {
    return false;
  }
}

/**
 * Despertador do app inteiro: o alarme toca em qualquer tela do Vertal, não só
 * com o painel do relógio aberto. O motor só é baixado quando há o que tocar.
 */
export function ClockRinger() {
  const [active, setActive] = useState(hasPending);

  useEffect(() => {
    // Uma vez ligado fica ligado: quem está tocando não pode sumir da tela.
    const check = () => setActive((on) => on || hasPending());
    const onStorage = (e: StorageEvent) => {
      if (e.key === CLOCK_STORAGE_KEY) check();
    };
    window.addEventListener(CLOCK_CHANGE_EVENT, check);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CLOCK_CHANGE_EVENT, check);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  if (!active) return null;
  return (
    <Suspense fallback={null}>
      <ClockRingerActive />
    </Suspense>
  );
}
