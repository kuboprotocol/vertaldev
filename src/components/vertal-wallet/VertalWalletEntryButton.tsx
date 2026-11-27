// Botão "Trader" do Vertal Chat (conector MetaMask). Com VITE_VERTAL_METAMASK desligado (padrão) não renderiza
// NADA: a tela existente fica idêntica. Ligado, só aparece se o servidor liberar o Trader para este usuário.
import { useNavigate } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import { useVertalWalletAccess } from '@/lib/vertalWallet/client'
import { METAMASK_TRADER_ROUTE } from '@/lib/vertalWallet/config'
import { preferredUiLang } from '@/lib/vertalUiLang'

const LABEL: Record<string, string> = { pt: 'Trader', 'pt-PT': 'Trader', en: 'Trader', es: 'Trader' }
const TITLE: Record<string, string> = {
  pt: 'Trader por prompt (testnet) — não é recomendação de investimento',
  'pt-PT': 'Trader por prompt (testnet) — não é recomendação de investimento',
  en: 'Trader by prompt (testnet) — not investment advice',
  es: 'Trader por prompt (testnet) — no es recomendación de inversión',
}

export function VertalWalletEntryButton({ enabledOverride }: { enabledOverride?: boolean }) {
  const navigate = useNavigate()
  const access = useVertalWalletAccess({ trader: true, enabledOverride })
  if (access !== 'allowed') return null
  const lang = preferredUiLang()
  return (
    <button
      type="button"
      data-testid="vertal-wallet-entry"
      onClick={() => navigate(METAMASK_TRADER_ROUTE)}
      title={TITLE[lang] ?? TITLE.en}
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
    >
      <Wallet className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">{LABEL[lang] ?? LABEL.en}</span>
    </button>
  )
}

export default VertalWalletEntryButton
