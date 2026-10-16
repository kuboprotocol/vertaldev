import { BRAND } from '@/config/brand'

interface AnimatedLogoProps {
  /** Escala do logo; a altura é `size * 2.8` px na horizontal (17 → ~48px no navbar) e `size * 2.4` px empilhado. */
  size?: number
  className?: string
  /** Encolhe o logo para nunca ultrapassar a largura do elemento pai; `size` vira o máximo. */
  fit?: boolean
  /**
   * `horizontal` (padrão, navbars): emblema à esquerda + "VERTAL DEV" à direita, legível em alturas pequenas.
   * `stacked`: logo completo com o texto embaixo do emblema, para hero e telas de destaque.
   */
  variant?: 'horizontal' | 'stacked'
}

/** Logo oficial Vertal Dev (V cristal azul/roxo/prata com anel dourado), recortado e com fundo transparente. */
export const LOGO_SRC = '/vertal-dev-logo.webp'
export const LOGO_HORIZONTAL_SRC = '/vertal-dev-logo-horizontal.webp'

const VARIANTS = {
  horizontal: { src: LOGO_HORIZONTAL_SRC, width: 781, height: 200, scale: 2.8 },
  stacked: { src: LOGO_SRC, width: 480, height: 446, scale: 2.4 },
} as const

/**
 * AnimatedLogo — logo oficial da marca usado no navbar e nos cabeçalhos.
 * Mantém a mesma API (`size`, `fit`) do antigo wordmark com cubo dourado orbitando.
 */
export default function AnimatedLogo({ size = 32, className = '', fit = false, variant = 'horizontal' }: AnimatedLogoProps) {
  const v = VARIANTS[variant]
  const height = Math.round(size * v.scale)

  return (
    <img
      src={v.src}
      alt={BRAND.appName}
      width={v.width}
      height={v.height}
      decoding="async"
      draggable={false}
      className={`inline-block w-auto object-contain select-none ${fit ? 'max-w-full' : ''} ${className}`}
      style={{ height }}
    />
  )
}
