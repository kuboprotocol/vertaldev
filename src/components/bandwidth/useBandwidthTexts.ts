import { useSchedulerUiLang } from '@/lib/chatScheduler/client'
import { BW_UI, bwLang } from '@/lib/bandwidthSharing'

/** Idioma: Ajustes → Idioma / perfil / navegador (mesma regra do Agendador e do MetaMask). */
export function useBandwidthTexts() {
  const lang = bwLang(useSchedulerUiLang())
  return { lang, t: BW_UI[lang] }
}
