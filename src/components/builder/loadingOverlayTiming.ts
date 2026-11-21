/**
 * Regras de saída do overlay do robô (AILoadingAnimation) no Builder.
 *
 * O robô fica em loop contínuo enquanto a geração/aplicação estiver em
 * andamento — não existe mais tempo máximo nem mínimo longo (antes eram 12 s).
 * Só há um mínimo curto para evitar que o overlay "pisque" quando a resposta
 * chega quase instantaneamente.
 */
export const MIN_LOADING_MS = 1_500

/**
 * Quanto tempo (ms) ainda falta para esconder o overlay.
 * - `null` enquanto o trabalho continua: o overlay NÃO sai, o robô segue em loop.
 * - `0` ou mais quando o trabalho terminou: esconder após esse atraso
 *   (só o que faltar do mínimo anti-piscar).
 */
export function overlayHideDelay(startedAt: number, now: number, isWorking: boolean): number | null {
  if (isWorking) return null
  const elapsed = Math.max(0, now - startedAt)
  return Math.max(0, MIN_LOADING_MS - elapsed)
}
