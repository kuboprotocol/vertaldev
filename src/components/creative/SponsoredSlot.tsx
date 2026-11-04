import { useEffect, useRef, useState } from 'react'
import { useSponsoredEligibility } from '@/hooks/useSponsoredEligibility'
import { TERRA_ADS_NATIVE_BANNER_ID, TERRA_ADS_NATIVE_BANNER_SRC } from '@/lib/terraAds'

interface SponsoredSlotProps {
  className?: string
}

/** Tempo máximo para o anúncio preencher o espaço. Depois disso o espaço some, sem caixa vazia. */
const FILL_TIMEOUT_MS = 6000

/**
 * Anúncio nativo TERRA ADS no Painel Criativo, no mesmo formato de resultado patrocinado.
 * Ocupa a largura da coluna em que está, sem borda nem caixa própria, e fica fora do fluxo
 * enquanto não há anúncio: nunca deixa espaço vazio nem empurra o conteúdo.
 * Só aparece para planos que exibem anúncio (Free e Starter) e nunca para admin.
 */
export function SponsoredSlot({ className = '' }: SponsoredSlotProps) {
  const eligible = useSponsoredEligibility()
  const containerRef = useRef<HTMLDivElement>(null)
  const [filled, setFilled] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!eligible || !container) return

    const script = document.createElement('script')
    script.async = true
    script.dataset.cfasync = 'false'
    script.src = TERRA_ADS_NATIVE_BANNER_SRC
    container.appendChild(script)

    // Mostra só quando o anúncio de fato entrou no contêiner (o script não conta).
    const checkFilled = () => {
      const hasAd = Array.from(container.children).some((el) => el.tagName !== 'SCRIPT')
      if (hasAd) setFilled(true)
      return hasAd
    }
    const fillObserver = new MutationObserver(checkFilled)
    fillObserver.observe(container, { childList: true, subtree: true })
    const timeout = window.setTimeout(() => {
      if (!checkFilled()) fillObserver.disconnect()
    }, FILL_TIMEOUT_MS)

    // Mesmo filtro cosmético do banner TERRA ADS: remove overlays grandes injetados fora do próprio espaço.
    const overlayObserver = new MutationObserver(() => {
      document.querySelectorAll('body > iframe, body > div[id^="ad_"]').forEach((el) => {
        if (!(el instanceof HTMLElement) || container.contains(el)) return
        const oversized =
          el.offsetWidth >= window.innerWidth * 0.8 || el.offsetHeight >= window.innerHeight * 0.8
        if (oversized) el.remove()
      })
    })
    overlayObserver.observe(document.body, { childList: true })

    return () => {
      window.clearTimeout(timeout)
      fillObserver.disconnect()
      overlayObserver.disconnect()
      script.remove()
    }
  }, [eligible])

  if (!eligible) return null

  return (
    <aside
      aria-label="Anúncio patrocinado"
      className={`w-full ${filled ? 'my-6' : 'h-0 overflow-hidden'} ${className}`}
    >
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">Patrocinado</p>
      <div ref={containerRef} id={TERRA_ADS_NATIVE_BANNER_ID} className="w-full" />
    </aside>
  )
}

export default SponsoredSlot
