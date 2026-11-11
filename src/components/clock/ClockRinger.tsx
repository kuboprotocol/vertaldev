import React, { useEffect, useState, lazy, Suspense } from 'react';
import { CLOCK_STORAGE_KEY, CLOCK_CHANGE_EVENT, getClockState } from '@/lib/clock/store';

const VertalClock = lazy(() => import('@/components/clock/VertalClock').then((m) => ({ default: m.VertalClock })));

/**
 * Portal global de despertador. Mostrado em tela cheia quando um alarme/timer toca.
 * Carregado só quando há alarmes/timers habilitados.
 */
export const ClockRinger = () => {
  const [hasRinger, setHasRinger] = useState(false);

  useEffect(() => {
    const check = () => {
      const state = getClockState();
      const hasEnabled = state.alarms.some((a) => a.enabled) || state.timers.some((t) => t.endsAt !== null || t.done);
      setHasRinger(hasEnabled);
    };

    check();

    const unsubStorage = () => {
      window.addEventListener(CLOCK_CHANGE_EVENT, check);
      return () => window.removeEventListener(CLOCK_CHANGE_EVENT, check);
    };

    const stop = unsubStorage();
    return stop;
  }, []);

  if (!hasRinger) return null;

  return (
    <Suspense fallback={null}>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          zIndex: 999999,
        }}
      >
        <VertalClock ringUI="on" theme="auto" tab="relógio" />
      </div>
    </Suspense>
  );
};
