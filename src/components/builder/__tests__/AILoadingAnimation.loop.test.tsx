import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import AILoadingAnimation from '../AILoadingAnimation'
import { MIN_LOADING_MS, overlayHideDelay } from '../loadingOverlayTiming'

describe('overlay do robô — regras de saída', () => {
  it('não usa mais o mínimo fixo de 12 s; só um mínimo curto anti-piscar', () => {
    expect(MIN_LOADING_MS).toBeLessThanOrEqual(2_000)
    expect(MIN_LOADING_MS).toBeGreaterThan(0)
  })

  it('enquanto o trabalho continua, nunca sai (robô em loop), por mais tempo que passe', () => {
    const start = 1_000
    for (const elapsed of [0, 12_000, 60_000, 10 * 60_000]) {
      expect(overlayHideDelay(start, start + elapsed, true)).toBeNull()
    }
  })

  it('quando o trabalho termina, sai na hora (ou após o que faltar do mínimo curto)', () => {
    expect(overlayHideDelay(0, 30_000, false)).toBe(0)
    expect(overlayHideDelay(0, 12_000, false)).toBe(0)
    expect(overlayHideDelay(0, 500, false)).toBe(MIN_LOADING_MS - 500)
  })
})

describe('AILoadingAnimation em loop', () => {
  afterEach(() => vi.useRealTimers())

  it('mantém o robô na tela após muito tempo enquanto não está pronto, e mostra "Ver agora" ao terminar', () => {
    vi.useFakeTimers()
    const onSkip = vi.fn()
    const { rerender } = render(<AILoadingAnimation isVisible chatLanguage="pt" isReady={false} onSkip={onSkip} />)
    act(() => { vi.advanceTimersByTime(90_000) })
    expect(screen.getByTestId('ai-loading-robot')).toBeTruthy()
    expect(screen.queryByTestId('loading-skip-button')).toBeNull()

    rerender(<AILoadingAnimation isVisible chatLanguage="pt" isReady onSkip={onSkip} />)
    expect(screen.getByTestId('loading-skip-button')).toBeTruthy()
    expect(screen.getByTestId('ai-loading-robot')).toBeTruthy()
  })
})
