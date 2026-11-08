import { useEffect, useState } from "react";
import { ArrowLeft, Copy, FileCode2, Github } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { diffStats, type CodeFile } from "@/lib/vibeCodeFiles";

/**
 * O "local do código": mostra o arquivo que o usuário abriu a partir de uma
 * caixinha no chat, com numeração de linhas, o diff e o link para o GitHub.
 */
export function VibeCodeViewer({ file, onBack }: { file: CodeFile | null; onBack?: () => void }) {
  const hasContent = !!file?.content;
  const [view, setView] = useState<"code" | "diff">(hasContent ? "code" : "diff");

  useEffect(() => {
    setView(file?.content ? "code" : "diff");
  }, [file?.path, file?.stepId, file?.content]);

  if (!file) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <FileCode2 className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm font-medium text-muted-foreground">Nenhum arquivo aberto</p>
        <p className="max-w-xs text-xs text-muted-foreground/70">
          Toque numa caixinha de código no chat e o arquivo abre aqui.
        </p>
        {onBack && (
          <Button variant="outline" size="sm" className="mt-2" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Voltar ao chat
          </Button>
        )}
      </div>
    );
  }

  const { added, removed } = diffStats(file.diff);
  const lines = (view === "code" ? file.content ?? "" : file.diff ?? "").split("\n");

  const copy = async () => {
    if (!file.content) return;
    try {
      await navigator.clipboard.writeText(file.content);
      toast.success(`${file.path} copiado`);
    } catch {
      toast.error("O navegador bloqueou a cópia.");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="vibe-code-viewer">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-3 py-2">
        {onBack && (
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onBack} aria-label="Voltar ao chat">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <FileCode2 className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold">{file.path}</span>
        {(added > 0 || removed > 0) && (
          <span className="font-mono text-[10px]">
            <span className="text-emerald-400">+{added}</span> <span className="text-rose-400">-{removed}</span>
          </span>
        )}
        {file.commitSha && (
          <Badge variant="outline" className="h-5 px-1.5 font-mono text-[10px]">
            {file.commitSha.replace(/^vault:/, "").slice(0, 7)}
          </Badge>
        )}
        <div className="flex items-center gap-1">
          <div className="flex rounded-md border border-border/40 p-0.5">
            <button
              type="button"
              disabled={!hasContent}
              onClick={() => setView("code")}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-medium",
                view === "code" ? "bg-primary/15 text-primary" : "text-muted-foreground",
                !hasContent && "opacity-40",
              )}
            >
              Código
            </button>
            <button
              type="button"
              disabled={!file.diff}
              onClick={() => setView("diff")}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-medium",
                view === "diff" ? "bg-primary/15 text-primary" : "text-muted-foreground",
                !file.diff && "opacity-40",
              )}
            >
              Diff
            </button>
          </div>
          {hasContent && (
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void copy()} aria-label="Copiar arquivo">
              <Copy className="h-3.5 w-3.5" />
            </Button>
          )}
          {file.repoUrl && (
            <Button asChild variant="ghost" size="sm" className="h-7 px-2">
              <a href={file.repoUrl} target="_blank" rel="noreferrer" aria-label="Abrir no GitHub">
                <Github className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>
      </div>

      {file.reason && <p className="border-b border-border/20 px-3 py-1.5 text-[11px] text-muted-foreground">{file.reason}</p>}

      {!hasContent && view === "code" && (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          Esta conversa é antiga e não guardou o arquivo completo. Veja o diff
          {file.repoUrl ? " ou abra no GitHub" : ""}.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto bg-black/40">
        <pre className="min-w-max p-3 font-mono text-[11px] leading-relaxed">
          {lines.map((line, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                view === "diff" && line.startsWith("+") && "bg-emerald-500/10 text-emerald-300",
                view === "diff" && line.startsWith("-") && "bg-rose-500/10 text-rose-300",
              )}
            >
              <span className="mr-4 inline-block w-8 shrink-0 select-none text-right text-muted-foreground/40">{i + 1}</span>
              <span className="whitespace-pre">{line || " "}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

export default VibeCodeViewer;
