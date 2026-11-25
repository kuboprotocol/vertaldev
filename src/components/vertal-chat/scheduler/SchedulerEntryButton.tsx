// Botão "Tarefas agendadas" no topo do Vertal Chat + aviso no app quando uma tarefa roda.
// Com VITE_VERTAL_CHAT_SCHEDULER desligado (padrão) não renderiza NADA: a tela existente fica idêntica.
// Com ele ligado, só aparece se o servidor liberar este usuário (VERTAL_CHAT_SCHEDULER_USER_IDS).
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { SCHEDULER_OPEN_EVENT, callScheduler, getSchedulerLangSetting, useSchedulerAccess } from '@/lib/chatScheduler/client';
import { schedUi, schedulerUiLang, useSchedulerLangs } from '@/lib/chatScheduler/i18n';

const SchedulerPanel = lazy(() => import('./SchedulerPanel'));

const POLL_MS = 60_000;

interface UnseenRun { id: string; status: string; output: string | null; error: string | null; chat_scheduled_tasks?: { title?: string } | null }

export function SchedulerEntryButton({ enabledOverride }: { enabledOverride?: boolean }) {
  const access = useSchedulerAccess(enabledOverride);
  // Idiomas além de pt/en/es: baixados só quando o Agendador está liberado.
  useSchedulerLangs(access === 'allowed');
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const shown = useRef(new Set<string>());

  useEffect(() => {
    if (access !== 'allowed') return;
    const onOpen = () => setOpen(true);
    window.addEventListener(SCHEDULER_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(SCHEDULER_OPEN_EVENT, onOpen);
  }, [access]);

  useEffect(() => {
    if (access !== 'allowed') return;
    let alive = true;
    const poll = async () => {
      if (document.visibilityState === 'hidden') return;
      const r = await callScheduler<{ count: number; runs: UnseenRun[] }>('unseen');
      if (!alive || !r.ok) return;
      setUnseen(r.data.count);
      for (const run of r.data.runs.slice(0, 3).reverse()) {
        if (shown.current.has(run.id)) continue;
        shown.current.add(run.id);
        const U = schedUi(schedulerUiLang(getSchedulerLangSetting()));
        const title = run.chat_scheduled_tasks?.title ?? U.taskFallback;
        const text = (run.output ?? run.error ?? '').replace(/[*_#>`]/g, '').slice(0, 140);
        (run.status === 'error' ? toast.error : toast.success)(`${title}`, { description: text || U.toastFallback });
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, [access]);

  if (access !== 'allowed') return null;
  const U = schedUi(schedulerUiLang(getSchedulerLangSetting()));
  return (
    <>
      <button
        type="button"
        data-testid="scheduler-entry"
        onClick={() => { setOpen(true); setUnseen(0); }}
        title={U.name}
        dir={U.dir}
        className="relative inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground/80 hover:border-primary/50"
      >
        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">{U.button}</span>
        {unseen > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-[1.1rem] text-primary-foreground">
            {unseen > 9 ? '9+' : unseen}
          </span>
        )}
      </button>
      {open && (
        <Suspense fallback={null}>
          <SchedulerPanel open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
}

export default SchedulerEntryButton;
