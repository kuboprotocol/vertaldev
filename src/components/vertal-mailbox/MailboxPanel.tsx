// Vertal Mail · caixa de e-mail profissional (/emails quando liberado) + contas conectadas → CRM.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Inbox, Send, Trash2, RefreshCw, PenSquare, Reply, Mail, Plus, Database, ExternalLink, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  callMailbox, mailAccountPath, MailboxError, syncTotals,
  type MailListItem, type MailMessage, type MailStatus,
} from '@/lib/vertalMailbox/client';
import { mailError, mailUi } from '@/lib/vertalMailbox/i18n';

type Folder = 'inbox' | 'sent' | 'trash' | 'spam';
const FOLDERS: Folder[] = ['inbox', 'sent', 'trash', 'spam'];

/** HTML do e-mail num iframe sem scripts, sem formulários e sem acesso à página. */
export function SafeHtml({ html }: { html: string }) {
  const doc = `<!doctype html><meta charset="utf-8"><base target="_blank"><style>body{font-family:system-ui,sans-serif;font-size:14px;color:#111;background:#fff;margin:12px;word-break:break-word}img{max-width:100%;height:auto}</style>${html}`;
  return <iframe title="email" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={doc} className="w-full min-h-[420px] rounded-lg border border-border bg-white" />;
}

export function useMailError() {
  const ui = useMemo(() => mailUi(), []);
  return useCallback((e: unknown) => toast.error(mailError(ui, e instanceof MailboxError ? e.code : null)), [ui]);
}

export default function MailboxPanel({ status, onReload, onShowLog }: { status: MailStatus; onReload: () => void; onShowLog: () => void }) {
  const navigate = useNavigate();
  const ui = useMemo(() => mailUi(), []);
  const showError = useMailError();
  const [folder, setFolder] = useState<Folder>('inbox');
  const [addressId, setAddressId] = useState<string>('all');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<MailListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<MailMessage | null>(null);
  const [compose, setCompose] = useState<null | { addressId: string; to: string; cc: string; subject: string; text: string; replyToId?: string }>(null);
  const [sending, setSending] = useState(false);
  const [newLocal, setNewLocal] = useState('');
  const [newName, setNewName] = useState('');
  const [syncing, setSyncing] = useState(false);

  const activeAddresses = status.addresses.filter((a) => a.active);
  const canSend = (domain: string) => status.config.outbound && status.config.outboundDomains.includes(domain);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await callMailbox<{ messages: MailListItem[] }>('list', { folder, ...(addressId !== 'all' ? { addressId } : {}), ...(q.trim() ? { q: q.trim() } : {}) });
      setItems(r.messages);
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  }, [folder, addressId, q, showError]);

  useEffect(() => { void load(); }, [folder, addressId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openMessage = async (id: string) => {
    try {
      const r = await callMailbox<{ message: MailMessage }>('read', { id });
      setOpen(r.message);
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, read_at: x.read_at ?? new Date().toISOString() } : x)));
    } catch (e) {
      showError(e);
    }
  };

  const doSend = async () => {
    if (!compose) return;
    setSending(true);
    try {
      await callMailbox('send', { addressId: compose.addressId, to: compose.to, cc: compose.cc, subject: compose.subject, text: compose.text, ...(compose.replyToId ? { replyToId: compose.replyToId } : {}) });
      toast.success(ui.sent);
      setCompose(null);
      if (folder === 'sent') void load();
    } catch (e) {
      showError(e);
    } finally {
      setSending(false);
    }
  };

  const createAddress = async () => {
    try {
      await callMailbox('address_create', { localPart: newLocal.trim().toLowerCase(), domain: status.config.aliasDomains[0], displayName: newName.trim() });
      setNewLocal(''); setNewName('');
      toast.success(ui.saved);
      onReload();
    } catch (e) {
      showError(e);
    }
  };

  const toggleAddressFeed = async (id: string, crmFeed: boolean) => {
    try { await callMailbox('address_update', { id, crmFeed }); onReload(); } catch (e) { showError(e); }
  };
  const toggleFeed = async (source: 'gmail' | 'outlook', accountRef: string, enabled: boolean) => {
    try { await callMailbox('feed_set', { source, accountRef, enabled }); onReload(); } catch (e) { showError(e); }
  };
  const syncNow = async () => {
    setSyncing(true);
    try {
      const r = await callMailbox<{ results: Record<string, unknown> }>('crm_sync', {});
      const t = syncTotals(r.results);
      toast.success(ui.synced(t.notes, t.contacts));
      onReload();
    } catch (e) {
      showError(e);
    } finally {
      setSyncing(false);
    }
  };

  const startReply = (m: MailMessage) => {
    const addr = status.addresses.find((a) => a.id === m.address_id);
    setCompose({ addressId: addr?.id ?? activeAddresses[0]?.id ?? '', to: m.reply_to || m.from_address, cc: '', subject: '', text: '', replyToId: m.id });
  };

  const fmtDate = (s: string) => { try { return new Date(s).toLocaleString(); } catch { return s; } };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 glass glass-border">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="gap-2"><ArrowLeft className="h-4 w-4" />{ui.back}</Button>
          <Mail className="h-5 w-5 text-primary" />
          <div className="min-w-0">
            <h1 className="font-semibold leading-tight">{ui.title}</h1>
            <p className="text-xs text-muted-foreground truncate">{ui.subtitle}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onShowLog}>{ui.sendLog}</Button>
            <Button size="sm" className="gap-2" disabled={!activeAddresses.length}
              onClick={() => setCompose({ addressId: activeAddresses[0]?.id ?? '', to: '', cc: '', subject: '', text: '' })}>
              <PenSquare className="h-4 w-4" />{ui.compose}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Coluna da esquerda: pastas, endereços e contas */}
        <aside className="space-y-4">
          <Card>
            <CardContent className="p-2 space-y-1">
              {FOLDERS.map((f) => (
                <Button key={f} variant={folder === f ? 'secondary' : 'ghost'} className="w-full justify-start gap-2" onClick={() => { setFolder(f); setOpen(null); }}>
                  {f === 'inbox' ? <Inbox className="h-4 w-4" /> : f === 'sent' ? <Send className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                  {ui.folders[f]}
                  {f === 'inbox' && status.unread > 0 && <Badge className="ml-auto">{status.unread}</Badge>}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{ui.addresses}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!status.config.aliasDomains.length && <p className="text-muted-foreground">{ui.noAliasDomain}</p>}
              {status.config.aliasDomains.length > 0 && !activeAddresses.length && <p className="text-muted-foreground">{ui.noAddresses}</p>}
              {activeAddresses.length > 1 && (
                <select className="w-full rounded-md border border-border bg-background p-2" value={addressId} onChange={(e) => setAddressId(e.target.value)}>
                  <option value="all">—</option>
                  {activeAddresses.map((a) => <option key={a.id} value={a.id}>{a.address}</option>)}
                </select>
              )}
              {activeAddresses.map((a) => (
                <div key={a.id} className="rounded-lg border border-border p-2 space-y-1">
                  <div className="font-medium break-all">{a.address}</div>
                  {!canSend(a.domain) && <div className="text-xs text-amber-500">{ui.outboundOff}</div>}
                  <label className="flex items-center justify-between gap-2 text-xs" title={ui.feedCrmHint}>
                    <span>{ui.feedCrm}</span>
                    <Switch checked={a.crm_feed} disabled={!status.crmEnabled} onCheckedChange={(v) => void toggleAddressFeed(a.id, v)} />
                  </label>
                </div>
              ))}
              {status.config.aliasDomains.length > 0 && activeAddresses.length < 5 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Input value={newLocal} onChange={(e) => setNewLocal(e.target.value)} placeholder={ui.localPart} className="h-8" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">@{status.config.aliasDomains[0]}</span>
                  </div>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={ui.displayName} className="h-8" />
                  <Button size="sm" variant="outline" className="w-full gap-2" disabled={newLocal.trim().length < 3} onClick={() => void createAddress()}>
                    <Plus className="h-4 w-4" />{ui.newAddress}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{ui.connected}</CardTitle>
              <p className="text-xs text-muted-foreground">{ui.connectedHint}</p>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!status.crmEnabled && <p className="text-xs text-amber-500">{ui.crmOff}</p>}
              {status.accounts.gmail.map((g) => (
                <div key={g.id} className="rounded-lg border border-border p-2 space-y-1">
                  <div className="flex items-center gap-2"><Badge variant="secondary">Gmail</Badge><span className="break-all text-xs">{g.email}</span></div>
                  <label className="flex items-center justify-between gap-2 text-xs" title={ui.feedCrmHint}>
                    <span>{ui.feedCrm}</span>
                    <Switch checked={g.crmFeed} disabled={!status.crmEnabled} onCheckedChange={(v) => void toggleFeed('gmail', g.id, v)} />
                  </label>
                  {g.lastSyncedAt && <div className="text-[11px] text-muted-foreground">{ui.lastSync}: {fmtDate(g.lastSyncedAt)}</div>}
                  <Button size="sm" variant="ghost" className="w-full gap-2" onClick={() => navigate(mailAccountPath('gmail', g.id))}><ExternalLink className="h-3 w-3" />{ui.openInbox}</Button>
                </div>
              ))}
              {status.accounts.gmail.length === 0 && (
                <Button size="sm" variant="outline" className="w-full" onClick={() => navigate('/connectors/gmail')}>{ui.connectGmail}</Button>
              )}
              {status.accounts.outlook.connected ? (
                <div className="rounded-lg border border-border p-2 space-y-1">
                  <div className="flex items-center gap-2"><Badge variant="secondary">Outlook</Badge><span className="break-all text-xs">{status.accounts.outlook.label}</span></div>
                  <label className="flex items-center justify-between gap-2 text-xs" title={ui.feedCrmHint}>
                    <span>{ui.feedCrm}</span>
                    <Switch checked={status.accounts.outlook.crmFeed} disabled={!status.crmEnabled} onCheckedChange={(v) => void toggleFeed('outlook', 'microsoft-outlook', v)} />
                  </label>
                  {status.accounts.outlook.lastSyncedAt && <div className="text-[11px] text-muted-foreground">{ui.lastSync}: {fmtDate(status.accounts.outlook.lastSyncedAt)}</div>}
                  <Button size="sm" variant="ghost" className="w-full gap-2" onClick={() => navigate(mailAccountPath('outlook'))}><ExternalLink className="h-3 w-3" />{ui.openInbox}</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="w-full" onClick={() => navigate('/connectors/microsoft-outlook/setup')}>{ui.connectOutlook}</Button>
              )}
              {status.crmEnabled && (
                <Button size="sm" className="w-full gap-2" disabled={syncing} onClick={() => void syncNow()}>
                  <Database className="h-4 w-4" />{ui.syncNow}
                </Button>
              )}
            </CardContent>
          </Card>
        </aside>

        {/* Lista + leitura / escrever */}
        <section className="grid gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 p-2 border-b border-border">
              <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void load(); }} placeholder={ui.search} className="h-8" />
              <Button size="icon" variant="ghost" title={ui.refresh} onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-border">
              {!loading && items.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">{ui.empty}</p>}
              {items.map((m) => (
                <button key={m.id} onClick={() => void openMessage(m.id)}
                  className={`w-full text-left p-3 hover:bg-muted/50 ${open?.id === m.id ? 'bg-muted/60' : ''}`}>
                  <div className="flex items-center gap-2">
                    {!m.read_at && m.direction === 'in' && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                    <span className={`truncate text-sm ${!m.read_at && m.direction === 'in' ? 'font-semibold' : ''}`}>
                      {m.direction === 'in' ? (m.from_name || m.from_address) : (m.to_addresses[0]?.email ?? '')}
                    </span>
                    {m.has_attachments && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                    <span className="ml-auto text-[11px] text-muted-foreground whitespace-nowrap">{fmtDate(m.created_at)}</span>
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
                <select className="w-full rounded-md border border-border bg-background p-2 text-sm" value={compose.addressId}
                  onChange={(e) => setCompose({ ...compose, addressId: e.target.value })} aria-label={ui.from}>
                  {activeAddresses.map((a) => <option key={a.id} value={a.id}>{ui.from}: {a.display_name ? `${a.display_name} <${a.address}>` : a.address}</option>)}
                </select>
                <Input value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} placeholder={ui.to} />
                <Input value={compose.cc} onChange={(e) => setCompose({ ...compose, cc: e.target.value })} placeholder={ui.cc} />
                {!compose.replyToId && <Input value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} placeholder={ui.subject} />}
                <Textarea value={compose.text} onChange={(e) => setCompose({ ...compose, text: e.target.value })} placeholder={ui.message} rows={12} />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => setCompose(null)}>{ui.cancel}</Button>
                  <Button className="gap-2" disabled={sending || !compose.to.trim() || !compose.text.trim()} onClick={() => void doSend()}>
                    <Send className="h-4 w-4" />{sending ? ui.sending : ui.send}
                  </Button>
                </div>
              </CardContent>
            ) : open ? (
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold break-words">{open.subject || ui.noSubject}</h2>
                    <p className="text-sm text-muted-foreground break-all">{ui.from}: {open.from_name ? `${open.from_name} <${open.from_address}>` : open.from_address}</p>
                    <p className="text-xs text-muted-foreground break-all">{ui.to}: {open.to_addresses.map((x) => x.email).join(', ')}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(open.created_at)}</p>
                  </div>
                  <div className="ml-auto flex gap-1">
                    {open.direction === 'in' && <Button size="sm" variant="outline" className="gap-1" onClick={() => startReply(open)}><Reply className="h-4 w-4" />{ui.reply}</Button>}
                    <Button size="icon" variant="ghost" title={ui.moveToTrash} onClick={async () => {
                      try { await callMailbox('move', { id: open.id, folder: 'trash' }); setOpen(null); void load(); } catch (e) { showError(e); }
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                {open.html_body ? <SafeHtml html={open.html_body} /> : <pre className="whitespace-pre-wrap break-words text-sm font-sans">{open.text_body}</pre>}
                {open.attachments?.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <div className="font-medium">{ui.attachments}</div>
                    {open.attachments.map((a, i) => <div key={i}>{a.filename} · {Math.round(a.size / 1024)} KB</div>)}
                  </div>
                )}
              </CardContent>
            ) : (
              <CardContent className="p-10 text-center text-muted-foreground text-sm">{ui.selectMessage}</CardContent>
            )}
          </Card>
        </section>
      </main>
    </div>
  );
}
