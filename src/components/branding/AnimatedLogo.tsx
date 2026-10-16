import { BRAND } from '@/config/brand'

interface AnimatedLogoProps {
  /** Escala do logo; a altura renderizada é `size * 2.4` px (17 → ~40px no navbar). */
  size?: number
  className?: string
  /** Encolhe o logo para nunca ultrapassar a largura do elemento pai; `size` vira o máximo. */
  fit?: boolean
}

/** Logo oficial Vertal Dev (V cristal azul/roxo/prata com anel dourado), recortado e com fundo transparente. */
export const LOGO_SRC = '/vertal-dev-logo.webp'

/**
 * AnimatedLogo — logo oficial da marca usado no navbar e nos cabeçalhos.
 * Mantém a mesma API (`size`, `fit`) do antigo wordmark com cubo dourado orbitando.
 */
export default function AnimatedLogo({ size = 32, className = '', fit = false }: AnimatedLogoProps) {
  const height = Math.round(size * 2.4)

  return (
    <img
      src={LOGO_SRC}
      alt={BRAND.appName}
      width={480}
      height={446}
      decoding="async"
      draggable={false}
      className={`inline-block w-auto object-contain select-none ${fit ? 'max-w-full' : ''} ${className}`}
      style={{ height }}
    />
  )
}
