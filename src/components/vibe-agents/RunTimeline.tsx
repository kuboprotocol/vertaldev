import { CheckCircle2, XCircle } from 'lucide-react'
import { VIBE_TOOLS } from '@/config/vibeAgents'
import { cn } from '@/lib/utils'
import type { RunResult } from '@/lib/vibeAgentsApi'

/** Step-by-step record of a run: thoughts, tool calls and the final answer. */
export function RunTimeline({ result, advanced }: { result: RunResult; advanced: boolean }) {
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
      {result.status === 'failed' && <li className="text-destructive text-sm">Falhou: {result.output} (créditos devolvidos)</li>}
      {result.status === 'completed' && result.credits_charged != null && (
        <li className="text-xs text-muted-foreground">Custo desta execução: {result.credits_charged} créditos</li>
      )}
    </ol>
  )
}
