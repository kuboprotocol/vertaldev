// Vertal Prospector · tela do pipeline (dentro do VERTAL Code AI, celular primeiro).
// Empresa → ICP para confirmar → Leads → Rascunhos para aprovar → Enviados/Respostas.
// Nada sai para um contato sem aprovação nesta tela; WhatsApp é sempre enviado pelo próprio usuário.
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Ban, Check, Download, ExternalLink, Loader2, Mail, MessageCircle, RefreshCw, Search, Send, Settings2, Target, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  callProspector, campaignOptionLabel, downloadCsv, joinAreas, parseAreas, prospectorErrorText, PROSPECTOR_NAME, readProspectorHandoff, searchCompaniesInBrowser, useVertalProspectorAccess, withDeadline,
} from '@/lib/vertalProspector/client';
import {
  EMAIL_STATUS_LABEL, leadsToCsv, textProblems, type CsvLead, type EmailStatus, type Icp,
} from '../../supabase/functions/_shared/vertalProspector/core';

const NotFound = lazy(() => import('@/pages/NotFound'));

type Step = 'empresa' | 'icp' | 'leads' | 'aprovar' | 'enviados';
const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'empresa', label: 'Empresa' },
  { id: 'icp', label: 'ICP' },
  { id: 'leads', label: 'Leads' },
  { id: 'aprovar', label: 'Aprovar' },
  { id: 'enviados', label: 'Enviados' },
];

interface Campaign {
  id: string;
  company_name: string;
  cnpj: string | null;
  website: string | null;
  status: 'icp_pending' | 'icp_confirmed' | 'archived';
  icp: Icp;
  profile: { offer?: string; pains?: string[] };
  settings: { senderName?: string; senderCompany?: string; bookingLink?: string | null };
}
interface Lead extends CsvLead {
  id: string;
  domain: string | null;
  whatsapp: string | null;
  fit: number | null;
  signals: { list?: string[]; why?: string; observation?: string } | null;
}
interface Message {
  id: string;
  lead_id: string;
  direction: 'out' | 'in';
  channel: 'email' | 'whatsapp';
  kind: 'first' | 'followup1' | 'followup2' | 'reply';
  subject: string | null;
  body: string;
  footer: string;
  status: string;
  sent_at: string | null;
  send_after: string | null;
  error: string | null;
  meta: Record<string, unknown>;
}

const KIND_LABEL: Record<Message['kind'], string> = { first: '1º contato', followup1: 'Follow-up 1', followup2: 'Follow-up 2', reply: 'Resposta' };
const STATUS_LABEL: Record<string, string> = {
  new: 'novo', enriched: 'site lido', drafted: 'rascunho', contacted: 'contatado', replied: 'respondeu', meeting: 'reunião',
  won: 'ganho', lost: 'perdido', opted_out: 'não contatar',
};
const EMAIL_BADGE: Record<string, string> = {
  verified: 'bg-emerald-500/15 text-emerald-300', risky: 'bg-amber-500/15 text-amber-300', guess: 'bg-sky-500/15 text-sky-300',
  invalid: 'bg-rose-500/15 text-rose-300', unknown: 'bg-muted text-muted-foreground',
};

const list = (s: string) => s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** Onde buscar: um ou mais locais (cidade, estado ou país), fácil de trocar antes de buscar. */
function AreasEditor({ areas, categories, disabled, onSave }: { areas: string[]; categories: string[]; disabled: boolean; onSave: (areas: string[]) => void }) {
  const [list, setList] = useState(areas);
  const [input, setInput] = useState('');
  const changed = joinAreas(list) !== joinAreas(areas);
  const add = () => {
    const more = parseAreas(input);
    if (!more.length) return;
    setList((cur) => parseAreas(joinAreas([...cur, ...more])));
    setInput('');
  };
  return (
    <div className="space-y-1.5 rounded-md border border-border/50 p-2" data-testid="prospector-search-scope">
      <p className="text-xs text-muted-foreground">
        Onde buscar{categories.length ? <> · <span className="text-foreground/80">{categories.join(', ')}</span></> : null}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {list.map((a) => (
          <span key={a} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
            {a}
            <button type="button" aria-label={`Remover ${a}`} disabled={disabled || list.length < 2} onClick={() => setList(list.filter((x) => x !== a))} className="text-muted-foreground hover:text-foreground disabled:opacity-40">×</button>
          </span>
        ))}
        <Input
          aria-label="Adicionar local"
          value={input}
          placeholder="Ex.: São Paulo, SP · Lisboa, Portugal"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          className="h-7 w-56 text-xs"
          disabled={disabled}
        />
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={disabled || !input.trim()} onClick={add}>Adicionar</Button>
        {changed && (
          <Button size="sm" className="h-7 text-xs" disabled={disabled || !list.length} onClick={() => onSave(list)}>Salvar locais</Button>
        )}
      </div>
    </div>
  );
}

export function VertalProspectorScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const handoff = useMemo(() => readProspectorHandoff(location.search), [location.search]);

  const [step, setStep] = useState<Step>('empresa');
  const [busy, setBusy] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Array<Pick<Campaign, 'id' | 'company_name' | 'status'> & { area?: string | null }>>([]);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [findings, setFindings] = useState<string[]>([]);
  const [cap, setCap] = useState({ cap: 20, sentToday: 0 });
  const [accounts, setAccounts] = useState<Array<{ id: string; email: string }>>([]);
  const [accountId, setAccountId] = useState('');
  const [form, setForm] = useState({ companyName: handoff.companyName, cnpj: handoff.cnpj, website: handoff.website, area: '' });
  const [icpDraft, setIcpDraft] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const [allowRisky, setAllowRisky] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [showDnc, setShowDnc] = useState(false);
  const [dnc, setDnc] = useState<Array<{ id: string; kind: string; value: string; reason: string | null }>>([]);
  const [dncInput, setDncInput] = useState({ kind: 'email', value: '' });
  const [limit, setLimit] = useState(25);
  const [searchError, setSearchError] = useState<string | null>(null);

  const run = useCallback(async <T,>(label: string, fn: () => Promise<T>): Promise<T | null> => {
    setBusy(label);
    try {
      return await fn();
    } catch (e) {
      toast.error(prospectorErrorText(e));
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  const loadList = useCallback(async () => {
    const r = await callProspector<{ campaigns: Campaign[] }>('list_campaigns').catch(() => null);
    if (r) setCampaigns(r.campaigns);
    const s = await callProspector<{ cap: number; sentToday: number; gmailAccounts: Array<{ id: string; email: string }> }>('status').catch(() => null);
    if (s) {
      setCap({ cap: s.cap, sentToday: s.sentToday });
      setAccounts(s.gmailAccounts ?? []);
      setAccountId((cur) => cur || s.gmailAccounts?.[0]?.id || '');
    }
  }, []);

  const icpToDraft = (icp: Icp) => ({
    summary: icp.summary ?? '',
    segments: (icp.segments ?? []).join(', '),
    osmTags: (icp.osmTags ?? []).map((t) => `${t.key}=${t.value}`).join(', '),
    area: icp.area ?? '',
    companySize: icp.companySize ?? '',
    buyingSignals: (icp.buyingSignals ?? []).join('; '),
    exclusions: (icp.exclusions ?? []).join('; '),
    decisionRoles: (icp.decisionRoles ?? []).join(', '),
  });

  const openCampaign = useCallback(async (id: string, goTo?: Step) => {
    const r = await run('Abrindo', () =>
      callProspector<{ campaign: Campaign; leads: Lead[]; messages: Message[]; cap: number; sentToday: number }>('get_campaign', { campaignId: id }),
    );
    if (!r) return;
    setCampaign(r.campaign);
    // Etapa "1. Empresa" mostra os dados salvos da campanha (antes aparecia vazia ao reabrir).
    setForm({ companyName: r.campaign.company_name ?? '', cnpj: r.campaign.cnpj ?? '', website: r.campaign.website ?? '', area: '' });
    setLeads(r.leads);
    setMessages(r.messages);
    setCap({ cap: r.cap, sentToday: r.sentToday });
    setIcpDraft(icpToDraft(r.campaign.icp));
    if (goTo) setStep(goTo);
  }, [run]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // Vertal Growth Team: ?campanha=<id> abre a campanha (ICP para confirmar ou leads).
  useEffect(() => {
    if (!handoff.campaignId) return;
    void (async () => {
      const r = await callProspector<{ campaign: Campaign }>('get_campaign', { campaignId: handoff.campaignId }).catch(() => null);
      if (r) await openCampaign(handoff.campaignId, r.campaign.status === 'icp_confirmed' ? 'leads' : 'icp');
    })();
  }, [handoff.campaignId, openCampaign]);

  const refresh = () => campaign && openCampaign(campaign.id);

  const createCampaign = async () => {
    const r = await run('Analisando a empresa', () =>
      callProspector<{ campaign: Campaign; findings: string[] }>('create_campaign', form),
    );
    if (!r) return;
    setFindings(r.findings ?? []);
    await loadList();
    await openCampaign(r.campaign.id, 'icp');
  };

  const draftIcp = (): Icp => ({
    summary: icpDraft.summary ?? '',
    segments: list(icpDraft.segments ?? ''),
    osmTags: list(icpDraft.osmTags ?? '').map((t) => {
      const [key, value] = t.split('=');
      return { key: (key ?? '').trim(), value: (value ?? '').trim() };
    }) as Icp['osmTags'],
    area: icpDraft.area ?? '',
    companySize: icpDraft.companySize ?? '',
    buyingSignals: list(icpDraft.buyingSignals ?? ''),
    exclusions: list(icpDraft.exclusions ?? ''),
    decisionRoles: list(icpDraft.decisionRoles ?? ''),
  });

  const saveIcp = async (confirm: boolean) => {
    if (!campaign) return;
    const r = await run(confirm ? 'Confirmando' : 'Salvando', () =>
      callProspector<{ campaign: Campaign }>('update_icp', { campaignId: campaign.id, icp: draftIcp(), confirm }),
    );
    if (!r) return;
    setCampaign(r.campaign);
    setIcpDraft(icpToDraft(r.campaign.icp));
    if (confirm) {
      toast.success('Cliente ideal confirmado.');
      setStep('leads');
    }
  };

  /** Locais da busca escolhidos pelo usuário (vencem o que a IA sugeriu). Mantém o ICP confirmado. */
  const saveAreas = async (areas: string[]) => {
    if (!campaign || !areas.length) return;
    const r = await run('Salvando locais', () =>
      callProspector<{ campaign: Campaign }>('update_icp', {
        campaignId: campaign.id, icp: { ...campaign.icp, area: joinAreas(areas) }, confirm: campaign.status === 'icp_confirmed',
      }),
    );
    if (!r) return;
    setCampaign(r.campaign);
    setIcpDraft(icpToDraft(r.campaign.icp));
    setCampaigns((cs) => cs.map((c) => (c.id === r.campaign.id ? { ...c, area: r.campaign.icp?.area ?? null } : c)));
    toast.success('Locais da busca salvos.');
  };

  const findLeads = async () => {
    if (!campaign) return;
    const r = await run('Buscando empresas no mapa aberto', async () => {
      // O mapa público recusa o servidor (403/406): o navegador do usuário consulta, com prazo e espelhos,
      // e o servidor só filtra e grava. Sem prazo a tela girava para sempre.
      // Rede de segurança: busca no mapa (~55 s) + gravação (30 s) nunca passam de 90 s — sempre resultado ou erro claro.
      setSearchError(null);
      try {
        return await withDeadline((async () => {
          const { elements, via, areas } = await searchCompaniesInBrowser(campaign.icp);
          const res = await callProspector<{ added: number; found: number; findings: string[] }>('find_leads', { campaignId: campaign.id, limit, elements }, { timeoutMs: 30_000 });
          // Por região: quantas o mapa trouxe e quais falharam (as outras seguem valendo).
          const perArea = areas.length > 1 || areas.some((a) => a.error)
            ? areas.map((a) => (a.error ? `${a.area}: ${a.finding ?? 'o mapa não respondeu agora.'}` : `${a.area}: ${a.count} no mapa.`))
            : [];
          return { ...res, findings: [...perArea, ...(res.findings ?? [])], via };
        })(), 90_000);
      } catch (e) {
        // Erro fica escrito na tela (o aviso flutuante some em segundos).
        setSearchError(prospectorErrorText(e));
        throw e;
      }
    });
    if (!r) return;
    setFindings(r.findings ?? []);
    toast.success(`${r.added} empresa(s) nova(s) na lista.`);
    if (!r.added) setSearchError(r.found ? 'Nenhuma empresa nova: as encontradas já estão na lista ou bloqueadas.' : 'O mapa respondeu, mas não há empresas dessas categorias nessa cidade. Revise as categorias ou a cidade do cliente ideal.');
    await refresh();
  };

  const enrich = async (ids: string[]) => {
    for (const [i, id] of ids.entries()) {
      const r = await run(`Lendo sites (${i + 1}/${ids.length})`, () => callProspector<{ lead: Lead }>('enrich_lead', { leadId: id }));
      if (r?.lead) setLeads((ls) => ls.map((l) => (l.id === id ? r.lead : l)));
    }
  };

  const draft = async (ids: string[]) => {
    for (const [i, id] of ids.entries()) {
      await run(`Escrevendo (${i + 1}/${ids.length})`, () => callProspector('draft_messages', { leadId: id }));
    }
    await refresh();
    setStep('aprovar');
  };

  const saveEdit = async (m: Message) => {
    const e = edits[m.id];
    if (!e) return;
    const r = await run('Salvando', () => callProspector('update_message', { messageId: m.id, subject: e.subject, body: e.body }));
    if (r) {
      setEdits((x) => {
        const { [m.id]: _drop, ...rest } = x;
        return rest;
      });
      await refresh();
    }
  };

  const decide = async (op: 'approve' | 'reject', ids: string[]) => {
    if (!ids.length) return;
    const r = await run(op === 'approve' ? 'Aprovando' : 'Rejeitando', () =>
      callProspector<{ approved?: string[]; rejected?: string[]; blocked: Array<{ id: string; problems: string[] }> }>(op, { messageIds: ids }),
    );
    if (!r) return;
    if (r.blocked?.length) toast.error(`${r.blocked.length} rascunho(s) precisam de ajuste: ${r.blocked[0].problems.join('; ')}`);
    else toast.success(op === 'approve' ? `${r.approved?.length ?? 0} aprovado(s).` : 'Rejeitado(s).');
    setSelected(new Set());
    await refresh();
  };

  const sendEmails = async (ids: string[]) => {
    if (!accountId) {
      toast.error('Conecte o Gmail em Conectores para enviar.');
      return;
    }
    const acct = accounts.find((a) => a.id === accountId)?.email ?? 'Gmail';
    if (!window.confirm(`Enviar ${ids.length} e-mail(s) aprovado(s) agora, pela conta ${acct}?`)) return;
    let sent = 0;
    for (const [i, id] of ids.entries()) {
      const r = await run(`Enviando (${i + 1}/${ids.length})`, () => callProspector('send', { messageId: id, accountId, allowRisky: allowRisky.has(id) }));
      if (r) sent++;
    }
    if (sent) toast.success(`${sent} e-mail(s) enviado(s).`);
    await refresh();
  };

  const openWhatsapp = async (m: Message) => {
    const r = await run('Abrindo WhatsApp', () => callProspector<{ link: string }>('whatsapp_link', { messageId: m.id }));
    if (r?.link) window.open(r.link, '_blank', 'noopener,noreferrer');
  };

  const checkReplies = async () => {
    if (!campaign) return;
    const r = await run('Lendo respostas', () =>
      callProspector<{ summary: { replies: number; optOuts: number; bounces: number; autoReplies: number; drafts: number } }>('check_replies', { campaignId: campaign.id }),
    );
    if (!r) return;
    const s = r.summary;
    toast.success(`${s.replies} resposta(s), ${s.drafts} rascunho(s) de resposta, ${s.optOuts} pedido(s) para parar, ${s.bounces} devolvido(s).`);
    await refresh();
  };

  const deleteLead = async (l: Lead) => {
    if (!window.confirm(`Apagar ${l.name} e as mensagens (LGPD)? Também entra na lista de não contatar.`)) return;
    const r = await run('Apagando', () => callProspector('delete_lead', { leadId: l.id, addToDnc: true }));
    if (r) await refresh();
  };

  const loadDnc = async () => {
    const r = await run('Carregando', () => callProspector<{ dnc: typeof dnc }>('dnc_list'));
    if (r) setDnc(r.dnc);
  };

  const exportCsv = () => {
    if (!campaign) return;
    const name = campaign.company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'campanha';
    downloadCsv(`vertal-prospector-${name}.csv`, leadsToCsv(leads));
  };

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const pending = messages.filter((m) => m.direction === 'out' && (m.status === 'draft' || m.status === 'approved'));
  const done = messages.filter((m) => m.direction === 'in' || ['sent', 'failed', 'cancelled'].includes(m.status));
  const approvedEmails = pending.filter((m) => m.status === 'approved' && m.channel === 'email' && (!m.send_after || new Date(m.send_after) <= new Date()));
  const newLeads = leads.filter((l) => l.status === 'new').map((l) => l.id);
  const enrichedLeads = leads.filter((l) => l.status === 'enriched').map((l) => l.id);
  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <div className="flex h-[100dvh] flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/50 px-3">
        <button type="button" onClick={() => navigate(-1)} aria-label="Voltar" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Target className="h-5 w-5 text-primary" aria-hidden />
        <h1 className="flex-1 truncate text-sm font-semibold">{PROSPECTOR_NAME}</h1>
        <select
          aria-label="Campanha"
          value={campaign?.id ?? ''}
          onChange={(e) => (e.target.value ? openCampaign(e.target.value, 'leads') : (setCampaign(null), setStep('empresa')))}
          className="max-w-[38vw] truncate rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
        >
          <option value="">Nova campanha</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {campaignOptionLabel(c, campaigns)}
            </option>
          ))}
        </select>
        <button type="button" aria-label="Não contatar" title="Lista de não contatar" onClick={() => { setShowDnc(true); void loadDnc(); }} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
          <Ban className="h-4 w-4" />
        </button>
        {campaign && (
          <button type="button" aria-label="Ajustes" title="Remetente e agenda" onClick={() => setShowSettings(true)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
            <Settings2 className="h-4 w-4" />
          </button>
        )}
      </header>

      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/40 px-2 py-2" aria-label="Etapas">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            disabled={s.id !== 'empresa' && !campaign}
            onClick={() => setStep(s.id)}
            className={cn(
              'whitespace-nowrap rounded-full border px-3 py-1 text-xs disabled:opacity-40',
              step === s.id ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border/60 text-foreground/80',
            )}
          >
            {i + 1}. {s.label}
            {s.id === 'aprovar' && pending.length > 0 && <span className="ml-1 text-primary">({pending.length})</span>}
          </button>
        ))}
      </nav>

      {busy && (
        <div className="flex shrink-0 items-center gap-2 bg-primary/10 px-3 py-1.5 text-xs text-primary" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {busy}…
        </div>
      )}

      <main className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {findings.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
            {findings.map((f) => <p key={f}>{f}</p>)}
            <button type="button" className="mt-1 underline" onClick={() => setFindings([])}>ok</button>
          </div>
        )}

        {step === 'empresa' && (
          <section className="mx-auto max-w-md space-y-3">
            <p className="text-sm text-muted-foreground">
              Diga qual é a sua empresa. Eu leio o site e o CNPJ, descubro o que você vende e proponho o cliente ideal para você confirmar.
              {handoff.from === 'chat' && <span className="block text-primary">Pedido vindo do Vertal Chat.</span>}
            </p>
            <Field label="Nome da empresa">
              <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Vertal Company" />
            </Field>
            <Field label="CNPJ (opcional)">
              <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} inputMode="numeric" placeholder="00.000.000/0000-00" />
            </Field>
            <Field label="Site (opcional)">
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} inputMode="url" placeholder="suaempresa.com.br" />
            </Field>
            <Field label="Onde buscar clientes (opcional — cidade, estado ou país; várias separadas por ;)">
              <Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="São Paulo, SP; Campinas, SP" />
            </Field>
            <Button className="w-full" disabled={!!busy || !form.companyName.trim()} onClick={createCampaign}>
              <Search className="mr-2 h-4 w-4" /> Analisar empresa
            </Button>
          </section>
        )}

        {step === 'icp' && campaign && (
          <section className="mx-auto max-w-xl space-y-3">
            <div className="rounded-md bg-secondary/40 p-3 text-sm">
              <p className="text-xs text-muted-foreground">O que {campaign.company_name} vende</p>
              <p>{campaign.profile?.offer || '—'}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Revise o cliente ideal. As categorias do mapa usam o formato chave=valor (ex.: amenity=dentist, shop=bakery, craft=electrician).
            </p>
            <Field label="Quem compra e por quê"><Textarea rows={3} value={icpDraft.summary ?? ''} onChange={(e) => setIcpDraft({ ...icpDraft, summary: e.target.value })} /></Field>
            <Field label="Segmentos"><Input value={icpDraft.segments ?? ''} onChange={(e) => setIcpDraft({ ...icpDraft, segments: e.target.value })} /></Field>
            <Field label="Categorias do mapa"><Input value={icpDraft.osmTags ?? ''} onChange={(e) => setIcpDraft({ ...icpDraft, osmTags: e.target.value })} /></Field>
            <Field label="Onde buscar (cidade, estado ou país — várias separadas por ;)"><Input value={icpDraft.area ?? ''} placeholder="São Paulo, SP; Campinas, SP" onChange={(e) => setIcpDraft({ ...icpDraft, area: e.target.value })} /></Field>
            <Field label="Porte"><Input value={icpDraft.companySize ?? ''} onChange={(e) => setIcpDraft({ ...icpDraft, companySize: e.target.value })} /></Field>
            <Field label="Sinais de compra"><Textarea rows={2} value={icpDraft.buyingSignals ?? ''} onChange={(e) => setIcpDraft({ ...icpDraft, buyingSignals: e.target.value })} /></Field>
            <Field label="Quem NÃO é cliente"><Input value={icpDraft.exclusions ?? ''} onChange={(e) => setIcpDraft({ ...icpDraft, exclusions: e.target.value })} /></Field>
            <Field label="Quem decide"><Input value={icpDraft.decisionRoles ?? ''} onChange={(e) => setIcpDraft({ ...icpDraft, decisionRoles: e.target.value })} /></Field>
            <div className="flex gap-2">
              <Button variant="outline" disabled={!!busy} onClick={() => saveIcp(false)}>Salvar</Button>
              <Button className="flex-1" disabled={!!busy} onClick={() => saveIcp(true)}>
                <Check className="mr-2 h-4 w-4" /> {campaign.status === 'icp_confirmed' ? 'Confirmado — salvar de novo' : 'Confirmar ICP'}
              </Button>
            </div>
          </section>
        )}

        {step === 'leads' && campaign && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Quantas" value={limit} onChange={(e) => setLimit(Number(e.target.value))} onInput={(e) => setLimit(Number((e.target as HTMLSelectElement).value))} className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs">
                {[10, 25, 50].map((n) => <option key={n} value={n}>{n} empresas</option>)}
              </select>
              <Button size="sm" disabled={!!busy || campaign.status !== 'icp_confirmed'} onClick={findLeads}>
                <Search className="mr-1 h-4 w-4" /> Buscar empresas
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy || !newLeads.length} onClick={() => enrich(newLeads.slice(0, 10))}>
                Ler sites ({Math.min(newLeads.length, 10)})
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy || !enrichedLeads.length} onClick={() => draft(enrichedLeads.slice(0, 10))}>
                Escrever mensagens ({Math.min(enrichedLeads.length, 10)})
              </Button>
              <Button size="sm" variant="ghost" disabled={!leads.length} onClick={exportCsv}>
                <Download className="mr-1 h-4 w-4" /> CSV
              </Button>
            </div>
            {campaign.status !== 'icp_confirmed' && <p className="text-xs text-amber-300">Confirme o ICP para buscar empresas.</p>}
            <AreasEditor
              key={`${campaign.id}:${campaign.icp?.area ?? ''}`}
              areas={parseAreas(campaign.icp?.area ?? '')}
              categories={(campaign.icp?.osmTags ?? []).map((t) => `${t.key}=${t.value}`)}
              disabled={!!busy}
              onSave={saveAreas}
            />
            {searchError && !busy && <p role="alert" className="text-sm text-destructive">{searchError}</p>}
            {leads.length === 0 && !busy && <p className="text-sm text-muted-foreground">Nenhuma empresa ainda.</p>}
            <ul className="space-y-2">
              {leads.map((l) => (
                <li key={l.id} className="rounded-lg border border-border/50 p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{l.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[l.category, l.city, STATUS_LABEL[l.status ?? 'new']].filter(Boolean).join(' · ')}
                        {l.fit !== null && l.fit !== undefined && <> · aderência {l.fit}/10</>}
                      </p>
                      {l.website && (
                        <a href={l.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary">
                          {l.domain ?? l.website} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <button type="button" aria-label="Apagar lead" onClick={() => deleteLead(l)} className="rounded p-1 text-muted-foreground hover:text-rose-300">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {(l.decision_maker?.name || l.email) && (
                    <p className="mt-1 text-xs">
                      {l.decision_maker?.name && <>{l.decision_maker.name}{l.decision_maker.role ? ` (${l.decision_maker.role})` : ''} · </>}
                      {l.email && <span>{l.email} </span>}
                      {l.email_status && (
                        <span className={cn('rounded px-1.5 py-0.5 text-[10px]', EMAIL_BADGE[l.email_status])}>{EMAIL_STATUS_LABEL[l.email_status as EmailStatus] ?? l.email_status}</span>
                      )}
                    </p>
                  )}
                  {l.signals?.list?.length ? <p className="mt-1 text-xs text-muted-foreground">Sinais: {l.signals.list.join('; ')}</p> : null}
                  {l.signals?.observation && <p className="mt-1 text-xs">Gancho: {l.signals.observation}</p>}
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => enrich([l.id])}>Ler site</Button>
                    <Button size="sm" variant="outline" disabled={!!busy || l.status === 'opted_out'} onClick={() => draft([l.id])}>Escrever</Button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-muted-foreground">
              Empresas vindas de mapa aberto colaborativo (licença ODbL) — <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">créditos</a>.
            </p>
          </section>
        )}

        {step === 'aprovar' && campaign && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Button size="sm" disabled={!!busy || !selected.size} onClick={() => decide('approve', [...selected])}><Check className="mr-1 h-4 w-4" /> Aprovar ({selected.size})</Button>
              <Button size="sm" variant="outline" disabled={!!busy || !selected.size} onClick={() => decide('reject', [...selected])}><X className="mr-1 h-4 w-4" /> Rejeitar</Button>
              <Button size="sm" variant="secondary" disabled={!!busy || !approvedEmails.length} onClick={() => sendEmails(approvedEmails.map((m) => m.id))}>
                <Send className="mr-1 h-4 w-4" /> Enviar aprovados ({approvedEmails.length})
              </Button>
              <select aria-label="Conta do Gmail" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="rounded-md border border-border/60 bg-background px-2 py-1.5">
                {accounts.length === 0 && <option value="">Gmail não conectado</option>}
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
              </select>
              <span className="text-muted-foreground">Hoje: {cap.sentToday}/{cap.cap}</span>
            </div>
            {pending.length === 0 && <p className="text-sm text-muted-foreground">Nenhum rascunho esperando aprovação.</p>}
            {pending.map((m) => {
              const lead = leadById.get(m.lead_id);
              const e = edits[m.id] ?? { subject: m.subject ?? '', body: m.body };
              const problems = textProblems(m.channel, m.kind, e.subject, e.body);
              const dirty = !!edits[m.id];
              return (
                <article key={m.id} className={cn('space-y-2 rounded-lg border p-3 text-sm', m.status === 'approved' ? 'border-emerald-500/40' : 'border-border/50')}>
                  <div className="flex items-center gap-2 text-xs">
                    <input type="checkbox" aria-label="Selecionar" checked={selected.has(m.id)} disabled={m.status !== 'draft'} onChange={() => toggle(m.id)} />
                    {m.channel === 'email' ? <Mail className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
                    <span className="font-medium">{lead?.name ?? 'Lead'}</span>
                    <span className="text-muted-foreground">{KIND_LABEL[m.kind]} · {m.channel === 'email' ? lead?.email ?? 'sem e-mail' : 'WhatsApp'}</span>
                    <span className={cn('ml-auto rounded px-1.5 py-0.5', m.status === 'approved' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-muted')}>
                      {m.status === 'approved' ? 'aprovado' : 'rascunho'}
                    </span>
                  </div>
                  {m.channel === 'email' && (
                    <Input aria-label="Assunto" value={e.subject} onChange={(ev) => setEdits({ ...edits, [m.id]: { ...e, subject: ev.target.value } })} />
                  )}
                  <Textarea aria-label="Mensagem" rows={5} value={e.body} onChange={(ev) => setEdits({ ...edits, [m.id]: { ...e, body: ev.target.value } })} />
                  {m.footer && <pre className="whitespace-pre-wrap rounded bg-secondary/40 p-2 text-[11px] text-muted-foreground">{m.footer.trim()}</pre>}
                  {m.send_after && m.status === 'approved' && new Date(m.send_after) > new Date() && (
                    <p className="text-xs text-muted-foreground">Sai a partir de {new Date(m.send_after).toLocaleDateString('pt-BR')}.</p>
                  )}
                  {problems.length > 0 && <p className="text-xs text-amber-300">Ajustar: {problems.join('; ')}</p>}
                  {m.error && <p className="text-xs text-rose-300">Último erro: {m.error}</p>}
                  <div className="flex flex-wrap gap-2">
                    {dirty && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => saveEdit(m)}>Salvar edição</Button>}
                    {m.status === 'draft' && !dirty && <Button size="sm" disabled={!!busy || problems.length > 0} onClick={() => decide('approve', [m.id])}>Aprovar</Button>}
                    {m.status === 'approved' && m.channel === 'email' && (
                      <>
                        {lead?.email_status === 'risky' && (
                          <label className="flex items-center gap-1 text-xs">
                            <input type="checkbox" checked={allowRisky.has(m.id)} onChange={() => setAllowRisky((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })} />
                            aceito e-mail arriscado
                          </label>
                        )}
                        <Button size="sm" disabled={!!busy} onClick={() => sendEmails([m.id])}><Send className="mr-1 h-4 w-4" /> Enviar</Button>
                      </>
                    )}
                    {m.status === 'approved' && m.channel === 'whatsapp' && (
                      <>
                        <Button size="sm" disabled={!!busy} onClick={() => openWhatsapp(m)}><MessageCircle className="mr-1 h-4 w-4" /> Abrir no WhatsApp</Button>
                        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run('Marcando', () => callProspector('mark_sent', { messageId: m.id })).then(refresh)}>Marquei como enviado</Button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {step === 'enviados' && campaign && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={!!busy} onClick={checkReplies}><RefreshCw className="mr-1 h-4 w-4" /> Ver respostas</Button>
              <span className="text-xs text-muted-foreground">Respostas viram rascunho na aba Aprovar (com horários de reunião).</span>
            </div>
            {done.length === 0 && <p className="text-sm text-muted-foreground">Nada enviado ainda.</p>}
            {done.map((m) => {
              const lead = leadById.get(m.lead_id);
              return (
                <article key={m.id} className={cn('rounded-lg border p-3 text-sm', m.direction === 'in' ? 'border-primary/40 bg-primary/5' : 'border-border/50')}>
                  <p className="text-xs text-muted-foreground">
                    {m.direction === 'in' ? `Resposta de ${String(m.meta?.from ?? lead?.name ?? '')}` : `${KIND_LABEL[m.kind]} para ${lead?.name ?? ''}`}
                    {' · '}
                    {m.direction === 'in' ? String(m.meta?.class ?? '') : m.status === 'sent' ? (m.meta?.manual ? 'enviado por você' : 'enviado') : m.status === 'cancelled' ? 'cancelado' : m.status}
                    {m.sent_at && ` · ${new Date(m.sent_at).toLocaleString('pt-BR')}`}
                  </p>
                  {m.subject && <p className="font-medium">{m.subject}</p>}
                  <p className="whitespace-pre-wrap text-xs">{m.body.slice(0, 600)}</p>
                </article>
              );
            })}
          </section>
        )}
      </main>

      <footer className="shrink-0 border-t border-border/40 px-3 py-2 text-[10px] text-muted-foreground">
        Só dados de contato de empresas (B2B). Toda mensagem leva opção de parar; quem pedir sai da lista. Apagar um lead remove os dados dele.
      </footer>

      {showSettings && campaign && (
        <SettingsDialog
          campaign={campaign}
          onClose={() => setShowSettings(false)}
          onSave={async (settings) => {
            const r = await run('Salvando', () => callProspector<{ campaign: Campaign }>('update_settings', { campaignId: campaign.id, settings }));
            if (r) {
              setCampaign(r.campaign);
              setShowSettings(false);
            }
          }}
        />
      )}

      {showDnc && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-label="Não contatar">
          <div className="max-h-[80vh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-xl bg-background p-4 sm:rounded-xl">
            <div className="flex items-center">
              <h2 className="flex-1 text-sm font-semibold">Lista de não contatar</h2>
              <button type="button" aria-label="Fechar" onClick={() => setShowDnc(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="flex gap-2">
              <select value={dncInput.kind} onChange={(e) => setDncInput({ ...dncInput, kind: e.target.value })} className="rounded-md border border-border/60 bg-background px-2 text-xs">
                <option value="email">e-mail</option>
                <option value="domain">domínio</option>
                <option value="phone">telefone</option>
              </select>
              <Input value={dncInput.value} onChange={(e) => setDncInput({ ...dncInput, value: e.target.value })} placeholder="contato@empresa.com.br" />
              <Button size="sm" disabled={!!busy || !dncInput.value.trim()} onClick={async () => {
                const r = await run('Adicionando', () => callProspector('dnc_add', { kind: dncInput.kind, value: dncInput.value }));
                if (r) {
                  setDncInput({ ...dncInput, value: '' });
                  await loadDnc();
                  await refresh();
                }
              }}>Adicionar</Button>
            </div>
            <ul className="space-y-1 text-xs">
              {dnc.map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <span className="flex-1">{d.value} <span className="text-muted-foreground">({d.kind}{d.reason ? ` · ${d.reason}` : ''})</span></span>
                  <button type="button" aria-label="Remover" onClick={async () => { await run('Removendo', () => callProspector('dnc_remove', { id: d.id })); await loadDnc(); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
              {dnc.length === 0 && <li className="text-muted-foreground">Vazia.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsDialog({ campaign, onClose, onSave }: { campaign: Campaign; onClose: () => void; onSave: (s: Record<string, string>) => void }) {
  const [s, setS] = useState({
    senderName: campaign.settings?.senderName ?? '',
    senderCompany: campaign.settings?.senderCompany ?? campaign.company_name,
    bookingLink: campaign.settings?.bookingLink ?? '',
  });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-label="Ajustes">
      <div className="w-full max-w-md space-y-3 rounded-t-xl bg-background p-4 sm:rounded-xl">
        <h2 className="text-sm font-semibold">Remetente e reuniões</h2>
        <Field label="Seu nome (assinatura)"><Input value={s.senderName} onChange={(e) => setS({ ...s, senderName: e.target.value })} /></Field>
        <Field label="Empresa (assinatura)"><Input value={s.senderCompany} onChange={(e) => setS({ ...s, senderCompany: e.target.value })} /></Field>
        <Field label="Link de agenda (opcional, https://)"><Input value={s.bookingLink} onChange={(e) => setS({ ...s, bookingLink: e.target.value })} /></Field>
        <p className="text-[11px] text-muted-foreground">Sem link, as respostas sugerem 3 dias úteis às 10h e 15h (horário de Brasília).</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(s)}>Salvar</Button>
        </div>
      </div>
    </div>
  );
}

/** Rota: só quem o servidor libera (VERTAL_PROSPECTOR_USER_IDS) vê a tela; os demais, "não encontrada". */
export default function VertalProspectorPage() {
  const access = useVertalProspectorAccess();
  if (access === 'checking') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" data-testid="vertal-prospector-checking">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }
  if (access !== 'allowed') {
    return (
      <Suspense fallback={null}>
        <NotFound />
      </Suspense>
    );
  }
  return <VertalProspectorScreen />;
}
