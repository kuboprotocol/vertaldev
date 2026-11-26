import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Loader2, LogIn, Plug, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { callFluxosApps, PENDING_APP_KEY, RETURN_PATH_KEY, type FluxosDescribe, type FluxosField } from '@/lib/fluxos/apps'

const SECRET_HINT = /token|secret|password|senha|key|chave/i

function fieldLabel(f: FluxosField): string {
  if (f.key === 'screenName') return 'Nome da conexão'
  return f.label || f.key
}

/** Conectar um app do Vertal Fluxos direto no Vertal Dev: login OAuth do app ou formulário de chave. */
export function FluxosConnectPanel({ app, name, returnPath, intro }: {
  app: string
  name: string
  /** Página para voltar depois do login (padrão: página do conector no catálogo). */
  returnPath?: string
  /** Texto extra acima do botão de login (ex.: requisitos da conta). */
  intro?: string
}) {
  const [info, setInfo] = useState<FluxosDescribe | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const res = await callFluxosApps<FluxosDescribe>({ op: 'describe', app })
    if (res.ok && res.data) {
      setInfo(res.data)
      setError(null)
      const defaults: Record<string, string> = {}
      for (const f of res.data.fields) if (typeof f.value === 'string' && f.value) defaults[f.key] = f.value
      setValues((v) => ({ ...defaults, ...v }))
    } else {
      setError(res.message)
    }
    setLoading(false)
  }, [app])

  useEffect(() => { void load() }, [load])

  if (loading) {
    return <Card className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando {name}…</Card>
  }
  if (!info) {
    return <Card className="p-6 text-sm text-destructive">{error ?? 'Não foi possível carregar este app.'}</Card>
  }

  const connected = info.connection?.status === 'connected'
  const oauthReady = info.app.oauth && info.platformClient === true
  // O servidor já tira os campos que o Vertal fornece (cliente OAuth); sem cliente, o usuário informa o próprio.
  const formFields = info.fields

  const connect = async () => {
    setBusy(true)
    setError(null)
    const fields: Record<string, string> = {}
    for (const f of formFields) if (values[f.key]) fields[f.key] = values[f.key]
    const res = await callFluxosApps<{ mode: 'oauth' | 'connected'; url?: string }>({ op: 'start', app, fields })
    if (!res.ok || !res.data) {
      setBusy(false)
      setError(res.code === 'missing_fields' && res.fields?.length
        ? `Preencha: ${res.fields.map((k) => fieldLabel(info.fields.find((f) => f.key === k) ?? { key: k })).join(', ')}.`
        : res.message)
      return
    }
    if (res.data.mode === 'oauth' && res.data.url) {
      sessionStorage.setItem(PENDING_APP_KEY, app)
      if (returnPath) sessionStorage.setItem(RETURN_PATH_KEY, returnPath)
      else sessionStorage.removeItem(RETURN_PATH_KEY)
      window.location.assign(res.data.url)
      return
    }
    setBusy(false)
    toast.success(`${name} conectado.`)
    void load()
  }

  const disconnect = async () => {
    setBusy(true)
    const res = await callFluxosApps({ op: 'disconnect', app })
    setBusy(false)
    if (!res.ok) { toast.error(res.message); return }
    toast.success(`${name} desconectado.`)
    void load()
  }

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Plug className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Conectar {name}</h2>
        </div>
        {connected
          ? <Badge className="gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Conectado</Badge>
          : <Badge variant="outline">Não conectado</Badge>}
      </div>

      {connected ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Conta: <span className="text-foreground font-medium">{info.connection?.screen_name ?? name}</span>. O Vertal Chat já pode usar {name}
            {info.actions.length + info.searches.length > 0 ? ` (${info.actions.length} ações, ${info.searches.length} buscas)` : ''}. Peça no chat, por exemplo: “use o {name} para …”.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={disconnect} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Desconectar
            </Button>
            <Button variant="ghost" onClick={connect} disabled={busy}>Reconectar</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {oauthReady ? (
            <>
              <p className="text-sm text-muted-foreground">Você entra na sua conta {name} e autoriza o Vertal Dev. Nenhuma senha passa por aqui.</p>
              {intro && <p className="text-xs text-muted-foreground">{intro}</p>}
            </>
          ) : info.app.oauth ? (
            <p className="text-sm text-muted-foreground">
              {`O login direto com ${name} ainda não está liberado. Se você tem um app próprio no ${name}, informe o client ID e o secret abaixo (endereço de retorno: https://vertal.dev/fluxos/oauth/${app}).`}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Informe os dados de acesso do {name}. Ficam guardados criptografados no servidor do Vertal Fluxos e nunca voltam para o navegador.</p>
          )}

          {formFields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`fx-${f.key}`}>{fieldLabel(f)}{f.required && f.key !== 'screenName' ? ' *' : ''}</Label>
              {Array.isArray(f.options) && f.options.length > 0 ? (
                <select
                  id={`fx-${f.key}`}
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                >
                  <option value="">Escolha…</option>
                  {f.options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label ?? String(o.value)}</option>)}
                </select>
              ) : (
                <Input
                  id={`fx-${f.key}`}
                  type={SECRET_HINT.test(f.key) && f.key !== 'screenName' ? 'password' : 'text'}
                  autoComplete="off"
                  placeholder={f.key === 'screenName' ? `Minha conta ${name}` : f.placeholder ?? ''}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              )}
              {f.description && f.key !== 'screenName' && <p className="text-xs text-muted-foreground">{f.description}</p>}
            </div>
          ))}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <Button onClick={connect} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : oauthReady ? <LogIn className="w-4 h-4" /> : <Plug className="w-4 h-4" />}
              {oauthReady ? `Entrar com ${name}` : 'Conectar'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

export default FluxosConnectPanel
