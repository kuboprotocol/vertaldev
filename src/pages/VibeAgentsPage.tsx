import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Bot, CheckCircle2, Loader2, Play, Plug, Sparkles, Trash2, Library } from 'lucide-react'
import { useSubscription } from '@/hooks/useSubscription'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  VIBE_AGENT_LIMITS,
  VIBE_AGENT_MIN_RUN_CREDITS,
  VIBE_AGENT_PRICING,
  VIBE_TOOLS,
  VIBE_TOOL_IDS,
  type VibeToolId,
} from '@/config/vibeAgents'
import { RunTimeline } from '@/components/vibe-agents/RunTimeline'
import { agentsTable, invokeAgents, type AgentDraft, type Readiness, type RunResult, type SavedAgent } from '@/lib/vibeAgentsApi'

export default function VibeAgentsPage() {
  const navigate = useNavigate()
  const { refetch } = useSubscription()
  const [description, setDescription] = useState('')
  const [designing, setDesigning] = useState(false)
  const [draft, setDraft] = useState<AgentDraft | null>(null)
  const [readiness, setReadiness] = useState<Readiness[]>([])
  const [saving, setSaving] = useState(false)
  const [agents, setAgents] = useState<SavedAgent[]>([])
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [advanced, setAdvanced] = useState(false)

  const loadAgents = useCallback(async () => {
    const { data } = await agentsTable().select('id, name, instructions, tools, created_at').order('created_at', { ascending: false })
    setAgents((data ?? []) as SavedAgent[])
    setLoadingAgents(false)
  }, [])
  useEffect(() => { loadAgents() }, [loadAgents])

  const refreshReadiness = async (tools: VibeToolId[]) => {
    const r = await invokeAgents<{ connectors: Readiness[] }>({ action: 'readiness', tools }).catch(() => ({ connectors: [] }))
    setReadiness(r.connectors)
  }

  const designAgent = async () => {
    setDesigning(true)
    try {
      const r = await invokeAgents<{ agent: AgentDraft; connectors: Readiness[] }>({ action: 'design', description })
      setDraft(r.agent)
      setReadiness(r.connectors)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao projetar o agente')
    } finally {
      setDesigning(false)
    }
  }

  const toggleTool = (id: VibeToolId) => {
    if (!draft) return
    const tools = draft.tools.includes(id) ? draft.tools.filter((t) => t !== id) : VIBE_TOOL_IDS.filter((t) => t === id || draft.tools.includes(t))
    setDraft({ ...draft, tools })
    refreshReadiness(tools)
  }

  const saveAgent = async () => {
    if (!draft) return
    setSaving(true)
    try {
      await invokeAgents({ action: 'save', ...draft })
      toast.success('Agente salvo!')
      setDraft(null)
      setDescription('')
      setReadiness([])
      loadAgents()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const deleteAgent = async (id: string) => {
    const { error } = await agentsTable().delete().eq('id', id)
    if (error) return void toast.error('Não foi possível apagar')
    setAgents((a) => a.filter((x) => x.id !== id))
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold font-display flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" /> Vibe Agents
            </h1>
            <p className="text-sm text-muted-foreground">Descreva o agente. A IA escolhe as ferramentas, você aprova e executa.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/agency-agents')} className="hidden md:inline-flex gap-2 rounded-xl border-primary/30 text-primary hover:bg-primary/10">
            <Library className="h-4 w-4" /> Agency Agents
          </Button>
          <label className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            Modo avançado <Switch checked={advanced} onCheckedChange={setAdvanced} />
          </label>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <section className="glass glass-border rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Criar agente</h2>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Todo dia, leia as issues abertas do meu repositório no GitHub, resuma as mais urgentes e poste no #dev do Slack."
            className="min-h-[96px]"
            maxLength={4000}
          />
          <Button onClick={designAgent} disabled={designing || description.trim().length < 5} className="gap-2">
            {designing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {designing ? 'Projetando…' : 'Projetar agente'}
          </Button>

          {draft && (
            <div className="space-y-4 border-t border-border pt-4" data-testid="agent-draft">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={VIBE_AGENT_LIMITS.maxNameChars} aria-label="Nome do agente" />
              <Textarea
                value={draft.instructions}
                onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
                className="min-h-[120px]"
                maxLength={VIBE_AGENT_LIMITS.maxInstructionsChars}
                aria-label="Instruções"
              />

              <div>
                <p className="text-sm font-medium mb-2">Ferramentas que o agente vai usar</p>
                <div className="flex flex-wrap gap-2">
                  {VIBE_TOOL_IDS.map((id) => {
                    const t = VIBE_TOOLS[id]
                    const on = draft.tools.includes(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleTool(id)}
                        aria-pressed={on}
                        title={t.description}
                        className={cn(
                          'text-xs px-3 py-1.5 rounded-full border transition-colors',
                          on ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-muted-foreground border-border/50 hover:text-foreground',
                        )}
                      >
                        {t.emoji} {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {readiness.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Conexões necessárias</p>
                  {readiness.map((r) => (
                    <div key={r.connector} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        {r.connected ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Plug className="h-4 w-4 text-amber-500" />}
                        {r.label}{' '}
                        {r.connected ? (r.setup_route ? 'conectado' : 'disponível') : r.setup_route ? 'não conectado' : 'aguardando ativação'}
                      </span>
                      {!r.connected && r.setup_route && (
                        <Button size="sm" variant="outline" onClick={() => navigate(r.setup_route!)}>Conectar</Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <Button onClick={saveAgent} disabled={saving || !draft.name.trim() || !draft.instructions.trim()} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar agente
              </Button>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Meus agentes</h2>
          {loadingAgents ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : agents.length === 0 ? (
            <div className="glass glass-border rounded-2xl p-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">Nenhum agente ainda. Descreva um acima ou contrate um especialista pronto.</p>
              <Button variant="outline" onClick={() => navigate('/agency-agents')} className="gap-2 rounded-xl">
                <Library className="h-4 w-4" /> Explorar Agency Agents
              </Button>
            </div>
          ) : (
            agents.map((a) => (
              <AgentCard key={a.id} agent={a} advanced={advanced} onDelete={() => deleteAgent(a.id)} onRan={() => { refetch(); loadAgents() }} />
            ))
          )}
        </section>
      </div>
    </div>
  )
}

function AgentCard({ agent, advanced, onDelete, onRan }: { agent: SavedAgent; advanced: boolean; onDelete: () => void; onRan: () => void }) {
  const [open, setOpen] = useState(false)
  const [task, setTask] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)

  const runAgent = async () => {
    setRunning(true)
    setResult(null)
    try {
      const r = await invokeAgents<RunResult>({ action: 'run', agent_id: agent.id, task }, crypto.randomUUID())
      setResult(r)
      if (r.status === 'failed') toast.error('O agente não concluiu. Os créditos foram devolvidos.')
      onRan()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao executar')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="glass glass-border rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{agent.name}</p>
          <p className="text-xs text-muted-foreground line-clamp-2">{agent.instructions}</p>
          <p className="text-sm mt-1" aria-label="Ferramentas">{agent.tools.map((t) => VIBE_TOOLS[t]?.emoji).join(' ')}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} className="gap-1"><Play className="h-3.5 w-3.5" /> Executar</Button>
        <Button size="icon" variant="ghost" onClick={onDelete} aria-label={`Apagar ${agent.name}`}><Trash2 className="h-4 w-4" /></Button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-border pt-3">
          <Textarea value={task} onChange={(e) => setTask(e.target.value)} placeholder="O que o agente deve fazer agora?" maxLength={4000} />
          <Button onClick={runAgent} disabled={running || !task.trim()} className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? 'Executando…' : `Executar (a partir de ${VIBE_AGENT_MIN_RUN_CREDITS} créditos)`}
          </Button>
          <p className="text-xs text-muted-foreground">
            {VIBE_AGENT_PRICING.runFee} crédito por execução + {VIBE_AGENT_PRICING.perStep} por passo da IA
            {agent.tools.includes('python_run') ? ` + ${VIBE_AGENT_PRICING.perPythonRun} por execução de Python` : ''}.
            Se a execução falhar, os créditos voltam.
          </p>
          {result && <RunTimeline result={result} advanced={advanced} />}
        </div>
      )}
    </div>
  )
}
