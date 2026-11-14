import { useState } from "react";
import {
  AlertTriangle,
  Bug,
  Check,
  CheckCircle2,
  FileCode2,
  Loader2,
  MessageCircleQuestion,
  PencilLine,
  RotateCcw,
  ShieldCheck,
  SkipForward,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { findingDiff, SEVERITY_LABEL, type Severity } from "@/lib/vibeReview/engine";
import { currentFixItem, queueProgress, type FixQueueState } from "@/lib/vibeReview/fixQueue";

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  high: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-sky-500/40 bg-sky-500/10 text-sky-300",
};

const COMMAND_TITLE: Record<string, { label: string; icon: typeof ShieldCheck }> = {
  review: { label: "Revisão de código", icon: ShieldCheck },
  improve: { label: "Melhorias sugeridas", icon: Sparkles },
  fix_errors: { label: "Correção de erros", icon: Bug },
};

/** Texto com `código` destacado. */
function InlineCode({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`\n]+`)/g).map((p, i) =>
        p.startsWith("`") && p.endsWith("`") && p.length > 2 ? (
          <code key={i} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-primary">
            {p.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export interface VibeFixQueueCardProps {
  state: FixQueueState;
  /** Uma chamada ao agente está em andamento (aplicar, ajustar ou responder). */
  busy: boolean;
  onApply: () => void;
  onSkip: () => void;
  onAdjust: (comment: string) => void;
  onAskAbout: () => void;
  onOpenFile?: (path: string) => void;
  onRestart: () => void;
  onClose: () => void;
}

/**
 * Fila de correções do Vibe Reviewer: um item por vez, com explicação em
 * português, o diff proposto e Aplicar / Pular / Ajustar. O Dev pode perguntar
 * no chat a qualquer momento; a pergunta vai sobre o item da vez.
 */
export function VibeFixQueueCard({
  state,
  busy,
  onApply,
  onSkip,
  onAdjust,
  onAskAbout,
  onOpenFile,
  onRestart,
  onClose,
}: VibeFixQueueCardProps) {
  const [adjusting, setAdjusting] = useState(false);
  const [comment, setComment] = useState("");
  const progress = queueProgress(state);
  const item = currentFixItem(state);
  const meta = COMMAND_TITLE[state.command ?? "review"] ?? COMMAND_TITLE.review;
  const Icon = meta.icon;

  if (!state.items.length) return null;

  const submitAdjust = () => {
    const text = comment.trim();
    if (!text) return;
    onAdjust(text);
    setComment("");
    setAdjusting(false);
  };

  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-2 border-t border-primary/20 bg-gradient-to-b from-primary/[0.06] to-transparent px-4 py-3"
      data-testid="vibe-fix-queue"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Icon className="h-3.5 w-3.5" />
          </div>
          <span className="truncate text-[11px] font-bold uppercase tracking-widest text-foreground/80">{meta.label}</span>
          <Badge variant="outline" className="h-5 rounded-md border-primary/30 bg-primary/10 px-1.5 font-mono text-[10px] text-primary">
            {progress.position}/{progress.total}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-0.5 text-emerald-400">
            <Check className="h-3 w-3" /> {progress.applied}
          </span>
          <span className="flex items-center gap-0.5">
            <SkipForward className="h-3 w-3" /> {progress.skipped}
          </span>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onClose} disabled={busy} aria-label="Fechar a fila">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <Progress value={progress.percent} className="mt-2 h-1 bg-white/5" />

      {progress.done || !item ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
          <p className="flex items-center gap-2 text-xs text-foreground/90">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Fila concluída: {progress.applied} aplicada(s), {progress.skipped} pulada(s).
          </p>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 border-border/30 text-[10px]" onClick={onRestart} disabled={busy}>
            <RotateCcw className="h-3 w-3" /> Revisar de novo
          </Button>
        </div>
      ) : (
        <div className="mt-3 max-h-[42vh] space-y-2.5 overflow-y-auto pr-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={cn("h-5 rounded-md px-1.5 text-[10px] font-semibold uppercase", SEVERITY_STYLE[item.finding.severity])}>
              {SEVERITY_LABEL[item.finding.severity]}
            </Badge>
            {typeof item.finding.score === "number" && (
              <Badge variant="outline" className="h-5 rounded-md border-border/30 px-1.5 font-mono text-[10px] text-muted-foreground">
                nota {item.finding.score}/10
              </Badge>
            )}
            {item.finding.label && (
              <Badge variant="outline" className="h-5 rounded-md border-border/30 px-1.5 text-[10px] text-muted-foreground">
                {item.finding.label}
              </Badge>
            )}
            <span className="text-sm font-semibold tracking-tight text-foreground">{item.finding.title}</span>
          </div>

          <button
            type="button"
            onClick={() => onOpenFile?.(item.finding.path)}
            className="flex max-w-full items-center gap-1.5 font-mono text-[11px] text-primary/90 hover:underline"
          >
            <FileCode2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {item.finding.path}
              {item.finding.startLine ? `:${item.finding.startLine}${item.finding.endLine && item.finding.endLine !== item.finding.startLine ? `-${item.finding.endLine}` : ""}` : ""}
            </span>
          </button>

          {item.finding.errorRef && (
            <pre className="whitespace-pre-wrap break-words rounded-lg border border-rose-500/20 bg-rose-500/5 p-2 font-mono text-[10px] text-rose-300/90">
              {item.finding.errorRef}
            </pre>
          )}

          <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/85">
            <InlineCode text={item.finding.explanation} />
          </p>
          {item.finding.why && (
            <p className="text-[11px] italic text-muted-foreground">
              Autorrevisão: <InlineCode text={item.finding.why} />
            </p>
          )}

          {item.finding.existingCode !== undefined && (
            <div className="overflow-x-auto rounded-lg border border-border/40 bg-black/60 py-1.5 font-mono text-[11px] leading-5" data-testid="vibe-fix-diff">
              {findingDiff(item.finding).map((l, i) => (
                <div
                  key={i}
                  className={cn(
                    "whitespace-pre px-2",
                    l.type === "del" ? "bg-rose-500/10 text-rose-300/90" : "bg-emerald-500/10 text-emerald-300/90",
                  )}
                >
                  <span className="mr-2 select-none opacity-60">{l.type === "del" ? "-" : "+"}</span>
                  {l.text || " "}
                </div>
              ))}
            </div>
          )}

          {(!item.finding.applicable || item.error) && (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-300/90">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {item.error ?? `Não dá para aplicar automaticamente: ${item.finding.problem ?? "correção indisponível"}. Use Ajustar para eu refazer, ou Pular.`}
            </p>
          )}

          {adjusting ? (
            <div className="space-y-2">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitAdjust();
                  }
                }}
                autoFocus
                placeholder="Como devo ajustar? Ex.: mantenha o nome da função e só trate o caso vazio"
                className="min-h-[56px] resize-none rounded-lg border-border/30 bg-black/60 text-xs"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => setAdjusting(false)}>
                  Cancelar
                </Button>
                <Button size="sm" className="h-7 gap-1.5 text-[10px]" onClick={submitAdjust} disabled={!comment.trim() || busy}>
                  <PencilLine className="h-3 w-3" /> Refazer correção
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-primary px-3 text-[11px] font-bold text-primary-foreground shadow-lg shadow-primary/20"
                onClick={onApply}
                disabled={busy || !item.finding.applicable}
                data-testid="vibe-fix-apply"
              >
                {item.status === "applying" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {item.status === "failed" ? "Tentar de novo" : "Aplicar"}
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 border-border/30 text-[11px]" onClick={onSkip} disabled={busy} data-testid="vibe-fix-skip">
                <SkipForward className="h-3.5 w-3.5" /> Pular
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 border-border/30 text-[11px]"
                onClick={() => setAdjusting(true)}
                disabled={busy}
                data-testid="vibe-fix-adjust"
              >
                {item.status === "adjusting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PencilLine className="h-3.5 w-3.5" />}
                Ajustar
              </Button>
              <Button size="sm" variant="ghost" className="ml-auto h-8 gap-1.5 text-[11px] text-muted-foreground" onClick={onAskAbout} disabled={busy}>
                <MessageCircleQuestion className="h-3.5 w-3.5" /> Explicar melhor
              </Button>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground/60">Dúvida? Escreva no chat: a pergunta vai sobre este item.</p>
        </div>
      )}
    </div>
  );
}

export default VibeFixQueueCard;
