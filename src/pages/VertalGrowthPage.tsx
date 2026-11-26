// Vertal Growth Team · tela (dentro do VERTAL Code AI, celular primeiro).
// Projeto → modelo do negócio → custo (20 créditos, mostrado antes) → equipe lançada →
// painel por etapa (Captação / Conversão / Retenção ou a variante de doadores), aprovações, contatos,
// equipe de agentes (Vertal Agentes + apps do Vertal Fluxos) e configurações.
// Nada sai para um contato sem aprovação aqui (ou no Prospector); o piloto automático só o dev liga.
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Loader2, Mail, MessageCircle, RefreshCw, Rocket, Send, Settings2, Trash2, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { callScheduler } from '@/lib/chatScheduler/client';
import {
  buildTeam, callGrowth, forwardEvents, GrowthError, launchGrowth, matchProjectByName, newIdempotencyKey, readGrowthHandoff, useVertalGrowthAccess,
} from '@/lib/vertalGrowth/client';
import { useDocumentLang } from '@/lib/useDocumentLang';
import { GROWTH_UI, growthServerLang, preferredUiLang, rememberUiLang, storedUiLang, uiDir, uiLangFrom, uiLocale } from '@/lib/vertalGrowth/i18n';
import { VERTAL_PROSPECTOR_ROUTE } from '@/lib/vertalProspector/client';
import { type BusinessModel, type GrowthKind, type TeamPreset } from '../../supabase/functions/_shared/vertalGrowth/core';

const NotFound = lazy(() => import('@/pages/NotFound'));

interface Growth {
  id: string;
  project_id: string | null;
  project_name: string;
  project_url: string | null;
  model: BusinessModel;
  lang: string;
  prospector_campaign_id: string | null;
  settings: { autopilot?: boolean; bookingLink?: string | null; senderName?: string; inactivityDays?: number; gmailAccountId?: string | null };
  team: { webhookAgentId?: number; agents?: Array<{ preset: string; agentId: number }> };
  charge: { credits?: number; free?: boolean };
}
interface Contact { id: string; email: string | null; name: string | null; stage: string; status: string; source: string; phone: string | null }
interface Msg { id: string; contact_id: string; kind: GrowthKind; stage: string; subject: string | null; body: string; footer: string; status: string; send_after: string | null }
interface Dash {
  captacao: { leads: number; contacted: number; replies: number; optedOut: number };
  conversao: { engaged: number; conversions: number; drafts: number };
  retencao: { active: number; atRisk: number; churned: number; wonBack: number; drafts: number };
  unit: 'customers' | 'donors';
}
interface Status { uiLang?: string | null; chargeOn: boolean; launchCost: number; runCost: number; cap: number; sentToday: number; gmailAccounts: Array<{ id: string; email: string }>; stripe: boolean; agents: boolean }

const card = 'rounded-xl border border-border/60 bg-card/60 p-3';
const selectCls = 'w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm';

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-secondary/50 px-2 py-1.5">
      <div className="text-lg font-semibold leading-tight">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function VertalGrowthScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const handoff = useMemo(() => readGrowthHandoff(location.search), [location.search]);
  // Idioma nativo do usuário: pedido explícito → idioma salvo (CRM/servidor) → navegador → pt-BR.
  const [lang, setLang] = useState(() => preferredUiLang(handoff.lang));
  // Sem idioma pedido nem salvo, espera o idioma do usuário vir do servidor antes de pintar a tela
  // (antes aparecia em inglês — idioma do navegador — e só depois traduzia). Prazo curto: nunca trava a tela.
  const [langReady, setLangReady] = useState(() => !!handoff.lang || !!storedUiLang());
  useEffect(() => {
    if (langReady) return;
    const timer = setTimeout(() => setLangReady(true), 2_500);
    return () => clearTimeout(timer);
  }, [langReady]);
  const t = GROWTH_UI[lang] ?? GROWTH_UI.pt;
  useDocumentLang(uiLocale(lang), uiDir(lang));
  const errText = (e: unknown) => {
    const code = e instanceof GrowthError ? e.code : e instanceof Error ? e.message : String(e);
    const extra = e instanceof GrowthError && Array.isArray(e.detail.problems) ? ` ${(e.detail.problems as string[]).join('; ')}` : '';
    return (t.errors[code] ?? t.errors.generic) + extra;
  };

  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; project_name: string }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; title: string }>>([]);
  const [mode, setMode] = useState<'new' | 'view'>('new');
  // Novo
  const [projectId, setProjectId] = useState(handoff.projectId);
  const [form, setForm] = useState({ name: '', description: '', website: '', area: '', model: (handoff.donors ? 'nonprofit' : 'b2c') as BusinessModel, subscription: false });
  const [confidence, setConfidence] = useState<number | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [launchKey, setLaunchKey] = useState(newIdempotencyKey);
  // Campanha aberta
  const [g, setG] = useState<Growth | null>(null);
  const [stages, setStages] = useState<Record<string, string>>({});
  const [dash, setDash] = useState<Dash | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [icpStatus, setIcpStatus] = useState<string>('');
  const [cap, setCap] = useState({ cap: 20, sentToday: 0 });
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const [plan, setPlan] = useState<{ presets: TeamPreset[]; crmApp: string | null; agents: boolean } | null>(null);
  const [newContact, setNewContact] = useState({ email: '', name: '', stage: 'conversao', consent: false });
  const [settings, setSettings] = useState({ bookingLink: '', senderName: '', inactivityDays: 30, gmailAccountId: '' });
  const [autoText, setAutoText] = useState('');
  const [accountId, setAccountId] = useState('');

  const run = useCallback(async <T,>(label: string, fn: () => Promise<T>): Promise<T | null> => {
    setBusy(label);
    try {
      return await fn();
    } catch (e) {
      toast.error(errText(e));
      return null;
    } finally {
      setBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const loadList = useCallback(async () => {
    const [s, l] = await Promise.all([
      callGrowth<Status>('status').catch(() => null),
      callGrowth<{ campaigns: Array<{ id: string; project_name: string }> }>('list').catch(() => null),
    ]);
    if (s) {
      setStatus(s);
      if (s.uiLang && !handoff.lang) {
        setLang(uiLangFrom(s.uiLang));
        rememberUiLang(s.uiLang);
      }
      setCap({ cap: s.cap, sentToday: s.sentToday });
      setAccountId((cur) => cur || s.gmailAccounts?.[0]?.id || '');
    }
    setLangReady(true);
    if (l) setCampaigns(l.campaigns);
    const { data } = await supabase.from('projects').select('id, title').order('updated_at', { ascending: false }).limit(50);
    const list = ((data ?? []) as Array<{ id: string; title: string | null }>).map((p) => ({ id: p.id, title: (p.title ?? '').slice(0, 80) || p.id.slice(0, 8) }));
    setProjects(list);
    // Comando do chat: "buscar clientes para meu app X" → escolhe o projeto pelo nome.
    if (handoff.project && !handoff.projectId) {
      const hit = matchProjectByName(list, handoff.project);
      if (hit) setProjectId(hit.id);
      else setForm((f) => ({ ...f, name: handoff.project }));
    }
  }, [handoff.project, handoff.projectId, handoff.lang]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openGrowth = useCallback(async (id: string) => {
    const r = await run('…', () => callGrowth<{
      growth: Growth; stages: Record<string, string>; dashboard: Dash; contacts: Contact[]; messages: Msg[]; prospector: { status: string } | null; cap: number; sentToday: number;
    }>('get', { growthId: id }));
    if (!r) return;
    setG(r.growth);
    setStages(r.stages);
    setDash(r.dashboard);
    setContacts(r.contacts);
    setMsgs(r.messages);
    setIcpStatus(r.prospector?.status ?? '');
    setCap({ cap: r.cap, sentToday: r.sentToday });
    setSettings({
      bookingLink: r.growth.settings.bookingLink ?? '', senderName: r.growth.settings.senderName ?? '',
      inactivityDays: r.growth.settings.inactivityDays ?? 30, gmailAccountId: r.growth.settings.gmailAccountId ?? '',
    });
    setMode('view');
    setPlan(null);
  }, [run]);

  const analyze = async () => {
    if (!projectId) return;
    const r = await run(t.reading, () => callGrowth<{
      prefill: { name: string; description: string; website: string }; inference: { model: BusinessModel; subscription: boolean; confidence: number };
    }>('analyze_project', { projectId, lang: growthServerLang(lang) }));
    if (!r) return;
    setForm((f) => ({
      ...f, name: r.prefill.name || f.name, description: r.prefill.description || f.description, website: r.prefill.website || f.website,
      model: handoff.donors ? 'nonprofit' : r.inference.model, subscription: r.inference.subscription,
    }));
    setConfidence(r.inference.confidence);
  };

  const cost = status?.launchCost ?? 20;
  const runCost = status?.runCost ?? 2;
  const launch = async () => {
    if (!accepted || !form.name.trim()) return;
    if (status?.chargeOn && !window.confirm(t.launchConfirm(cost))) return;
    // Resposta pode demorar (perfil + cliente ideal com IA): repete com a mesma chave até a campanha existir,
    // sem cobrar de novo. Antes a conexão caía em ~60 s e a tela sumia sem campanha nem erro.
    const r = await run(t.launching, () => launchGrowth<{ growth: Growth; replayed?: boolean }>({
      ...form, projectId: projectId || undefined, acceptCost: true, idempotencyKey: launchKey, lang: growthServerLang(lang),
    }));
    if (!r) {
      await loadList();
      return;
    }
    setLaunchKey(newIdempotencyKey());
    toast.success(t.launched);
    await loadList();
    await openGrowth(r.growth.id);
  };

  const refresh = () => g && openGrowth(g.id);

  const sync = async () => {
    if (!g) return;
    const r = await run(t.syncing, () => callGrowth<{
      summary: { newLeads: number; engaged: number; customers: number; atRisk: number; drafts: number; autoSent: number }; events: Array<Record<string, unknown>>; runCost: number;
    }>('sync', { growthId: g.id }));
    if (!r) return;
    toast.success(t.syncDone(r.summary));
    if (g.team.webhookAgentId && r.events.length && window.confirm(t.forwardConfirm(r.events.length, r.runCost))) {
      const n = await forwardEvents(g.team.webhookAgentId, r.events);
      toast.success(t.forwarded(n));
    }
    await refresh();
  };

  const act = async (op: 'approve' | 'reject', ids: string[]) => {
    const r = await run('…', () => callGrowth<{ blocked?: Array<{ problems: string[] }> }>(op, { messageIds: ids }));
    if (r?.blocked?.length) toast.error(r.blocked.flatMap((b) => b.problems).join('; '));
    await refresh();
  };
  const saveMsg = async (m: Msg) => {
    const e = edits[m.id];
    if (!e) return;
    const r = await run('…', () => callGrowth<{ problems: string[] }>('update_message', { messageId: m.id, subject: e.subject, body: e.body }));
    if (r?.problems?.length) toast.error(r.problems.join('; '));
    setEdits(({ [m.id]: _, ...rest }) => rest);
    await refresh();
  };
  const sendMsg = async (m: Msg) => {
    const c = contacts.find((x) => x.id === m.contact_id);
    if (!accountId) return toast.error(t.noGmail);
    if (!window.confirm(t.sendConfirm(c?.email ?? ''))) return;
    const r = await run('…', () => callGrowth('send', { messageId: m.id, accountId }));
    if (r) toast.success(t.sent);
    await refresh();
  };
  const whatsapp = async (m: Msg) => {
    const r = await run('…', () => callGrowth<{ link: string }>('whatsapp_link', { messageId: m.id }));
    if (r?.link) window.open(r.link, '_blank', 'noopener');
  };

  const loadPlan = async () => {
    if (!g) return;
    const r = await run('…', () => callGrowth<{ presets: TeamPreset[]; crmApp: string | null; agents: boolean }>('plan_team', { growthId: g.id }));
    if (r) setPlan(r);
  };
  const createTeam = async () => {
    if (!g || !plan?.presets.length) return;
    if (!window.confirm(t.teamConfirm(plan.presets.length, runCost))) return;
    const r = await run('…', async () => {
      const built = await buildTeam(g.project_name, plan.presets);
      if ('message' in built) {
        // O que já foi criado fica salvo (para não criar de novo nem perder o controle dos agentes).
        if (built.partial) await callGrowth('save_team', { growthId: g.id, team: built.partial });
        throw new Error(built.message);
      }
      return callGrowth('save_team', { growthId: g.id, team: built.team });
    });
    if (r) toast.success(t.teamCreated);
    await refresh();
  };

  const addContact = async () => {
    if (!g) return;
    const r = await run('…', () => callGrowth<{ events: Array<Record<string, unknown>> }>('add_contact', { growthId: g.id, ...newContact }));
    if (!r) return;
    setNewContact({ email: '', name: '', stage: newContact.stage, consent: false });
    if (g.team.webhookAgentId && r.events?.length && window.confirm(t.forwardConfirm(r.events.length, runCost))) {
      toast.success(t.forwarded(await forwardEvents(g.team.webhookAgentId, r.events)));
    }
    await refresh();
  };
  const markContact = async (c: Contact, s: string) => {
    await run('…', () => callGrowth('update_contact', { contactId: c.id, status: s }));
    await refresh();
  };
  const deleteContact = async (c: Contact) => {
    if (!window.confirm(`${t.deleteContact}: ${c.email ?? c.name}?`)) return;
    await run('…', () => callGrowth('delete_contact', { contactId: c.id }));
    await refresh();
  };

  const saveSettings = async () => {
    if (!g) return;
    const r = await run('…', () => callGrowth('update_settings', { growthId: g.id, settings: { ...settings, gmailAccountId: settings.gmailAccountId || undefined } }));
    if (r) toast.success('OK');
    await refresh();
  };
  const setAutopilot = async (enabled: boolean) => {
    if (!g) return;
    const r = await run('…', () => callGrowth('set_autopilot', { growthId: g.id, enabled, confirmText: autoText.trim(), origin: 'growth_settings' }));
    if (r) setAutoText('');
    await refresh();
  };
  const addReminder = async () => {
    if (!g) return;
    const r = await callScheduler('create', { spec: { kind: 'reminder', title: t.reminderTitle(g.project_name), repeat: { every: 'weekdays', time: '09:00' }, lang: uiLocale(lang) } });
    if (r.ok) toast.success(t.reminderCreated);
    else toast.error(r.message);
  };
  const del = async () => {
    if (!g || !window.confirm(t.deleteConfirm)) return;
    const r = await run('…', () => callGrowth('delete', { growthId: g.id }));
    if (!r) return;
    setG(null);
    setMode('new');
    await loadList();
  };

  // Nomes das etapas no idioma da tela (o servidor manda no idioma da campanha: "Lead generation" numa tela em pt).
  // Nomes das etapas no idioma da tela (o servidor só tem pt/en/es).
  const stageNames: Record<string, string> = g ? { ...stages, ...t.stageNames[g.model === 'nonprofit' ? 'donor' : 'business'] } : stages;
  const drafts = msgs.filter((m) => ['draft', 'approved'].includes(m.status));
  const donors = g?.model === 'nonprofit';
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(uiLocale(lang)) : '');

  if (!langReady) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background text-muted-foreground" data-testid="growth-lang-loading">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground" lang={uiLocale(lang)} dir={uiDir(lang)}>
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border/50 bg-background/80 px-3 backdrop-blur">
        <button type="button" onClick={() => navigate(-1)} aria-label={t.back} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
        <Rocket className="h-5 w-5 text-primary" aria-hidden />
        <h1 className="flex-1 truncate text-sm font-semibold">{t.title}</h1>
        <select
          aria-label={t.campaigns}
          className="max-w-[40vw] truncate rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
          value={mode === 'view' && g ? g.id : ''}
          onChange={(e) => (e.target.value ? openGrowth(e.target.value) : (setMode('new'), setG(null)))}
        >
          <option value="">{t.newCampaign}</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.project_name}</option>)}
        </select>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-3 px-3 py-4 text-sm">
        {busy && <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {busy}</p>}

        {mode === 'new' && (
          <section className={`${card} space-y-3`} data-testid="growth-new">
            <p className="text-xs text-muted-foreground">{t.subtitle}</p>
            <label className="block space-y-1 text-xs">
              <span className="text-muted-foreground">{t.project}</span>
              <div className="flex gap-2">
                <select className={selectCls} value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label={t.project}>
                  <option value="">{t.pickProject}</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
                <Button size="sm" variant="outline" onClick={analyze} disabled={!projectId || !!busy}>{t.readProject}</Button>
              </div>
            </label>
            <fieldset className="space-y-1 text-xs">
              <legend className="text-muted-foreground">{t.model}</legend>
              {(['b2b', 'b2c', 'nonprofit'] as BusinessModel[]).map((m) => (
                <label key={m} className="flex items-start gap-2">
                  <input type="radio" name="model" checked={form.model === m} onChange={() => setForm({ ...form, model: m })} className="mt-0.5" />
                  <span><b>{t.models[m]}</b> <span className="text-muted-foreground">— {t.modelHint[m]}</span></span>
                </label>
              ))}
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.subscription} onChange={(e) => setForm({ ...form, subscription: e.target.checked })} /> {t.subscription}
              </label>
              {confidence !== null && <p className="text-muted-foreground">{t.confidence(confidence)}</p>}
            </fieldset>
            <label className="block space-y-1 text-xs"><span className="text-muted-foreground">{t.name}</span>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} /></label>
            <label className="block space-y-1 text-xs"><span className="text-muted-foreground">{t.description}</span>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={1500} /></label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block space-y-1 text-xs"><span className="text-muted-foreground">{t.website}</span>
                <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" /></label>
              <label className="block space-y-1 text-xs"><span className="text-muted-foreground">{t.area}</span>
                <Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Campinas, SP" /></label>
            </div>
            <div className="space-y-1 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs" data-testid="growth-cost">
              <p className="font-medium">{t.costTitle}</p>
              <p>{status?.chargeOn === false ? t.costLaunchOff : t.costLaunch(cost)}</p>
              <p>{t.costRun(runCost)}</p>
              <p>{t.costSafety}</p>
              <label className="flex items-center gap-2 pt-1">
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} data-testid="growth-accept" /> {t.accept}
              </label>
            </div>
            <Button className="w-full gap-2" onClick={launch} disabled={!accepted || !form.name.trim() || !!busy} data-testid="growth-launch">
              <Rocket className="h-4 w-4" /> {status?.chargeOn === false ? t.launchFree : t.launch(cost)}
            </Button>
            <p className="text-[11px] text-muted-foreground">{t.lgpd}</p>
          </section>
        )}

        {mode === 'view' && g && dash && (
          <>
            <section className={`${card} space-y-2`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{g.project_name}</p>
                  <p className="text-xs text-muted-foreground">{t.models[g.model]} · {t.dailyCap(cap.sentToday, cap.cap)}</p>
                </div>
                <Button size="sm" className="gap-1" onClick={sync} disabled={!!busy} data-testid="growth-sync"><RefreshCw className="h-3.5 w-3.5" /> {t.sync}</Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="space-y-1.5" data-testid="stage-captacao">
                  <p className="text-xs font-medium">{stageNames.captacao}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Stat label={t.leads} value={dash.captacao.leads} /><Stat label={t.contacted} value={dash.captacao.contacted} />
                    <Stat label={t.replies} value={dash.captacao.replies} /><Stat label={t.optedOut} value={dash.captacao.optedOut} />
                  </div>
                  {g.prospector_campaign_id && (
                    <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => navigate(`${VERTAL_PROSPECTOR_ROUTE}?campanha=${g.prospector_campaign_id}`)}>
                      {t.openCapture}
                    </Button>
                  )}
                  {icpStatus === 'icp_pending' && <p className="text-[11px] text-amber-400">{t.icpPending}</p>}
                </div>
                <div className="space-y-1.5" data-testid="stage-conversao">
                  <p className="text-xs font-medium">{stageNames.conversao}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Stat label={t.engaged} value={dash.conversao.engaged} /><Stat label={t.conversions} value={dash.conversao.conversions} />
                    <Stat label={t.drafts} value={dash.conversao.drafts} />
                  </div>
                </div>
                <div className="space-y-1.5" data-testid="stage-retencao">
                  <p className="text-xs font-medium">{stageNames.retencao}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Stat label={donors ? t.activeDonors : t.activeCustomers} value={dash.retencao.active} /><Stat label={t.atRisk} value={dash.retencao.atRisk} />
                    <Stat label={t.churned} value={dash.retencao.churned} /><Stat label={t.wonBack} value={dash.retencao.wonBack} />
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">{status?.stripe ? t.stripeOn : t.stripeOff}</p>
            </section>

            <section className={`${card} space-y-2`} data-testid="growth-approvals">
              <div className="flex items-center justify-between">
                <p className="font-medium">{t.approvals}</p>
                {drafts.some((m) => m.status === 'draft') && (
                  <Button size="sm" variant="outline" onClick={() => act('approve', drafts.filter((m) => m.status === 'draft').map((m) => m.id))}>{t.approveAll}</Button>
                )}
              </div>
              {!drafts.length && <p className="text-xs text-muted-foreground">{t.noDrafts}</p>}
              {status && !status.gmailAccounts.length && <p className="text-xs text-amber-400">{t.noGmail}</p>}
              {status && status.gmailAccounts.length > 1 && (
                <select className={selectCls} value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label={t.gmail}>
                  {status.gmailAccounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
                </select>
              )}
              {drafts.map((m) => {
                const c = contacts.find((x) => x.id === m.contact_id);
                const e = edits[m.id];
                return (
                  <div key={m.id} className="space-y-1.5 rounded-lg border border-border/50 p-2">
                    <p className="text-xs text-muted-foreground">
                      {t.kinds[m.kind]} · {c?.name || c?.email} · {m.status === 'approved' ? t.approve + ' ✓' : t.draftLabel}
                      {m.send_after && new Date(m.send_after) > new Date() ? ` · ${t.readyAt(fmt(m.send_after))}` : ''}
                    </p>
                    <Input value={e?.subject ?? m.subject ?? ''} onChange={(ev) => setEdits({ ...edits, [m.id]: { subject: ev.target.value, body: e?.body ?? m.body } })} aria-label="subject" />
                    <Textarea rows={4} value={e?.body ?? m.body} onChange={(ev) => setEdits({ ...edits, [m.id]: { subject: e?.subject ?? m.subject ?? '', body: ev.target.value } })} aria-label="body" />
                    <p className="whitespace-pre-wrap text-[11px] text-muted-foreground">{m.footer.trim()}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {e && <Button size="sm" variant="outline" onClick={() => saveMsg(m)}>{t.save}</Button>}
                      {m.status === 'draft' && !e && <Button size="sm" variant="outline" className="gap-1" onClick={() => act('approve', [m.id])}><Check className="h-3.5 w-3.5" /> {t.approve}</Button>}
                      {m.status === 'approved' && <Button size="sm" className="gap-1" onClick={() => sendMsg(m)}><Send className="h-3.5 w-3.5" /> {t.send}</Button>}
                      {m.status === 'approved' && c?.phone && <Button size="sm" variant="outline" className="gap-1" onClick={() => whatsapp(m)}><MessageCircle className="h-3.5 w-3.5" /> {t.whatsapp}</Button>}
                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => act('reject', [m.id])}><X className="h-3.5 w-3.5" /> {t.reject}</Button>
                    </div>
                  </div>
                );
              })}
            </section>

            <section className={`${card} space-y-2`} data-testid="growth-contacts">
              <p className="flex items-center gap-2 font-medium"><Users className="h-4 w-4" /> {t.contacts} ({contacts.length})</p>
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {contacts.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-md bg-secondary/40 px-2 py-1 text-xs">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{c.name || c.email} <span className="text-muted-foreground">{c.email && c.name ? `· ${c.email}` : ''}</span></span>
                    <span className="rounded bg-background px-1.5 py-0.5">{stageNames[c.stage]} · {t.status[c.status as keyof typeof t.status] ?? c.status}</span>
                    <select aria-label={t.markAs} className="rounded border border-border bg-background px-1 py-0.5" value="" onChange={(e) => e.target.value && markContact(c, e.target.value)}>
                      <option value="">{t.markAs}…</option>
                      {Object.entries(t.status).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button type="button" onClick={() => deleteContact(c)} aria-label={t.deleteContact} className="text-muted-foreground hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5 rounded-lg border border-dashed border-border/60 p-2">
                <p className="text-xs font-medium">{t.addContact}</p>
                <div className="grid gap-1.5 sm:grid-cols-3">
                  <Input placeholder={t.email} value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
                  <Input placeholder={t.contactName} value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
                  <select className={selectCls} value={newContact.stage} onChange={(e) => setNewContact({ ...newContact, stage: e.target.value })} aria-label={t.stage}>
                    {Object.entries(stageNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={newContact.consent} onChange={(e) => setNewContact({ ...newContact, consent: e.target.checked })} /> {t.consent}</label>
                <Button size="sm" variant="outline" onClick={addContact} disabled={!newContact.email || !newContact.consent || !!busy}>{t.add}</Button>
              </div>
            </section>

            <section className={`${card} space-y-2`} data-testid="growth-team">
              <p className="font-medium">{t.team}</p>
              {g.team.webhookAgentId
                ? <p className="text-xs">{t.teamReady(g.team.agents?.length ?? 0)}</p>
                : !plan
                  ? <Button size="sm" variant="outline" onClick={loadPlan} disabled={!!busy}>{t.teamCreate}</Button>
                  : !plan.agents
                    ? <p className="text-xs text-amber-400">{t.teamNoAgents}</p>
                    : !plan.presets.length
                      ? <p className="text-xs text-amber-400">{t.teamNone}</p>
                      : (
                        <div className="space-y-1.5 text-xs">
                          <p className="text-muted-foreground">{t.teamPlan}</p>
                          <ul className="list-disc space-y-0.5 pl-4">
                            {plan.presets.map((p) => (
                              <li key={p.id}>{stageNames[p.stage]}: {t.presets[p.id]} <span className="text-muted-foreground">({p.app}{p.needs?.length ? ` · ${t.needsField(p.needs.join(', '))}` : ''})</span></li>
                            ))}
                          </ul>
                          <p>{t.costRun(runCost)}</p>
                          <Button size="sm" onClick={createTeam} disabled={!!busy}>{t.teamCreate}</Button>
                        </div>
                      )}
            </section>

            <section className={`${card} space-y-2`} data-testid="growth-settings">
              <p className="flex items-center gap-2 font-medium"><Settings2 className="h-4 w-4" /> {t.settings}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block space-y-1 text-xs"><span className="text-muted-foreground">{t.bookingLink}</span>
                  <Input value={settings.bookingLink} onChange={(e) => setSettings({ ...settings, bookingLink: e.target.value })} placeholder="https://" /></label>
                <label className="block space-y-1 text-xs"><span className="text-muted-foreground">{t.senderName}</span>
                  <Input value={settings.senderName} onChange={(e) => setSettings({ ...settings, senderName: e.target.value })} /></label>
                <label className="block space-y-1 text-xs"><span className="text-muted-foreground">{t.inactivityDays}</span>
                  <Input type="number" min={7} max={180} value={settings.inactivityDays} onChange={(e) => setSettings({ ...settings, inactivityDays: Number(e.target.value) || 30 })} /></label>
                {status && status.gmailAccounts.length > 0 && (
                  <label className="block space-y-1 text-xs"><span className="text-muted-foreground">{t.gmail}</span>
                    <select className={selectCls} value={settings.gmailAccountId} onChange={(e) => setSettings({ ...settings, gmailAccountId: e.target.value })}>
                      <option value="">—</option>
                      {status.gmailAccounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
                    </select></label>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={saveSettings} disabled={!!busy}>{t.save}</Button>
                <Button size="sm" variant="outline" onClick={addReminder} disabled={!!busy}>{t.reminder}</Button>
              </div>
              <div className="space-y-1.5 rounded-lg border border-amber-500/30 p-2 text-xs" data-testid="growth-autopilot">
                <p className="font-medium">{t.autopilot}: {g.settings.autopilot ? t.autopilotOn : t.autopilotOff}</p>
                <p className="text-muted-foreground">{t.autopilotHelp}</p>
                {g.settings.autopilot
                  ? <Button size="sm" variant="outline" onClick={() => setAutopilot(false)}>{t.autopilotDisable}</Button>
                  : (
                    <div className="flex gap-2">
                      <Input value={autoText} onChange={(e) => setAutoText(e.target.value)} placeholder={t.autopilotType} aria-label={t.autopilotType} />
                      <Button size="sm" variant="outline" onClick={() => setAutopilot(true)} disabled={autoText.trim() !== 'AUTOPILOT'}>{t.autopilotEnable}</Button>
                    </div>
                  )}
              </div>
              <p className="text-[11px] text-muted-foreground">{t.lgpd}</p>
              <Button size="sm" variant="ghost" className="gap-1 text-rose-400" onClick={del}><Trash2 className="h-3.5 w-3.5" /> {t.deleteCampaign}</Button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default function VertalGrowthPage() {
  const access = useVertalGrowthAccess();
  if (access === 'checking') return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (access !== 'allowed') return <Suspense fallback={null}><NotFound /></Suspense>;
  return <VertalGrowthScreen />;
}
