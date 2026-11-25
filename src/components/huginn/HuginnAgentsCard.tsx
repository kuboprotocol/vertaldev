// Huginn no painel de agentes: status da instância do cliente, lista de agentes
// e ações rápidas. Nada é chamado sozinho: cada clique do usuário é a permissão
// daquela chamada (o servidor exige confirmed: true), como no Vertal Chat.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, KeyRound, Loader2, Play, Radar, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { callHuginnOp } from '@/lib/huginn/client'
import { FluxosAgentBuilder } from './FluxosAgentBuilder'

export interface HuginnAgentRow {
  id: number
  name: string
  type?: string
  enabled?: boolean
  schedule?: string
  events?: number
  lastEventAt?: string
  lastErrorAt?: string
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'setup'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; url?: string; agents: HuginnAgentRow[]; pending?: number; failures?: number }

export const HUGINN_SETUP_ROUTE = '/secrets?env_key=HUGINN_URL&name=Vertal%20Agentes%20URL'

const fmt = (iso?: string) => {
  if (!iso) return 'nunca'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'nunca' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function HuginnAgentsCard() {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [busy, setBusy] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = async () => {
    setState({ kind: 'loading' })
    setNote(null)
    const status = await callHuginnOp({ op: 'status' })
    if (!status.ok) {
      const setup = status.code === 'missing_secrets' || status.code === 'auth_failed' || status.code === 'bad_url'
      return setState({ kind: setup ? 'setup' : 'error', message: status.message })
    }
    const list = await callHuginnOp({ op: 'list_agents' })
    if (!list.ok) return setState({ kind: 'error', message: list.message })
    const s = (status.data ?? {}) as { instance_url?: string; pending?: number; recent_failures?: number }
    const d = (list.data ?? {}) as { agents?: HuginnAgentRow[]; instance_url?: string }
    setState({ kind: 'ready', url: d.instance_url ?? s.instance_url, agents: d.agents ?? [], pending: s.pending, failures: s.recent_failures })
  }

  const toggle = async (a: HuginnAgentRow, enabled: boolean) => {
    setBusy(a.id)
    const r = await callHuginnOp({ op: 'set_agent_enabled', agent_id: a.id, enabled })
    setBusy(null)
    setNote(r.message.split('\n')[0])
    if (r.ok && state.kind === 'ready') {
      setState({ ...state, agents: state.agents.map((x) => (x.id === a.id ? { ...x, enabled } : x)) })
    }
  }

  const run = async (a: HuginnAgentRow) => {
    if (!window.confirm(`Rodar agora o agente "${a.name}" no Vertal Agentes? Ele executa de verdade.`)) return
    setBusy(a.id)
    const r = await callHuginnOp({ op: 'run_agent', agent_id: a.id })
    setBusy(null)
    setNote(r.message.split('\n')[0])
  }

  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4 space-y-3" data-testid="huginn-card">
      <div className="flex items-start gap-3">
        <Radar className="h-5 w-5 text-primary mt-0.5" />
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold flex items-center gap-2">
            Vertal Agentes
            {state.kind === 'ready' && <Badge variant="default" className="text-[10px]">conectado</Badge>}
            {state.kind === 'setup' && <Badge variant="outline" className="text-[10px]">não configurado</Badge>}
          </h2>
          <p className="text-xs text-muted-foreground">
            Agentes que vigiam sites, feeds e APIs, reagem a eventos e agem nos apps que você conectou no
            Vertal Fluxos. No Vertal Chat, peça por exemplo “quando o Vertal Agentes detectar X, crie uma tarefa
            no Todoist” ou “rode o fluxo Y do Vertal Fluxos”.
          </p>
        </div>
        {state.kind === 'ready' && state.url && (
          <a href={state.url} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="gap-1"><ExternalLink className="h-3.5 w-3.5" /> Abrir Vertal Agentes</Button>
          </a>
        )}
        <Button size="sm" variant="secondary" className="gap-1" onClick={load} disabled={state.kind === 'loading'}>
          {state.kind === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {state.kind === 'ready' ? 'Atualizar' : 'Ver meus agentes'}
        </Button>
      </div>

      {state.kind === 'idle' && (
        <p className="text-xs text-muted-foreground">O Vertal só fala com o seu Vertal Agentes quando você clica.</p>
      )}
      {(state.kind === 'setup' || state.kind === 'error') && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 px-3 py-2 text-sm">
          <span>{state.message}</span>
          {state.kind === 'setup' && (
            <Link to={HUGINN_SETUP_ROUTE}><Button size="sm" variant="outline" className="gap-1"><KeyRound className="h-3.5 w-3.5" /> Configurar no Cofre</Button></Link>
          )}
        </div>
      )}
      {state.kind === 'ready' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {state.agents.length} agente(s) nesta página · fila: {state.pending ?? 0} pendente(s)
            {state.failures ? ` · ${state.failures} falha(s) recente(s)` : ''}
          </p>
          {state.agents.length === 0 && <p className="text-sm text-muted-foreground">Nenhum agente no Vertal Agentes ainda.</p>}
          {state.agents.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl bg-secondary/50 px-3 py-2 text-sm" data-testid="huginn-agent">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {state.url ? <a className="hover:underline" href={`${state.url}/agents/${a.id}`} target="_blank" rel="noopener noreferrer">{a.name}</a> : a.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {a.name.startsWith('Vertal Fluxos ·') ? 'usa Vertal Fluxos' : a.type ?? 'Agente'} · {a.events ?? 0} evento(s) · último: {fmt(a.lastEventAt)}{a.lastErrorAt ? ' · teve erro' : ''}
                </p>
              </div>
              <Switch checked={a.enabled !== false} disabled={busy === a.id} onCheckedChange={(v) => toggle(a, v)} aria-label={`Ativar ${a.name}`} />
              <Button size="sm" variant="outline" className="gap-1" disabled={busy === a.id} onClick={() => run(a)}>
                {busy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Rodar
              </Button>
            </div>
          ))}
          {note && <p className="text-xs text-muted-foreground" role="status">{note}</p>}
          <FluxosAgentBuilder agents={state.agents.map((a) => ({ id: a.id, name: a.name }))} onCreated={load} />
        </div>
      )}
    </section>
  )
}

export default HuginnAgentsCard
