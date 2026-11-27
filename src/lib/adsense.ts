/**
 * Google AdSense (única rede de anúncios de display do site, no lugar do TERRA ADS removido no #305).
 *
 * - Só o cliente abaixo; nenhuma outra rede, nenhum pop-up/popunder/redirecionamento.
 * - Só unidades de display com rótulo "Publicidade" (componente AdSenseDisplay), só para os planos
 *   com anúncio (Free e Starter, AD_SUPPORTED_PLANS em src/lib/planConfig.ts).
 * - Nunca dentro do painel de recompensas nem ao lado dos botões do vídeo premiado
 *   (política do AdSense contra incentivar cliques).
 */
export const ADSENSE_CLIENT = 'ca-pub-6320473908706491'

/**
 * ID da unidade de display responsiva ("data-ad-slot"), criada no painel do AdSense
 * (Anúncios → Por bloco de anúncios → Anúncio de display, tamanho Responsivo).
 * Enquanto estiver vazio nenhum bloco é renderizado e o script do AdSense não carrega.
 * Pode vir da variável de build VITE_ADSENSE_DISPLAY_SLOT_ID ou ser preenchido aqui.
 */
export const ADSENSE_DISPLAY_SLOT_ID: string =
  (import.meta.env.VITE_ADSENSE_DISPLAY_SLOT_ID as string | undefined)?.trim() || ''

export const ADSENSE_SCRIPT_SRC = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`

const SCRIPT_ID = 'google-adsense-loader'

/** Carrega o adsbygoogle.js uma única vez por página (idempotente). */
export function loadAdSenseScript(doc: Document = document): void {
  if (doc.getElementById(SCRIPT_ID)) return
  if (doc.querySelector(`script[src^="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]`)) return
  const script = doc.createElement('script')
  script.id = SCRIPT_ID
  script.async = true
  script.src = ADSENSE_SCRIPT_SRC
  script.crossOrigin = 'anonymous'
  doc.head.appendChild(script)
}

type AdsByGoogle = Array<Record<string, unknown>>

/** Pede ao AdSense para preencher o próximo <ins class="adsbygoogle"> ainda vazio. */
export function requestAdSenseFill(win: Window = window): void {
  const w = win as Window & { adsbygoogle?: AdsByGoogle }
  w.adsbygoogle = w.adsbygoogle || []
  w.adsbygoogle.push({})
}
