import { Bug, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { previewErrorStore, usePreviewErrors } from "@/lib/vibeReview/previewErrors";

const SOURCE_LABEL = { preview: "preview", agent: "agente", manual: "colado" } as const;

/**
 * Console do Vibe Code: erros de build/runtime vistos no preview (e os que o
 * Dev colou com /fix). O botão "Corrigir erros um a um" do chat usa esta lista.
 */
export function VibePreviewConsole() {
  const errors = usePreviewErrors();

  return (
    <div className="flex h-full flex-col bg-[#050505]">
      <div className="flex items-center justify-between border-b border-border/30 px-3 py-2">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-foreground/70">
          <Bug className="h-3.5 w-3.5 text-primary" /> Console · {errors.length} erro(s)
        </div>
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-[10px]" onClick={() => previewErrorStore.clear()} disabled={!errors.length}>
          <Trash2 className="h-3 w-3" /> Limpar
        </Button>
      </div>
      {errors.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center text-muted-foreground/60">
          <p className="text-xs">Nenhum erro capturado.</p>
          <p className="text-[10px] text-muted-foreground/40">
            Erros que o app do preview reportar aparecem aqui. Você também pode colar um erro no chat com /fix.
          </p>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-3">
            {errors.map((e) => (
              <div key={e.id} className="group rounded-lg border border-rose-500/20 bg-rose-500/5 p-2">
                <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>
                    {SOURCE_LABEL[e.source]} · {new Date(e.at).toLocaleTimeString("pt-BR")}
                  </span>
                  <button type="button" onClick={() => previewErrorStore.remove(e.id)} aria-label="Remover erro" className="opacity-60 hover:opacity-100">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-rose-200/90">{e.message}</pre>
              </div>
            ))}
            <p className="pt-1 text-center text-[10px] text-muted-foreground/50">Use "Corrigir erros um a um" no chat para resolver com o agente.</p>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

export default VibePreviewConsole;
