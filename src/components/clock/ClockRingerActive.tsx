import { useEffect, useState } from 'react';
import { AlarmClock } from 'lucide-react';
import { dismissRing, getRinging, snoozeRing, startClockEngine, subscribeRinging, type Ring } from '@/lib/clock/engine';

export default function ClockRingerActive() {
  const [rings, setRings] = useState<Ring[]>(getRinging);

  useEffect(() => {
    const stop = startClockEngine();
    const unsubscribe = subscribeRinging(setRings);
    setRings(getRinging());
    return () => {
      unsubscribe();
      stop();
    };
  }, []);

  const ring = rings[0];
  if (!ring) return null;
  const alarm = ring.kind === 'alarm';
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={alarm ? 'Alarme tocando' : 'Timer terminou'}
      className="fixed inset-0 z-[2147483000] flex flex-col items-center justify-center gap-3 bg-[#06070e]/95 p-6 text-center text-white backdrop-blur"
    >
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#8b7bff] to-[#22d3ee] motion-safe:animate-bounce">
        <AlarmClock className="h-10 w-10" aria-hidden />
      </span>
      <p className="text-7xl font-extralight tabular-nums tracking-tight">{alarm ? ring.time : '00:00'}</p>
      <p className="text-lg font-semibold">{ring.label || (alarm ? 'Alarme' : 'O timer terminou')}</p>
      {ring.tzLabel && <p className="text-sm opacity-70">{ring.tzLabel}</p>}
      <div className="mt-5 flex gap-3">
        {alarm && (
          <button type="button" onClick={() => snoozeRing(ring)} className="min-w-28 rounded-full border border-white/20 bg-white/10 px-6 py-3.5 font-bold">
            Soneca
          </button>
        )}
        <button type="button" onClick={() => dismissRing(ring)} className="min-w-28 rounded-full bg-white px-6 py-3.5 font-bold text-black">
          Parar
        </button>
      </div>
    </div>
  );
}
