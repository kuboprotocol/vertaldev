import { useDailyCredits } from '@/hooks/useDailyCredits'

/**
 * Credita os créditos diários do plano (e o bônus de cadastro) uma vez por sessão.
 * Antes isso rodava dentro do AdGate, que também abria um anúncio de terceiros numa
 * aba nova ao navegar; o anúncio saiu (política do Google Ads), o crédito diário ficou.
 */
export default function DailyCreditsSync() {
  useDailyCredits()
  return null
}
