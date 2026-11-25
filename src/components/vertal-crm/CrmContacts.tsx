// Vertal CRM · contatos e empresas: lista com busca, filtros (status, etiqueta), busca com IA (1 crédito),
// importar/exportar CSV (formato do Atomic CRM, MIT) e criação rápida.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Plus, Sparkles, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { crmDb, downloadText } from '@/lib/vertalCrm/client';
import { CONTACT_EXPORT_HEADERS, CONTACT_STATUSES, csvToContacts, toCsv } from '../../../supabase/functions/_shared/vertalCrm/core';
import { CrmAiDialog } from './CrmAiDialog';
import { fullName, STATUS_COLORS, useCrm } from './crmState';
import { CrmRecordPanel } from './CrmRecordPanel';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const clean = (s: string) => s.replace(/[%_,()*\\]/g, ' ').trim();

export function CrmContacts() {
  const { t, workspace, canWrite, tags, userId } = useCrm();
  const [rows, setRows] = useState<Row[]>([]);
  const [companies, setCompanies] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [aiQuery, setAiQuery] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiIds, setAiIds] = useState<string[] | null>(null);
  const [creating, setCreating] = useState({ first_name: '', last_name: '', email: '', company: '' });
  const [showNew, setShowNew] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const db = crmDb();
  const ws = workspace?.id ?? '';

  const load = useCallback(async () => {
    if (!ws) return;
    let query = db.from('crm_contacts').select('*').eq('workspace_id', ws);
    const s = clean(q);
    if (s) query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,email_primary.ilike.%${s}%,title.ilike.%${s}%`);
    if (status) query = query.eq('status', status);
    if (tag) query = query.contains('tags', [tag]);
    if (aiIds) query = query.in('id', aiIds.length ? aiIds : ['00000000-0000-0000-0000-000000000000']);
    const { data } = await query.order('last_seen', { ascending: false }).limit(500);
    setRows(data ?? []);
    const ids = [...new Set((data ?? []).map((r: Row) => r.company_id).filter(Boolean))];
    if (ids.length) {
      const { data: cs } = await db.from('crm_companies').select('id, name').in('id', ids);
      setCompanies(Object.fromEntries((cs ?? []).map((c: Row) => [c.id, c.name])));
    }
  }, [db, ws, q, status, tag, aiIds]);

  useEffect(() => {
    const h = setTimeout(() => void load(), 200);
    return () => clearTimeout(h);
  }, [load]);

  const companyIdFor = async (name: string): Promise<string | null> => {
    const n = name.trim();
    if (!n) return null;
    const { data } = await db.from('crm_companies').select('id').eq('workspace_id', ws).ilike('name', clean(n)).limit(1);
    if (data?.[0]) return data[0].id;
    const { data: c } = await db.from('crm_companies').insert({ workspace_id: ws, name: n.slice(0, 200), source: 'manual', owner_id: userId }).select('id').single();
    return c?.id ?? null;
  };

  const create = async () => {
    const c = creating;
    if (!c.first_name.trim() && !c.email.trim()) return;
    const company_id = await companyIdFor(c.company);
    const { data, error } = await db.from('crm_contacts').insert({
      workspace_id: ws, first_name: c.first_name.trim(), last_name: c.last_name.trim(), company_id, owner_id: userId,
      emails: c.email.trim() ? [{ email: c.email.trim().toLowerCase(), type: 'Work' }] : [],
    }).select('id').single();
    if (error) return toast.error(t.error);
    setCreating({ first_name: '', last_name: '', email: '', company: '' });
    setShowNew(false);
    void load();
    setOpen(data.id);
  };

  const importCsv = async (file: File) => {
    const text = await file.text();
    const { contacts, skipped } = csvToContacts(text);
    const tagIds = new Map(tags.map((x) => [x.name.toLowerCase(), x.id]));
    let n = 0;
    const companyCache = new Map<string, string | null>();
    for (const c of contacts) {
      let company_id: string | null = null;
      if (c.company) {
        if (!companyCache.has(c.company)) companyCache.set(c.company, await companyIdFor(c.company));
        company_id = companyCache.get(c.company) ?? null;
      }
      const tIds: string[] = [];
      for (const name of c.tags) {
        let id = tagIds.get(name.toLowerCase());
        if (!id) {
          const { data } = await db.from('crm_tags').insert({ workspace_id: ws, name: name.slice(0, 60) }).select('id').single();
          if (data?.id) tagIds.set(name.toLowerCase(), (id = data.id));
        }
        if (id) tIds.push(id);
      }
      const { error } = await db.from('crm_contacts').insert({
        workspace_id: ws, first_name: c.first_name, last_name: c.last_name, title: c.title, emails: c.emails, phones: c.phones,
        background: c.background, status: c.status, tags: tIds, linkedin_url: c.linkedin_url, has_newsletter: c.has_newsletter,
        company_id, source: 'csv', owner_id: userId,
      });
      if (!error) n++;
    }
    toast.success(t.csv.imported(n, skipped));
    void load();
  };

  const exportCsv = async () => {
    const { data } = await db.from('crm_contacts').select('*').eq('workspace_id', ws).limit(10000);
    const { data: cs } = await db.from('crm_companies').select('id, name').eq('workspace_id', ws).limit(10000);
    const cmap = new Map((cs ?? []).map((c: Row) => [c.id, c.name]));
    const tmap = new Map(tags.map((x) => [x.id, x.name]));
    const byType = (list: Row[], type: string, k: string) => list?.find((e) => e.type === type)?.[k] ?? '';
    const rowsOut = (data ?? []).map((c: Row) => ({
      ...c, tags: (c.tags ?? []).map((id: string) => tmap.get(id)).filter(Boolean), company: cmap.get(c.company_id) ?? '',
      email_work: byType(c.emails, 'Work', 'email') || c.emails?.[0]?.email || '', email_home: byType(c.emails, 'Home', 'email'), email_other: byType(c.emails, 'Other', 'email'),
      phone_work: byType(c.phones, 'Work', 'number') || c.phones?.[0]?.number || '', phone_home: byType(c.phones, 'Home', 'number'), phone_other: byType(c.phones, 'Other', 'number'),
    }));
    downloadText(`vertal-crm-contatos-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(CONTACT_EXPORT_HEADERS, rowsOut));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={q} onChange={(e) => { setQ(e.target.value); setAiIds(null); }} placeholder={t.search} className="sm:max-w-xs" />
        <select className="h-10 rounded-md border bg-background px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t.status}>
          <option value="">{t.status}</option>
          {CONTACT_STATUSES.map((s) => <option key={s} value={s}>{t.contactStatus[s]}</option>)}
        </select>
        {tags.length > 0 && (
          <select className="h-10 rounded-md border bg-background px-2 text-sm" value={tag} onChange={(e) => setTag(e.target.value)} aria-label={t.tags}>
            <option value="">{t.tags}</option>
            {tags.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
        <div className="flex gap-2 sm:ml-auto">
          {canWrite && <Button size="sm" onClick={() => setShowNew((v) => !v)}><Plus className="h-4 w-4" />{t.new}</Button>}
          {canWrite && <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} title={t.csv.hint}><Upload className="h-4 w-4" />{t.csv.import}</Button>}
          <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-4 w-4" />{t.csv.export}</Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ''; }} />
        </div>
      </div>

      <div className="flex gap-2">
        <Input value={aiQuery} onChange={(e) => setAiQuery(e.target.value)} placeholder={t.aiSearchPlaceholder} maxLength={300} />
        <Button variant="outline" disabled={!aiQuery.trim()} onClick={() => setAiOpen(true)}><Sparkles className="h-4 w-4" />{t.aiSearch}</Button>
        {aiIds && <Button variant="ghost" onClick={() => setAiIds(null)}>×</Button>}
      </div>

      {showNew && (
        <div className="grid grid-cols-1 gap-2 rounded-xl border p-3 sm:grid-cols-5">
          <Input placeholder={t.firstName} value={creating.first_name} onChange={(e) => setCreating({ ...creating, first_name: e.target.value })} />
          <Input placeholder={t.lastName} value={creating.last_name} onChange={(e) => setCreating({ ...creating, last_name: e.target.value })} />
          <Input placeholder={t.email} type="email" value={creating.email} onChange={(e) => setCreating({ ...creating, email: e.target.value })} />
          <Input placeholder={t.company} value={creating.company} onChange={(e) => setCreating({ ...creating, company: e.target.value })} />
          <Button onClick={create}>{t.save}</Button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <ul className="divide-y rounded-xl border" data-testid="crm-contacts-list">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpen(r.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/50">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLORS[r.status] ?? '#999' }} title={t.contactStatus[r.status]} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{fullName(r)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[r.title, companies[r.company_id], r.email_primary].filter(Boolean).join(' · ')}</span>
                </span>
                {typeof r.score === 'number' && <span className="text-xs text-primary">{r.score}</span>}
                <span className="hidden gap-1 sm:flex">
                  {(r.tags ?? []).slice(0, 3).map((id: string) => {
                    const tg = tags.find((x) => x.id === id);
                    return tg ? <span key={id} className="rounded-full px-1.5 text-[10px] text-white" style={{ background: tg.color }}>{tg.name}</span> : null;
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <CrmRecordPanel type="contact" id={open} onClose={() => setOpen(null)} onChanged={load} />
      <CrmAiDialog kind="search" query={aiQuery} open={aiOpen} onOpenChange={setAiOpen}
        onDone={(r) => {
          const f = r.filter as { entity?: string } | undefined;
          if (!f || f.entity === 'contacts') setAiIds(((r.items as Row[]) ?? []).map((x) => x.id));
        }} />
    </div>
  );
}

export function CrmCompanies() {
  const { t, workspace, canWrite, userId } = useCrm();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const db = crmDb();
  const ws = workspace?.id ?? '';

  const load = useCallback(async () => {
    if (!ws) return;
    let query = db.from('crm_companies').select('*').eq('workspace_id', ws);
    const s = clean(q);
    if (s) query = query.or(`name.ilike.%${s}%,sector.ilike.%${s}%,city.ilike.%${s}%`);
    const { data } = await query.order('name').limit(500);
    setRows(data ?? []);
  }, [db, ws, q]);

  useEffect(() => {
    const h = setTimeout(() => void load(), 200);
    return () => clearTimeout(h);
  }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    const { data, error } = await db.from('crm_companies').insert({ workspace_id: ws, name: name.trim().slice(0, 200), owner_id: userId }).select('id').single();
    if (error) return toast.error(t.error);
    setName('');
    void load();
    setOpen(data.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} className="sm:max-w-xs" />
        {canWrite && (
          <div className="flex gap-2 sm:ml-auto">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.company} />
            <Button onClick={create} disabled={!name.trim()}><Plus className="h-4 w-4" />{t.new}</Button>
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpen(r.id)} className="w-full rounded-xl border p-3 text-left hover:border-primary/40">
                <p className="truncate font-medium">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">{[r.sector, r.city, r.website].filter(Boolean).join(' · ') || '—'}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
      <CrmRecordPanel type="company" id={open} onClose={() => setOpen(null)} onChanged={load} />
    </div>
  );
}
