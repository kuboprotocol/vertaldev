import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Bot, CheckCircle2, Loader2, MessageSquare, Play, Plug, Sparkles, Trash2, XCircle } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useSubscription } from '@/hooks/useSubscription'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { SITE_FONT, siteRoot, surface } from '@/components/site/siteUi'
import {
  VIBE_AGENT_MIN_RUN_CREDITS,
  VIBE_AGENT_PRICING,
  VIBE_TOOLS,
  VIBE_TOOL_IDS,
  type VibeToolId,
} from '@/config/vibeAgents'
import { HuginnAgentsCard } from '@/components/huginn/HuginnAgentsCard'

interface AgentDraft { name: string; instructions: string; tools: VibeToolId[] }
interface SavedAgent extends AgentDraft { id: string; created_at: string }
/** setup_route is null for platform capabilities (e.g. the Python sandbox) that the user cannot connect. */
interface Readiness { connector: string; label: string; setup_route: string | null; connected: boolean }
type Step =
  | { type: 'thought' | 'final'; agent: string; text: string }
  | { type: 'tool'; agent: string; tool: VibeToolId; args: Record<string, unknown>; ok: boolean; result: string }
interface RunResult { status: 'completed' | 'failed'; output: string; steps: Step[]; credits_charged?: number }

const ERRORS: Record<string, string> = {
  agent_model_not_configured: 'The agent model is not active yet (the platform AI key is missing).',
  deduction_failed: 'You do not have enough credits to run this agent.',
  sandbox_not_configured: 'The Python sandbox is not turned on yet.',
  agent_limit_reached: 'You reached the agent limit. Delete one to create another.',
  description_required: 'Describe what the agent should do.',
  duplicate_request: 'This run was already sent.',
}
const friendly = (code: string) => ERRORS[code] ?? (code.startsWith('rate_limit') ? 'Too many requests. Please wait a minute.' : code)

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
      toast.error(e instanceof Error ? e.message : 'We could not design the agent')
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
      toast.success('Agent saved')
      setDraft(null)
      setDescription('')
      setReadiness([])
      loadAgents()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'We could not save the agent')
    } finally {
      setSaving(false)
    }
  }

  const deleteAgent = async (id: string) => {
    const { error } = await agentsTable().delete().eq('id', id)
    if (error) return void toast.error('We could not delete the agent')
    setAgents((a) => a.filter((x) => x.id !== id))
  }

  return (
    <div className={cn("min-h-screen", siteRoot)} style={SITE_FONT}>
      <div className={cn("border-b sticky top-0 z-10", surface.bar)}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" /> Vibe Agents
            </h1>
            <p className="text-sm text-muted-foreground">Describe the agent. The AI picks the tools, and you approve and run it.</p>
          </div>
          <label className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            Advanced mode <Switch checked={advanced} onCheckedChange={setAdvanced} />
          </label>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <section className={cn("p-5 space-y-4", surface.card)}>
          <h2 className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Create an agent</h2>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="For example: Every day, read the open issues in my GitHub repository, summarize the most urgent ones and post them in #dev on Slack."
            className="min-h-[96px]"
            maxLength={4000}
          />
          <Button onClick={designAgent} disabled={designing || description.trim().length < 5} className="gap-2">
            {designing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {designing ? 'Designing…' : 'Design the agent'}
          </Button>

          {draft && (
            <div className="space-y-4 border-t border-border pt-4" data-testid="agent-draft">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} aria-label="Agent name" />
              <Textarea value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} className="min-h-[120px]" maxLength={4000} aria-label="Instructions" />

              <div>
                <p className="text-sm font-medium mb-2">Tools the agent will use</p>
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
                  <p className="text-sm font-medium">Connections needed</p>
                  {readiness.map((r) => (
                    <div key={r.connector} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        {r.connected ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Plug className="h-4 w-4 text-amber-500" />}
                        {r.label}{' '}
                        {r.connected ? (r.setup_route ? 'connected' : 'available') : r.setup_route ? 'not connected' : 'waiting to be turned on'}
                      </span>
                      {!r.connected && r.setup_route && (
                        <Button size="sm" variant="outline" onClick={() => navigate(r.setup_route!)}>Connect</Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <Button onClick={saveAgent} disabled={saving || !draft.name.trim() || !draft.instructions.trim()} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save agent
              </Button>
            </div>
          )}
        </section>

        <HuginnAgentsCard />

        <section className="space-y-3">
          <h2 className="font-semibold">My agents</h2>
          {loadingAgents ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents yet. Describe one above to start.</p>
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
      if (r.status === 'failed') toast.error('The agent did not finish. Your credits were refunded.')
      onRan()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'We could not run the agent')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className={cn("p-4 space-y-3", surface.card)}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{agent.name}</p>
          <p className="text-xs text-muted-foreground line-clamp-2">{agent.instructions}</p>
          <p className="text-sm mt-1" aria-label="Tools">{agent.tools.map((t) => VIBE_TOOLS[t]?.emoji).join(' ')}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} className="gap-1"><Play className="h-3.5 w-3.5" /> Run</Button>
        <Button size="icon" variant="ghost" onClick={onDelete} aria-label={`Delete ${agent.name}`}><Trash2 className="h-4 w-4" /></Button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-border pt-3">
          <Textarea value={task} onChange={(e) => setTask(e.target.value)} placeholder="What should the agent do now?" maxLength={4000} />
          <Button onClick={runAgent} disabled={running || !task.trim()} className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? 'Running…' : `Run (from ${VIBE_AGENT_MIN_RUN_CREDITS} credits)`}
          </Button>
          <p className="text-xs text-muted-foreground">
            {VIBE_AGENT_PRICING.runFee} credit per run + {VIBE_AGENT_PRICING.perStep} per AI step
            {agent.tools.includes('python_run') ? ` + ${VIBE_AGENT_PRICING.perPythonRun} per Python run` : ''}.
            If the run fails, your credits are refunded.
          </p>
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
            <p className={cn('flex items-start gap-2', s.type === 'final' && 'font-medium')}>
              {s.type === 'final'
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                : <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
              <span>{s.text}
              <span className="text-xs text-muted-foreground"> · {s.agent}</span></span>
            </p>
          )}
        </li>
      ))}
      {result.status === 'failed' && <li className="text-destructive text-sm">Failed: {result.output} (credits refunded)</li>}
      {result.status === 'completed' && result.credits_charged != null && (
        <li className="text-xs text-muted-foreground">Cost of this run: {result.credits_charged} credits</li>
      )}
    </ol>
  )
}
