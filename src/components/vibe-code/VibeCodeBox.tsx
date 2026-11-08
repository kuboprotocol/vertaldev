import { ChevronRight, FileCode2, Github } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { diffStats, fileName, type CodeFile } from "@/lib/vibeCodeFiles";

const STATUS_LABEL: Record<CodeFile["status"], string> = {
  preview: "para revisar",
  committed: "commitado",
  reverted: "desfeito",
};

/**
 * Caixinha de código: um arquivo que o agente criou ou alterou.
 * Tocar na caixinha leva ao arquivo no visualizador de código.
 */
export function VibeCodeBox({ file, active, onOpen }: { file: CodeFile; active?: boolean; onOpen: (file: CodeFile) => void }) {
  const { name, dir } = fileName(file.path);
  const { added, removed } = diffStats(file.diff);
  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-xl border bg-black/40 px-3 py-2.5 transition-colors",
        active ? "border-primary/60 bg-primary/5" : "border-border/40 hover:border-primary/40 hover:bg-white/[0.03]",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(file)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none"
        aria-label={`Abrir ${file.path}`}
        data-testid="vibe-code-box"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileCode2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs font-semibold text-foreground">{name}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">{dir || "raiz do projeto"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {(added > 0 || removed > 0) && (
            <span className="font-mono text-[10px]">
              <span className="text-emerald-400">+{added}</span> <span className="text-rose-400">-{removed}</span>
            </span>
          )}
          <Badge
            variant="outline"
            className={cn(
              "h-4 px-1.5 text-[9px] uppercase",
              file.status === "committed" && "border-emerald-500/30 text-emerald-400",
              file.status === "preview" && "border-amber-500/30 text-amber-400",
              file.status === "reverted" && "border-rose-500/30 text-rose-400",
            )}
          >
            {STATUS_LABEL[file.status]}
          </Badge>
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
      </button>
      {file.repoUrl && (
        <a
          href={file.repoUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-muted-foreground hover:text-primary"
          aria-label={`Abrir ${file.path} no GitHub`}
          title="Abrir no GitHub"
        >
          <Github className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

export default VibeCodeBox;
