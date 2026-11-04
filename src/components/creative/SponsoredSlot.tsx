import { useEffect, useRef } from 'react'
import { Info } from 'lucide-react'
import { useSponsoredEligibility } from '@/hooks/useSponsoredEligibility'
import { TERRA_ADS_NATIVE_BANNER_ID, TERRA_ADS_NATIVE_BANNER_SRC } from '@/lib/terraAds'

interface SponsoredSlotProps {
  className?: string
}

/**
 * Anúncio nativo TERRA ADS no Painel Criativo, no formato de resultado patrocinado:
 * rótulo "Patrocinado" com ícone de informação e o cartão do anúncio logo abaixo.
 * Só aparece para planos que exibem anúncio (Free e Starter) e nunca para admin.
 */
export function SponsoredSlot({ className = '' }: SponsoredSlotProps) {
  const eligible = useSponsoredEligibility()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!eligible || !container) return

    const script = document.createElement('script')
    script.async = true
    script.dataset.cfasync = 'false'
    script.src = TERRA_ADS_NATIVE_BANNER_SRC
    container.appendChild(script)

    // Mesmo filtro cosmético do banner TERRA ADS: remove overlays grandes injetados fora do próprio espaço.
    const observer = new MutationObserver(() => {
      document.querySelectorAll('body > iframe, body > div[id^="ad_"]').forEach((el) => {
        if (!(el instanceof HTMLElement) || container.contains(el)) return
        const oversized =
          el.offsetWidth >= window.innerWidth * 0.8 || el.offsetHeight >= window.innerHeight * 0.8
        if (oversized) el.remove()
      })
    })
    observer.observe(document.body, { childList: true })

    return () => {
      observer.disconnect()
      script.remove()
    }
  }, [eligible])

  if (!eligible) return null

  return (
    <aside aria-label="Anúncio patrocinado" className={className}>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400">
        Patrocinado
        <Info className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
      </p>
      <div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/50 transition-colors hover:border-slate-500">
        <div
          ref={containerRef}
          id={TERRA_ADS_NATIVE_BANNER_ID}
          className="flex min-h-[160px] items-center justify-center p-3"
        />
      </div>
    </aside>
  )
}

export default SponsoredSlot
