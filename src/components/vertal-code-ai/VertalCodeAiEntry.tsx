import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { isVertalCodeAiEnabled, VERTAL_CODE_AI_NAME, VERTAL_CODE_AI_ROUTE } from "@/lib/vertalCodeAi/flags";
import { handoffFromChat, saveHandoff, type ChatLikeMessage } from "@/lib/vertalCodeAi/handoff";

/**
 * Atalho do Vibe Code para o VERTAL Code AI. Com o interruptor desligado (padrão)
 * não renderiza nada: a barra do Vibe Code fica idêntica.
 */
export function VertalCodeAiVibeEntry() {
  const navigate = useNavigate();
  if (!isVertalCodeAiEnabled()) return null;
  return (
    <button
      type="button"
      onClick={() => navigate(VERTAL_CODE_AI_ROUTE)}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-primary hover:bg-primary/20"
      aria-label={`Abrir o ${VERTAL_CODE_AI_NAME}`}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">{VERTAL_CODE_AI_NAME}</span>
      <span className="sm:hidden">Code AI</span>
    </button>
  );
}

/**
 * Vertal Chat ─► VERTAL Code AI: leva o pedido (rascunho ou última mensagem) e o
 * contexto recente. Com o interruptor desligado (padrão) não renderiza nada.
 */
export function VertalCodeAiChatHandoff({ messages, draft }: { messages: ChatLikeMessage[]; draft?: string }) {
  const navigate = useNavigate();
  if (!isVertalCodeAiEnabled()) return null;
  const handoff = handoffFromChat(messages, draft ?? "");
  return (
    <button
      type="button"
      disabled={!handoff}
      onClick={() => {
        if (!handoff) return;
        saveHandoff(handoff);
        navigate(`${VERTAL_CODE_AI_ROUTE}?from=chat`);
      }}
      title={handoff ? `Continuar no ${VERTAL_CODE_AI_NAME}` : "Escreva o que quer programar primeiro"}
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-40"
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">Programar no {VERTAL_CODE_AI_NAME}</span>
      <span className="sm:hidden">Code AI</span>
    </button>
  );
}
