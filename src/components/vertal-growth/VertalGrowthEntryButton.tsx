// Botão "Buscar clientes" do Vertal Growth Team (VERTAL Code AI, Vertal Chat e o projeto no Vibe Code).
// Com VITE_VERTAL_GROWTH_TEAM desligado (padrão) não renderiza NADA: a tela existente fica idêntica.
// Ligado, só aparece se o servidor liberar este usuário.
import { useNavigate } from 'react-router-dom';
import { Rocket } from 'lucide-react';
import { useVertalGrowthAccess, vertalGrowthHref } from '@/lib/vertalGrowth/client';
import { preferredUiLang, type UiLang } from '@/lib/vertalUiLang';

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

// Rótulo nos 21 idiomas (o mesmo de GROWTH_UI[*].entryLabel; aqui à parte para não carregar o dicionário inteiro no chat).
const LABEL: Record<UiLang, string> = {
  pt: 'Buscar clientes', 'pt-PT': 'Encontrar clientes', en: 'Find customers', es: 'Buscar clientes', fr: 'Trouver des clients', de: 'Kunden finden',
  it: 'Trova clienti', nl: 'Klanten vinden', pl: 'Znajdź klientów', tr: 'Müşteri bul', ru: 'Найти клиентов', uk: 'Знайти клієнтів', ar: 'ابحث عن عملاء',
  hi: 'ग्राहक खोजें', id: 'Cari pelanggan', vi: 'Tìm khách hàng', th: 'หาลูกค้า', ja: '顧客を探す', ko: '고객 찾기', 'zh-CN': '寻找客户', 'zh-TW': '尋找客戶',
};

export function VertalGrowthEntryButton({ from, projectId, hidden, floating, enabledOverride }: Props) {
  const navigate = useNavigate();
  const access = useVertalGrowthAccess(enabledOverride);
  if (access !== 'allowed' || hidden) return null;
  const label = LABEL[preferredUiLang()] ?? LABEL.pt;
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
