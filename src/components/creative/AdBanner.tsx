import type { ReactNode } from "react";

/**
 * Banners de publicidade do Painel Criativo. Cada um fica num iframe próprio:
 * o script usa a variável global `atOptions`, então dois banners na mesma página
 * se sobrescreveriam. O iframe isola cada um.
 */

interface AdBannerProps {
  adKey: string;
  width: number;
  height: number;
  className?: string;
}

function bannerSrcDoc(adKey: string, width: number, height: number): string {
  const src = `https://bauval.org/22/${adKey}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}</style></head><body><script>atOptions={'key':'${adKey}','format':'iframe','height':${height},'width':${width},'params':{}};</script><script src="${src}"></script></body></html>`;
}

export function AdBanner({
  adKey,
  width,
  height,
  className = "",
}: AdBannerProps) {
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
  );
}

// Unidades cadastradas no painel de anúncios (chave do banner, tamanho em pixels).
const TOP_DESKTOP = {
  adKey: "ed1cf4e3aec693999f925ba4deeacc90",
  width: 728,
  height: 90,
};
const TOP_MOBILE = {
  adKey: "dc62503e50010538292bb7dc0dc0936f",
  width: 320,
  height: 50,
};

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
  );
}

// Laterais do quadro em volta de uma área (unidades cadastradas no painel de anúncios).
const SIDE_LEFT = {
  adKey: "ebe7adda0e4b08cd55ca612284ac327b",
  width: 160,
  height: 600,
};
const SIDE_RIGHT = {
  adKey: "cabee980bd11dbb6e81c737d3b1c72e5",
  width: 160,
  height: 300,
};

/**
 * Quadro de publicidade em volta de um bloco: um banner em cima, um embaixo e um de cada lado.
 * Um banner por lado, nunca vários. As laterais só aparecem em telas médias ou maiores, porque
 * no celular não cabem ao lado do conteúdo.
 */
export function AdFrameSquare({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex flex-col items-center gap-3"
      data-testid="ad-frame-square"
    >
      <div className="flex justify-center">
        <AdBanner {...TOP_DESKTOP} className="hidden md:block" />
        <AdBanner {...TOP_MOBILE} className="md:hidden" />
      </div>

      <div className="flex w-full items-start justify-center gap-4">
        <div className="hidden shrink-0 md:block">
          <AdBanner {...SIDE_LEFT} />
        </div>
        <div className="min-w-0 w-full max-w-2xl">{children}</div>
        <div className="hidden shrink-0 md:block">
          <AdBanner {...SIDE_RIGHT} />
        </div>
      </div>

      <div className="flex justify-center">
        <AdBanner {...TOP_DESKTOP} className="hidden md:block" />
        <AdBanner {...TOP_MOBILE} className="md:hidden" />
      </div>
    </div>
  );
}
