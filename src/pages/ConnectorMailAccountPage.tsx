// Vertal Mail · subpágina de UMA conta de e-mail conectada, dentro de Conectores:
//   /connectors/gmail/:accountId/inbox      → conta Gmail (conector nativo; funções gmail-* de sempre, grátis)
//   /connectors/microsoft-outlook/inbox     → conta Outlook (conexão do Vertal Fluxos; sem cobrança)
// Com o interruptor "Alimentar o CRM" (desligado por padrão): só as contas marcadas entram no Vertal CRM.
// Só abre com o Vertal Mail liberado (VITE_VERTAL_MAILBOX + servidor); senão manda para a página do conector.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Database, RefreshCw, Reply, Send, PenSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { SafeHtml, useMailError } from '@/components/vertal-mailbox/MailboxPanel';
import { callMailbox, isVertalMailboxEnabled, syncTotals, type MailStatus } from '@/lib/vertalMailbox/client';
import { mailUi } from '@/lib/vertalMailbox/i18n';

interface Row { id: string; threadId?: string; from: string; subject: string; snippet: string; date: string; unread?: boolean }
interface Full { id: string; threadId?: string; from: string; to: string; subject: string; date: string; text: string; html: string; messageIdHeader?: string; references?: string }

const graphAddr = (x: { emailAddress?: { name?: string; address?: string } } | undefined) =>
  x?.emailAddress ? (x.emailAddress.name ? `${x.emailAddress.name} <${x.emailAddress.address}>` : String(x.emailAddress.address ?? '')) : '';

export default function ConnectorMailAccountPage({ source }: { source: 'gmail' | 'outlook' }) {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const ui = useMemo(() => mailUi(), []);
  const showError = useMailError();
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Full | null>(null);
  const [compose, setCompose] = useState<null | { to: string; subject: string; body: string; reply?: Full }>(null);
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await callMailbox<MailStatus>('status', { autoSync: false }));
    } catch {
      setBlocked(true);
    }
  }, []);
  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const gmail = source === 'gmail' ? status?.accounts.gmail.find((g) => g.id === accountId) ?? null : null;
  const outlook = source === 'outlook' ? status?.accounts.outlook ?? null : null;
  const label = gmail?.email ?? outlook?.label ?? '';
  const feedOn = gmail ? gmail.crmFeed : !!outlook?.crmFeed;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (source === 'gmail') {
        const { data, error } = await supabase.functions.invoke('gmail-list-messages', {
          body: { accountId, q: search.trim() || 'in:inbox', maxResults: 25 },
        });
        if (error) throw error;
        setRows(((data?.messages ?? []) as Array<Row & { labelIds?: string[] }>).map((m) => ({ ...m, unread: (m.labelIds ?? []).includes('UNREAD') })));
      } else {
        const r = await callMailbox<{ messages: Array<Record<string, unknown>> }>('outlook_list', { top: 25, ...(search.trim() ? { search: search.trim() } : {}) });
        setRows(r.messages.map((m) => ({
          id: String(m.id), from: graphAddr(m.from as never), subject: String(m.subject ?? ''), snippet: String(m.bodyPreview ?? ''),
          date: String(m.receivedDateTime ?? ''), unread: m.isRead === false,
        })));
      }
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  }, [source, accountId, search, showError]);
  useEffect(() => { if (status && (gmail || outlook?.connected)) void load(); }, [status?.ok, accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const read = async (row: Row) => {
    try {
      if (source === 'gmail') {
        const { data, error } = await supabase.functions.invoke('gmail-get-thread', { body: { accountId, threadId: row.threadId ?? row.id } });
        if (error) throw error;
        const msgs = (data?.messages ?? []) as Array<Record<string, string>>;
        const m = msgs.find((x) => x.id === row.id) ?? msgs[msgs.length - 1];
        if (m) setOpen({ id: m.id, threadId: m.threadId, from: m.from, to: m.to, subject: m.subject, date: m.date, text: m.bodyText, html: m.bodyHtml, messageIdHeader: m.messageIdHeader, references: m.references });
      } else {
        const r = await callMailbox<{ message: Record<string, unknown> | null }>('outlook_read', { messageId: row.id });
        const m = r.message;
        if (m) {
          setOpen({
            id: String(m.id), from: graphAddr(m.from as never), to: ((m.toRecipients as never[]) ?? []).map((x) => graphAddr(x)).join(', '),
            subject: String(m.subject ?? ''), date: String(m.receivedDateTime ?? ''), text: String((m.body as { content?: string })?.content ?? ''), html: '',
          });
        }
      }
      setCompose(null);
    } catch (e) {
      showError(e);
    }
  };

  const send = async () => {
    if (!compose) return;
    setSending(true);
    try {
      if (source === 'gmail') {
        const r = compose.reply;
        const { error } = await supabase.functions.invoke('gmail-send-message', {
          body: {
            accountId, to: compose.to, subject: compose.subject, body: compose.body,
            ...(r ? { threadId: r.threadId, inReplyTo: r.messageIdHeader || undefined, references: [r.references, r.messageIdHeader].filter(Boolean).join(' ') || undefined } : {}),
          },
        });
        if (error) throw error;
      } else if (compose.reply) {
        await callMailbox('outlook_reply', { messageId: compose.reply.id, comment: compose.body });
      } else {
        await callMailbox('outlook_send', { to: compose.to, subject: compose.subject, body: compose.body });
      }
      toast.success(ui.sent);
      setCompose(null);
    } catch (e) {
      showError(e);
    } finally {
      setSending(false);
    }
  };

  const toggleFeed = async (enabled: boolean) => {
    try {
      await callMailbox('feed_set', { source, accountRef: source === 'gmail' ? accountId : 'microsoft-outlook', enabled });
      await loadStatus();
    } catch (e) {
      showError(e);
    }
  };
  const syncNow = async () => {
    setSyncing(true);
    try {
      const r = await callMailbox<{ results: Record<string, unknown> }>('crm_sync', { source, accountRef: source === 'gmail' ? accountId : 'microsoft-outlook' });
      const t = syncTotals(r.results);
      toast.success(ui.synced(t.notes, t.contacts));
      await loadStatus();
    } catch (e) {
      showError(e);
    } finally {
      setSyncing(false);
    }
  };

  if (!isVertalMailboxEnabled() || blocked) return <Navigate to={source === 'gmail' ? '/connectors/gmail' : '/connectors/microsoft-outlook'} replace />;
  if (!status) return <div className="min-h-screen grid place-items-center text-muted-foreground">{ui.loading}</div>;
  if (!gmail && !outlook?.connected) return <Navigate to={source === 'gmail' ? '/connectors/gmail' : '/connectors/microsoft-outlook/setup'} replace />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 glass glass-border">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/emails')} className="gap-2"><ArrowLeft className="h-4 w-4" />{ui.backToMail}</Button>
          <Badge variant="secondary">{source === 'gmail' ? 'Gmail' : 'Outlook'}</Badge>
          <span className="font-medium truncate">{label}</span>
          <div className="ml-auto flex items-center gap-3">
            {status.crmEnabled && (
              <label className="flex items-center gap-2 text-sm" title={ui.feedCrmHint}>
                {ui.feedCrm}
                <Switch checked={feedOn} onCheckedChange={(v) => void toggleFeed(v)} />
              </label>
            )}
            {status.crmEnabled && feedOn && (
              <Button size="sm" variant="outline" className="gap-2" disabled={syncing} onClick={() => void syncNow()}><Database className="h-4 w-4" />{ui.syncNow}</Button>
            )}
            <Button size="sm" className="gap-2" onClick={() => { setOpen(null); setCompose({ to: '', subject: '', body: '' }); }}><PenSquare className="h-4 w-4" />{ui.compose}</Button>
          </div>
        </div>
        {!status.crmEnabled && (
          <p className="max-w-7xl mx-auto px-4 pb-2 text-xs">
            <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => navigate('/crm')}>{ui.crmWaitlist}</button>
          </p>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 p-2 border-b border-border">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void load(); }} placeholder={ui.search} className="h-8" />
            <Button size="icon" variant="ghost" title={ui.refresh} onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
          </div>
          <div className="max-h-[75vh] overflow-y-auto divide-y divide-border">
            {!loading && rows.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">{ui.empty}</p>}
            {rows.map((m) => (
              <button key={m.id} onClick={() => void read(m)} className={`w-full text-left p-3 hover:bg-muted/50 ${open?.id === m.id ? 'bg-muted/60' : ''}`}>
                <div className="flex items-center gap-2">
                  {m.unread && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                  <span className={`truncate text-sm ${m.unread ? 'font-semibold' : ''}`}>{m.from}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground whitespace-nowrap">{m.date ? new Date(m.date).toLocaleString() : ''}</span>
                </div>
                <div className="truncate text-sm">{m.subject || ui.noSubject}</div>
                <div className="truncate text-xs text-muted-foreground">{m.snippet}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="min-h-[60vh]">
          {compose ? (
            <CardContent className="p-4 space-y-3">
              <Input value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} placeholder={ui.to} disabled={source === 'outlook' && !!compose.reply} />
              <Input value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} placeholder={ui.subject} disabled={source === 'outlook' && !!compose.reply} />
              <Textarea value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} placeholder={ui.message} rows={12} />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setCompose(null)}>{ui.cancel}</Button>
                <Button className="gap-2" disabled={sending || !compose.body.trim() || (!compose.reply && !compose.to.trim())} onClick={() => void send()}>
                  <Send className="h-4 w-4" />{sending ? ui.sending : ui.send}
                </Button>
              </div>
            </CardContent>
          ) : open ? (
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold break-words">{open.subject || ui.noSubject}</h2>
                  <p className="text-sm text-muted-foreground break-all">{ui.from}: {open.from}</p>
                  <p className="text-xs text-muted-foreground break-all">{ui.to}: {open.to}</p>
                </div>
                <Button size="sm" variant="outline" className="ml-auto gap-1" onClick={() => {
                  const addr = /<([^>]+)>/.exec(open.from)?.[1] ?? open.from;
                  setCompose({ to: addr, subject: /^re:/i.test(open.subject) ? open.subject : `Re: ${open.subject}`, body: '', reply: open });
                }}><Reply className="h-4 w-4" />{ui.reply}</Button>
              </div>
              {open.html ? <SafeHtml html={open.html} /> : <pre className="whitespace-pre-wrap break-words text-sm font-sans">{open.text}</pre>}
            </CardContent>
          ) : (
            <CardContent className="p-10 text-center text-muted-foreground text-sm">{ui.selectMessage}</CardContent>
          )}
        </Card>
      </main>
    </div>
  );
}
