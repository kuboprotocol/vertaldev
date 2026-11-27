import { useDailyCredits } from '@/hooks/useDailyCredits'

/**
 * Antes este componente abria o Smartlink TERRA ADS (Adsterra) numa aba nova ao navegar.
 * Isso saiu (política "Site comprometido" do Google Ads): nenhum anúncio de terceiros, nenhum
 * redirecionamento. Ficou só o crédito diário do plano, que já rodava aqui.
 * O nome continua para não mexer em src/App.tsx (protegido pelo engine-guard do VERTAL Code AI).
 */
export default function AdGate() {
  useDailyCredits()
  return null
}
