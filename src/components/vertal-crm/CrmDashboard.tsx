// Vertal CRM · painel (valor do funil, previsão ponderada, taxa de ganho, por etapa e por mês)
// e tarefas/lembretes. Ideia do Dashboard do Atomic CRM (MIT, Marmelab); métricas novas em core.computeMetrics.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { crmDb } from '@/lib/vertalCrm/client';
import { crmActivityText, crmDateTime, ellipsis } from '@/lib/vertalCrm/i18n';
import { computeMetrics, TASK_TYPES, type MetricDeal } from '../../../supabase/functions/_shared/vertalCrm/core';
import { fullName, useCrm } from './crmState';
import { LocaleDateInput } from './LocaleDateInput';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Bars({ rows, money }: { rows: Array<{ label: string; value: number; sub?: number }>; money: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="text-xs">
          <div className="flex justify-between gap-2"><span>{r.label}</span>{' '}<span className="text-muted-foreground">{money(r.value)}{r.sub !== undefined ? ` · ${money(r.sub)}` : ''}</span></div>
          <div className="mt-0.5 h-1.5 rounded bg-muted"><div className="h-1.5 rounded bg-primary" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function CrmTasksList({ compact = false }: { compact?: boolean }) {
  const { t, workspace, canWrite, userId, lang } = useCrm();
  const [tasks, setTasks] = useState<Row[]>([]);
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [type, setType] = useState('follow-up');
  const [showDone, setShowDone] = useState(false);
  const db = crmDb();
  const ws = workspace?.id ?? '';

  const load = useCallback(async () => {
    if (!ws) return;
    let q = db.from('crm_tasks').select('*, crm_contacts(first_name, last_name), crm_deals(name)').eq('workspace_id', ws);
    if (!showDone) q = q.is('done_at', null);
    const { data } = await q.order('due_date', { ascending: true, nullsFirst: false }).limit(compact ? 8 : 300);
    setTasks(data ?? []);
  }, [db, ws, showDone, compact]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!text.trim()) return;
    const d = due ? new Date(due).toISOString() : null;
    const { error } = await db.from('crm_tasks').insert({ workspace_id: ws, text: text.trim(), type, due_date: d, reminder_at: d, created_by: userId, assignee_id: userId });
    if (error) return toast.error(t.error);
    setText('');
    setDue('');
    void load();
  };
  const toggle = async (tk: Row) => {
    await db.from('crm_tasks').update({ done_at: tk.done_at ? null : new Date().toISOString() }).eq('id', tk.id);
    void load();
  };

  const now = Date.now();
  const endToday = new Date();
  endToday.setHours(23, 59, 59, 999);
  const group = (tk: Row) => (tk.done_at ? t.done : !tk.due_date ? t.upcoming : new Date(tk.due_date).getTime() < now ? t.overdue : new Date(tk.due_date) <= endToday ? t.today : t.upcoming);
  const groups = [t.overdue, t.today, t.upcoming, t.done];
  return (
    <div className="space-y-3">
      {canWrite && !compact && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.taskText} />
          <select className="h-10 rounded-md border bg-background px-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
            {TASK_TYPES.map((tt) => <option key={tt} value={tt}>{t.taskTypes[tt]}</option>)}
          </select>
          <LocaleDateInput withTime lang={lang} value={due} onChange={setDue} ariaLabel={t.due} />
          <Button onClick={add} disabled={!text.trim()}><Plus className="h-4 w-4" />{t.addTask}</Button>
        </div>
      )}
      {!compact && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />{t.done}</label>}
      {tasks.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{t.empty}</p>}
      {groups.map((g) => {
        const list = tasks.filter((tk) => group(tk) === g);
        if (!list.length) return null;
        return (
          <div key={g}>
            <p className={`mb-1 text-xs font-semibold ${g === t.overdue ? 'text-destructive' : 'text-muted-foreground'}`}>{g}</p>
            <ul className="space-y-1">
              {list.map((tk) => (
                <li key={tk.id} className="flex items-center gap-2 text-sm">
                  <button type="button" onClick={() => toggle(tk)} disabled={!canWrite} aria-label={t.done}>{tk.done_at ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4" />}</button>
                  <span className={`min-w-0 flex-1 truncate ${tk.done_at ? 'line-through text-muted-foreground' : ''}`}>
                    {t.taskTypes[tk.type] ?? tk.type}: {tk.text}
                    {tk.crm_contacts && <span className="text-muted-foreground"> · {fullName(tk.crm_contacts)}</span>}
                    {tk.crm_deals && <span className="text-muted-foreground"> · {tk.crm_deals.name}</span>}
                  </span>
                  {tk.due_date && <span className="shrink-0 text-xs text-muted-foreground">{' '}{crmDateTime(tk.due_date, lang)}</span>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function CrmDashboard() {
  const { t, workspace, pipelines, money, lang } = useCrm();
  const [deals, setDeals] = useState<MetricDeal[]>([]);
  const [hot, setHot] = useState<Row[]>([]);
  const [acts, setActs] = useState<Row[]>([]);
  const db = crmDb();
  const ws = workspace?.id ?? '';

  useEffect(() => {
    if (!ws) return;
    void (async () => {
      const [d, h, a] = await Promise.all([
        db.from('crm_deals').select('amount, stage, status, pipeline_id, expected_closing_date, closed_at, archived_at, created_at').eq('workspace_id', ws).limit(5000),
        db.from('crm_contacts').select('id, first_name, last_name, email_primary, score, status').eq('workspace_id', ws).in('status', ['hot', 'warm']).order('score', { ascending: false, nullsFirst: false }).limit(8),
        db.from('crm_activities').select('kind, summary, created_at').eq('workspace_id', ws).order('created_at', { ascending: false }).limit(12),
      ]);
      setDeals(d.data ?? []);
      setHot(h.data ?? []);
      setActs(a.data ?? []);
    })();
  }, [db, ws]);

  const m = useMemo(() => computeMetrics(deals, pipelines), [deals, pipelines]);
  const pct = m.winRate === null ? '—' : `${Math.round(m.winRate * 100)}%`;
  return (
    <div className="space-y-6" data-testid="crm-dashboard">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t.dash.pipelineValue} value={money(m.openValue)} hint={t.openDealsN(m.openCount)} />
        <Stat label={t.dash.forecast} value={money(m.weightedForecast)} />
        <Stat label={t.dash.winRate} value={pct} hint={`${m.wonCount} ${t.won} · ${m.lostCount} ${t.lost}`} />
        <Stat label={t.dash.wonValue} value={money(m.wonValue)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border p-3">
          <h3 className="mb-2 text-sm font-semibold">{t.dash.byStage}</h3>
          <Bars money={money} rows={pipelines.flatMap((p) => p.stages.map((s) => {
            const r = m.byStage.find((x) => x.pipelineId === p.id && x.stage === s.id);
            return { label: `${pipelines.length > 1 ? `${p.name} · ` : ''}${s.label} (${r?.count ?? 0})`, value: r?.value ?? 0 };
          }))} />
        </section>
        <section className="rounded-xl border p-3">
          <h3 className="mb-2 text-sm font-semibold">{t.dash.byMonth}</h3>
          {m.forecastByMonth.length === 0 ? <p className="text-xs text-muted-foreground">{t.empty}</p> : (
            <Bars money={money} rows={m.forecastByMonth.map((x) => ({ label: x.month === 'sem-data' ? t.dash.noDate : x.month, value: x.value, sub: x.weighted }))} />
          )}
        </section>
        <section className="rounded-xl border p-3">
          <h3 className="mb-2 text-sm font-semibold">{t.dash.tasksToday}</h3>
          <CrmTasksList compact />
        </section>
        <section className="rounded-xl border p-3">
          <h3 className="mb-2 text-sm font-semibold">{t.dash.hot}</h3>
          <ul className="space-y-1 text-sm">
            {hot.map((c) => <li key={c.id} className="flex justify-between"><span>{fullName(c)}</span><span className="text-xs text-muted-foreground">{t.contactStatus[c.status]}{typeof c.score === 'number' ? ` · ${c.score}` : ''}</span></li>)}
            {!hot.length && <li className="text-xs text-muted-foreground">{t.empty}</li>}
          </ul>
          <h3 className="mb-2 mt-4 text-sm font-semibold">{t.dash.latest}</h3>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {acts.map((a, i) => (
              <li key={i} title={String(a.summary ?? '')}>
                {crmActivityText(a.kind, t)}{a.summary ? ` · ${ellipsis(String(a.summary), 60)}` : ''}
                {a.created_at ? <span className="opacity-70"> · {crmDateTime(a.created_at, lang)}</span> : null}
              </li>
            ))}
            {!acts.length && <li>{t.empty}</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
