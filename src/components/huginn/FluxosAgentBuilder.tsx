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
  { value: 'never', label: 'Only when I run it' },
  { value: 'every_1h', label: 'Every hour' },
  { value: 'every_12h', label: 'Every 12 hours' },
  { value: 'every_1d', label: 'Once a day' },
  { value: '8am', label: 'Every day at 8 am' },
  { value: 'every_7d', label: 'Once a week' },
]

const SHARED_NAMES: Record<string, string> = { gmail: 'Gmail', slack: 'Slack', github: 'GitHub', stripe: 'Stripe', discord: 'Discord', spotify: 'Spotify' }
/** Apps do Vertal Fluxos que não usam login: servem para qualquer usuário, sem conectar nada. */
const NO_LOGIN_APPS: Array<{ app_key: string; name: string }> = [
  { app_key: 'formatter', name: 'Formatter (no connection needed)' },
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
      return setNote('Parameters: use a JSON object, for example {"content": "{{ title }}"}.')
    }
    const sourceId = Number(source)
    if (trigger === 'agent' && !sourceId) return setNote('Choose the agent that starts this one.')
    const when = trigger === 'agent'
      ? `on each event from the agent "${agents.find((a) => a.id === sourceId)?.name ?? sourceId}"`
      : BUILDER_SCHEDULES.find((s) => s.value === schedule)?.label.toLowerCase() ?? schedule
    if (!window.confirm(`Create an agent that ${chosen.kind === 'trigger' ? 'searches' : 'runs'} "${chosen.name}" in ${appLabel(app)} with your connection, ${when}? Each run costs 2 credits (refunded if it fails).`)) return
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
        <Sparkles className="h-3.5 w-3.5" /> Create an agent with a Vertal Fluxos app
      </Button>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-2 text-sm" data-testid="fluxos-agent-builder">
      <p className="font-medium flex items-center gap-2"><Plug className="h-4 w-4 text-primary" /> Agent with a Vertal Fluxos app</p>
      <p className="text-xs text-muted-foreground">
        The agent uses the apps you already connected (no new password). The result of each run becomes an event
        that other agents or a flow can use.
      </p>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {conns && conns.every((c) => NO_LOGIN_APPS.some((n) => n.app_key === c.app_key)) && (
        <p className="text-xs">
          No app with a sign-in is connected yet. <Link className="underline" to="/connectors">Connect one in Connectors</Link>
        </p>
      )}
      {conns && conns.length > 0 && (
        <div className="space-y-2">
          <label className="block text-xs">Connected app
            <select className={selectCls} value={app} onChange={(e) => pickApp(e.target.value)} aria-label="Connected app">
              <option value="">Choose…</option>
              {conns.map((c) => <option key={c.app_key} value={c.app_key}>{appLabel(c.app_key)}</option>)}
            </select>
          </label>
          {desc && (
            <label className="block text-xs">What the agent does
              <select className={selectCls} value={item} onChange={(e) => setItem(e.target.value)} aria-label="Action or search">
                <option value="">Choose…</option>
                {items.map((i) => <option key={`${i.kind}:${i.key}`} value={`${i.kind}:${i.key}`}>{i.kind === 'trigger' ? 'Search: ' : ''}{i.name}</option>)}
              </select>
            </label>
          )}
          {chosen && (
            <>
              {chosen.description && <p className="text-xs text-muted-foreground">{chosen.description}</p>}
              <label className="block text-xs">Parameters (JSON; use {'{{ field }}'} for data from the incoming event)
                <Textarea className="font-mono text-xs" rows={4} value={params} onChange={(e) => setParams(e.target.value)} aria-label="Parameters" />
              </label>
              <div className="flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1"><input type="radio" checked={trigger === 'schedule'} onChange={() => setTrigger('schedule')} /> On a schedule</label>
                <label className="flex items-center gap-1"><input type="radio" checked={trigger === 'agent'} onChange={() => setTrigger('agent')} disabled={agents.length === 0} /> When another agent sends an event</label>
              </div>
              {trigger === 'schedule'
                ? (
                  <select className={selectCls} value={schedule} onChange={(e) => setSchedule(e.target.value)} aria-label="Schedule">
                    {BUILDER_SCHEDULES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                )
                : (
                  <select className={selectCls} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Agent that starts it">
                    <option value="">Choose the agent…</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                )}
              <Button size="sm" className="gap-1" onClick={create} disabled={loading}>
                <Sparkles className="h-3.5 w-3.5" /> Create agent (2 credits per run)
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
