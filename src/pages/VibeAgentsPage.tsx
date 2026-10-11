import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Bot, CheckCircle2, Loader2, Play, Plug, Sparkles, Trash2, XCircle } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useSubscription } from '@/hooks/useSubscription'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  VIBE_AGENT_RUN_CREDITS,
  VIBE_TOOLS,
  VIBE_TOOL_IDS,
  type VibeToolId,
} from '@/config/vibeAgents'

interface AgentDraft { name: string; instructions: string; tools: VibeToolId[] }
interface SavedAgent extends AgentDraft { id: string; created_at: string }
/** setup_route is null for platform capabilities (e.g. the Python sandbox) that the user cannot connect. */
interface Readiness { connector: string; label: string; setup_route: string | null; connected: boolean }
type Step =
  | { type: 'thought' | 'final'; agent: string; text: string }
  | { type: 'tool'; agent: string; tool: VibeToolId; args: Record<string, unknown>; ok: boolean; result: string }
interface RunResult { status: 'completed' | 'failed'; output: string; steps: Step[] }

const ERRORS: Record<string, string> = {
  agent_model_not_configured: 'O modelo dos agentes ainda não está ativo (falta a chave do OpenRouter).',
  deduction_failed: 'Créditos insuficientes para executar o agente.',
  sandbox_not_configured: 'A sandbox Python ainda não foi ativada na plataforma.',
  agent_limit_reached: 'Você chegou ao limite de agentes. Apague algum para criar outro.',
  description_required: 'Descreva o que o agente deve fazer.',
  duplicate_request: 'Essa execução já foi enviada.',
}
const friendly = (code: string) => ERRORS[code] ?? (code.startsWith('rate_limit') ? 'Muitas solicitações. Aguarde um minuto.' : code)

async function invokeAgents<T>(body: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('vibe-agents', {
    body,
    headers: idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : undefined,
  })
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null)
    // A failed run still carries its steps, so the timeline can show what happened.
    if (detail?.steps) return detail as T
    throw new Error(friendly(detail?.error ?? error.message))
  }
  return data as T
}

// vibe_agents is newer than the generated Supabase types; type just the two queries used here.
interface AgentsTable {
  select: (cols: string) => { order: (col: string, o: { ascending: boolean }) => PromiseLike<{ data: SavedAgent[] | null }> }
  delete: () => { eq: (col: string, v: string) => PromiseLike<{ error: unknown }> }
}
const agentsTable = () => (supabase as unknown as { from: (t: string) => AgentsTable }).from('vibe_agents')

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
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} aria-label="Nome do agente" />
              <Textarea value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} className="min-h-[120px]" maxLength={4000} aria-label="Instruções" />

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
            <p className="text-sm text-muted-foreground">Nenhum agente ainda. Descreva um acima para começar.</p>
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
            {running ? 'Executando…' : `Executar (${VIBE_AGENT_RUN_CREDITS} créditos)`}
          </Button>
          {result && <RunTimeline result={result} advanced={advanced} />}
        </div>
      )}
    </div>
  )
}

function RunTimeline({ result, advanced }: { result: RunResult; advanced: boolean }) {
  return (
    <ol className="space-y-2 text-sm" data-testid="run-timeline">
      {result.steps.map((s, i) => (
        <li key={i} className="rounded-xl bg-secondary/50 px-3 py-2">
          {s.type === 'tool' ? (
            <div>
              <span className="flex items-center gap-2">
                {s.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                <span>{VIBE_TOOLS[s.tool]?.emoji} {VIBE_TOOLS[s.tool]?.label ?? s.tool}</span>
                <span className="text-xs text-muted-foreground">· {s.agent}</span>
              </span>
              {(advanced || !s.ok) && (
                <pre className="mt-1 text-xs whitespace-pre-wrap break-words text-muted-foreground">
                  {advanced ? `${JSON.stringify(s.args)}\n→ ${s.result}` : s.result}
                </pre>
              )}
            </div>
          ) : (
            <p className={cn(s.type === 'final' && 'font-medium')}>
              {s.type === 'final' ? '✅ ' : '💭 '}{s.text}
              <span className="text-xs text-muted-foreground"> · {s.agent}</span>
            </p>
          )}
        </li>
      ))}
      {result.status === 'failed' && <li className="text-destructive text-sm">Falhou: {result.output}</li>}
    </ol>
  )
}
