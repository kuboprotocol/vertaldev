// Sub-página do Vertal Navigator ("Abrir em outra tela"): só abre quando o usuário toca
// no botão do cartão ao vivo do projeto. Acompanha a MESMA sessão (/navegar/:sessionId),
// sem abrir um navegador novo. Sem :sessionId, mostra o painel normal do Navigator.
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { NavigatorPanel } from '@/components/vertal-chat/NavigatorPanel';
import { NavigatorApprovalDialog } from '@/components/vertal-chat/NavigatorApprovalDialog';
import { attachNavigatorSession } from '@/lib/navigator/store';

export default function NavigatorSessionPage() {
  const { sessionId } = useParams<{ sessionId?: string }>();

  useEffect(() => {
    if (sessionId) void attachNavigatorSession(sessionId);
  }, [sessionId]);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Vertal Navigator';
    return () => { document.title = prev; };
  }, []);

  return (
    <main className="min-h-[100dvh] bg-background text-foreground" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <nav className="mx-auto flex max-w-6xl items-center px-3 pt-3 sm:px-4">
        <Link to="/vibe-code" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Voltar ao Vibe Code
        </Link>
      </nav>
      <NavigatorPanel />
      {/* Aprovação de pagamento/envio e código 2FA desta sessão. */}
      <NavigatorApprovalDialog />
    </main>
  );
}
