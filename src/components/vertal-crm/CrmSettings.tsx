// Vertal CRM · configurações: workspace, funis/etapas, etiquetas, campos personalizados, equipe e papéis,
// CRMs externos (4 créditos para ativar, 2 por sincronização com IA), API/webhooks e importações.
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { callCrm, crmDb, CrmError, newIdempotencyKey } from '@/lib/vertalCrm/client';
import { crmErrorText } from '@/lib/vertalCrm/i18n';
import { CRM_EVENT_TYPES, normalizeStages, type CrmPipeline, type CrmStage } from '../../../supabase/functions/_shared/vertalCrm/core';
import { useCrm } from './crmState';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div><h3 className="font-semibold">{title}</h3>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
      {children}
    </section>
  );
}

function PipelineEditor({ p, onSaved }: { p: CrmPipeline | null; onSaved: () => void }) {
  const { t, workspace } = useCrm();
  const [name, setName] = useState(p?.name ?? '');
  const [stages, setStages] = useState<CrmStage[]>(p?.stages ?? [{ id: '', label: '', probability: 10, kind: 'open' }]);
  const upd = (i: number, k: keyof CrmStage, v: unknown) => setStages((s) => s.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const save = async () => {
    if (!normalizeStages(stages)) return toast.error(t.error);
    try {
      await callCrm('save_pipeline', { workspaceId: workspace?.id, id: p?.id, name, stages });
      toast.success(t.saved);
      onSaved();
    } catch (e) {
      toast.error(crmErrorText(e instanceof CrmError ? e.code : 'error', t));
    }
  };
  const remove = async () => {
    if (!p || !window.confirm(t.confirmDelete)) return;
    try {
      await callCrm('delete_pipeline', { workspaceId: workspace?.id, id: p.id, confirm: 'APAGAR' });
      onSaved();
    } catch (e) {
      toast.error(crmErrorText(e instanceof CrmError ? e.code : 'error', t));
    }
  };
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.pipeline} />
      {stages.map((s, i) => (
        <div key={i} className="grid grid-cols-[1fr_5rem_7rem_auto] gap-2">
          <Input value={s.label} onChange={(e) => upd(i, 'label', e.target.value)} placeholder={t.stage} />
          <Input type="number" min={0} max={100} value={s.probability} onChange={(e) => upd(i, 'probability', Number(e.target.value))} aria-label={t.settings.probability} disabled={s.kind !== 'open'} />
          <select className="h-10 rounded-md border bg-background px-2 text-sm" value={s.kind} onChange={(e) => upd(i, 'kind', e.target.value)}>
            {(['open', 'won', 'lost'] as const).map((k) => <option key={k} value={k}>{t.settings.kind[k]}</option>)}
          </select>
          <Button variant="ghost" size="icon" onClick={() => setStages((x) => x.filter((_, j) => j !== i))} aria-label={t.delete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setStages((x) => [...x, { id: '', label: '', probability: 50, kind: 'open' }])}><Plus className="h-4 w-4" />{t.settings.addStage}</Button>
        <Button size="sm" onClick={save}>{t.save}</Button>
        {p && <Button size="sm" variant="ghost" className="text-destructive" onClick={remove}>{t.delete}</Button>}
      </div>
    </div>
  );
}

export function CrmSettings() {
  const ctx = useCrm();
  const { t, workspace, pipelines, tags, fields, members, isAdmin, costs, reload, userId } = ctx;
  const db = crmDb();
  const ws = workspace?.id ?? '';
  const [wsName, setWsName] = useState(workspace?.name ?? '');
  const [currency, setCurrency] = useState(workspace?.currency ?? 'BRL');
  const [uiLang, setUiLang] = useState<string>(ctx.lang);
  const [autoImport, setAutoImport] = useState(workspace?.settings?.autoImport !== false);
  const [newPipe, setNewPipe] = useState(false);
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#8B5CF6');
  const [fieldDraft, setFieldDraft] = useState({ entity: 'contact', label: '', type: 'text', options: '' });
  const [invite, setInvite] = useState({ email: '', role: 'member' });
  const [providers, setProviders] = useState<Row[]>([]);
  const [keys, setKeys] = useState<Row[]>([]);
  const [hooks, setHooks] = useState<Row[]>([]);
  const [reveal, setReveal] = useState<string | null>(null);
  const [hookUrl, setHookUrl] = useState('');
  const [hookEvents, setHookEvents] = useState<string[]>(['*']);
  const [busy, setBusy] = useState(false);

  const loadExtra = useCallback(async () => {
    if (!ws) return;
    try {
      const r = await callCrm<{ providers: Row[] }>('sync_providers', { workspaceId: ws });
      setProviders(r.providers);
    } catch { /* sem conexão */ }
    if (isAdmin) {
      const [k, h] = await Promise.all([
        db.from('crm_api_keys').select('id, name, prefix, scopes, created_at, last_used_at, revoked_at').eq('workspace_id', ws).order('created_at', { ascending: false }),
        db.from('crm_webhooks').select('id, url, events, active, created_at, last_delivery_at').eq('workspace_id', ws).order('created_at', { ascending: false }),
      ]);
      setKeys(k.data ?? []);
      setHooks(h.data ?? []);
    }
  }, [db, ws, isAdmin]);

  useEffect(() => {
    void loadExtra();
  }, [loadExtra]);

  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
    } catch (e) {
      toast.error(crmErrorText(e instanceof CrmError ? e.code : 'error', t));
    } finally {
      setBusy(false);
    }
  };

  const saveWorkspace = () => run(async () => {
    const { error } = await db.from('crm_workspaces').update({ name: wsName.trim() || workspace?.name, currency, settings: { ...(workspace?.settings ?? {}), autoImport, uiLang } }).eq('id', ws);
    if (error) throw new CrmError('save_failed');
    await reload();
  }, t.saved);

  const addTag = () => run(async () => {
    const { error } = await db.from('crm_tags').insert({ workspace_id: ws, name: tagName.trim(), color: tagColor });
    if (error) throw new CrmError('save_failed');
    setTagName('');
    await reload();
  });
  const delTag = (id: string) => run(async () => {
    await db.from('crm_tags').delete().eq('id', id);
    await reload();
  });

  const addField = () => run(async () => {
    const key = fieldDraft.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'f_$1').slice(0, 40);
    const { error } = await db.from('crm_custom_fields').insert({
      workspace_id: ws, entity: fieldDraft.entity, key: key || `campo_${Date.now()}`, label: fieldDraft.label.trim(), type: fieldDraft.type,
      options: fieldDraft.type === 'select' ? fieldDraft.options.split(',').map((s) => s.trim()).filter(Boolean) : [], position: fields.length,
    });
    if (error) throw new CrmError('save_failed');
    setFieldDraft({ entity: 'contact', label: '', type: 'text', options: '' });
    await reload();
  });
  const delField = (id: string) => run(async () => {
    await db.from('crm_custom_fields').delete().eq('id', id);
    await reload();
  });

  const doInvite = () => run(async () => {
    await callCrm('invite_member', { workspaceId: ws, ...invite });
    setInvite({ email: '', role: 'member' });
    await reload();
  }, t.saved);

  const activate = (provider: string) => {
    if (!window.confirm(t.settings.activate(costs.syncActivate))) return;
    void run(async () => {
      await callCrm('sync_activate', { workspaceId: ws, provider, idempotencyKey: newIdempotencyKey() });
      await loadExtra();
    }, t.saved);
  };
  const sync = (provider: string, mode: 'ai' | 'plain', direction: 'push' | 'pull') => {
    const cost = mode === 'ai' ? costs.syncAiRun : costs.syncPlainRun;
    if (cost && !window.confirm(t.ai.cost(cost))) return;
    void run(async () => {
      const r = await callCrm<{ stats: Row }>('sync_run', { workspaceId: ws, provider, mode, direction, idempotencyKey: newIdempotencyKey() });
      toast.success(`↑ ${r.stats.pushed ?? 0} · ↓ ${r.stats.pulled ?? 0}`);
      await loadExtra();
    });
  };

  const newKey = () => run(async () => {
    const r = await callCrm<{ key: string }>('api_key_create', { workspaceId: ws, name: 'Vertal CRM API' });
    setReveal(`${t.settings.keyOnce}\n${r.key}`);
    await loadExtra();
  });
  const revoke = (id: string) => run(async () => {
    await callCrm('api_key_revoke', { workspaceId: ws, id });
    await loadExtra();
  });
  const newHook = () => run(async () => {
    const r = await callCrm<{ secret: string }>('webhook_create', { workspaceId: ws, url: hookUrl.trim(), events: hookEvents });
    setReveal(`${t.settings.secretOnce}\n${r.secret}`);
    setHookUrl('');
    await loadExtra();
  });
  const delHook = (id: string) => run(async () => {
    await callCrm('webhook_delete', { workspaceId: ws, id });
    await loadExtra();
  });

  const importFrom = (op: 'import_prospector' | 'import_growth') => run(async () => {
    const r = await callCrm<{ result: { contactsCreated: number } }>(op, { workspaceId: ws });
    toast.success(t.settings.imported(r.result.contactsCreated));
  });

  const apiBase = `${(import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''}/functions/v1/vertal-code-ai?app=crm`;
  return (
    <div className="space-y-4" data-testid="crm-settings">
      {reveal && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
          <pre className="whitespace-pre-wrap break-all font-mono text-xs">{reveal}</pre>
          <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(reveal.split('\n').pop() ?? ''); setReveal(null); }}>{t.ai.copy} · {t.close}</Button>
        </div>
      )}

      <Section title={t.settings.workspace}>
        <div className="grid gap-2 sm:grid-cols-[1fr_8rem_12rem_auto]">
          <Input value={wsName} onChange={(e) => setWsName(e.target.value)} disabled={!isAdmin} aria-label={t.settings.name} />
          <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} disabled={!isAdmin} aria-label={t.settings.currency} />
          <select className="h-10 rounded-md border bg-background px-2 text-sm" value={uiLang} disabled={!isAdmin} aria-label={t.settings.language}
            onChange={(e) => setUiLang(e.target.value)} onInput={(e) => setUiLang((e.target as HTMLSelectElement).value)}>
            {Object.entries(t.languageNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {isAdmin && <Button onClick={saveWorkspace} disabled={busy}>{t.save}</Button>}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoImport} disabled={!isAdmin} onChange={(e) => setAutoImport(e.target.checked)} />{t.settings.autoImport}</label>
        {ctx.workspaces.length > 1 && (
          <select className="h-10 rounded-md border bg-background px-2 text-sm" value={ws} onChange={(e) => ctx.setWorkspaceId(e.target.value)}>
            {ctx.workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
      </Section>

      <Section title={t.settings.pipelines}>
        {pipelines.map((p) => <PipelineEditor key={p.id + JSON.stringify(p.stages)} p={isAdmin ? p : p} onSaved={() => void reload()} />)}
        {isAdmin && (newPipe ? <PipelineEditor p={null} onSaved={() => { setNewPipe(false); void reload(); }} /> : <Button size="sm" variant="outline" onClick={() => setNewPipe(true)}><Plus className="h-4 w-4" />{t.settings.addPipeline}</Button>)}
      </Section>

      <Section title={t.settings.tags}>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((x) => (
            <span key={x.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-white" style={{ background: x.color }}>
              {x.name}{ctx.canWrite && <button type="button" onClick={() => delTag(x.id)} aria-label={t.delete}>×</button>}
            </span>
          ))}
        </div>
        {ctx.canWrite && (
          <div className="flex gap-2">
            <Input value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder={t.settings.addTag} maxLength={60} />
            <input type="color" value={tagColor} onChange={(e) => setTagColor(e.target.value)} className="h-10 w-12 rounded border" aria-label="cor" />
            <Button onClick={addTag} disabled={!tagName.trim() || busy}>{t.save}</Button>
          </div>
        )}
      </Section>

      <Section title={t.settings.fields}>
        <ul className="space-y-1 text-sm">
          {fields.map((f) => <li key={f.id} className="flex items-center gap-2">{t.settings.entity[f.entity]} · <b>{f.label}</b> <span className="text-xs text-muted-foreground">({f.type})</span>{isAdmin && <button type="button" className="ml-auto text-muted-foreground" onClick={() => delField(f.id)} aria-label={t.delete}><Trash2 className="h-3.5 w-3.5" /></button>}</li>)}
        </ul>
        {isAdmin && (
          <div className="grid gap-2 sm:grid-cols-[8rem_1fr_8rem_1fr_auto]">
            <select className="h-10 rounded-md border bg-background px-2 text-sm" value={fieldDraft.entity} onChange={(e) => setFieldDraft({ ...fieldDraft, entity: e.target.value })}>
              {(['contact', 'company', 'deal'] as const).map((k) => <option key={k} value={k}>{t.settings.entity[k]}</option>)}
            </select>
            <Input value={fieldDraft.label} onChange={(e) => setFieldDraft({ ...fieldDraft, label: e.target.value })} placeholder={t.settings.fieldLabel} />
            <select className="h-10 rounded-md border bg-background px-2 text-sm" value={fieldDraft.type} onChange={(e) => setFieldDraft({ ...fieldDraft, type: e.target.value })}>
              {['text', 'number', 'date', 'select', 'boolean', 'url'].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <Input value={fieldDraft.options} onChange={(e) => setFieldDraft({ ...fieldDraft, options: e.target.value })} placeholder="a, b, c" disabled={fieldDraft.type !== 'select'} />
            <Button onClick={addField} disabled={!fieldDraft.label.trim() || busy}>{t.settings.addField}</Button>
          </div>
        )}
      </Section>

      <Section title={t.settings.team} hint={t.settings.inviteHint}>
        <ul className="space-y-1 text-sm">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-2">
              <span className="flex-1 truncate">{m.email ?? m.user_id}{m.user_id === userId ? ` (${t.you})` : ''}</span>
              {isAdmin && m.role !== 'owner' ? (
                <select className="h-8 rounded border bg-background px-1 text-xs" value={m.role} onChange={(e) => run(async () => { await callCrm('set_member_role', { workspaceId: ws, userId: m.user_id, role: e.target.value }); await reload(); })}>
                  {['admin', 'member', 'viewer'].map((r) => <option key={r} value={r}>{t.settings.roles[r]}</option>)}
                </select>
              ) : <span className="text-xs text-muted-foreground">{t.settings.roles[m.role]}</span>}
              {isAdmin && m.role !== 'owner' && <button type="button" className="text-muted-foreground" onClick={() => run(async () => { await callCrm('remove_member', { workspaceId: ws, userId: m.user_id }); await reload(); })} aria-label={t.delete}><Trash2 className="h-3.5 w-3.5" /></button>}
            </li>
          ))}
        </ul>
        {isAdmin && (
          <div className="flex gap-2">
            <Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder={t.email} />
            <select className="h-10 rounded-md border bg-background px-2 text-sm" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
              {['admin', 'member', 'viewer'].map((r) => <option key={r} value={r}>{t.settings.roles[r]}</option>)}
            </select>
            <Button onClick={doInvite} disabled={!invite.email.trim() || busy}>{t.settings.invite}</Button>
          </div>
        )}
      </Section>

      <Section title={t.settings.integrations} hint={t.settings.integrationsHint}>
        <ul className="space-y-2">
          {providers.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center" data-testid={`crm-provider-${p.id}`}>
              <div className="flex-1">
                <p className="font-medium">{p.name} {p.connection?.status === 'active' && <span className="ml-1 rounded bg-primary/10 px-1.5 text-xs text-primary">{t.settings.active}</span>}</p>
                <p className="text-xs text-muted-foreground">
                  {!p.available ? t.settings.comingSoon : p.fluxosStatus !== 'connected' ? t.settings.connectFirst : p.connection?.last_sync_at ? `↻ ${new Date(p.connection.last_sync_at).toLocaleString()}` : ''}
                </p>
              </div>
              {p.available && p.fluxosStatus === 'connected' && (
                p.connection?.status === 'active' ? (
                  <div className="flex flex-wrap gap-2">
                    {p.push && <Button size="sm" variant="outline" disabled={busy} onClick={() => sync(p.id, 'plain', 'push')}>{t.settings.push} · {t.settings.syncPlain(costs.syncPlainRun)}</Button>}
                    {p.push && <Button size="sm" disabled={busy} onClick={() => sync(p.id, 'ai', 'push')}>{t.settings.syncAi(costs.syncAiRun)}</Button>}
                    {p.pull && <Button size="sm" variant="outline" disabled={busy} onClick={() => sync(p.id, 'plain', 'pull')}>{t.settings.pull}</Button>}
                    {p.pull && !p.push && <Button size="sm" disabled={busy} onClick={() => sync(p.id, 'ai', 'pull')}>{t.settings.syncAi(costs.syncAiRun)}</Button>}
                  </div>
                ) : isAdmin && <Button size="sm" disabled={busy} onClick={() => activate(p.id)}>{t.settings.activate(costs.syncActivate)}</Button>
              )}
              {p.available && p.fluxosStatus !== 'connected' && <Button size="sm" variant="ghost" onClick={() => window.location.assign('/connectors')}>→</Button>}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t.settings.importFrom} hint={t.settings.fluxos}>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy || !ctx.canWrite} onClick={() => importFrom('import_prospector')}>{t.settings.importProspector}</Button>
          <Button size="sm" variant="outline" disabled={busy || !ctx.canWrite} onClick={() => importFrom('import_growth')}>{t.settings.importGrowth}</Button>
        </div>
      </Section>

      {isAdmin && (
        <Section title={t.settings.api} hint={apiBase}>
          <ul className="space-y-1 text-sm">
            {keys.map((k) => <li key={k.id} className="flex items-center gap-2"><code className="text-xs">{k.prefix}…</code><span className="flex-1 text-xs text-muted-foreground">{k.revoked_at ? '✕' : k.last_used_at ? new Date(k.last_used_at).toLocaleString() : ''}</span>{!k.revoked_at && <Button size="sm" variant="ghost" onClick={() => revoke(k.id)}>{t.settings.revoke}</Button>}</li>)}
          </ul>
          <Button size="sm" variant="outline" onClick={newKey} disabled={busy}>{t.settings.newKey}</Button>
          <h4 className="pt-2 text-sm font-semibold">{t.settings.webhooks}</h4>
          <ul className="space-y-1 text-sm">
            {hooks.map((h) => <li key={h.id} className="flex items-center gap-2"><span className="flex-1 truncate text-xs">{h.url} · {(h.events ?? []).join(', ')}</span><Button size="sm" variant="ghost" onClick={() => delHook(h.id)}>{t.delete}</Button></li>)}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://…" />
            <select multiple className="h-20 rounded-md border bg-background px-2 text-xs sm:w-56" value={hookEvents} onChange={(e) => setHookEvents([...e.target.selectedOptions].map((o) => o.value))}>
              <option value="*">*</option>
              {CRM_EVENT_TYPES.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
            </select>
            <Button size="sm" onClick={newHook} disabled={!hookUrl.startsWith('https://') || busy}>{t.settings.newWebhook}</Button>
          </div>
        </Section>
      )}
    </div>
  );
}
