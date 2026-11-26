// Vertal CRM · painel lateral de um contato, empresa ou negócio: dados (com campos personalizados e etiquetas),
// notas, tarefas/lembretes, linha do tempo, anexos (Storage privado por workspace/usuário) e IA (1 crédito).
// Inspirado nas telas ContactShow/DealShow/CompanyShow do Atomic CRM (MIT, Marmelab).
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, Download, Loader2, Mail, Paperclip, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { attachmentPath, callCrm, CRM_BUCKET, crmDb, CrmError } from '@/lib/vertalCrm/client';
import { crmActivityText, crmDateTime, crmErrorText, crmSourceText, ellipsis } from '@/lib/vertalCrm/i18n';
import { CONTACT_STATUSES, TASK_TYPES, type CrmAiKind } from '../../../supabase/functions/_shared/vertalCrm/core';
import { CrmAiDialog } from './CrmAiDialog';
import { fullName, STATUS_COLORS, useCrm } from './crmState';
import { LocaleDateInput } from './LocaleDateInput';

export type RecordType = 'contact' | 'company' | 'deal';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const TABLE: Record<RecordType, string> = { contact: 'crm_contacts', company: 'crm_companies', deal: 'crm_deals' };
const FK: Record<RecordType, string> = { contact: 'contact_id', company: 'company_id', deal: 'deal_id' };

interface Props { type: RecordType; id: string | null; onClose: () => void; onChanged?: () => void; /** Tira o registro apagado da lista na hora (antes a lista só atualizava ao recarregar). */ onDeleted?: (id: string) => void }

export function CrmRecordPanel({ type, id, onClose, onChanged, onDeleted }: Props) {
  const { t, workspace, userId, canWrite, fields, tags, pipelines, money, lang } = useCrm();
  const [rec, setRec] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Row>({});
  const [notes, setNotes] = useState<Row[]>([]);
  const [tasks, setTasks] = useState<Row[]>([]);
  const [acts, setActs] = useState<Row[]>([]);
  const [files, setFiles] = useState<Row[]>([]);
  const [companies, setCompanies] = useState<Row[]>([]);
  const [note, setNote] = useState('');
  const [task, setTask] = useState({ text: '', type: 'follow-up', due: '' });
  const [ai, setAi] = useState<CrmAiKind | null>(null);
  const [busy, setBusy] = useState(false);
  const db = crmDb();
  const ws = workspace?.id ?? '';

  const load = useCallback(async () => {
    if (!id || !ws) return;
    const col = FK[type];
    const [r, n, tk, a, f, c] = await Promise.all([
      db.from(TABLE[type]).select('*').eq('workspace_id', ws).eq('id', id).maybeSingle(),
      db.from('crm_notes').select('*').eq('workspace_id', ws).eq(col, id).order('created_at', { ascending: false }).limit(100),
      db.from('crm_tasks').select('*').eq('workspace_id', ws).eq(col, id).order('due_date', { ascending: true }).limit(100),
      db.from('crm_activities').select('*').eq('workspace_id', ws).eq(col, id).order('created_at', { ascending: false }).limit(50),
      db.from('crm_attachments').select('*').eq('workspace_id', ws).eq(col, id).order('created_at', { ascending: false }),
      type === 'company' ? Promise.resolve({ data: [] }) : db.from('crm_companies').select('id, name').eq('workspace_id', ws).order('name').limit(500),
    ]);
    setRec(r.data ?? null);
    setDraft(r.data ?? {});
    setNotes(n.data ?? []);
    setTasks(tk.data ?? []);
    setActs(a.data ?? []);
    setFiles(f.data ?? []);
    setCompanies(c.data ?? []);
  }, [db, id, type, ws]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) return null;
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));
  const setCustom = (k: string, v: unknown) => setDraft((d) => ({ ...d, custom: { ...(d.custom ?? {}), [k]: v } }));

  const save = async () => {
    setBusy(true);
    const { id: _i, workspace_id: _w, created_at: _c, updated_at: _u, email_primary: _e, status: st, closed_at: _cl, ...rest } = draft;
    const patch: Row = { ...rest };
    if (type === 'contact') patch.status = st;
    if (type === 'deal') patch.amount = Number(patch.amount) || 0;
    const { error } = await db.from(TABLE[type]).update(patch).eq('workspace_id', ws).eq('id', id);
    setBusy(false);
    if (error) return toast.error(t.error);
    toast.success(t.saved);
    onChanged?.();
    void load();
  };

  const remove = async () => {
    if (!window.confirm(t.confirmDelete)) return;
    const { error } = await db.from(TABLE[type]).delete().eq('workspace_id', ws).eq('id', id);
    if (error) return toast.error(t.error);
    toast.success(t.deleted);
    onDeleted?.(id);
    onClose();
    onChanged?.();
  };

  const addNote = async () => {
    if (!note.trim()) return;
    const { error } = await db.from('crm_notes').insert({ workspace_id: ws, [FK[type]]: id, text: note.trim(), author_id: userId, status: type === 'contact' ? rec?.status : null });
    if (error) return toast.error(t.error);
    setNote('');
    if (type === 'contact') await db.from('crm_contacts').update({ last_seen: new Date().toISOString() }).eq('id', id);
    void load();
  };

  const addTask = async () => {
    if (!task.text.trim()) return;
    const due = task.due ? new Date(task.due).toISOString() : null;
    const { error } = await db.from('crm_tasks').insert({ workspace_id: ws, [FK[type]]: id, text: task.text.trim(), type: task.type, due_date: due, reminder_at: due, created_by: userId, assignee_id: userId });
    if (error) return toast.error(t.error);
    setTask({ text: '', type: 'follow-up', due: '' });
    void load();
  };

  const toggleTask = async (tk: Row) => {
    await db.from('crm_tasks').update({ done_at: tk.done_at ? null : new Date().toISOString() }).eq('id', tk.id);
    void load();
  };

  const upload = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) return toast.error('25 MB');
    const path = attachmentPath(ws, userId, file.name);
    const up = await db.storage.from(CRM_BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (up.error) return toast.error(t.error);
    const { error } = await db.from('crm_attachments').insert({ workspace_id: ws, [FK[type]]: id, path, name: file.name.slice(0, 200), size: file.size, mime: file.type || null, uploaded_by: userId });
    if (error) {
      await db.storage.from(CRM_BUCKET).remove([path]);
      return toast.error(t.error);
    }
    void load();
  };

  const openFile = async (f: Row) => {
    const { data } = await db.storage.from(CRM_BUCKET).createSignedUrl(f.path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  };
  const removeFile = async (f: Row) => {
    if (!window.confirm(t.confirmDelete)) return;
    await db.storage.from(CRM_BUCKET).remove([f.path]);
    await db.from('crm_attachments').delete().eq('id', f.id);
    void load();
  };

  const captureEmail = async () => {
    setBusy(true);
    try {
      const r = await callCrm<{ added: number }>('capture_email', { workspaceId: ws, contactId: id });
      toast.success(t.emailCaptured(r.added));
      void load();
    } catch (e) {
      toast.error(crmErrorText(e instanceof CrmError ? e.code : 'error', t));
    } finally {
      setBusy(false);
    }
  };

  const title = !rec ? t.loading : type === 'contact' ? fullName(rec) : rec.name;
  const myFields = fields.filter((f) => f.entity === type);
  const pipeline = type === 'deal' ? pipelines.find((p) => p.id === draft.pipeline_id) : null;
  const dateFmt = (s: string) => crmDateTime(s, lang);
  const stageLabel = (sid: unknown) => pipelines.flatMap((p) => p.stages).find((x) => x.id === sid)?.label ?? String(sid ?? '');

  const field = (k: string, label: string, opts: { type?: string; textarea?: boolean } = {}) => (
    <label className="block text-xs text-muted-foreground">
      {label}
      {opts.textarea ? (
        <Textarea value={draft[k] ?? ''} onChange={(e) => set(k, e.target.value)} disabled={!canWrite} rows={3} />
      ) : opts.type === 'date' ? (
        <LocaleDateInput lang={lang} value={String(draft[k] ?? '').slice(0, 10)} onChange={(v) => set(k, v)} disabled={!canWrite} ariaLabel={label} />
      ) : (
        <Input type={opts.type ?? 'text'} value={draft[k] ?? ''} onChange={(e) => set(k, e.target.value)} disabled={!canWrite} />
      )}
    </label>
  );

  return (
    <Sheet open={!!id} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" data-testid="crm-record-panel">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {type === 'contact' && rec && <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[rec.status] ?? '#999' }} />}
            {title}
            {type === 'contact' && typeof rec?.score === 'number' && <span className="rounded bg-primary/10 px-1.5 text-xs text-primary">{' '}{rec.score}/100</span>}
            {type === 'deal' && rec && <span className="text-sm font-normal text-muted-foreground">{' · '}{money(rec.amount)}</span>}
          </SheetTitle>
        </SheetHeader>
        {!rec ? (
          <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="mt-4 space-y-6 pb-10">
            {/* IA */}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setAi('summary')}><Sparkles className="h-3.5 w-3.5" />{t.ai.summary}</Button>
              {canWrite && <Button size="sm" variant="outline" onClick={() => setAi('next_action')}><Sparkles className="h-3.5 w-3.5" />{t.ai.next_action}</Button>}
              {canWrite && type !== 'company' && <Button size="sm" variant="outline" onClick={() => setAi('email')}><Sparkles className="h-3.5 w-3.5" />{t.ai.email}</Button>}
              {canWrite && type === 'contact' && <Button size="sm" variant="outline" onClick={() => setAi('score')}><Sparkles className="h-3.5 w-3.5" />{t.ai.score}</Button>}
              {canWrite && type === 'contact' && <Button size="sm" variant="ghost" onClick={captureEmail} disabled={busy}><Mail className="h-3.5 w-3.5" />{t.emailCapture}</Button>}
            </div>

            {/* Dados */}
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {type === 'contact' && (
                <>
                  {field('first_name', t.firstName)}
                  {field('last_name', t.lastName)}
                  <label className="block text-xs text-muted-foreground">{t.email}
                    <Input type="email" value={draft.emails?.[0]?.email ?? ''} disabled={!canWrite} onChange={(e) => set('emails', e.target.value ? [{ email: e.target.value.trim().toLowerCase(), type: 'Work' }, ...(draft.emails ?? []).slice(1)] : (draft.emails ?? []).slice(1))} />
                  </label>
                  <label className="block text-xs text-muted-foreground">{t.phone}
                    <Input value={draft.phones?.[0]?.number ?? ''} disabled={!canWrite} onChange={(e) => set('phones', e.target.value ? [{ number: e.target.value, type: 'Work' }, ...(draft.phones ?? []).slice(1)] : (draft.phones ?? []).slice(1))} />
                  </label>
                  {field('title', t.jobTitle)}
                  <label className="block text-xs text-muted-foreground">{t.status}
                    <select className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm" value={draft.status ?? 'cold'} disabled={!canWrite} onChange={(e) => set('status', e.target.value)}>
                      {CONTACT_STATUSES.map((s) => <option key={s} value={s}>{t.contactStatus[s]}</option>)}
                    </select>
                  </label>
                </>
              )}
              {type === 'company' && (
                <>
                  {field('name', t.company)}
                  {field('website', t.website)}
                  {field('phone', t.phone)}
                  {field('city', t.city)}
                  {field('sector', t.sector)}
                  {field('tax_id', t.taxId)}
                  {field('address', t.address)}
                </>
              )}
              {type === 'deal' && (
                <>
                  {field('name', t.dealName)}
                  {field('amount', t.amount, { type: 'number' })}
                  <label className="block text-xs text-muted-foreground">{t.stage}
                    <select className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm" value={draft.stage ?? ''} disabled={!canWrite} onChange={(e) => set('stage', e.target.value)}>
                      {(pipeline?.stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </label>
                  {field('expected_closing_date', t.closeDate, { type: 'date' })}
                  {field('category', t.category)}
                </>
              )}
              {type !== 'company' && (
                <label className="block text-xs text-muted-foreground">{t.company}
                  <select className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm" value={draft.company_id ?? ''} disabled={!canWrite} onChange={(e) => set('company_id', e.target.value || null)}>
                    <option value="">—</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              )}
              {myFields.map((f) => (
                <label key={f.id} className="block text-xs text-muted-foreground">{f.label}
                  {f.type === 'select' ? (
                    <select className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm" value={draft.custom?.[f.key] ?? ''} disabled={!canWrite} onChange={(e) => setCustom(f.key, e.target.value)}>
                      <option value="">—</option>
                      {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'boolean' ? (
                    <input type="checkbox" className="mt-2 block" checked={draft.custom?.[f.key] === true} disabled={!canWrite} onChange={(e) => setCustom(f.key, e.target.checked)} />
                  ) : (
                    <Input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text'} value={draft.custom?.[f.key] ?? ''} disabled={!canWrite} onChange={(e) => setCustom(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)} />
                  )}
                </label>
              ))}
              <div className="sm:col-span-2">{field(type === 'deal' ? 'description' : type === 'company' ? 'description' : 'background', type === 'contact' ? t.background : t.description, { textarea: true })}</div>
              {tags.length > 0 && (
                <div className="sm:col-span-2">
                  <p className="mb-1 text-xs text-muted-foreground">{t.tags}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tg) => {
                      const on = (draft.tags ?? []).includes(tg.id);
                      return (
                        <button key={tg.id} type="button" disabled={!canWrite} onClick={() => set('tags', on ? (draft.tags ?? []).filter((x: string) => x !== tg.id) : [...(draft.tags ?? []), tg.id])}
                          className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-transparent text-white' : 'text-muted-foreground'}`} style={on ? { background: tg.color } : undefined}>
                          {tg.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {canWrite && (
                <div className="flex gap-2 sm:col-span-2">
                  <Button onClick={save} disabled={busy}>{t.save}</Button>
                  <Button variant="ghost" className="text-destructive" onClick={remove}><Trash2 className="h-4 w-4" />{t.delete}</Button>
                </div>
              )}
              {type === 'contact' && rec.score_reason && <p className="text-xs text-muted-foreground sm:col-span-2">{t.score}: {rec.score_reason}</p>}
              <p className="text-[11px] text-muted-foreground sm:col-span-2">{t.source}: {crmSourceText(rec.source, t)}</p>
            </section>

            {/* Notas */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">{t.notes}</h3>
              {canWrite && (
                <div className="mb-3 space-y-2">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.notePlaceholder} rows={2} />
                  <Button size="sm" onClick={addNote} disabled={!note.trim()}>{t.addNote}</Button>
                </div>
              )}
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-lg border p-2 text-sm">
                    <p className="whitespace-pre-wrap">{n.text}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{dateFmt(n.created_at)} · {crmSourceText(n.source, t)}</p>
                  </li>
                ))}
              </ul>
            </section>

            {/* Tarefas */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">{t.tasks}</h3>
              {canWrite && (
                <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                  <Input value={task.text} onChange={(e) => setTask({ ...task, text: e.target.value })} placeholder={t.taskText} />
                  <select className="h-10 rounded-md border bg-background px-2 text-sm" value={task.type} onChange={(e) => setTask({ ...task, type: e.target.value })}>
                    {TASK_TYPES.map((tt) => <option key={tt} value={tt}>{t.taskTypes[tt]}</option>)}
                  </select>
                  <LocaleDateInput withTime lang={lang} value={task.due} onChange={(v) => setTask((cur) => ({ ...cur, due: v }))} ariaLabel={t.due} />
                  <Button size="sm" onClick={addTask} disabled={!task.text.trim()}>{t.addTask}</Button>
                </div>
              )}
              <ul className="space-y-1">
                {tasks.map((tk) => (
                  <li key={tk.id} className="flex items-center gap-2 text-sm">
                    <button type="button" onClick={() => toggleTask(tk)} disabled={!canWrite} aria-label={t.done}>
                      {tk.done_at ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4" />}
                    </button>
                    <span className={tk.done_at ? 'line-through text-muted-foreground' : ''}>{t.taskTypes[tk.type] ?? tk.type}: {tk.text}</span>
                    {tk.due_date && <span className={`ml-auto pl-1 text-xs ${!tk.done_at && new Date(tk.due_date) < new Date() ? 'text-destructive' : 'text-muted-foreground'}`}>{dateFmt(tk.due_date)}</span>}
                  </li>
                ))}
              </ul>
            </section>

            {/* Anexos */}
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4" />{t.attachments}</h3>
              {canWrite && <input type="file" className="mb-2 text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} aria-label={t.upload} />}
              <ul className="space-y-1">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-sm">
                    <button type="button" className="flex items-center gap-1 hover:text-primary" onClick={() => openFile(f)}><Download className="h-3.5 w-3.5" />{f.name}</button>
                    <span className="text-xs text-muted-foreground">{Math.ceil((f.size ?? 0) / 1024)} KB</span>
                    {canWrite && <button type="button" className="ml-auto text-muted-foreground hover:text-destructive" onClick={() => removeFile(f)} aria-label={t.delete}><Trash2 className="h-3.5 w-3.5" /></button>}
                  </li>
                ))}
              </ul>
            </section>

            {/* Linha do tempo */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">{t.timeline}</h3>
              <ol className="space-y-1 border-l pl-3 text-xs">
                {acts.map((a) => (
                  <li key={a.id}>
                    <span className="text-muted-foreground">{dateFmt(a.created_at)}</span> · {crmActivityText(a.kind, t)}
                    {a.data?.from && <> ({stageLabel(a.data.from)} → {stageLabel(a.data.to)})</>} {a.summary && <span className="text-muted-foreground" title={String(a.summary)}>— {ellipsis(String(a.summary), 80)}</span>}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
        {ai && <CrmAiDialog kind={ai} entityType={type} entityId={id} open={!!ai} onOpenChange={(v) => !v && setAi(null)} onDone={() => void load()} />}
      </SheetContent>
    </Sheet>
  );
}
