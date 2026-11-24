import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, FilePlus2, FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProposedFile } from "@/lib/vertalCodeAi/api";

/** Linhas do diff unificado com cor por tipo (adição, remoção, cabeçalho de trecho). */
export function DiffLines({ diff }: { diff: string }) {
  return (
    <pre className="max-h-[50vh] overflow-auto rounded-md bg-black/60 p-2 text-[11px] leading-relaxed sm:text-xs">
      {diff.split("\n").map((line, i) => (
        <div
          key={i}
          className={cn(
            "whitespace-pre-wrap break-all",
            line.startsWith("@@") && "text-sky-400",
            line.startsWith("+") && !line.startsWith("+++") && "bg-emerald-500/10 text-emerald-300",
            line.startsWith("-") && !line.startsWith("---") && "bg-rose-500/10 text-rose-300",
            (line.startsWith("+++") || line.startsWith("---")) && "text-muted-foreground",
          )}
        >
          {line || " "}
        </div>
      ))}
    </pre>
  );
}

export function VertalCodeAiDiffReview({
  files,
  selected,
  onToggle,
}: {
  files: ProposedFile[];
  selected: Set<string>;
  onToggle: (path: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(files.length === 1 ? files[0].path : null);
  if (!files.length) return null;
  return (
    <ul className="space-y-2" aria-label="Arquivos alterados">
      {files.map((f) => {
        const isOpen = open === f.path;
        return (
          <li key={f.path} className="rounded-lg border border-border/60 bg-background/40">
            <div className="flex items-center gap-2 p-2">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-primary"
                checked={selected.has(f.path)}
                onChange={() => onToggle(f.path)}
                aria-label={`Incluir ${f.path}`}
              />
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : f.path)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                aria-expanded={isOpen}
              >
                {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                {f.isNew ? <FilePlus2 className="h-4 w-4 shrink-0 text-emerald-400" /> : <FileCode2 className="h-4 w-4 shrink-0 text-sky-400" />}
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{f.path}</span>
                <span className="shrink-0 font-mono text-[11px]">
                  <span className="text-emerald-400">+{f.added}</span> <span className="text-rose-400">-{f.removed}</span>
                </span>
              </button>
            </div>
            {f.problems.length > 0 && (
              <p className="flex items-start gap-1.5 px-3 pb-2 text-xs text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {f.problems.join("; ")}
              </p>
            )}
            {isOpen && (
              <div className="space-y-2 px-2 pb-2">
                {f.reason && <p className="text-xs text-muted-foreground">{f.reason}</p>}
                <DiffLines diff={f.diff} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
