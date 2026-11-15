import { CircleDot, ListChecks, Loader2, Play, PlayCircle, Square, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  AUTONOMY,
  AUTONOMY_LEVELS,
  graphProgress,
  MODEL_PACK_LABEL,
  MODEL_PACKS,
  nextTask,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type AutonomyLevel,
  type ModelPack,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/vibePlan/engine";
import type { VibePlanState } from "@/lib/vibeCodeAgentTypes";

const STATUS_STYLE: Record<TaskStatus, string> = {
  pending: "border-border/40 text-muted-foreground",
  "in-progress": "border-primary/40 bg-primary/10 text-primary",
  done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  deferred: "border-border/30 text-muted-foreground/60",
  blocked: "border-rose-500/40 bg-rose-500/10 text-rose-300",
};

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  high: "text-orange-300",
  medium: "text-amber-200/80",
  low: "text-sky-300/80",
};

export interface VibePlanPanelProps {
  state: VibePlanState;
  /** Uma chamada ao agente está em andamento. */
  busy: boolean;
  /** "Executar todas" está rodando (mostra o botão de parar). */
  runningAll: boolean;
  onRunNext: () => void;
  onRunAll: () => void;
  onStopAll: () => void;
  onConfig: (patch: { autonomy?: AutonomyLevel; modelPack?: ModelPack }) => void;
  onClose?: () => void;
}

export function VibePlanPanel({ state, busy, runningAll, onRunNext, onRunAll, onStopAll, onConfig, onClose }: VibePlanPanelProps) {
  const graph = state.graph;
  const progress = graphProgress(graph);
  const next = nextTask(graph);
  const hasStaged = state.staged.length > 0;

  return (
    <div className="border-t border-border/40 bg-white/[0.02] px-4 py-3" data-testid="vibe-plan-panel">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-widest text-foreground/90">Plano</span>
        {graph && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {progress.done}/{progress.total}
          </span>
        )}
        {onClose && (
          <Button size="icon" variant="ghost" className="ml-auto h-6 w-6" onClick={onClose} aria-label="Fechar plano">
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {graph ? (
        <>
          {graph.goal && <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{graph.goal}</p>}
          <Progress value={progress.percent} className="mt-2 h-1" />
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1" aria-label="Tarefas do plano">
            {graph.tasks.map((t) => {
              const isNext = next?.id === t.id;
              return (
                <li
                  key={t.id}
                  data-next={isNext || undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]",
                    isNext ? "border-primary/50 bg-primary/5" : "border-border/30 bg-card/30",
                  )}
                >
                  {isNext ? <CircleDot className="h-3 w-3 shrink-0 text-primary" aria-label="Próxima" /> : <span className="w-3 shrink-0" />}
                  <span className="font-mono text-muted-foreground/70">#{t.id}</span>
                  <span className={cn("min-w-0 flex-1 truncate", t.status === "done" ? "text-muted-foreground line-through" : "text-foreground/85")}>
                    {t.title}
                  </span>
                  {t.dependencies.length > 0 && (
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60" title="Depende de">
                      ← {t.dependencies.map((d) => `#${d}`).join(" ")}
                    </span>
                  )}
                  <span className={cn("shrink-0 text-[10px]", PRIORITY_STYLE[t.priority])}>{PRIORITY_LABEL[t.priority]}</span>
                  <Badge variant="outline" className={cn("h-4 shrink-0 rounded px-1 text-[9px] uppercase", STATUS_STYLE[t.status])}>
                    {STATUS_LABEL[t.status]}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">Esta conversa ainda não tem plano. Use /plano seguido do que você quer construir.</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button size="sm" className="h-7 gap-1.5 px-2.5 text-[10px]" onClick={onRunNext} disabled={busy || !next || hasStaged}>
          {busy && !runningAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Executar próxima
        </Button>
        {runningAll ? (
          <Button size="sm" variant="outline" className="h-7 gap-1.5 border-rose-500/40 px-2.5 text-[10px] text-rose-300" onClick={onStopAll}>
            <Square className="h-3 w-3" /> Parar sequência
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-7 gap-1.5 border-border/30 px-2.5 text-[10px]" onClick={onRunAll} disabled={busy || !next || hasStaged}>
            <PlayCircle className="h-3 w-3" /> Executar todas (semi-autônomo)
          </Button>
        )}
        <label className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          Autonomia
          <select
            aria-label="Autonomia"
            className="h-7 rounded-md border border-border/30 bg-black/60 px-1.5 text-[10px] text-foreground"
            value={state.autonomy}
            disabled={busy}
            title={AUTONOMY[state.autonomy].description}
            onChange={(e) => onConfig({ autonomy: e.target.value as AutonomyLevel })}
          >
            {AUTONOMY_LEVELS.map((l) => (
              <option key={l} value={l}>
                {AUTONOMY[l].label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          Modelos
          <select
            aria-label="Pacote de modelos"
            className="h-7 rounded-md border border-border/30 bg-black/60 px-1.5 text-[10px] text-foreground"
            value={state.modelPack}
            disabled={busy}
            title={MODEL_PACK_LABEL[state.modelPack].description}
            onChange={(e) => onConfig({ modelPack: e.target.value as ModelPack })}
          >
            {MODEL_PACKS.map((p) => (
              <option key={p} value={p}>
                {MODEL_PACK_LABEL[p].label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {hasStaged && <p className="mt-1.5 text-[10px] text-amber-300/80">Revise as mudanças staged antes de seguir para a próxima tarefa.</p>}
    </div>
  );
}

export default VibePlanPanel;
