import { useState } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { surfaceCard } from "@/components/vibe-code/surface";
import { VERTAL_AI_FOLLOW_UP_PROMPT, vertalAiConnectorApi, vertalAiConnectorUiEnabled } from "@/lib/vertalAiConnector";

interface Props {
  projectId: string | null;
  needsVideo?: boolean;
  disabled?: boolean;
  /** Depois de ativar: o chat manda o pedido que liga a IA do app ao conector. */
  onActivated: (followUpPrompt: string) => void;
  /** Para testes. */
  uiEnabled?: boolean;
}

/**
 * Cartão "Este app usa IA. Ativar a Vertal AI?" (mesmo estilo do cartão do Login Vertal).
 * Um clique: cria a chave do projeto (idempotente), guarda no Cofre e segue o pedido.
 * Só aparece com VITE_VERTAL_AI_CONNECTOR ligado; o servidor só oferece para quem está na allowlist.
 */
export function VertalAiOfferCard({ projectId, needsVideo, disabled, onActivated, uiEnabled }: Props) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (!(uiEnabled ?? vertalAiConnectorUiEnabled())) return null;

  const activate = async () => {
    setBusy(true);
    try {
      const r = await vertalAiConnectorApi.activate(projectId, { video: !!needsVideo });
      setDone(true);
      toast.success(r.created ? "Vertal AI ativada neste projeto." : "A Vertal AI já estava ativa neste projeto.");
      onActivated(VERTAL_AI_FOLLOW_UP_PROMPT);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui ativar a Vertal AI.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${surfaceCard} ml-8 flex items-center gap-2 px-3 py-2 text-xs`} data-testid="vibe-vertal-ai-offer">
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="flex-1">
        {done
          ? "Vertal AI ativa. Conectando a IA do app…"
          : "Este app usa IA. Ative a Vertal AI: chave do projeto guardada no Cofre, uso nos seus créditos, nada para configurar."}
      </span>
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Ativada" />
      ) : (
        <Button size="sm" className="h-7 px-2 text-[11px]" disabled={busy || disabled} onClick={() => void activate()} data-testid="vibe-vertal-ai-activate">
          {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
          Ativar Vertal AI
        </Button>
      )}
    </div>
  );
}
