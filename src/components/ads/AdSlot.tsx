import { useRef } from 'react'
import { useAdEligibility } from '@/hooks/useAdEligibility'
import { useNativeAdSlotVisibility } from '@/hooks/useNativeAdVisibility'
import { isNativeAdsPlatform, nativeBannerConfigured } from '@/lib/admob'
import { AdSenseDisplay } from './AdSenseDisplay'

interface AdSlotProps {
  className?: string
  placement?: string
}

/**
 * Lugar de anúncio (os 6 lugares do antigo TERRA ADS). Só Free e Starter (useAdEligibility).
 * - Site: bloco de display do Google AdSense (AdSenseDisplay).
 * - App nativo (Capacitor): nada do AdSense; quando este lugar entra na tela, o banner do
 *   Google AdMob aparece fixo embaixo (some quando sai, ou quando o painel do vídeo premiado
 *   está na tela). Nunca os dois.
 */
export function AdSlot(props: AdSlotProps) {
  return isNativeAdsPlatform() ? <NativeAdMobSlot {...props} /> : <AdSenseDisplay {...props} />
}

function NativeAdMobSlot({ placement }: AdSlotProps) {
  const eligible = useAdEligibility()
  const enabled = eligible && nativeBannerConfigured()
  const ref = useRef<HTMLDivElement>(null)
  useNativeAdSlotVisibility(ref, enabled)
  if (!enabled) return null
  // Marcador invisível: só serve para saber quando este lugar está na tela.
  return <div ref={ref} aria-hidden="true" data-testid="admob-slot-anchor" data-placement={placement} className="h-px w-full" />
}

export default AdSlot
