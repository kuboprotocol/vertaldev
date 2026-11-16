import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Markdown, { type Components } from 'react-markdown'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Bot, Box, Boxes, Code, DollarSign, Gamepad2, GraduationCap, LifeBuoy, Loader2, Map as MapIcon, Megaphone,
  PenTool as PenToolIcon, Play, Plug, CheckCircle2, ClipboardList, FlaskConical, Library, Search, ShieldCheck, Sparkles,
  Stethoscope, Target, TrendingUp, Users,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RunTimeline } from '@/components/vibe-agents/RunTimeline'
import { agentsTable, invokeAgents, type Readiness, type RunResult, type SavedAgent } from '@/lib/vibeAgentsApi'
import {
  VIBE_AGENT_LIMITS, VIBE_AGENT_MIN_RUN_CREDITS, VIBE_TOOLS, VIBE_TOOL_IDS, type VibeToolId,
} from '@/config/vibeAgents'
import {
  AGENCY_AGENTS, AGENCY_CATALOG, AGENCY_DIVISIONS, buildHireInstructions, filterAgencyAgents, loadAgencyBody, type AgencyAgent,
} from '@/lib/agencyAgents'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 48
const DEFAULT_TOOLS: VibeToolId[] = ['web_fetch']

/** Markdown styling without the typography plugin: keeps personas readable in light and dark themes. */
const markdownParts: Components = {
  h1: (p) => <h2 className="mb-3 mt-6 font-display text-xl font-semibold first:mt-0" {...p} />,
  h2: (p) => <h3 className="mb-2 mt-6 font-display text-lg font-semibold first:mt-0" {...p} />,
  h3: (p) => <h4 className="mb-2 mt-5 font-semibold" {...p} />,
  h4: (p) => <h5 className="mb-1 mt-4 font-semibold" {...p} />,
  p: (p) => <p className="mb-3 text-sm leading-relaxed" {...p} />,
  ul: (p) => <ul className="mb-3 list-disc space-y-1 pl-5 text-sm" {...p} />,
  ol: (p) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm" {...p} />,
  li: (p) => <li className="leading-relaxed" {...p} />,
  strong: (p) => <strong className="font-semibold text-foreground" {...p} />,
  em: (p) => <em className="italic" {...p} />,
  a: (p) => <a className="text-primary underline underline-offset-4" target="_blank" rel="noreferrer" {...p} />,
  code: (p) => <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs" {...p} />,
  pre: (p) => <pre className="mb-3 overflow-x-auto rounded-xl bg-secondary/70 p-3 font-mono text-xs leading-relaxed" {...p} />,
  blockquote: (p) => <blockquote className="mb-3 border-l-2 border-primary/50 pl-3 italic text-muted-foreground" {...p} />,
  hr: () => <hr className="my-5 border-border" />,
  table: (p) => <div className="mb-3 overflow-x-auto"><table className="w-full border-collapse text-xs" {...p} /></div>,
  th: (p) => <th className="border border-border bg-secondary/50 px-2 py-1 text-left font-semibold" {...p} />,
  td: (p) => <td className="border border-border px-2 py-1 align-top" {...p} />,
}

function AgentMarkdown({ children }: { children: string }) {
  return <Markdown components={markdownParts}>{children}</Markdown>
}

/** Division icon names come from divisions.json (lucide names). */
const DIVISION_ICONS: Record<string, LucideIcon> = {
  GraduationCap, PenTool: PenToolIcon, Code, DollarSign, Gamepad2, Map: MapIcon, Stethoscope, Megaphone, Target, Box,
  ClipboardList, Search, TrendingUp, ShieldCheck, Boxes, Sparkles, LifeBuoy, FlaskConical,
}
const divisionIcon = (id: string): LucideIcon => DIVISION_ICONS[AGENCY_CATALOG.divisions[id]?.icon ?? ''] ?? Bot

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Algo deu errado. Tente de novo.')

/** Hired agents in the user's team, keyed by name → vibe_agents id. A Map avoids clashes with names like "constructor". */
type Team = Map<string, string>

export default function AgencyAgentsPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [division, setDivision] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<AgencyAgent | null>(null)
  const [team, setTeam] = useState<Team>(() => new Map())
  const [teamSize, setTeamSize] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.resolve(agentsTable().select('id, name, created_at').order('created_at', { ascending: false }))
      .then(({ data }) => {
        if (!alive) return
        const rows = (data ?? []) as Pick<SavedAgent, 'id' | 'name'>[]
        setTeamSize(rows.length)
        // Rows come newest first; reversing lets the newest entry win when a name repeats.
        setTeam(new Map([...rows].reverse().map((r) => [r.name, r.id] as const)))
      })
      .catch(() => alive && setTeamSize(0))
    return () => { alive = false }
  }, [])

  const results = useMemo(() => filterAgencyAgents(AGENCY_AGENTS, { query, division }), [query, division])
  const visible = results.slice(0, shown)
  const teamFull = teamSize >= VIBE_AGENT_LIMITS.maxAgentsPerUser

  const resetFilters = () => { setQuery(''); setDivision(null); setShown(PAGE_SIZE) }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-card/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 font-display text-xl font-bold md:text-2xl">
              <Library className="h-5 w-5 text-primary" /> Agency Agents
            </h1>
            <p className="truncate text-xs text-muted-foreground md:text-sm">Especialistas prontos para trabalhar com você</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/vibe-agents')} className="gap-2 rounded-xl border-primary/30 text-primary hover:bg-primary/10">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Minha equipe</span>
            <span className="tabular-nums">{teamSize}/{VIBE_AGENT_LIMITS.maxAgentsPerUser}</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-primary/15 via-card to-card p-6 md:p-10"
        >
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
          <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-primary">The Agency · {AGENCY_AGENTS.length} especialistas</p>
          <h2 className="relative mt-3 max-w-2xl font-display text-3xl font-bold leading-tight md:text-4xl">
            Contrate um time inteiro de especialistas de IA
          </h2>
          <p className="relative mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
            Engenharia, design, marketing, finanças, saúde, jogos e mais. Escolha um perfil, dê a primeira tarefa e acompanhe cada passo do trabalho.
          </p>
          <div className="relative mt-6 max-w-xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setShown(PAGE_SIZE) }}
              placeholder="Busque por função, habilidade ou área: ex. “SEO”, “segurança”, “React”"
              aria-label="Buscar especialistas"
              className="h-12 rounded-2xl border-border/60 bg-background/70 pl-12 text-base backdrop-blur"
            />
          </div>
        </motion.section>

        <nav aria-label="Divisões" className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <Chip active={division === null} onClick={() => { setDivision(null); setShown(PAGE_SIZE) }} label="Todas" count={AGENCY_AGENTS.length} />
          {AGENCY_DIVISIONS.map((d) => {
            const Icon = divisionIcon(d.id)
            return (
              <Chip
                key={d.id}
                active={division === d.id}
                color={d.color}
                icon={<Icon className="h-3.5 w-3.5" />}
                onClick={() => { setDivision(division === d.id ? null : d.id); setShown(PAGE_SIZE) }}
                label={d.label}
                count={d.count}
              />
            )
          })}
        </nav>

        <div className="flex items-center justify-between text-sm text-muted-foreground" aria-live="polite">
          <span>{results.length} {results.length === 1 ? 'especialista' : 'especialistas'}{division ? ` em ${AGENCY_CATALOG.divisions[division]?.label}` : ''}</span>
          {(query || division) && <button type="button" onClick={resetFilters} className="text-primary hover:underline">Limpar filtros</button>}
        </div>

        {results.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="font-medium">Nenhum especialista com essa busca</p>
            <p className="mt-1 text-sm text-muted-foreground">Tente outro termo ou escolha outra divisão.</p>
            <Button variant="outline" onClick={resetFilters} className="mt-4 rounded-xl">Ver todos</Button>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((agent, i) => (
              <motion.li
                key={agent.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 12) * 0.03, duration: 0.25 }}
              >
                <AgentCard agent={agent} hired={team.has(agent.name)} onOpen={() => setSelected(agent)} />
              </motion.li>
            ))}
          </ul>
        )}

        {visible.length < results.length && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => setShown((n) => n + PAGE_SIZE)} className="rounded-xl">
              Mostrar mais ({results.length - visible.length})
            </Button>
          </div>
        )}

        <footer className="border-t border-border pt-6 text-xs text-muted-foreground">
          Catálogo <a className="text-primary underline-offset-4 hover:underline" href={AGENCY_CATALOG.source.url} target="_blank" rel="noreferrer">The Agency (msitarzewski/agency-agents)</a>, licença {AGENCY_CATALOG.source.license}.
          Cada especialista é executado pelo seu Vibe Agents, com os seus créditos.
        </footer>
      </main>

      {selected && (
        <AgentDialog
          key={selected.id}
          agent={selected}
          hiredId={team.get(selected.name) ?? null}
          teamFull={teamFull}
          onClose={() => setSelected(null)}
          onHired={(a, id) => {
            setTeam((t) => new Map(t).set(a.name, id))
            setTeamSize((n) => n + 1)
          }}
          onOpenVibeAgents={() => navigate('/vibe-agents')}
          onConnect={(route) => navigate(route)}
        />
      )}
    </div>
  )
}

function Chip({ active, onClick, label, count, color, icon }: { active: boolean; onClick: () => void; label: string; count: number; color?: string; icon?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={active && color ? { backgroundColor: color, borderColor: color, color: '#fff' } : undefined}
      className={cn(
        'flex shrink-0 snap-start items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-all',
        active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border/60 bg-card/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground',
      )}
    >
      {!active && color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />}
      {icon}
      <span className="whitespace-nowrap">{label}</span>
      <span className="text-xs opacity-70 tabular-nums">{count}</span>
    </button>
  )
}

function AgentCard({ agent, hired, onOpen }: { agent: AgencyAgent; hired: boolean; onOpen: () => void }) {
  const division = AGENCY_CATALOG.divisions[agent.division]
  const color = division?.color ?? '#6366F1'
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Ver perfil de ${agent.name}`}
      className="group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-1 opacity-80 transition-opacity group-hover:opacity-100" style={{ backgroundColor: color }} />
      <span aria-hidden className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: `radial-gradient(120% 60% at 0% 0%, ${color}22, transparent 60%)` }} />
      <span className="relative flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl" style={{ backgroundColor: `${color}1f` }} aria-hidden>
          {agent.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium" style={{ color }}>{division?.label}</span>
          <span className="block truncate font-semibold leading-snug">{agent.name}</span>
        </span>
        {hired && <Badge className="shrink-0 gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Na equipe</Badge>}
      </span>
      {agent.vibe && <span className="relative mt-4 line-clamp-2 text-sm italic text-muted-foreground">“{agent.vibe}”</span>}
      <span className="relative mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground/90">{agent.description}</span>
      <span className="relative mt-auto flex items-center gap-1 pt-4 text-xs font-medium text-primary">
        Ver perfil e contratar <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
      </span>
    </button>
  )
}

function AgentDialog({
  agent, hiredId, teamFull, onClose, onHired, onOpenVibeAgents, onConnect,
}: {
  agent: AgencyAgent
  hiredId: string | null
  teamFull: boolean
  onClose: () => void
  onHired: (agent: AgencyAgent, id: string) => void
  onOpenVibeAgents: () => void
  onConnect: (route: string) => void
}) {
  const division = AGENCY_CATALOG.divisions[agent.division]
  const color = division?.color ?? '#6366F1'
  const DivisionIcon = divisionIcon(agent.division)
  const [persona, setPersona] = useState<string | null>(null)
  const [personaError, setPersonaError] = useState(false)
  const [tools, setTools] = useState<VibeToolId[]>(DEFAULT_TOOLS)
  const [readiness, setReadiness] = useState<Readiness[]>([])
  const [task, setTask] = useState('')
  const [agentId, setAgentId] = useState<string | null>(hiredId)
  const [busy, setBusy] = useState<null | 'hire' | 'run'>(null)
  const [result, setResult] = useState<RunResult | null>(null)

  useEffect(() => {
    let alive = true
    loadAgencyBody(agent)
      .then((text) => alive && setPersona(text))
      .catch(() => alive && setPersonaError(true))
    return () => { alive = false }
  }, [agent])

  useEffect(() => {
    let alive = true
    invokeAgents<{ connectors: Readiness[] }>({ action: 'readiness', tools })
      .then((r) => alive && setReadiness(r.connectors))
      .catch(() => alive && setReadiness([]))
    return () => { alive = false }
  }, [tools])

  const toggleTool = (id: VibeToolId) =>
    setTools((current) => (current.includes(id) ? current.filter((t) => t !== id) : VIBE_TOOL_IDS.filter((t) => t === id || current.includes(t))))

  /** Saves the persona as a Vibe agent once; later calls reuse the same id. */
  const ensureHired = async (): Promise<string> => {
    if (agentId) return agentId
    const text = persona ?? (await loadAgencyBody(agent))
    const r = await invokeAgents<{ agent: { id: string } }>({
      action: 'save',
      name: agent.name,
      instructions: buildHireInstructions(agent, text),
      tools,
    })
    setAgentId(r.agent.id)
    onHired(agent, r.agent.id)
    return r.agent.id
  }

  const runTask = async (id: string) => {
    setResult(null)
    const r = await invokeAgents<RunResult>({ action: 'run', agent_id: id, task: task.trim() }, crypto.randomUUID())
    setResult(r)
    if (r.status === 'failed') toast.error('O especialista não concluiu. Os créditos foram devolvidos.')
  }

  const hireOnly = async () => {
    setBusy('hire')
    try {
      await ensureHired()
      toast.success(`${agent.name} entrou na sua equipe`)
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const hireAndRun = async () => {
    setBusy('run')
    try {
      await runTask(await ensureHired())
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const runOnly = async () => {
    if (!agentId) return
    setBusy('run')
    try {
      await runTask(agentId)
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const canRun = task.trim().length > 0 && busy === null
  const missing = readiness.filter((r) => !r.connected && r.setup_route)
  const pending = readiness.filter((r) => !r.connected && !r.setup_route)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-5xl gap-0 overflow-hidden p-0">
        <DialogHeader className="relative space-y-3 border-b border-border p-6 text-left" style={{ background: `linear-gradient(135deg, ${color}26, transparent 70%)` }}>
          <div className="flex items-start gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-4xl shadow-inner" style={{ backgroundColor: `${color}22` }} aria-hidden>
              {agent.emoji}
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <Badge variant="outline" className="gap-1.5 font-medium" style={{ color, borderColor: `${color}66` }}>
                <DivisionIcon className="h-3 w-3" />
                {division?.label}
              </Badge>
              <DialogTitle className="font-display text-2xl leading-tight md:text-3xl">{agent.name}</DialogTitle>
              {agent.vibe && <p className="text-sm italic text-muted-foreground">“{agent.vibe}”</p>}
            </div>
          </div>
          <DialogDescription className="sr-only">{agent.description}</DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[calc(92vh-9.5rem)] grid-cols-1 overflow-hidden md:grid-cols-[1fr_340px]">
          <div className="overflow-y-auto p-6">
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{agent.description}</p>
            {personaError ? (
              <p className="text-sm text-destructive">Não foi possível carregar o perfil completo deste especialista.</p>
            ) : persona === null ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando perfil…</div>
            ) : (
              <article>
                <AgentMarkdown>{persona}</AgentMarkdown>
              </article>
            )}
          </div>

          <aside className="space-y-5 overflow-y-auto border-t border-border bg-secondary/30 p-6 md:border-l md:border-t-0">
            <div className="space-y-1">
              <h3 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" /> {agentId ? 'Na sua equipe' : 'Contratar para sua equipe'}</h3>
              <p className="text-xs text-muted-foreground">
                Ele trabalha com o seu saldo de créditos: {VIBE_AGENT_MIN_RUN_CREDITS} no mínimo por tarefa.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Ferramentas</p>
              <div className="flex flex-wrap gap-2">
                {VIBE_TOOL_IDS.map((id) => {
                  const t = VIBE_TOOLS[id]
                  const on = tools.includes(id)
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleTool(id)}
                      aria-pressed={on}
                      title={t.description}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs transition-colors',
                        on ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60 bg-background text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t.emoji} {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {(missing.length > 0 || pending.length > 0) && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Conexões necessárias</p>
                {missing.map((r) => (
                  <div key={r.connector} className="flex items-center justify-between gap-2 rounded-xl bg-background/70 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2"><Plug className="h-4 w-4 text-amber-500" /> {r.label} não conectado</span>
                    <Button size="sm" variant="outline" onClick={() => onConnect(r.setup_route!)}>Conectar</Button>
                  </div>
                ))}
                {pending.map((r) => (
                  <div key={r.connector} className="flex items-center gap-2 rounded-xl bg-background/70 px-3 py-2 text-sm text-muted-foreground">
                    <Plug className="h-4 w-4" /> {r.label} aguardando ativação
                  </div>
                ))}
              </div>
            )}

            {agentId ? (
              <div className="space-y-3">
                <Textarea
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="Qual é a primeira tarefa? Ex.: revise a página de preços do meu app e liste 5 melhorias."
                  maxLength={VIBE_AGENT_LIMITS.maxTaskChars}
                  className="min-h-[104px] bg-background/70"
                  aria-label="Tarefa para o especialista"
                />
                <Button onClick={runOnly} disabled={!canRun} className="w-full gap-2 rounded-xl">
                  {busy === 'run' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {busy === 'run' ? 'Trabalhando…' : 'Executar tarefa'}
                </Button>
                <Button variant="ghost" size="sm" onClick={onOpenVibeAgents} className="w-full rounded-xl text-muted-foreground">
                  Abrir em Minha equipe
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Textarea
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="Primeira tarefa (opcional). Ex.: revise a página de preços do meu app e liste 5 melhorias."
                  maxLength={VIBE_AGENT_LIMITS.maxTaskChars}
                  className="min-h-[104px] bg-background/70"
                  aria-label="Primeira tarefa para o especialista"
                />
                <Button
                  onClick={hireAndRun}
                  disabled={busy !== null || teamFull || !task.trim()}
                  className="w-full gap-2 rounded-xl"
                  style={{ backgroundColor: color }}
                >
                  {busy === 'run' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {busy === 'run' ? 'Contratando e trabalhando…' : 'Contratar e executar'}
                </Button>
                <Button variant="outline" onClick={hireOnly} disabled={busy !== null || teamFull} className="w-full gap-2 rounded-xl">
                  {busy === 'hire' && <Loader2 className="h-4 w-4 animate-spin" />}
                  Só contratar
                </Button>
                {teamFull && <p className="text-xs text-destructive">Sua equipe está cheia ({VIBE_AGENT_LIMITS.maxAgentsPerUser}). Dispense alguém em Minha equipe para contratar.</p>}
              </div>
            )}

            {result && (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm font-medium">Resultado</p>
                {result.status === 'completed' && result.output && (
                  <div className="rounded-xl bg-background/80 p-3 text-sm">
                    <article>
                      <AgentMarkdown>{result.output}</AgentMarkdown>
                    </article>
                  </div>
                )}
                <RunTimeline result={result} advanced={false} />
              </div>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  )
}
