// Botão "Buscar clientes" do Vertal Growth Team (VERTAL Code AI, Vertal Chat e o projeto no Vibe Code).
// Com VITE_VERTAL_GROWTH_TEAM desligado (padrão) não renderiza NADA: a tela existente fica idêntica.
// Ligado, só aparece se o servidor liberar este usuário.
import { useNavigate } from 'react-router-dom';
import { Rocket } from 'lucide-react';
import { useVertalGrowthAccess, vertalGrowthHref } from '@/lib/vertalGrowth/client';
import { preferredUiLang } from '@/lib/vertalGrowth/i18n';

interface Props {
  from: 'chat' | 'code' | 'builder';
  projectId?: string | null;
  /** Some quando o projeto ainda não tem código (nada para divulgar). */
  hidden?: boolean;
  /** Botão flutuante (tela do projeto no Vibe Code): não ocupa espaço no layout existente. */
  floating?: boolean;
  /** Só para testes: força o valor do interruptor. */
  enabledOverride?: boolean;
}

const LABEL = { pt: 'Buscar clientes', en: 'Find customers', es: 'Buscar clientes' } as const;

export function VertalGrowthEntryButton({ from, projectId, hidden, floating, enabledOverride }: Props) {
  const navigate = useNavigate();
  const access = useVertalGrowthAccess(enabledOverride);
  if (access !== 'allowed' || hidden) return null;
  const label = LABEL[preferredUiLang()];
  return (
    <button
      type="button"
      data-testid="vertal-growth-entry"
      onClick={() => navigate(vertalGrowthHref({ from, projectId }))}
      title={label}
      className={floating
        ? 'fixed bottom-24 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-primary/50 bg-background/90 px-3 py-2 text-xs font-medium text-primary shadow-lg backdrop-blur hover:bg-primary/10 md:bottom-6'
        : 'inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10'}
    >
      <Rocket className="h-3.5 w-3.5" aria-hidden />
      <span className={floating ? '' : 'hidden sm:inline'}>{label}</span>
    </button>
  );
}

export default VertalGrowthEntryButton;
