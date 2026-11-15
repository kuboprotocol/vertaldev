import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, FileDiff, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ClientStagedChange } from "@/lib/vibePlan/engine";

/** Cor por linha do diff unificado. */
function DiffBlock({ diff }: { diff: string }) {
  return (
    <pre className="mt-1.5 max-h-56 overflow-auto rounded-md bg-black/50 p-2 font-mono text-[10px] leading-relaxed">
      {diff.split("\n").map((line, i) => (
        <div
          key={i}
          className={cn(
            "whitespace-pre",
            line.startsWith("+") && !line.startsWith("+++") && "bg-emerald-500/10 text-emerald-300",
            line.startsWith("-") && !line.startsWith("---") && "bg-rose-500/10 text-rose-300",
            line.startsWith("@@") && "text-sky-300/80",
            !/^[-+@]/.test(line) && "text-muted-foreground/80",
          )}
        >
          {line || " "}
        </div>
      ))}
    </pre>
  );
}

export interface VibeStagedChangesProps {
  staged: ClientStagedChange[];
  busy: boolean;
  onApply: (paths?: string[]) => void;
  onReject: (paths?: string[]) => void;
}

export function VibeStagedChanges({ staged, busy, onApply, onReject }: VibeStagedChangesProps) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(staged.slice(0, 1).map((s) => s.path)));
  if (!staged.length) return null;
  const toggle = (path: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <div className="border-t border-border/40 bg-primary/5 px-4 py-3" data-testid="vibe-staged-changes">
      <div className="flex items-center gap-2">
        <FileDiff className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium text-foreground/85">
          {staged.length} mudança{staged.length > 1 ? "s" : ""} staged · nada foi gravado no projeto ainda
        </span>
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 gap-1 border-border/30 px-2 text-[10px]" onClick={() => onReject()} disabled={busy}>
            <X className="h-3 w-3" /> Rejeitar tudo
          </Button>
          <Button size="sm" className="h-7 gap-1 px-2 text-[10px]" onClick={() => onApply()} disabled={busy}>
            <Check className="h-3 w-3" /> Aplicar tudo
          </Button>
        </div>
      </div>
      <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {staged.map((s) => {
          const expanded = open.has(s.path);
          return (
            <li key={s.path} className="rounded-lg border border-border/30 bg-card/40 px-2.5 py-1.5">
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => toggle(s.path)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  aria-expanded={expanded}
                  aria-label={`Ver diff de ${s.path}`}
                >
                  <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", !expanded && "-rotate-90")} />
                  <span className="truncate font-mono text-foreground/85">{s.path}</span>
                  <span className="shrink-0 font-mono text-[10px] text-emerald-300">+{s.added}</span>
                  <span className="shrink-0 font-mono text-[10px] text-rose-300">-{s.removed}</span>
                  {typeof s.taskId === "number" && <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">#{s.taskId}</span>}
                  {s.status === "stale" && (
                    <Badge variant="outline" className="h-4 shrink-0 gap-0.5 rounded border-amber-500/40 px-1 text-[9px] text-amber-300">
                      <AlertTriangle className="h-2.5 w-2.5" /> desatualizada
                    </Badge>
                  )}
                </button>
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-rose-300" onClick={() => onReject([s.path])} disabled={busy} aria-label={`Rejeitar ${s.path}`}>
                  Rejeitar
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-primary" onClick={() => onApply([s.path])} disabled={busy} aria-label={`Aplicar ${s.path}`}>
                  Aplicar
                </Button>
              </div>
              {s.reason && expanded && <p className="mt-1 text-[10px] text-muted-foreground">{s.reason}</p>}
              {expanded && <DiffBlock diff={s.diff} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default VibeStagedChanges;
