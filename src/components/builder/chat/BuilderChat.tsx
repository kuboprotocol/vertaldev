import { memo, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  AlertCircle, Braces, Check, ChevronDown, CodeXml, Copy, Eye, FileCode2,
  Loader2, Palette, PanelsTopLeft, RotateCcw, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BRAND } from '@/config/brand'
import { LOGO_SRC } from '@/components/branding/AnimatedLogo'
import FilePreview from '@/components/builder/FilePreview'
import type { Msg } from '@/lib/streamChat'
import {
  formatBytes, parseBuilderTurn, splitProseAndCode, splitUserMessage, type BuilderTurn, type BuildStage, type StageKind,
} from '@/lib/builderTurn'

const STAGE_META: Record<StageKind, { title: string; lang: string; icon: typeof Braces }> = {
  base: { title: 'Base do documento', lang: 'HTML', icon: FileCode2 },
  styles: { title: 'Estilos', lang: 'CSS', icon: Palette },
  interface: { title: 'Interface', lang: 'HTML', icon: PanelsTopLeft },
  logic: { title: 'Lógica e interações', lang: 'JS', icon: Braces },
}

const MODE_LABEL: Record<string, string> = { flow: 'FLOW', think: 'THINK', ship: 'SHIP' }

/**
 * Turnos já encerrados não mudam mais: guarda a interpretação para não
 * reprocessar a conversa inteira a cada pedaço do streaming do turno atual.
 */
const settledTurns = new Map<string, BuilderTurn>()
function settledTurn(content: string): BuilderTurn {
  let turn = settledTurns.get(content)
  if (!turn) {
    turn = parseBuilderTurn(content)
    if (settledTurns.size > 80) settledTurns.clear()
    settledTurns.set(content, turn)
  }
  return turn
}

const linesLabel = (n: number) => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'linha' : 'linhas'}`

/** Caixinha de uma etapa do trabalho: fechada mostra o resumo, aberta mostra o código. */
function StageBox({ stage }: { stage: BuildStage }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)
  const meta = STAGE_META[stage.kind]
  const Icon = meta.icon

  // Com a caixinha aberta durante a escrita, acompanha a última linha.
  useEffect(() => {
    if (open && stage.active && preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight
  }, [open, stage.active, stage.code])

  const lastLine = stage.active ? stage.code.trimEnd().split('\n').pop()?.trim() ?? '' : ''

  const copy = () => {
    navigator.clipboard?.writeText(stage.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div
      data-testid="builder-stage-box"
      data-stage={stage.kind}
      data-active={stage.active || undefined}
      className={cn(
        'overflow-hidden rounded-xl border bg-background/60 transition-colors',
        stage.active ? 'border-primary/50 shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]' : 'border-border/60',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
            stage.active ? 'bg-primary/15 text-primary' : 'bg-foreground/[0.06] text-muted-foreground',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-foreground">{meta.title}</span>
            <span className="rounded bg-foreground/[0.06] px-1 py-px font-mono text-[9px] font-semibold tracking-wide text-muted-foreground">
              {meta.lang}
            </span>
          </span>
          <span className="block truncate font-mono text-[10.5px] text-muted-foreground">
            {stage.active && lastLine ? lastLine : linesLabel(stage.lines)}
          </span>
        </span>
        {stage.active ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-label="Escrevendo" />
        ) : (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-label="Concluído" />
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-border/60 bg-black/30">
          <div className="flex items-center justify-between px-3 py-1">
            <span className="font-mono text-[10px] text-muted-foreground">
              index.html · {meta.lang} · {linesLabel(stage.lines)}
            </span>
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <pre
            ref={preRef}
            tabIndex={0}
            className="max-h-64 overflow-auto px-3 pb-3 font-mono text-[11px] leading-relaxed text-foreground/85"
          >
            <code>{stage.code}</code>
          </pre>
        </div>
      )}
    </div>
  )
}

/** Caixinha de estado sem código (pensando, erro). */
function StatusBox({ tone, children }: { tone: 'working' | 'error'; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[13px]',
        tone === 'error'
          ? 'border-destructive/40 bg-destructive/10 text-foreground'
          : 'border-primary/40 bg-primary/[0.06] text-foreground',
      )}
    >
      {tone === 'error' ? (
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
      ) : (
        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
      )}
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

function AssistantHeader({ mode }: { mode?: string }) {
  return (
    <div className="flex items-center gap-2">
      <img src={LOGO_SRC} alt="" width={20} height={20} className="h-5 w-5 object-contain" draggable={false} />
      <span className="font-display text-[10px] font-bold tracking-[0.18em] text-foreground">{BRAND.shortName.toUpperCase()}</span>
      {mode && MODE_LABEL[mode] && (
        <span className="rounded-full border border-primary/30 px-1.5 py-px font-display text-[8px] font-bold tracking-widest text-primary">
          {MODE_LABEL[mode]}
        </span>
      )}
    </div>
  )
}

interface TurnActions {
  onOpenPreview: () => void
  onOpenCode: () => void
  onRestore: (code: string) => void
}

const AssistantTurn = memo(function AssistantTurn({
  content, streaming, mode, version, isCurrent, onOpenPreview, onOpenCode, onRestore,
}: {
  content: string
  streaming: boolean
  mode?: string
  /** Número da versão que este turno gerou (0 = turno só de conversa). */
  version: number
  /** O código deste turno é o que está no preview agora. */
  isCurrent: boolean
} & TurnActions) {
  const turn = useMemo(() => (streaming ? parseBuilderTurn(content, true) : settledTurn(content)), [content, streaming])
  const done = !streaming && turn.code !== ''

  return (
    <div className="space-y-2.5" data-testid="builder-assistant-turn">
      <AssistantHeader mode={streaming ? mode : undefined} />

      {turn.prose && (
        <div
          data-testid="builder-turn-prose"
          className="prose prose-sm prose-invert max-w-none break-words text-[13.5px] leading-relaxed text-foreground/90 prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0 prose-headings:font-sans prose-headings:text-sm prose-code:rounded prose-code:bg-foreground/10 prose-code:px-1 prose-code:py-px prose-code:text-primary prose-code:before:content-none prose-code:after:content-none"
        >
          <ReactMarkdown>{turn.prose}</ReactMarkdown>
        </div>
      )}

      {streaming && !turn.code && !turn.prose && <StatusBox tone="working">Entendendo o seu pedido…</StatusBox>}

      {turn.stages.length > 0 && (
        <div className="space-y-1.5">
          {turn.stages.map((stage) => (
            <StageBox key={stage.kind} stage={stage} />
          ))}
        </div>
      )}

      {done && (
        <div
          data-testid="builder-version-card"
          className={cn(
            'rounded-xl border px-3 py-2.5',
            isCurrent ? 'border-primary/40 bg-primary/[0.06]' : 'border-border/60 bg-background/60',
          )}
        >
          <div className="flex items-center gap-2">
            <Sparkles className={cn('h-3.5 w-3.5 shrink-0', isCurrent ? 'text-primary' : 'text-muted-foreground')} />
            <span className="text-[13px] font-semibold text-foreground">Versão {version}</span>
            {isCurrent && (
              <span className="rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-medium text-primary">no preview</span>
            )}
            <span className="ml-auto truncate font-mono text-[10.5px] text-muted-foreground">
              {linesLabel(turn.totalLines)} · {formatBytes(turn.bytes)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {isCurrent ? (
              <>
                <TurnButton primary onClick={onOpenPreview} icon={Eye}>Ver preview</TurnButton>
                <TurnButton onClick={onOpenCode} icon={CodeXml}>Abrir código</TurnButton>
              </>
            ) : (
              <TurnButton onClick={() => onRestore(turn.code)} icon={RotateCcw}>Restaurar esta versão</TurnButton>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

function TurnButton({ children, onClick, icon: Icon, primary }: { children: React.ReactNode; onClick: () => void; icon: typeof Eye; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        primary
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'border border-border/70 text-foreground hover:bg-foreground/[0.05]',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  )
}

const UserTurn = memo(function UserTurn({ content }: { content: string }) {
  const { text, files } = useMemo(() => splitUserMessage(content), [content])
  return (
    <div className="flex justify-end" data-testid="builder-user-turn">
      <div className="max-w-[88%] rounded-2xl rounded-br-md border border-primary/25 bg-primary/10 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-foreground">
        <p className="whitespace-pre-wrap break-words">{text}</p>
        {files.length > 0 && (
          <div className="mt-2 space-y-1">
            {files.map((f, i) => (
              <FilePreview
                key={i}
                compact
                file={{ url: f.url, name: f.name, size: 0, originalSize: 0, mimeType: '', category: f.category as never, path: '' }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

const SUGGESTIONS = [
  'Um app de tarefas com arrastar e soltar',
  'Uma landing page para um produto SaaS',
  'Um app de delivery com Pix e pagamento em cripto',
  'Um painel financeiro com gráficos',
]

export interface BuilderChatProps extends TurnActions {
  messages: Msg[]
  isLoading: boolean
  mode: string
  /** Código que está no preview agora — define qual versão é a atual. */
  currentCode: string
  /** Falha da última geração, mostrada como caixinha na conversa. */
  error?: string | null
  onPickSuggestion: (prompt: string) => void
}

/** Conversa do Builder: texto em balões, código em caixinhas por etapa. */
export default function BuilderChat({
  messages, isLoading, mode, currentCode, error, onPickSuggestion, onOpenPreview, onOpenCode, onRestore,
}: BuilderChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)

  // Só acompanha o fim da conversa se a pessoa já estava lá embaixo; quem
  // subiu para reler não é puxado de volta a cada pedaço do streaming.
  useEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages, isLoading, error])

  const versions = useMemo(() => {
    let n = 0
    return messages.map((m, i) => {
      if (m.role !== 'assistant') return 0
      // O turno em streaming muda a cada pedaço: basta saber se já tem código.
      const hasCode = isLoading && i === messages.length - 1 ? splitProseAndCode(m.content).code !== '' : settledTurn(m.content).code !== ''
      return hasCode ? ++n : 0
    })
  }, [messages, isLoading])

  const lastIndex = messages.length - 1
  const waitingFirstChunk = isLoading && messages[lastIndex]?.role !== 'assistant'
  const normalizedCurrent = currentCode.trim()

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget
        stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      }}
      className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4"
      data-testid="builder-chat"
    >
      {messages.length === 0 && !isLoading ? (
        <div className="mx-auto flex max-w-md flex-col items-center px-2 pt-10 text-center">
          <img src={LOGO_SRC} alt={BRAND.appName} width={56} height={52} className="mb-4 h-14 w-auto" draggable={false} />
          <h2 className="font-display text-base font-bold tracking-wide text-foreground">O que vamos construir?</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Descreva o app. A conversa fica aqui e o código vai para caixinhas, uma por etapa.
          </p>
          <div className="mt-6 grid w-full gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onPickSuggestion(s)}
                className="rounded-xl border border-border/60 bg-background/60 px-3.5 py-3 text-left text-[13px] text-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-2xl space-y-5">
          {messages.map((msg, i) =>
            msg.role === 'user' ? (
              <UserTurn key={i} content={msg.content} />
            ) : (
              <AssistantTurn
                key={i}
                content={msg.content}
                streaming={isLoading && i === lastIndex}
                mode={mode}
                version={versions[i]}
                isCurrent={versions[i] > 0 && !(isLoading && i === lastIndex) && isCurrentCode(msg.content, normalizedCurrent)}
                onOpenPreview={onOpenPreview}
                onOpenCode={onOpenCode}
                onRestore={onRestore}
              />
            ),
          )}
          {waitingFirstChunk && (
            <div className="space-y-2.5">
              <AssistantHeader mode={mode} />
              <StatusBox tone="working">Entendendo o seu pedido…</StatusBox>
            </div>
          )}
          {error && !isLoading && <StatusBox tone="error">{error}</StatusBox>}
        </div>
      )}
    </div>
  )
}

/** O código gerado por esta mensagem é o que está no preview? */
function isCurrentCode(content: string, normalizedCurrent: string): boolean {
  if (!normalizedCurrent) return false
  // Comparação barata antes de interpretar a mensagem inteira.
  if (!content.includes(normalizedCurrent.slice(0, 64))) return false
  return settledTurn(content).code.trim() === normalizedCurrent
}
