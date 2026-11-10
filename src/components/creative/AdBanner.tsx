import type { ReactNode } from 'react'

/**
 * Banners de publicidade do Painel Criativo. Cada um fica num iframe próprio:
 * o script usa a variável global `atOptions`, então dois banners na mesma página
 * se sobrescreveriam. O iframe isola cada um.
 */

interface AdBannerProps {
  adKey: string
  width: number
  height: number
  className?: string
}

function bannerSrcDoc(adKey: string, width: number, height: number): string {
  const src = `https://bauval.org/22/${adKey}`
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}</style></head><body><script>atOptions={'key':'${adKey}','format':'iframe','height':${height},'width':${width},'params':{}};</script><script src="${src}"></script></body></html>`
}

export function AdBanner({ adKey, width, height, className = '' }: AdBannerProps) {
  return (
    <iframe
      title="Publicidade"
      srcDoc={bannerSrcDoc(adKey, width, height)}
      width={width}
      height={height}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer-when-downgrade"
      loading="lazy"
      className={`block border-0 ${className}`}
      style={{ width, height }}
    />
  )
}

// Unidades cadastradas no painel de anúncios (chave do banner, tamanho em pixels).
const TOP_DESKTOP = { adKey: 'ed1cf4e3aec693999f925ba4deeacc90', width: 728, height: 90 }
const TOP_MOBILE = { adKey: 'dc62503e50010538292bb7dc0dc0936f', width: 320, height: 50 }

/**
 * Envolve uma tela do Painel Criativo com um banner no topo e outro no rodapé
 * (728x90 no computador, 320x50 no celular). Sem laterais.
 */
export function CreativeAdFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div className="mb-6 flex justify-center">
        <AdBanner {...TOP_DESKTOP} className="hidden md:block" />
        <AdBanner {...TOP_MOBILE} className="md:hidden" />
      </div>

      <div className="relative z-10">{children}</div>

      <div className="mt-10 flex justify-center">
        <AdBanner {...TOP_DESKTOP} className="hidden md:block" />
        <AdBanner {...TOP_MOBILE} className="md:hidden" />
      </div>
    </div>
  )
}
