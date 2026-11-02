import { useEffect, useMemo, useState } from "react";
import { Copy, FileCode2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ConvFile {
  path: string;
  content: string;
  version: number;
  created_at: string;
}

/**
 * Código de UMA conversa: ao clicar na caixinha da conversa, o usuário cai aqui e vê
 * os arquivos que o agente escreveu naquela conversa (a versão mais recente de cada um).
 */
export function VibeConversationCode({ conversationId, title }: { conversationId: string | null; title?: string }) {
  const [files, setFiles] = useState<ConvFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId) {
      setFiles([]);
      return;
    }
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("vibe_project_files")
          .select("path, content, version, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(300);
        if (error) throw error;
        // Ordenado do mais novo para o mais antigo: a primeira ocorrência de cada caminho é a versão atual.
        const latest = new Map<string, ConvFile>();
        for (const row of (data ?? []) as ConvFile[]) {
          if (!latest.has(row.path)) latest.set(row.path, row);
        }
        if (active) setFiles([...latest.values()].sort((a, b) => a.path.localeCompare(b.path)));
      } catch {
        if (active) setFiles([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [conversationId]);

  useEffect(() => {
    setSelected((cur) => (files.some((f) => f.path === cur) ? cur : files[0]?.path ?? null));
  }, [files]);

  const current = useMemo(() => files.find((f) => f.path === selected) ?? null, [files, selected]);

  if (!conversationId) {
    return (
      <EmptyState text="Clique numa conversa ao lado para ver o código que o agente escreveu nela." />
    );
  }
  if (loading) return <EmptyState text="Carregando o código desta conversa…" />;
  if (files.length === 0) {
    return <EmptyState text="Esta conversa ainda não gerou código. Peça algo ao agente e os arquivos aparecem aqui." />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5 text-primary" />
        <span className="truncate font-medium text-foreground/80">{title ?? "Conversa"}</span>
        <span className="ml-auto shrink-0">{files.length} arquivo{files.length > 1 ? "s" : ""}</span>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[220px_1fr]">
        <ul className="min-h-0 space-y-1 overflow-auto rounded-xl border border-border/40 bg-black/20 p-2">
          {files.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                onClick={() => setSelected(f.path)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                  f.path === selected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                )}
              >
                <FileCode2 className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate font-mono">{f.path}</span>
                <span className="font-mono text-[10px] text-muted-foreground/70">v{f.version}</span>
              </button>
            </li>
          ))}
        </ul>
        {current && (
          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/40 bg-black/30">
            <div className="flex items-center gap-2 border-b border-border/30 px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{current.path}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 gap-1 px-2 text-[10px]"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(current.content)
                    .then(() => toast.success("Código copiado"))
                    .catch(() => toast.error("Não foi possível copiar."))
                }
              >
                <Copy className="h-3 w-3" /> Copiar
              </Button>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-foreground/85">
              {current.content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-border/50 p-6 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

export default VibeConversationCode;
