// Página própria do scanner (/scanner): funciona no navegador, no Android e no iOS sem entrar no chat.
import { DocumentScanner } from '@/components/scanner/DocumentScanner';

export default function ScannerPage() {
  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <DocumentScanner />
    </main>
  );
}
