import { useEffect, useRef } from 'react'
import { useAdEligibility } from '@/hooks/useAdEligibility'
import { ADSENSE_CLIENT, ADSENSE_DISPLAY_SLOT_ID, loadAdSenseScript, requestAdSenseFill } from '@/lib/adsense'
import { isNativeAdsPlatform } from '@/lib/admob'

interface AdSenseDisplayProps {
  className?: string
  /** Para testes e para distinguir os blocos no DOM. */
  placement?: string
}

/**
 * Bloco de display do Google AdSense (responsivo), com rótulo "Publicidade".
 * Fica nos mesmos lugares onde havia o banner TERRA ADS (SponsoredSlot / CreativeAdFrame), só para
 * Free e Starter. Não abre nada sozinho: sem pop-up, popunder, redirecionamento ou intersticial.
 * Não usar dentro do painel de recompensas nem ao lado do vídeo premiado.
 * Só no site: dentro do app nativo nunca carrega (lá o lugar usa o AdMob, ver AdSlot).
 */
export function AdSenseDisplay({ className = '', placement }: AdSenseDisplayProps) {
  const eligible = useAdEligibility()
  const enabled = eligible && ADSENSE_DISPLAY_SLOT_ID !== '' && !isNativeAdsPlatform()
  const insRef = useRef<HTMLModElement>(null)
  const pushedRef = useRef(false)

  useEffect(() => {
    if (!enabled || pushedRef.current || !insRef.current) return
    pushedRef.current = true
    loadAdSenseScript()
    try {
      requestAdSenseFill()
    } catch {
      /* bloqueador de anúncios ou script indisponível: o espaço fica vazio */
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <aside
      aria-label="Publicidade"
      data-testid="adsense-display"
      data-placement={placement}
      className={`my-6 w-full rounded-xl border border-white/10 bg-black/10 p-3 ${className}`}
    >
      <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-wider text-slate-500">Publicidade</p>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={ADSENSE_DISPLAY_SLOT_ID}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  )
}

export default AdSenseDisplay
