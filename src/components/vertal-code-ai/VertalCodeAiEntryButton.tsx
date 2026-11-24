// Botão de entrada do VERTAL Code AI (Vertal Chat e Vibe Code).
// Com VITE_VERTAL_CODE_AI desligado (padrão) não renderiza NADA: a tela existente fica idêntica.
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { isVertalCodeAiEnabled, vertalCodeAiHref, type VcaFrom } from '@/lib/vertalCodeAi/client';

interface Props {
  from: Exclude<VcaFrom, 'direct'>;
  /** Pedido a levar junto (ponte Chat → VERTAL Code AI). */
  prompt?: string;
  /** Só para testes: força o valor do interruptor. */
  enabledOverride?: boolean;
}

export function VertalCodeAiEntryButton({ from, prompt, enabledOverride }: Props) {
  const navigate = useNavigate();
  const enabled = enabledOverride ?? isVertalCodeAiEnabled();
  if (!enabled) return null;
  return (
    <button
      type="button"
      data-testid="vertal-code-ai-entry"
      onClick={() => navigate(vertalCodeAiHref({ from, prompt }))}
      title="Abrir o VERTAL Code AI (agente de programação)"
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">Code AI</span>
    </button>
  );
}

export default VertalCodeAiEntryButton;
