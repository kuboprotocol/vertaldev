// Vertal Chat · painel "Tarefas agendadas": lista, próxima execução, histórico, ligar/pausar,
// rodar agora, apagar, agenda e ajustes (fuso, horário de silêncio, aviso por e-mail).
import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, History, Loader2, Play, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  SCHEDULER_CHANGED_EVENT, callScheduler, setSchedulerLangSetting,
  type SchedulerRun, type SchedulerSettings, type SchedulerTaskView,
} from '@/lib/chatScheduler/client';
import { LANG_CHOICES, dateLocale, schedUi, schedulerUiLang } from '@/lib/chatScheduler/i18n';

interface AgendaEvent { id: string; title: string; starts_at: string; ends_at: string; location?: string | null; provider: string; add_to_google_url?: string | null }
interface Template { id: string; label: string; example: string }


export function SchedulerPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [tasks, setTasks] = useState<SchedulerTaskView[] | null>(null);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [settings, setSettings] = useState<SchedulerSettings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, SchedulerRun[]>>({});
  // Idioma da tela: Ajustes → Idioma (se não for automático) → navegador → pt-BR.
  const ui = schedulerUiLang(settings?.lang);
  const U = schedUi(ui);
  const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(dateLocale(ui), { dateStyle: 'short', timeStyle: 'short' }) : '—');

  const load = useCallback(async () => {
    const [t, a, s, tp] = await Promise.all([
      callScheduler<{ tasks: SchedulerTaskView[] }>('list'),
      callScheduler<{ events: AgendaEvent[] }>('agenda'),
      callScheduler<{ settings: SchedulerSettings }>('settings_get'),
      callScheduler<{ templates: Template[] }>('templates'),
    ]);
    if (t.ok) setTasks(t.data.tasks); else { setTasks([]); toast.error(t.message); }
    if (a.ok) setEvents(a.data.events);
    if (s.ok) { setSettings(s.data.settings); setSchedulerLangSetting(s.data.settings.lang); }
    if (tp.ok) setTemplates(tp.data.templates);
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    void callScheduler('mark_seen');
    const onChange = () => void load();
    window.addEventListener(SCHEDULER_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(SCHEDULER_CHANGED_EVENT, onChange);
  }, [open, load]);

  const act = async (id: string, action: string, payload: Record<string, unknown> = {}) => {
    setBusy(`${action}:${id}`);
    const r = await callScheduler<{ text?: string }>(action, { id, ...payload });
    setBusy(null);
    if (!r.ok) { toast.error(r.message); return; }
    if (action === 'run_now') toast.success(U.ranNow);
    await load();
    if (history[id]) await showHistory(id, true);
  };

  const showHistory = async (id: string, force = false) => {
    if (history[id] && !force) { setHistory(({ [id]: _drop, ...rest }) => rest); return; }
    const r = await callScheduler<{ runs: SchedulerRun[] }>('history', { id });
    if (r.ok) setHistory((h) => ({ ...h, [id]: r.data.runs }));
  };

  const saveSettings = async (patch: Record<string, unknown>) => {
    const r = await callScheduler<{ settings: SchedulerSettings }>('settings_set', { settings: patch });
    if (r.ok) {
      setSettings(r.data.settings);
      setSchedulerLangSetting(r.data.settings.lang);
      toast.success(schedUi(schedulerUiLang(r.data.settings.lang)).saved);
      if (patch.lang !== undefined) void load();
    } else toast.error(r.message);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg" data-testid="scheduler-panel">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-primary" aria-hidden /> {U.name}</SheetTitle>
          <SheetDescription>{U.description}</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="tasks" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="tasks">{U.tabTasks}</TabsTrigger>
            <TabsTrigger value="agenda">{U.tabAgenda}</TabsTrigger>
            <TabsTrigger value="settings">{U.tabSettings}</TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="space-y-3">
            <div className="flex justify-end">
              <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> {U.refresh}
              </button>
            </div>
            {tasks === null && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {U.loading}</p>}
            {tasks?.length === 0 && (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">{U.empty}</p>
                <ul className="space-y-1">
                  {templates.map((t) => (
                    <li key={t.id}>
                      <button type="button" className="text-left text-primary hover:underline" onClick={() => { void navigator.clipboard?.writeText(t.example); toast.success(U.copied); }}>
                        {t.label}: "{t.example}"
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {tasks?.map((t) => (
              <div key={t.id} className="rounded-xl border border-border/60 p-3" data-testid="scheduler-task">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{U.kind[t.kind]} · {U.status[t.status]}</p>
                    <p className="truncate font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.when_text}</p>
                    {t.status === 'active' && t.next_run_text && <p className="text-xs">{U.next}: {t.next_run_text}</p>}
                    {t.last_run_at && <p className="text-xs text-muted-foreground">{U.last}: {fmt(t.last_run_at)} ({t.last_status ?? '—'}) · {U.runs(t.run_count)}</p>}
                    {t.last_error && <p className="text-xs text-destructive">{U.error}: {t.last_error}</p>}
                    {t.send_to.length > 0 && <p className="text-xs text-muted-foreground">{U.sendTo}: {t.send_to.join(', ')}</p>}
                  </div>
                  {(t.status === 'active' || t.status === 'paused') && (
                    <Switch
                      aria-label={t.status === 'active' ? U.pause : U.activate}
                      checked={t.status === 'active'}
                      disabled={busy !== null}
                      onCheckedChange={(on) => void act(t.id, 'update', { status: on ? 'active' : 'paused' })}
                    />
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <button type="button" disabled={busy !== null} onClick={() => void act(t.id, 'run_now')} className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 hover:bg-secondary">
                    {busy === `run_now:${t.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} {U.runNow}
                  </button>
                  <button type="button" onClick={() => void showHistory(t.id)} className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 hover:bg-secondary">
                    <History className="h-3 w-3" /> {U.history}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => { if (window.confirm(U.confirmDelete(t.title))) void act(t.id, 'delete'); }}
                    className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" /> {U.del}
                  </button>
                </div>
                {history[t.id] && (
                  <ul className="mt-2 space-y-1 border-t border-border/40 pt-2 text-xs">
                    {history[t.id].length === 0 && <li className="text-muted-foreground">{U.neverRan}</li>}
                    {history[t.id].map((r) => (
                      <li key={r.id} className={cn(r.status === 'error' && 'text-destructive')}>
                        {fmt(r.started_at)} · {U.runStatus[r.status] ?? r.status}{r.sentiment ? ` · ${r.sentiment}` : ''} · {U.runTrigger[r.trigger] ?? r.trigger}
                        {(r.output || r.error) && <span className="block truncate text-muted-foreground">{(r.output ?? r.error ?? '').slice(0, 160)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="agenda" className="space-y-2">
            {events.length === 0 && <p className="text-sm text-muted-foreground">{U.agendaEmpty}</p>}
            {events.map((e) => (
              <div key={e.id} className="rounded-xl border border-border/60 p-3 text-sm">
                <p className="font-medium">{e.title}</p>
                <p className="text-xs text-muted-foreground">{fmt(e.starts_at)} – {new Date(e.ends_at).toLocaleTimeString(dateLocale(ui), { timeStyle: 'short' })}{e.location ? ` · ${e.location}` : ''}</p>
                {e.provider === 'google'
                  ? <p className="text-xs text-primary">{U.inGoogle}</p>
                  : e.add_to_google_url && <a className="text-xs text-primary hover:underline" href={e.add_to_google_url} target="_blank" rel="noreferrer">{U.addGoogle}</a>}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 text-sm">
            {settings && (
              <>
                <label className="block">
                  <span className="text-xs text-muted-foreground">{U.language}</span>
                  <select
                    data-testid="scheduler-lang"
                    className="mt-1 w-full rounded-md border border-border/60 bg-background px-2 py-1.5"
                    value={settings.lang ?? 'auto'}
                    onChange={(e) => void saveSettings({ lang: e.target.value })}
                  >
                    {LANG_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label(ui)}</option>)}
                  </select>
                  <span className="mt-1 block text-[11px] text-muted-foreground">{U.languageHint}</span>
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground">{U.timezone}</span>
                  <input
                    className="mt-1 w-full rounded-md border border-border/60 bg-background px-2 py-1.5"
                    defaultValue={settings.timezone}
                    onBlur={(e) => e.target.value !== settings.timezone && void saveSettings({ timezone: e.target.value })}
                  />
                </label>
                <div>
                  <span className="text-xs text-muted-foreground">{U.quiet}</span>
                  <div className="mt-1 flex items-center gap-2">
                    <input type="time" className="rounded-md border border-border/60 bg-background px-2 py-1" defaultValue={settings.quiet?.start ?? ''} id="quiet-start" />
                    <span>{U.until}</span>
                    <input type="time" className="rounded-md border border-border/60 bg-background px-2 py-1" defaultValue={settings.quiet?.end ?? ''} id="quiet-end" />
                    <button
                      type="button"
                      className="rounded-md border border-border/60 px-2 py-1 hover:bg-secondary"
                      onClick={() => {
                        const s = (document.getElementById('quiet-start') as HTMLInputElement | null)?.value || null;
                        const e = (document.getElementById('quiet-end') as HTMLInputElement | null)?.value || null;
                        void saveSettings({ quiet_start: s, quiet_end: e });
                      }}
                    >
                      {U.save}
                    </button>
                  </div>
                </div>
                <label className="flex items-center justify-between gap-2">
                  <span>{U.notifyEmail}</span>
                  <Switch checked={settings.notify_email} onCheckedChange={(on) => void saveSettings({ notify_email: on })} />
                </label>
              </>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export default SchedulerPanel;
