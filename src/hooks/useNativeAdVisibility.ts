import { useEffect, useId, type RefObject } from 'react'
import { isNativeAdsPlatform, setNativeAdExclusionVisible, setNativeAdSlotVisible } from '@/lib/admob'

type Setter = (id: string, visible: boolean) => void

function useVisibility(ref: RefObject<Element | null>, active: boolean, set: Setter, rootMargin = '0px') {
  const id = useId()
  useEffect(() => {
    const el = ref.current
    if (!active || !el) return
    if (typeof IntersectionObserver === 'undefined') {
      set(id, true)
      return () => set(id, false)
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) set(id, e.isIntersecting)
      },
      { rootMargin },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      set(id, false)
    }
  }, [ref, active, set, id, rootMargin])
}

/**
 * App nativo: marca um lugar de anúncio (AdSlot) como visível na tela. Enquanto algum estiver
 * visível (e nenhuma zona de exclusão), o banner AdMob aparece embaixo. No site não faz nada.
 */
export function useNativeAdSlotVisibility(ref: RefObject<Element | null>, enabled: boolean) {
  // O marcador tem 1px: conta como "na tela" enquanto estiver a até meia tela de distância.
  useVisibility(ref, enabled && isNativeAdsPlatform(), setNativeAdSlotVisible, '50% 0px')
}

/**
 * App nativo: área onde o banner nunca pode aparecer junto (painel/botões do vídeo premiado).
 * No site não faz nada.
 */
export function useNativeAdExclusionZone(ref: RefObject<Element | null>) {
  useVisibility(ref, isNativeAdsPlatform(), setNativeAdExclusionVisible)
}
