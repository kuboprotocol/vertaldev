import { Link } from "react-router-dom";
import { CheckCircle2, Circle, KeyRound, Plug, Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VibeRequirement } from "@/lib/vibeCodeAgentTypes";

/**
 * "O que esta aplicação precisa": os conectores e APIs que o agente detectou,
 * com o motivo, o estado e o caminho exato para conectar cada um.
 */
export function VibeRequirementsCard({ requirements }: { requirements: VibeRequirement[] }) {
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${text} copiado`);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <ul className="mt-3 space-y-2" data-testid="vibe-requirements">
      {requirements.map((r) => {
        const connected = r.status === "connected";
        return (
          <li key={r.slug} className="rounded-lg border border-border/50 bg-background/50 p-3">
            <div className="flex items-start gap-2">
              {connected ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{r.label}</span>
                  <Badge variant="outline" className="h-4 px-1.5 text-[9px] uppercase">
                    {r.kind === "connector" ? "conector" : "API"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`h-4 px-1.5 text-[9px] uppercase ${connected ? "border-emerald-500/30 text-emerald-400" : "border-amber-500/30 text-amber-400"}`}
                  >
                    {r.builtin ? "da plataforma" : connected ? "conectado" : "falta conectar"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{r.reason}</p>

                {r.secrets.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <KeyRound className="h-3 w-3 text-muted-foreground" />
                    {r.secrets.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void copy(s)}
                        className="inline-flex items-center gap-1 rounded border border-border/50 bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-primary"
                        title="Copiar nome do segredo"
                      >
                        {s} <Copy className="h-2.5 w-2.5" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!connected && (
                <Button asChild size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-xs">
                  <Link to={r.connectPath ?? "/connectors"}>
                    <Plug className="h-3 w-3" /> {r.connectPath ? "Conectar" : "Configurar"}
                  </Link>
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default VibeRequirementsCard;
