import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { ArrowLeft, ChevronDown, Copy, Inbox, RefreshCw, Send, Settings2 } from 'lucide-react'
import { functionErrorCode } from '@/lib/functionError'
import { WhatsAppConnectPanel } from '@/components/connectors/WhatsAppConnectPanel'
import { FluxosConnectPanel } from '@/components/connectors/FluxosConnectPanel'
import { SITE_FONT, siteRoot } from '@/components/site/siteUi'

export type ChannelId = 'instagram' | 'whatsapp'

interface ChannelSpec {
  label: string
  subtitle: string
  webhookFn: string
  subscribeHint: string
  secrets: string[]
  rule: string
}

const SPEC: Record<ChannelId, ChannelSpec> = {
  instagram: {
    label: 'Instagram',
    subtitle: 'Your Instagram professional account, through the official Meta API',
    webhookFn: 'virtual-chat-instagram-webhook',
    subscribeHint: 'In the Meta app, go to Instagram → Webhooks and subscribe to the "messages" field.',
    secrets: ['INSTAGRAM_VERIFY_TOKEN', 'INSTAGRAM_APP_SECRET', 'INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_ACCOUNT_ID', 'INSTAGRAM_ALLOWED_IG_IDS'],
    rule: 'Automatic replies only go to the IDs in INSTAGRAM_ALLOWED_IG_IDS. Free-form text is only allowed up to 24 hours after the contact\'s last message.',
  },
  whatsapp: {
    label: 'WhatsApp',
    subtitle: 'WhatsApp Business Cloud API (business account)',
    webhookFn: 'virtual-chat-webhook',
    subscribeHint: 'In the Meta app, go to WhatsApp → Configuration and subscribe to the "messages" field.',
    secrets: ['WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ALLOWED_WA_IDS'],
    rule: 'Automatic replies only go to the numbers in WHATSAPP_ALLOWED_WA_IDS. Free-form text is only allowed up to 24 hours after the customer\'s last message.',
  },
}

interface InboxRow {
  channel: ChannelId
  direction: 'in' | 'out'
  contact_id: string
  display_name: string | null
  kind: string
  body: string | null
  occurred_at: string
}

const SEND_ERRORS: Record<string, string> = {
  outside_window: 'Outside the 24-hour window: you can only reply to people who wrote in the last 24 hours.',
  channel_not_configured: 'This channel is not set up on the server yet.',
  forbidden: 'Only the account owner can send through the channels.',
  invalid_input: 'Check the recipient (numeric ID) and the text.',
}

export default function ConnectorChannelPage({ channel }: { channel: ChannelId }) {
  const navigate = useNavigate()
  const spec = SPEC[channel]
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${spec.webhookFn}`

  const [configured, setConfigured] = useState<boolean | null>(null)
  const [messages, setMessages] = useState<InboxRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [to, setTo] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  // Instagram: o login por usuário é o caminho principal; o canal do operador fica em "Avançado".
  const operatorCollapsible = channel === 'instagram'
  const [showOperator, setShowOperator] = useState(false)
  const operatorVisible = !operatorCollapsible || showOperator

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase.functions.invoke('channel-inbox', { body: { channel, limit: 30 } })
    if (error) {
      const code = await functionErrorCode(error)
      setLoadError(code === 'forbidden' ? 'Only the account owner can see this inbox.' : 'We could not load the inbox right now.')
      setMessages([])
    } else {
      setConfigured(!!data?.configured?.[channel])
      setMessages((data?.messages ?? []) as InboxRow[])
    }
    setLoading(false)
  }, [channel])

  useEffect(() => { if (operatorVisible) load() }, [load, operatorVisible])

  const send = async () => {
    if (!to.trim() || !text.trim()) {
      toast.error('Enter the recipient and the message')
      return
    }
    setSending(true)
    const { error } = await supabase.functions.invoke('channel-send', {
      body: { channel, to: to.trim(), text: text.trim() },
    })
    setSending(false)
    if (error) {
      const code = await functionErrorCode(error)
      toast.error(SEND_ERRORS[code ?? ''] ?? 'We could not send the message.')
      return
    }
    toast.success('Message sent')
    setText('')
    load()
  }

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      toast.success('URL copied')
    } catch {
      toast.error('We could not copy. Select the URL and copy it by hand.')
    }
  }

  return (
    <div className={`min-h-screen ${siteRoot}`} style={SITE_FONT}>
      <div className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/connectors')}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <div>
              <h1 className="text-lg font-bold font-orbitron">{spec.label}</h1>
              <p className="text-xs text-muted-foreground">{spec.subtitle}</p>
            </div>
          </div>
          {operatorVisible && <div className="flex items-center gap-2">
            {configured === null && <Badge variant="outline">Checking…</Badge>}
            {configured === true && <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30" variant="outline">Connected</Badge>}
            {configured === false && <Badge variant="outline" className="border-amber-500/40 text-amber-400">Not set up</Badge>}
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>}
        </div>
      </div>

      {channel === 'whatsapp' && (
        <div className="max-w-5xl mx-auto px-4 pt-6">
          {/* Conexão do próprio cliente (token da Cloud API); a caixa abaixo é a do número do operador. */}
          <WhatsAppConnectPanel />
          <h2 className="mt-8 text-sm font-semibold text-muted-foreground">Inbox of the Vertal number (operator)</h2>
        </div>
      )}

      {channel === 'instagram' && (
        <div className="max-w-5xl mx-auto px-4 pt-6 space-y-4" data-testid="instagram-oauth-panel">
          {/* Conexão do próprio cliente: "Entrar com Instagram" (login da Meta, app do Vertal). */}
          <FluxosConnectPanel
            app="instagram"
            name="Instagram"
            returnPath="/connectors/instagram"
            intro="Use an Instagram professional account (Business or Creator). You sign in on the Meta screen, with Instagram or Facebook, and choose which accounts to allow. Then ask Vertal Chat to post photos and Reels, see insights, or read and answer DMs (always after you confirm)."
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowOperator((v) => !v)}
            aria-expanded={showOperator}
            data-testid="instagram-advanced-toggle"
          >
            <Settings2 className="w-4 h-4 mr-1" />
            {showOperator ? 'Hide advanced' : 'Advanced: operator channel (webhook and server secrets)'}
            <ChevronDown className={`w-4 h-4 ml-1 transition ${showOperator ? 'rotate-180' : ''}`} />
          </Button>
          {showOperator && (
            <p className="text-xs text-muted-foreground">
              Only for the Vertal owner: Vertal's own Instagram account, set up with server secrets, with automatic AI replies.
            </p>
          )}
        </div>
      )}

      {operatorVisible && <div className="max-w-5xl mx-auto px-4 py-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="bg-card/30">
          <CardHeader><CardTitle className="text-base">Meta connection</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{spec.subscribeHint}</p>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Callback URL</p>
              <div className="flex gap-2">
                <code className="flex-1 truncate rounded-md border border-border bg-background px-3 py-2 text-xs">{webhookUrl}</code>
                <Button size="sm" variant="outline" onClick={copyWebhook}><Copy className="w-4 h-4" /></Button>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Secrets the operator sets in Supabase (Edge Functions → Secrets)</p>
              <ul className="list-disc pl-5 space-y-0.5">
                {spec.secrets.map((s) => <li key={s}><code className="text-xs">{s}</code></li>)}
              </ul>
              <p className="text-xs text-muted-foreground mt-2">The values never show here or in the chat.</p>
            </div>
            <p className="text-xs text-muted-foreground border-t border-border pt-3">{spec.rule}</p>
          </CardContent>
        </Card>

        <Card className="bg-card/30">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Send className="w-4 h-4" /> Reply</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Contact ID (number)" inputMode="numeric" />
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your message" rows={4} maxLength={4000} />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Tap a contact in the inbox to fill in the recipient.</p>
              <Button onClick={send} disabled={sending || configured === false}>
                <Send className="w-4 h-4 mr-1" /> {sending ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/30 lg:col-span-2">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Inbox className="w-4 h-4" /> Inbox</CardTitle></CardHeader>
          <CardContent>
            {loadError && <p className="text-sm text-amber-400 mb-3">{loadError}</p>}
            {!loadError && messages.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground">No messages yet. They show here as soon as they arrive through the webhook.</p>
            )}
            <ul className="divide-y divide-border">
              {messages.map((m, i) => (
                <li key={`${m.occurred_at}-${i}`}>
                  <button
                    type="button"
                    onClick={() => m.direction === 'in' && setTo(m.contact_id)}
                    className="w-full text-left py-3 hover:bg-accent/40 rounded-md px-2 transition"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {m.direction === 'in' ? `${m.display_name ?? 'Contato'} · ${m.contact_id}` : `Respondido a ${m.contact_id}`}
                      </span>
                      <span>{new Date(m.occurred_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                    <p className="text-sm mt-1 whitespace-pre-wrap break-words">{m.body ?? `[${m.kind}]`}</p>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>}
    </div>
  )
}
