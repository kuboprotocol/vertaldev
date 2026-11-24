// Porteiro da rota /vertal-code-ai: só renderiza a tela para usuários liberados pelo servidor.
// Os demais veem a mesma página "não encontrada" do resto do site.
import { lazy, Suspense, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useVertalCodeAiAccess } from '@/lib/vertalCodeAi/access';

const NotFound = lazy(() => import('@/pages/NotFound'));

export function VertalCodeAiGate({ children, enabledOverride }: { children: ReactNode; enabledOverride?: boolean }) {
  const access = useVertalCodeAiAccess(enabledOverride);
  if (access === 'checking') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" data-testid="vertal-code-ai-gate-checking">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }
  if (access !== 'allowed') {
    return (
      <Suspense fallback={null}>
        <NotFound />
      </Suspense>
    );
  }
  return <>{children}</>;
}

export default VertalCodeAiGate;
