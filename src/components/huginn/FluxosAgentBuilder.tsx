// Agentes que usam os apps conectados do Vertal Fluxos: o usuário escolhe um app
// que ELE conectou, a ação (ou busca), os parâmetros e quando roda (a cada evento
// de outro agente ou numa agenda). O servidor confere a conexão, gera o token do
// usuário e cria o agente; nada de credencial passa pelo navegador.
// Nada é chamado sozinho: cada clique é a permissão daquela chamada.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Plug, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { callFluxosApps, type FluxosDescribe } from '@/lib/fluxos/apps'
import { callHuginnOp } from '@/lib/huginn/client'
import { FLUXOS_NATIVE_APPS } from '@/lib/fluxosConnectors'

export interface BuilderAgent { id: number; name: string }

interface Conn { app_key: string; status: string; screen_name?: string | null }
type Item = { kind: 'action' | 'trigger'; key: string; name: string; description?: string }

/** Agendas oferecidas no painel (subconjunto das aceitas pelo Vertal Agentes). */
const BUILDER_SCHEDULES: Array<{ value: string; label: string }> = [
  { value: 'never', label: 'Só quando eu mandar rodar' },
  { value: 'every_1h', label: 'A cada hora' },
  { value: 'every_12h', label: 'A cada 12 horas' },
  { value: 'every_1d', label: 'Uma vez por dia' },
  { value: '8am', label: 'Todo dia às 8h' },
  { value: 'every_7d', label: 'Uma vez por semana' },
]

const SHARED_NAMES: Record<string, string> = { gmail: 'Gmail', slack: 'Slack', github: 'GitHub', stripe: 'Stripe', discord: 'Discord', spotify: 'Spotify' }
/** Apps do Vertal Fluxos que não usam login: servem para qualquer usuário, sem conectar nada. */
const NO_LOGIN_APPS: Array<{ app_key: string; name: string }> = [
  { app_key: 'formatter', name: 'Formatter (não precisa conectar)' },
]
const appLabel = (key: string) =>
  NO_LOGIN_APPS.find((a) => a.app_key === key)?.name ?? FLUXOS_NATIVE_APPS.find((a) => a.app === key)?.name ?? SHARED_NAMES[key] ?? key

const selectCls = 'w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm'

export function FluxosAgentBuilder({ agents, onCreated }: { agents: BuilderAgent[]; onCreated?: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [conns, setConns] = useState<Conn[] | null>(null)
  const [app, setApp] = useState('')
  const [desc, setDesc] = useState<FluxosDescribe | null>(null)
  const [item, setItem] = useState('')
  const [params, setParams] = useState('{\n  \n}')
  const [trigger, setTrigger] = useState<'agent' | 'schedule'>('schedule')
  const [source, setSource] = useState('')
  const [schedule, setSchedule] = useState('never')
  const [note, setNote] = useState<string | null>(null)

  const start = async () => {
    setOpen(true)
    setLoading(true)
    setNote(null)
    const r = await callFluxosApps<{ connections?: Conn[] }>({ op: 'status' })
    setLoading(false)
    if (!r.ok) return setNote(r.message)
    const connected = (r.data?.connections ?? []).filter((c) => c.status === 'connected')
    setConns([
      ...connected,
      ...NO_LOGIN_APPS.filter((n) => !connected.some((c) => c.app_key === n.app_key)).map((n) => ({ app_key: n.app_key, status: 'connected' })),
    ])
  }

  const pickApp = async (key: string) => {
    setApp(key)
    setDesc(null)
    setItem('')
    if (!key) return
    setLoading(true)
    const r = await callFluxosApps<FluxosDescribe>({ op: 'describe', app: key })
    setLoading(false)
    if (!r.ok || !r.data) return setNote(r.message)
    setDesc(r.data)
  }

  const items: Item[] = desc
    ? [
      ...desc.actions.map((a) => ({ kind: 'action' as const, key: a.key, name: a.name, description: a.description })),
      ...desc.searches.map((s) => ({ kind: 'trigger' as const, key: s.key, name: s.name, description: s.description })),
    ]
    : []
  const chosen = items.find((i) => `${i.kind}:${i.key}` === item)

  const create = async () => {
    if (!chosen) return
    let parameters: Record<string, unknown>
    try {
      parameters = params.trim() ? JSON.parse(params) : {}
      if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) throw new Error('obj')
    } catch {
      return setNote('Parâmetros: use um objeto JSON, por exemplo {"content": "{{ title }}"}.')
    }
    const sourceId = Number(source)
    if (trigger === 'agent' && !sourceId) return setNote('Escolha o agente que dispara este.')
    const when = trigger === 'agent'
      ? `a cada evento do agente "${agents.find((a) => a.id === sourceId)?.name ?? sourceId}"`
      : BUILDER_SCHEDULES.find((s) => s.value === schedule)?.label.toLowerCase() ?? schedule
    if (!window.confirm(`Criar um agente que ${chosen.kind === 'trigger' ? 'busca' : 'executa'} "${chosen.name}" no ${appLabel(app)} com a sua conexão, ${when}? Cada execução custa 2 créditos (devolvidos se falhar).`)) return
    setLoading(true)
    const r = await callHuginnOp({
      op: 'create_fluxos_agent', app, kind: chosen.kind, key: chosen.key, parameters,
      ...(trigger === 'agent' ? { source_ids: [sourceId] } : { schedule }),
    })
    setLoading(false)
    setNote(r.message.split('\n')[0])
    if (r.ok) onCreated?.()
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="gap-1" onClick={start} data-testid="fluxos-agent-open">
        <Sparkles className="h-3.5 w-3.5" /> Criar agente com um app do Vertal Fluxos
      </Button>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-2 text-sm" data-testid="fluxos-agent-builder">
      <p className="font-medium flex items-center gap-2"><Plug className="h-4 w-4 text-primary" /> Agente com app do Vertal Fluxos</p>
      <p className="text-xs text-muted-foreground">
        O agente usa os apps que você já conectou (sem pedir senha de novo). A resposta de cada execução vira um evento
        que outros agentes ou um fluxo podem usar.
      </p>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {conns && conns.every((c) => NO_LOGIN_APPS.some((n) => n.app_key === c.app_key)) && (
        <p className="text-xs">
          Nenhum app com login conectado ainda. <Link className="underline" to="/connectors">Conectar em Conectores</Link>
        </p>
      )}
      {conns && conns.length > 0 && (
        <div className="space-y-2">
          <label className="block text-xs">App conectado
            <select className={selectCls} value={app} onChange={(e) => pickApp(e.target.value)} aria-label="App conectado">
              <option value="">Escolha…</option>
              {conns.map((c) => <option key={c.app_key} value={c.app_key}>{appLabel(c.app_key)}</option>)}
            </select>
          </label>
          {desc && (
            <label className="block text-xs">O que o agente faz
              <select className={selectCls} value={item} onChange={(e) => setItem(e.target.value)} aria-label="Ação ou busca">
                <option value="">Escolha…</option>
                {items.map((i) => <option key={`${i.kind}:${i.key}`} value={`${i.kind}:${i.key}`}>{i.kind === 'trigger' ? 'Buscar: ' : ''}{i.name}</option>)}
              </select>
            </label>
          )}
          {chosen && (
            <>
              {chosen.description && <p className="text-xs text-muted-foreground">{chosen.description}</p>}
              <label className="block text-xs">Parâmetros (JSON; use {'{{ campo }}'} para dados do evento recebido)
                <Textarea className="font-mono text-xs" rows={4} value={params} onChange={(e) => setParams(e.target.value)} aria-label="Parâmetros" />
              </label>
              <div className="flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1"><input type="radio" checked={trigger === 'schedule'} onChange={() => setTrigger('schedule')} /> Numa agenda</label>
                <label className="flex items-center gap-1"><input type="radio" checked={trigger === 'agent'} onChange={() => setTrigger('agent')} disabled={agents.length === 0} /> Quando outro agente emitir um evento</label>
              </div>
              {trigger === 'schedule'
                ? (
                  <select className={selectCls} value={schedule} onChange={(e) => setSchedule(e.target.value)} aria-label="Agenda">
                    {BUILDER_SCHEDULES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                )
                : (
                  <select className={selectCls} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Agente que dispara">
                    <option value="">Escolha o agente…</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                )}
              <Button size="sm" className="gap-1" onClick={create} disabled={loading}>
                <Sparkles className="h-3.5 w-3.5" /> Criar agente (2 créditos por execução)
              </Button>
            </>
          )}
        </div>
      )}
      {note && <p className="text-xs text-muted-foreground" role="status">{note}</p>}
    </div>
  )
}

export default FluxosAgentBuilder
