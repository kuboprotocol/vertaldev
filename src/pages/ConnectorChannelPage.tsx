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
    subtitle: 'Sua conta profissional do Instagram, pela API oficial da Meta',
    webhookFn: 'virtual-chat-instagram-webhook',
    subscribeHint: 'No app da Meta, em Instagram → Webhooks, assine o campo "messages".',
    secrets: ['INSTAGRAM_VERIFY_TOKEN', 'INSTAGRAM_APP_SECRET', 'INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_ACCOUNT_ID', 'INSTAGRAM_ALLOWED_IG_IDS'],
    rule: 'Respostas automáticas só para os IDs em INSTAGRAM_ALLOWED_IG_IDS. Texto livre só até 24 h depois da última mensagem do contato.',
  },
  whatsapp: {
    label: 'WhatsApp',
    subtitle: 'WhatsApp Business Cloud API (conta de negócio)',
    webhookFn: 'virtual-chat-webhook',
    subscribeHint: 'No app da Meta, em WhatsApp → Configuração, assine o campo "messages".',
    secrets: ['WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ALLOWED_WA_IDS'],
    rule: 'Respostas automáticas só para os números em WHATSAPP_ALLOWED_WA_IDS. Texto livre só até 24 h depois da última mensagem do cliente.',
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
  outside_window: 'Fora da janela de 24 h: só dá para responder quem escreveu nas últimas 24 horas.',
  channel_not_configured: 'Este canal ainda não está configurado no servidor.',
  forbidden: 'Só o dono da conta pode enviar pelos canais.',
  invalid_input: 'Confira o destinatário (id numérico) e o texto.',
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
      setLoadError(code === 'forbidden' ? 'Só o dono da conta pode ver esta caixa de entrada.' : 'Não foi possível carregar a caixa de entrada agora.')
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
      toast.error('Informe o destinatário e a mensagem')
      return
    }
    setSending(true)
    const { error } = await supabase.functions.invoke('channel-send', {
      body: { channel, to: to.trim(), text: text.trim() },
    })
    setSending(false)
    if (error) {
      const code = await functionErrorCode(error)
      toast.error(SEND_ERRORS[code ?? ''] ?? 'Não foi possível enviar a mensagem.')
      return
    }
    toast.success('Mensagem enviada')
    setText('')
    load()
  }

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      toast.success('URL copiada')
    } catch {
      toast.error('Não foi possível copiar. Selecione a URL e copie manualmente.')
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/connectors')}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <div>
              <h1 className="text-lg font-bold font-orbitron">{spec.label}</h1>
              <p className="text-xs text-muted-foreground">{spec.subtitle}</p>
            </div>
          </div>
          {operatorVisible && <div className="flex items-center gap-2">
            {configured === null && <Badge variant="outline">Verificando…</Badge>}
            {configured === true && <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30" variant="outline">Conectado</Badge>}
            {configured === false && <Badge variant="outline" className="border-amber-500/40 text-amber-400">Falta configurar</Badge>}
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </div>}
        </div>
      </div>

      {channel === 'whatsapp' && (
        <div className="max-w-5xl mx-auto px-4 pt-6">
          {/* Conexão do próprio cliente (token da Cloud API); a caixa abaixo é a do número do operador. */}
          <WhatsAppConnectPanel />
          <h2 className="mt-8 text-sm font-semibold text-muted-foreground">Caixa de entrada do número do Vertal (operador)</h2>
        </div>
      )}

      {channel === 'instagram' && (
        <div className="max-w-5xl mx-auto px-4 pt-6 space-y-4" data-testid="instagram-oauth-panel">
          {/* Conexão do próprio cliente: "Entrar com Instagram" (login da Meta, app do Vertal). */}
          <FluxosConnectPanel
            app="instagram"
            name="Instagram"
            returnPath="/connectors/instagram"
            intro="Use uma conta profissional do Instagram (Empresa ou Criador de conteúdo) vinculada a uma Página do Facebook. O login é feito na Meta e você escolhe quais Páginas e contas liberar. Depois, peça no Vertal Chat para publicar fotos e Reels, ver métricas ou ler e responder DMs (sempre com a sua confirmação)."
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowOperator((v) => !v)}
            aria-expanded={showOperator}
            data-testid="instagram-advanced-toggle"
          >
            <Settings2 className="w-4 h-4 mr-1" />
            {showOperator ? 'Ocultar avançado' : 'Avançado: canal do operador (webhook e segredos do servidor)'}
            <ChevronDown className={`w-4 h-4 ml-1 transition ${showOperator ? 'rotate-180' : ''}`} />
          </Button>
          {showOperator && (
            <p className="text-xs text-muted-foreground">
              Só para o dono do Vertal: a conta do Instagram do próprio Vertal, configurada por segredos do servidor, com respostas automáticas por IA.
            </p>
          )}
        </div>
      )}

      {operatorVisible && <div className="max-w-5xl mx-auto px-4 py-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="bg-card/30">
          <CardHeader><CardTitle className="text-base">Conexão com a Meta</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{spec.subscribeHint}</p>
            <div>
              <p className="text-xs text-muted-foreground mb-1">URL de callback (Callback URL)</p>
              <div className="flex gap-2">
                <code className="flex-1 truncate rounded-md border border-border bg-background px-3 py-2 text-xs">{webhookUrl}</code>
                <Button size="sm" variant="outline" onClick={copyWebhook}><Copy className="w-4 h-4" /></Button>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Segredos que o operador define no Supabase (Edge Functions → Secrets)</p>
              <ul className="list-disc pl-5 space-y-0.5">
                {spec.secrets.map((s) => <li key={s}><code className="text-xs">{s}</code></li>)}
              </ul>
              <p className="text-xs text-muted-foreground mt-2">Os valores nunca aparecem aqui nem no chat.</p>
            </div>
            <p className="text-xs text-muted-foreground border-t border-border pt-3">{spec.rule}</p>
          </CardContent>
        </Card>

        <Card className="bg-card/30">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Send className="w-4 h-4" /> Responder</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="ID do contato (número)" inputMode="numeric" />
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva a mensagem" rows={4} maxLength={4000} />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Toque em um contato na caixa para preencher o destinatário.</p>
              <Button onClick={send} disabled={sending || configured === false}>
                <Send className="w-4 h-4 mr-1" /> {sending ? 'Enviando…' : 'Enviar'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/30 lg:col-span-2">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Inbox className="w-4 h-4" /> Caixa de entrada</CardTitle></CardHeader>
          <CardContent>
            {loadError && <p className="text-sm text-amber-400 mb-3">{loadError}</p>}
            {!loadError && messages.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda. Elas aparecem aqui assim que chegarem pelo webhook.</p>
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
