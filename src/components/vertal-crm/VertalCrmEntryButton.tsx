// Botão "Vertal CRM" (topo do Vertal Chat). Com VITE_VERTAL_CRM desligado (padrão) não renderiza NADA.
// Ligado, só aparece se o servidor liberar este usuário.
import { useNavigate } from 'react-router-dom';
import { Contact } from 'lucide-react';
import { useVertalCrmAccess, VERTAL_CRM_ROUTE } from '@/lib/vertalCrm/client';

export function VertalCrmEntryButton({ enabledOverride }: { enabledOverride?: boolean }) {
  const navigate = useNavigate();
  const access = useVertalCrmAccess(enabledOverride);
  if (access !== 'allowed') return null;
  return (
    <button type="button" data-testid="vertal-crm-entry" onClick={() => navigate(VERTAL_CRM_ROUTE)} title="Vertal CRM"
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10">
      <Contact className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">CRM</span>
    </button>
  );
}

export default VertalCrmEntryButton;
