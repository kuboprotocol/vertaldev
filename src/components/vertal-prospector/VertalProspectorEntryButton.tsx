// Botão de entrada do Vertal Prospector (Vertal Chat e VERTAL Code AI).
// Com VITE_VERTAL_PROSPECTOR desligado (padrão) não renderiza NADA: a tela existente fica idêntica.
// Ligado, só aparece se o servidor liberar este usuário (VERTAL_PROSPECTOR_USER_IDS).
import { useNavigate } from 'react-router-dom';
import { Target } from 'lucide-react';
import { useVertalProspectorAccess, vertalProspectorHref } from '@/lib/vertalProspector/client';

interface Props {
  from: 'chat' | 'code';
  /** Só para testes: força o valor do interruptor. */
  enabledOverride?: boolean;
}

export function VertalProspectorEntryButton({ from, enabledOverride }: Props) {
  const navigate = useNavigate();
  const access = useVertalProspectorAccess(enabledOverride);
  if (access !== 'allowed') return null;
  return (
    <button
      type="button"
      data-testid="vertal-prospector-entry"
      onClick={() => navigate(vertalProspectorHref({ from }))}
      title="Abrir o Vertal Prospector (encontrar clientes)"
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
    >
      <Target className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">Prospector</span>
    </button>
  );
}

export default VertalProspectorEntryButton;
